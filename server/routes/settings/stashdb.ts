import StashDbAPI from '@server/api/stashdb';
import { getSettings } from '@server/lib/settings';
import logger from '@server/logger';
import { Router } from 'express';
import { z } from 'zod';

const stashDbSettingsSchema = z.object({
  endpoint: z.string().url(),
  apiKey: z.string().min(1),
});

const stashDbRoutes = Router();

const testConnection = async (
  settings: z.infer<typeof stashDbSettingsSchema>
): Promise<string> => {
  const stashDb = new StashDbAPI(settings);
  const { version } = await stashDb.getVersion();

  return version;
};

stashDbRoutes.get('/', (_req, res) => {
  res.status(200).json(getSettings().stashdb);
});

stashDbRoutes.post('/', async (req, res, next) => {
  const parsed = stashDbSettingsSchema.safeParse(req.body);

  if (!parsed.success) {
    return next({ status: 400, message: 'Invalid StashDB settings.' });
  }

  try {
    await testConnection(parsed.data);
  } catch (e) {
    logger.error('Failed to connect to StashDB', {
      label: 'StashDB',
      errorMessage: e.message,
    });
    return next({ status: 400, message: 'Unable to connect to StashDB.' });
  }

  const settings = getSettings();
  settings.stashdb = parsed.data;
  await settings.save();

  return res.status(200).json(settings.stashdb);
});

stashDbRoutes.post('/test', async (req, res, next) => {
  const parsed = stashDbSettingsSchema.safeParse(req.body);

  if (!parsed.success) {
    return next({ status: 400, message: 'Invalid StashDB settings.' });
  }

  try {
    const version = await testConnection(parsed.data);

    return res.status(200).json({ version });
  } catch (e) {
    logger.error('Failed to connect to StashDB', {
      label: 'StashDB',
      errorMessage: e.message,
    });
    return next({ status: 400, message: 'Unable to connect to StashDB.' });
  }
});

export default stashDbRoutes;
