import WhisparrAPI from '@server/api/servarr/whisparr';
import type { WhisparrSettings } from '@server/lib/settings';
import { getSettings } from '@server/lib/settings';
import logger from '@server/logger';
import { Router } from 'express';

const whisparrRoutes = Router();

whisparrRoutes.get('/', (_req, res) => {
  const settings = getSettings();

  res.status(200).json(settings.whisparr);
});

whisparrRoutes.post('/', async (req, res) => {
  const settings = getSettings();

  const newWhisparr = req.body as WhisparrSettings;
  const lastItem = settings.whisparr[settings.whisparr.length - 1];
  newWhisparr.id = lastItem ? lastItem.id + 1 : 0;

  // If we are setting this as the default, clear any previous defaults for the same type first
  // ex: if is4k is true, it will only remove defaults for other servers that have is4k set to true
  // and are the default
  if (req.body.isDefault) {
    settings.whisparr
      .filter((whisparrInstance) => whisparrInstance.is4k === req.body.is4k)
      .forEach((whisparrInstance) => {
        whisparrInstance.isDefault = false;
      });
  }

  settings.whisparr = [...settings.whisparr, newWhisparr];
  await settings.save();

  return res.status(201).json(newWhisparr);
});

whisparrRoutes.post<
  undefined,
  Record<string, unknown>,
  WhisparrSettings & { tagLabel?: string }
>('/test', async (req, res, next) => {
  try {
    const whisparr = new WhisparrAPI({
      apiKey: req.body.apiKey,
      url: WhisparrAPI.buildUrl(req.body, '/api/v3'),
    });

    const status = await whisparr.getSystemStatus();

    // v2 is a Sonarr fork with a different API and ThePornDB ids
    if (!status.version?.startsWith('3.')) {
      return next({
        status: 400,
        message: `Whisparr v3 is required, found ${status.version}`,
      });
    }

    const urlBase = status.urlBase ?? req.body.baseUrl;
    const profiles = await whisparr.getProfiles();
    const folders = await whisparr.getRootFolders();
    const tags = await whisparr.getTags();

    return res.status(200).json({
      profiles,
      rootFolders: folders.map((folder) => ({
        id: folder.id,
        path: folder.path,
      })),
      tags,
      urlBase,
    });
  } catch (e) {
    logger.error('Failed to test Whisparr', {
      label: 'Whisparr',
      message: e.message,
    });

    next({ status: 500, message: 'Failed to connect to Whisparr' });
  }
});

whisparrRoutes.put<{ id: string }, WhisparrSettings, WhisparrSettings>(
  '/:id',
  async (req, res, next) => {
    const settings = getSettings();

    const whisparrIndex = settings.whisparr.findIndex(
      (r) => r.id === Number(req.params.id)
    );

    if (whisparrIndex === -1) {
      return next({ status: '404', message: 'Settings instance not found' });
    }

    // If we are setting this as the default, clear any previous defaults for the same type first
    // ex: if is4k is true, it will only remove defaults for other servers that have is4k set to true
    // and are the default
    if (req.body.isDefault) {
      settings.whisparr
        .filter((whisparrInstance) => whisparrInstance.is4k === req.body.is4k)
        .forEach((whisparrInstance) => {
          whisparrInstance.isDefault = false;
        });
    }

    settings.whisparr[whisparrIndex] = {
      ...req.body,
      id: Number(req.params.id),
    } as WhisparrSettings;
    await settings.save();

    return res.status(200).json(settings.whisparr[whisparrIndex]);
  }
);

whisparrRoutes.get<{ id: string }>('/:id/profiles', async (req, res, next) => {
  const settings = getSettings();

  const whisparrSettings = settings.whisparr.find(
    (r) => r.id === Number(req.params.id)
  );

  if (!whisparrSettings) {
    return next({ status: '404', message: 'Settings instance not found' });
  }

  const whisparr = new WhisparrAPI({
    apiKey: whisparrSettings.apiKey,
    url: WhisparrAPI.buildUrl(whisparrSettings, '/api/v3'),
  });

  const profiles = await whisparr.getProfiles();

  return res.status(200).json(
    profiles.map((profile) => ({
      id: profile.id,
      name: profile.name,
    }))
  );
});

whisparrRoutes.delete<{ id: string }>('/:id', async (req, res, next) => {
  const settings = getSettings();

  const whisparrIndex = settings.whisparr.findIndex(
    (r) => r.id === Number(req.params.id)
  );

  if (whisparrIndex === -1) {
    return next({ status: '404', message: 'Settings instance not found' });
  }

  const removed = settings.whisparr.splice(whisparrIndex, 1);
  await settings.save();

  return res.status(200).json(removed[0]);
});

export default whisparrRoutes;
