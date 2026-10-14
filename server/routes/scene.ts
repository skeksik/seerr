import StashDbAPI, { StashDbNotConfiguredError } from '@server/api/stashdb';
import type {
  StashDbSceneList,
  StashDbSceneSort,
} from '@server/api/stashdb/interfaces';
import Media from '@server/entity/Media';
import { getSettings } from '@server/lib/settings';
import logger from '@server/logger';
import type {
  SceneFilterDetails,
  SceneListResponse,
} from '@server/models/Scene';
import { mapSceneDetails, mapSceneResult } from '@server/models/Scene';
import type { NextFunction } from 'express';
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
      let details: SceneFilterDetails | null;

      if (req.params.type === 'studio') {
        const studio = await stashDb.getStudio(parsed.data);
        details = studio && {
          id: studio.id,
          name: studio.name,
          imageUrl: studio.images[0]?.url,
        };
      } else if (req.params.type === 'performer') {
        const performer = await stashDb.getPerformer(parsed.data);
        details = performer && {
          id: performer.id,
          name: performer.disambiguation
            ? `${performer.name} (${performer.disambiguation})`
            : performer.name,
          imageUrl: performer.images[0]?.url,
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
      .json(
        mapSceneDetails(
          scene,
          new URL(getSettings().stashdb.endpoint).origin,
          media?.filter(req.user)
        )
      );
  } catch (e) {
    return handleError(e, next, 'Unable to retrieve scene.', {
      sceneId: parsed.data,
    });
  }
});

export default sceneRoutes;
