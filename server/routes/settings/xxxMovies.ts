import WhisparrAPI from '@server/api/servarr/whisparr';
import TpdbAPI from '@server/api/tpdb';
import { getSettings, XxxMovieSource } from '@server/lib/settings';
import { getWhisparrServer } from '@server/lib/whisparrMedia';
import logger from '@server/logger';
import { Router } from 'express';
import { z } from 'zod';

const xxxMovieSettingsSchema = z.object({
  source: z.nativeEnum(XxxMovieSource),
  tmdbCompanies: z.array(z.number().int().positive()).max(100),
  tpdbApiKey: z.string(),
});

const xxxMovieRoutes = Router();

const testTpdb = async (apiKey: string): Promise<boolean> => {
  try {
    await new TpdbAPI(apiKey).test();
    return true;
  } catch (e) {
    logger.error('Failed to connect to ThePornDB', {
      label: 'ThePornDB',
      errorMessage: e.message,
    });
    return false;
  }
};

const currentSettings = () => {
  const { xxxMovies, tpdb } = getSettings();

  return {
    source: xxxMovies.source,
    tmdbCompanies: xxxMovies.tmdbCompanies,
    tpdbApiKey: tpdb.apiKey,
  };
};

xxxMovieRoutes.get('/', (_req, res) => {
  res.status(200).json(currentSettings());
});

xxxMovieRoutes.post('/', async (req, res, next) => {
  const parsed = xxxMovieSettingsSchema.safeParse(req.body);

  if (!parsed.success) {
    return next({ status: 400, message: 'Invalid XXX movie settings.' });
  }

  const { source, tmdbCompanies, tpdbApiKey } = parsed.data;

  if (source === XxxMovieSource.TPDB && !tpdbApiKey) {
    return next({ status: 400, message: 'ThePornDB needs an API key.' });
  }

  if (tpdbApiKey && !(await testTpdb(tpdbApiKey))) {
    return next({ status: 400, message: 'Unable to connect to ThePornDB.' });
  }

  const settings = getSettings();
  settings.xxxMovies = { source, tmdbCompanies };
  settings.tpdb = { apiKey: tpdbApiKey };
  await settings.save();

  return res.status(200).json(currentSettings());
});

xxxMovieRoutes.post('/test', async (req, res, next) => {
  const parsed = z.object({ apiKey: z.string().min(1) }).safeParse(req.body);

  if (!parsed.success) {
    return next({ status: 400, message: 'Missing ThePornDB API key.' });
  }

  if (!(await testTpdb(parsed.data.apiKey))) {
    return next({ status: 400, message: 'Unable to connect to ThePornDB.' });
  }

  return res.status(200).json({ success: true });
});

// TMDB company ids of the studios the default Whisparr server knows, as a
// starting point for the TMDB studio list
xxxMovieRoutes.get('/whisparr-companies', async (_req, res, next) => {
  const server = getWhisparrServer(false);

  if (!server) {
    return next({
      status: 409,
      message: 'No default Whisparr server is configured.',
    });
  }

  try {
    const whisparr = new WhisparrAPI({
      apiKey: server.apiKey,
      url: WhisparrAPI.buildUrl(server, '/api/v3'),
    });
    const studios = await whisparr.getStudios();

    return res
      .status(200)
      .json(
        studios
          .filter((studio) => studio.tmdbId > 0)
          .map((studio) => ({ id: studio.tmdbId, name: studio.title }))
      );
  } catch (e) {
    logger.error('Failed to load Whisparr studios', {
      label: 'Whisparr',
      errorMessage: e.message,
    });
    return next({ status: 500, message: 'Unable to load Whisparr studios.' });
  }
});

export default xxxMovieRoutes;
