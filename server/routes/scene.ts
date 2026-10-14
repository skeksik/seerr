import type { WhisparrCreditType } from '@server/api/servarr/whisparr';
import WhisparrAPI from '@server/api/servarr/whisparr';
import StashDbAPI, { StashDbNotConfiguredError } from '@server/api/stashdb';
import type {
  StashDbSceneList,
  StashDbSceneSort,
} from '@server/api/stashdb/interfaces';
import Media from '@server/entity/Media';
import { Permission } from '@server/lib/permissions';
import { getSettings } from '@server/lib/settings';
import { getWhisparrServer } from '@server/lib/whisparrMedia';
import logger from '@server/logger';
import { isAuthenticated } from '@server/middleware/auth';
import type {
  SceneFilterDetails,
  SceneListResponse,
  ScenePerformerDetails,
  SceneStudioDetails,
  WhisparrMonitorStatus,
} from '@server/models/Scene';
import {
  mapPerformerDetails,
  mapSceneDetails,
  mapSceneResult,
  mapStudioDetails,
} from '@server/models/Scene';
import type { NextFunction, Request } from 'express';
import { Router } from 'express';
import { z } from 'zod';

const PAGE_SIZE = 20;

const sceneRoutes = Router();

const sortValues = [
  'trending',
  'popularity',
  'date',
  'title',
  'duration',
  'created_at',
] as const;

const discoverQuery = z.object({
  page: z.coerce.number().int().positive().default(1),
  sort: z.enum(sortValues).default('trending'),
  studio: z.string().uuid().optional(),
  performer: z.string().uuid().optional(),
  tag: z.string().uuid().optional(),
});

const searchQuery = z.object({
  query: z.string().trim().min(1),
  page: z.coerce.number().int().positive().default(1),
});

const sceneId = z.string().uuid();

const monitorBody = z.object({
  monitored: z.boolean(),
  search: z.boolean().default(false),
});

const stashDbOrigin = () => new URL(getSettings().stashdb.endpoint).origin;

const whisparrClient = () => {
  const server = getWhisparrServer(false);

  return server
    ? {
        server,
        api: new WhisparrAPI({
          apiKey: server.apiKey,
          url: WhisparrAPI.buildUrl(server, '/api/v3'),
        }),
      }
    : undefined;
};

const creditUrl = (
  server: NonNullable<ReturnType<typeof getWhisparrServer>>,
  type: WhisparrCreditType,
  foreignId: string
) =>
  server.externalUrl
    ? `${server.externalUrl.replace(/\/+$/, '')}/${type}/${foreignId}`
    : WhisparrAPI.buildUrl(server, `/${type}/${foreignId}`);

// Monitoring is a request manager tool; a Whisparr outage only hides it
const getMonitorStatus = async (
  req: Request,
  type: WhisparrCreditType,
  foreignId: string
): Promise<WhisparrMonitorStatus | undefined> => {
  const whisparr = whisparrClient();

  if (!whisparr || !req.user?.hasPermission(Permission.MANAGE_REQUESTS)) {
    return undefined;
  }

  try {
    const credit = await whisparr.api.getCredit(type, foreignId);
    return {
      monitored: !!credit?.monitored,
      serviceUrl: creditUrl(whisparr.server, type, foreignId),
    };
  } catch (e) {
    logger.debug('Unable to retrieve Whisparr monitoring status', {
      label: 'API',
      type,
      foreignId,
      errorMessage: e.message,
    });
    return undefined;
  }
};

const mapSceneList = async (
  list: StashDbSceneList,
  page: number
): Promise<SceneListResponse> => {
  const media = await Media.getRelatedScenes(list.scenes.map((s) => s.id));

  return {
    page,
    totalPages: Math.ceil(list.count / PAGE_SIZE),
    totalResults: list.count,
    results: list.scenes.map((scene) =>
      mapSceneResult(
        scene,
        media.find((m) => m.stashId === scene.id)
      )
    ),
  };
};

const handleError = (
  e: Error,
  next: NextFunction,
  message: string,
  meta: Record<string, unknown>
) => {
  if (e instanceof StashDbNotConfiguredError) {
    return next({ status: 503, message: 'StashDB is not configured.' });
  }

  logger.debug(message, { label: 'API', errorMessage: e.message, ...meta });
  return next({ status: 500, message });
};

sceneRoutes.get('/discover', async (req, res, next) => {
  const parsed = discoverQuery.safeParse(req.query);

  if (!parsed.success) {
    return next({ status: 400, message: 'Invalid discover parameters.' });
  }

  const { page, sort, studio, performer, tag } = parsed.data;

  try {
    const list = await StashDbAPI.fromSettings().queryScenes({
      page,
      perPage: PAGE_SIZE,
      sort: sort.toUpperCase() as StashDbSceneSort,
      // Oldest-first is never what a discover row wants, titles aside
      direction: sort === 'title' ? 'ASC' : 'DESC',
      studioId: studio,
      performerId: performer,
      tagId: tag,
    });

    return res.status(200).json(await mapSceneList(list, page));
  } catch (e) {
    return handleError(e, next, 'Unable to retrieve scenes.', {
      query: req.query,
    });
  }
});

