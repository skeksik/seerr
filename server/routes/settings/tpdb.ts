import TpdbAPI from '@server/api/tpdb';
import { getSettings } from '@server/lib/settings';
import logger from '@server/logger';
import { Router } from 'express';
import { z } from 'zod';

const tpdbSettingsSchema = z.object({
  url: z.string().url(),
  apiKey: z.string().min(1),
});

const tpdbRoutes = Router();

const testConnection = (settings: z.infer<typeof tpdbSettingsSchema>) =>
  new TpdbAPI(settings).test();

tpdbRoutes.get('/', (_req, res) => {
  res.status(200).json(getSettings().tpdb);
});

tpdbRoutes.post('/', async (req, res, next) => {
  const parsed = tpdbSettingsSchema.safeParse(req.body);

  if (!parsed.success) {
    return next({ status: 400, message: 'Invalid ThePornDB settings.' });
  }

  try {
    await testConnection(parsed.data);
  } catch (e) {
    logger.error('Failed to connect to ThePornDB', {
      label: 'ThePornDB',
      errorMessage: e.message,
    });
    return next({ status: 400, message: 'Unable to connect to ThePornDB.' });
  }

  const settings = getSettings();
  settings.tpdb = {
    ...parsed.data,
    url: parsed.data.url.replace(/\/+$/, ''),
  };
  await settings.save();

  return res.status(200).json(settings.tpdb);
});

tpdbRoutes.post('/test', async (req, res, next) => {
  const parsed = tpdbSettingsSchema.safeParse(req.body);

  if (!parsed.success) {
    return next({ status: 400, message: 'Invalid ThePornDB settings.' });
  }

  try {
    await testConnection(parsed.data);
    return res.status(200).json({ success: true });
  } catch (e) {
    logger.error('Failed to connect to ThePornDB', {
      label: 'ThePornDB',
      errorMessage: e.message,
    });
    return next({ status: 400, message: 'Unable to connect to ThePornDB.' });
  }
});

export default tpdbRoutes;
