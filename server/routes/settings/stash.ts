import StashAPI, { stashUrl } from '@server/api/stash';
import { stashScanner } from '@server/lib/scanners/stash';
import { getSettings } from '@server/lib/settings';
import logger from '@server/logger';
import { Router } from 'express';
import { z } from 'zod';

const stashSettingsSchema = z.object({
  hostname: z
    .string()
    .trim()
    .min(1)
    .regex(/^[^/:\s]+$/),
  port: z.coerce.number().int().min(1).max(65535),
  useSsl: z.boolean(),
  // A leading slash and no trailing one, like Jellyfin's
  urlBase: z
    .string()
    .regex(/^(\/.*[^/])?$/)
    .optional(),
  apiKey: z.string().min(1),
  externalUrl: z.string().url().or(z.literal('')).optional(),
});

type StashSettingsBody = z.infer<typeof stashSettingsSchema>;

const stashRoutes = Router();

const testConnection = (settings: StashSettingsBody) =>
  new StashAPI({
    url: stashUrl(settings),
    apiKey: settings.apiKey,
  }).getVersion();

stashRoutes.get('/', (_req, res) => {
  res.status(200).json(getSettings().stash);
});

stashRoutes.post('/', async (req, res, next) => {
  const parsed = stashSettingsSchema.safeParse(req.body);

  if (!parsed.success) {
    return next({ status: 400, message: 'Invalid Stash settings.' });
  }

  try {
    await testConnection(parsed.data);
  } catch (e) {
    logger.error('Failed to connect to Stash', {
      label: 'Stash',
      errorMessage: e.message,
    });
    return next({ status: 400, message: 'Unable to connect to Stash.' });
  }

  const settings = getSettings();
  settings.stash = {
    ...parsed.data,
    urlBase: parsed.data.urlBase ?? '',
    externalUrl: parsed.data.externalUrl?.replace(/\/+$/, ''),
  };
  await settings.save();

  return res.status(200).json(settings.stash);
});

stashRoutes.post('/test', async (req, res, next) => {
  const parsed = stashSettingsSchema.safeParse(req.body);

  if (!parsed.success) {
    return next({ status: 400, message: 'Invalid Stash settings.' });
  }

  try {
    return res.status(200).json({ version: await testConnection(parsed.data) });
  } catch (e) {
    logger.error('Failed to connect to Stash', {
      label: 'Stash',
      errorMessage: e.message,
    });
    return next({ status: 400, message: 'Unable to connect to Stash.' });
  }
});

// Like the Jellyfin library sync
stashRoutes.get('/sync', (_req, res) => {
  res.status(200).json(stashScanner.status());
});

stashRoutes.post('/sync', (req, res) => {
  if (req.body.cancel) {
    stashScanner.cancel();
  } else if (req.body.start) {
    stashScanner.run();
  }

  res.status(200).json(stashScanner.status());
});

export default stashRoutes;