sceneRoutes.get('/search', async (req, res, next) => {
  const parsed = searchQuery.safeParse(req.query);

  if (!parsed.success) {
    return next({ status: 400, message: 'Invalid search parameters.' });
  }

  const { query, page } = parsed.data;

  try {
    const list = await StashDbAPI.fromSettings().searchScenes({
      query,
      page,
      perPage: PAGE_SIZE,
    });

    return res.status(200).json(await mapSceneList(list, page));
  } catch (e) {
    return handleError(e, next, 'Unable to retrieve scene search results.', {
      query,
    });
  }
});

sceneRoutes.get<{ type: string; id: string }>(
  '/:type/:id',
  async (req, res, next) => {
    const parsed = sceneId.safeParse(req.params.id);

    if (
      !parsed.success ||
      !['studio', 'performer', 'tag'].includes(req.params.type)
    ) {
      return next({ status: 404, message: 'Not found.' });
    }

    try {
      const stashDb = StashDbAPI.fromSettings();
      let details:
        | SceneFilterDetails
        | ScenePerformerDetails
        | SceneStudioDetails
        | null;

      if (req.params.type === 'studio') {
        const studio = await stashDb.getStudio(parsed.data);
        details = studio && {
          ...mapStudioDetails(studio, stashDbOrigin()),
          whisparr: await getMonitorStatus(req, 'studio', studio.id),
        };
      } else if (req.params.type === 'performer') {
        const performer = await stashDb.getPerformer(parsed.data);
        details = performer && {
          ...mapPerformerDetails(performer, stashDbOrigin()),
          whisparr: await getMonitorStatus(req, 'performer', performer.id),
        };
      } else {
        const tag = await stashDb.getTag(parsed.data);
        details = tag && {
          id: tag.id,
          name: tag.name,
          description: tag.description ?? undefined,
        };
      }

      if (!details) {
        return next({ status: 404, message: 'Not found.' });
      }

      return res.status(200).json(details);
    } catch (e) {
      return handleError(e, next, 'Unable to retrieve scene filter.', {
        type: req.params.type,
        id: parsed.data,
      });
    }
  }
);

sceneRoutes.post<{ type: string; id: string }>(
  '/:type/:id/monitor',
  isAuthenticated(Permission.MANAGE_REQUESTS),
  async (req, res, next) => {
    const parsedId = sceneId.safeParse(req.params.id);
    const body = monitorBody.safeParse(req.body);
    const type = req.params.type;

    if (!parsedId.success || (type !== 'performer' && type !== 'studio')) {
      return next({ status: 404, message: 'Not found.' });
    }

    if (!body.success) {
      return next({ status: 400, message: 'Invalid monitor request.' });
    }

    const whisparr = whisparrClient();

    if (!whisparr) {
      return next({
        status: 409,
        message: 'No default Whisparr server is configured.',
      });
    }

    try {
      const { server, api } = whisparr;
      const credit = await api.setCreditMonitored(
        type,
        parsedId.data,
        body.data.monitored,
        {
          qualityProfileId: server.activeProfileId,
          rootFolderPath: server.activeDirectory,
          tags: server.tags ?? [],
          searchOnAdd: body.data.search && !server.preventSearch,
        }
      );

      return res.status(200).json({
        monitored: !!credit?.monitored,
        serviceUrl: creditUrl(server, type, parsedId.data),
      } satisfies WhisparrMonitorStatus);
    } catch (e) {
      logger.error('Unable to update Whisparr monitoring', {
        label: 'API',
        type,
        foreignId: parsedId.data,
        errorMessage: e.message,
      });
      return next({ status: 500, message: 'Unable to update Whisparr.' });
    }
  }
);

sceneRoutes.get('/:sceneId', async (req, res, next) => {
  const parsed = sceneId.safeParse(req.params.sceneId);

  if (!parsed.success) {
    return next({ status: 404, message: 'Scene not found.' });
  }

  try {
    const scene = await StashDbAPI.fromSettings().getScene(parsed.data);

    if (!scene || scene.deleted) {
      return next({ status: 404, message: 'Scene not found.' });
    }

    const media = await Media.getMediaByStashId(scene.id);

    return res
      .status(200)
      .json(mapSceneDetails(scene, stashDbOrigin(), media?.filter(req.user)));
  } catch (e) {
    return handleError(e, next, 'Unable to retrieve scene.', {
      sceneId: parsed.data,
    });
  }
});

export default sceneRoutes;
