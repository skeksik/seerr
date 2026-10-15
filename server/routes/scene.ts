import type { WhisparrCreditType } from '@server/api/servarr/whisparr';
import WhisparrAPI from '@server/api/servarr/whisparr';
import type { StashDbSceneQuery } from '@server/api/stashdb';
import StashDbAPI, { StashDbNotConfiguredError } from '@server/api/stashdb';
import type {
  StashDbSceneList,
  StashDbSceneSort,
  StashDbSceneSummary,
} from '@server/api/stashdb/interfaces';
import { MediaType } from '@server/constants/media';
import Media from '@server/entity/Media';
import type { User } from '@server/entity/User';
import { isOnWatchlist } from '@server/lib/adultMedia';
import type {
  Orientation,
  StashDbOrientationTagIds,
} from '@server/lib/orientation';
import {
  FEATURE_ORIENTATIONS,
  ORIENTATIONS,
  STASHDB_MISSING_PERFORMER_TAGS,
  STASHDB_ORIENTATION_TAGS,
  classifyScene,
  hiddenOrientations,
  isHidden,
  tagsNeeded,
} from '@server/lib/orientation';
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
  pickImage,
  rankStudios,
} from '@server/models/Scene';
import { isoDate } from '@server/utils/dateHelpers';
import type { NextFunction, Request } from 'express';
import { Router } from 'express';
import { z } from 'zod';

const PAGE_SIZE = 20;

const sceneRoutes = Router();

const sortValues = [
  'trending',
  'popularity',
  'date',
  'oldest',
  'title',
  'duration',
  'created_at',
] as const;

const uuids = z
  .string()
  .transform((value) => value.split(',').filter(Boolean))
  .pipe(z.array(z.string().uuid()).max(25));

const filterMode = z.enum(['and', 'or']).optional();

const discoverQuery = z.object({
  page: z.coerce.number().int().positive().default(1),
  sort: z.enum(sortValues).default('trending'),
  // Comma-separated StashDB ids
  studio: uuids.optional(),
  performer: uuids.optional(),
  tags: uuids.optional(),
  studioExclude: uuids.optional(),
  performerExclude: uuids.optional(),
  tagsExclude: uuids.optional(),
  // Whether a scene needs all of the performers or tags, or any
  performerMode: filterMode,
  tagMode: filterMode,
  // Comma-separated sexual preferences to show; the user's defaults if unset
  orientation: z.string().optional(),
  // Single tag, kept for older links
  tag: z.string().uuid().optional(),
  // stash-box takes one date bound
  released: z.enum(['after', 'before']).optional(),
  releaseDate: isoDate.optional(),
  upcoming: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
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

interface SceneListFilter {
  hidden: Set<Orientation>;
  exclude?: StashDbSceneQuery['exclude'];
}

// Orientation tag ids for this stash-box instance; without them the cast
// alone decides
const orientationTagIds = async (
  api: StashDbAPI
): Promise<StashDbOrientationTagIds> => {
  try {
    const ids = await api.getTagIds([
      ...Object.values(STASHDB_ORIENTATION_TAGS),
      ...Object.values(STASHDB_MISSING_PERFORMER_TAGS),
    ]);
    return {
      orientations: Object.fromEntries(
        ORIENTATIONS.flatMap((orientation) => {
          const id = ids[STASHDB_ORIENTATION_TAGS[orientation]];
          return id ? [[orientation, id]] : [];
        })
      ),
      missing: Object.fromEntries(
        Object.entries(STASHDB_MISSING_PERFORMER_TAGS).flatMap(([key, name]) =>
          ids[name] ? [[key, ids[name]]] : []
        )
      ),
    };
  } catch (e) {
    logger.debug('Unable to look up StashDB orientation tags', {
      label: 'API',
      errorMessage: e.message,
    });
    return { orientations: {}, missing: {} };
  }
};

// Leaves out what stash-box could not: exclusions next to inclusions on the
// same field, and hidden sexual preferences
const filterScenes = async (
  api: StashDbAPI,
  scenes: StashDbSceneSummary[],
  { hidden, exclude }: SceneListFilter
): Promise<StashDbSceneSummary[]> => {
  const tagIds = hidden.size ? await orientationTagIds(api) : undefined;
  const studios = new Set(
    exclude?.studioIds?.length
      ? await api.withChildStudios(exclude.studioIds)
      : []
  );
  const performers = new Set(exclude?.performerIds);
  const tags = new Set(exclude?.tagIds);

  return scenes.filter(
    (scene) =>
      !(scene.studio && studios.has(scene.studio.id)) &&
      !(scene.studio?.parent && studios.has(scene.studio.parent.id)) &&
      !scene.performers.some(({ performer }) => performers.has(performer.id)) &&
      !scene.tags?.some((tag) => tags.has(tag.id)) &&
      !(tagIds && isHidden(classifyScene(scene, tagIds), hidden))
  );
};

const mapSceneList = async (
  list: StashDbSceneList,
  page: number,
  user?: User,
  filter: SceneListFilter = { hidden: hiddenOrientations(user) }
): Promise<SceneListResponse> => {
  const scenes = await filterScenes(
    StashDbAPI.fromSettings(),
    list.scenes,
    filter
  );
  const media = await Media.getRelatedScenes(
    scenes.map((s) => s.id),
    user
  );

  return {
    page,
    totalPages: Math.ceil(list.count / PAGE_SIZE),
    totalResults: list.count,
    results: scenes.map((scene) =>
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

  const {
    page,
    sort,
    studio,
    performer,
    tags,
    tag,
    studioExclude,
    performerExclude,
    tagsExclude,
    performerMode,
    tagMode,
    orientation,
    released,
    releaseDate,
    upcoming,
  } = parsed.data;
  const today = new Date().toISOString().slice(0, 10);
  const tagIds = [...(tags ?? []), ...(tag ? [tag] : [])];

  try {
    const api = StashDbAPI.fromSettings();
    const hidden = hiddenOrientations(req.user, orientation);
    const orientationIds = hidden.size
      ? (await orientationTagIds(api)).orientations
      : {};
    const needed = tagIds.length ? [] : tagsNeeded(hidden);
    // Without straight, scenes tagged with a shown orientation are asked for.
    // Otherwise tags of hidden features go along when no tag is included; a
    // hidden audience tag cannot, as the scene may suit a shown one too
    const idsOf = (keys: Orientation[]) =>
      keys.flatMap((key) => {
        const id = orientationIds[key];
        return id ? [id] : [];
      });
    const orientationTags = idsOf(needed);
    const hiddenTags =
      tagIds.length || orientationTags.length
        ? []
        : idsOf(FEATURE_ORIENTATIONS.filter((key) => hidden.has(key)));
    const exclude = {
      studioIds: studioExclude,
      performerIds: performerExclude,
      tagIds: [...(tagsExclude ?? []), ...hiddenTags],
    };
    const list = await api.queryScenes({
      page,
      perPage: PAGE_SIZE,
      sort: upcoming
        ? 'DATE'
        : sort === 'oldest'
          ? 'DATE'
          : (sort.toUpperCase() as StashDbSceneSort),
      // Oldest-first is never what a discover row wants, titles aside
      direction:
        upcoming || sort === 'title' || sort === 'oldest' ? 'ASC' : 'DESC',
      studioIds: studio,
      performerIds: performer,
      tagIds: orientationTags.length ? orientationTags : tagIds,
      any: {
        performers: performerMode === 'or',
        tags: tagMode === 'or' || orientationTags.length > 0,
      },
      exclude,
      date: upcoming
        ? { value: today, modifier: 'GREATER_THAN' }
        : releaseDate
          ? {
              value: releaseDate,
              modifier: released === 'before' ? 'LESS_THAN' : 'GREATER_THAN',
            }
          : undefined,
    });

    return res.status(200).json(
      await mapSceneList(list, page, req.user, {
        hidden,
        exclude: { ...exclude, tagIds: tagsExclude },
      })
    );
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

    return res.status(200).json(await mapSceneList(list, page, req.user));
  } catch (e) {
    return handleError(e, next, 'Unable to retrieve scene search results.', {
      query,
    });
  }
});

const TRENDING_STUDIO_LIMIT = 20;

// Studios (or their networks) ranked by how many trending scenes they have
sceneRoutes.get('/trending-studios', async (req, res, next) => {
  const type = req.query.type === 'networks' ? 'networks' : 'studios';

  try {
    const studios = await StashDbAPI.fromSettings().getSceneStudios('TRENDING');

    return res
      .status(200)
      .json(rankStudios(studios, type).slice(0, TRENDING_STUDIO_LIMIT));
  } catch (e) {
    return handleError(e, next, 'Unable to retrieve trending studios.', {
      type,
    });
  }
});

// StashDB's sites with their icons, for links from anywhere
sceneRoutes.get('/sites', async (req, res, next) => {
  try {
    const sites = await StashDbAPI.fromSettings().getSites();

    return res
      .status(200)
      .json(
        sites.flatMap((site) =>
          site.url && site.icon
            ? [{ name: site.name, url: site.url.trim(), icon: site.icon }]
            : []
        )
      );
  } catch (e) {
    return handleError(e, next, 'Unable to retrieve StashDB sites.', {});
  }
});

const lookupQuery = z.object({
  query: z.string().trim().min(1),
  // The filters already picked, so suggestions that find nothing are left out
  studio: uuids.optional(),
  performer: uuids.optional(),
  tags: uuids.optional(),
  performerMode: filterMode,
  tagMode: filterMode,
});

type LookupType = 'studios' | 'performers' | 'tags';

const lookupField = {
  studios: 'studioIds',
  performers: 'performerIds',
  tags: 'tagIds',
} as const;

// Drops suggestions that would find no scene next to the picked filters.
// A suggestion is checked on its own field only when that field needs all
// of its values; studios and "any" fields only ever add scenes
const withMatches = async <T extends { id: string }>(
  api: StashDbAPI,
  type: LookupType,
  results: T[],
  filters: Omit<z.infer<typeof lookupQuery>, 'query'>
): Promise<T[]> => {
  const base: StashDbSceneQuery = {
    studioIds: filters.studio,
    performerIds: filters.performer,
    tagIds: filters.tags,
    any: {
      performers: filters.performerMode === 'or',
      tags: filters.tagMode === 'or',
    },
  };
  const field = lookupField[type];
  const keepOwn =
    (type === 'performers' && filters.performerMode !== 'or') ||
    (type === 'tags' && filters.tagMode !== 'or');
  const constrained = (Object.keys(lookupField) as LookupType[]).some(
    (other) => (other !== type || keepOwn) && !!base[lookupField[other]]?.length
  );

  if (!constrained || results.length === 0) {
    return results;
  }

  try {
    const counts = await api.countScenes(
      results.map((result) => ({
        ...base,
        [field]: [...(keepOwn ? (base[field] ?? []) : []), result.id],
      }))
    );
    return results.filter((_, i) => counts[i] > 0);
  } catch (e) {
    logger.debug('Unable to count scenes for filter suggestions', {
      label: 'API',
      errorMessage: e.message,
    });
    return results;
  }
};

// Autocomplete for the scene filters
const studioListQuery = z.object({
  type: z.enum(['studios', 'networks']).default('studios'),
  page: z.coerce.number().int().positive().default(1),
  sort: z.enum(['name', 'newest', 'trending', 'popular']).default('name'),
  query: z.string().trim().optional(),
});

// Networks are top-level studios with studios under them; StashDB cannot
// filter on that, so each page reads this many top-level studios
const NETWORK_PAGE_READS = 3;
const RANKED_PAGE_SIZE = 40;

// The full lists behind the Studios and Networks rows
sceneRoutes.get('/studios', async (req, res, next) => {
  const parsed = studioListQuery.safeParse(req.query);

  if (!parsed.success) {
    return next({ status: 400, message: 'Invalid studio list parameters.' });
  }

  const { type, page, sort, query } = parsed.data;
  try {
    const api = StashDbAPI.fromSettings();

    if (sort === 'trending' || sort === 'popular') {
      const ranked = rankStudios(
        await api.getSceneStudios(
          sort === 'trending' ? 'TRENDING' : 'POPULARITY'
        ),
        type
      ).filter(
        (studio) =>
          !query || studio.name.toLowerCase().includes(query.toLowerCase())
      );

      return res.status(200).json({
        page,
        totalPages: Math.ceil(ranked.length / RANKED_PAGE_SIZE),
        totalResults: ranked.length,
        results: ranked.slice(
          (page - 1) * RANKED_PAGE_SIZE,
          page * RANKED_PAGE_SIZE
        ),
      });
    }

    const reads =
      type === 'networks'
        ? Array.from(
            { length: NETWORK_PAGE_READS },
            (_, i) => (page - 1) * NETWORK_PAGE_READS + i + 1
          )
        : [page];
    const lists = await Promise.all(
      reads.map((read) =>
        api.queryStudios({
          page: read,
          perPage: type === 'networks' ? 100 : 40,
          sort: sort === 'newest' ? 'CREATED_AT' : 'NAME',
          name: query,
          topLevel: type === 'networks',
        })
      )
    );
    const count = lists[0]?.count ?? 0;
    const perPage = type === 'networks' ? 100 * NETWORK_PAGE_READS : 40;

    return res.status(200).json({
      page,
      totalPages: Math.ceil(count / perPage),
      totalResults: count,
      results: lists
        .flatMap((list) => list.studios)
        // Networks are listed apart, so each list holds one kind
        .filter((studio) =>
          type === 'networks'
            ? studio.child_studios.length > 0
            : studio.child_studios.length === 0
        )
        .map(
          (studio): SceneFilterDetails => ({
            id: studio.id,
            name: studio.name,
            imageUrl: pickImage(studio.images),
          })
        ),
    });
  } catch (e) {
    return handleError(e, next, 'Unable to retrieve studios.', {
      query: req.query,
    });
  }
});

sceneRoutes.get<{ type: string }>('/lookup/:type', async (req, res, next) => {
  const parsed = lookupQuery.safeParse(req.query);
  const { type } = req.params;

  if (!Object.keys(lookupField).includes(type)) {
    return next({ status: 404, message: 'Not found.' });
  }

  if (!parsed.success) {
    return next({ status: 400, message: 'A query is required.' });
  }

  try {
    const { query, ...filters } = parsed.data;
    const stashDb = StashDbAPI.fromSettings();
    const results =
      type === 'studios'
        ? await stashDb.searchStudios(query)
        : type === 'performers'
          ? await stashDb.searchPerformers(query)
          : await stashDb.searchTags(query);

    return res
      .status(200)
      .json(await withMatches(stashDb, type as LookupType, results, filters));
  } catch (e) {
    return handleError(e, next, 'Unable to search StashDB.', {
      type,
      query: parsed.data.query,
    });
  }
});

const pageQuery = z.object({
  page: z.coerce.number().int().positive().default(1),
});

// Similar scenes are ranked from this many popular candidates
const SIMILAR_POOL = 100;
const SIMILAR_LIMIT = 40;
const SIMILAR_TIMEOUT = 60000;

// Scenes with any of this scene's performers, most popular first
sceneRoutes.get<{ sceneId: string }>(
  '/:sceneId/recommendations',
  async (req, res, next) => {
    const id = sceneId.safeParse(req.params.sceneId);
    const query = pageQuery.safeParse(req.query);

    if (!id.success || !query.success) {
      return next({ status: 404, message: 'Scene not found.' });
    }

    try {
      const stashDb = StashDbAPI.fromSettings();
      const scene = await stashDb.getScene(id.data);

      if (!scene || scene.deleted) {
        return next({ status: 404, message: 'Scene not found.' });
      }

      const performerIds = scene.performers.map(
        ({ performer }) => performer.id
      );
      const list = performerIds.length
        ? await stashDb.queryScenes({
            page: query.data.page,
            perPage: PAGE_SIZE,
            sort: 'POPULARITY',
            performerIds,
            any: { performers: true },
          })
        : { count: 0, scenes: [] };
      const others = list.scenes.filter((s) => s.id !== scene.id);

      return res.status(200).json(
        await mapSceneList(
          {
            count: Math.max(list.count - 1, 0),
            scenes: others,
          },
          query.data.page,
          req.user
        )
      );
    } catch (e) {
      return handleError(e, next, 'Unable to retrieve recommendations.', {
        sceneId: id.data,
      });
    }
  }
);

// Popular scenes ranked by how many tags they share with this one
sceneRoutes.get<{ sceneId: string }>(
  '/:sceneId/similar',
  async (req, res, next) => {
    const id = sceneId.safeParse(req.params.sceneId);
    const query = pageQuery.safeParse(req.query);

    if (!id.success || !query.success) {
      return next({ status: 404, message: 'Scene not found.' });
    }

    try {
      const stashDb = StashDbAPI.fromSettings();
      const scene = await stashDb.getScene(id.data);

      if (!scene || scene.deleted) {
        return next({ status: 404, message: 'Scene not found.' });
      }

      const tagIds = new Set(scene.tags.map((tag) => tag.id));
      const pool = tagIds.size
        ? await stashDb.queryScenes({
            perPage: SIMILAR_POOL,
            sort: 'POPULARITY',
            tagIds: [...tagIds],
            any: { tags: true },
            // StashDB sorts most of its catalogue by popularity when a scene
            // has many tags, which takes 10-20s
            timeout: SIMILAR_TIMEOUT,
          })
        : { count: 0, scenes: [] };
      const shared = (candidate: { tags?: { id: string }[] }) =>
        (candidate.tags ?? []).filter((tag) => tagIds.has(tag.id)).length;
      // Array.sort is stable, so popularity breaks ties
      const ranked = pool.scenes
        .filter((candidate) => candidate.id !== scene.id)
        .sort((a, b) => shared(b) - shared(a))
        .slice(0, SIMILAR_LIMIT);
      const start = (query.data.page - 1) * PAGE_SIZE;

      return res.status(200).json(
        await mapSceneList(
          {
            count: ranked.length,
            scenes: ranked.slice(start, start + PAGE_SIZE),
          },
          query.data.page,
          req.user
        )
      );
    } catch (e) {
      return handleError(e, next, 'Unable to retrieve similar scenes.', {
        sceneId: id.data,
      });
    }
  }
);

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

    return res.status(200).json({
      ...mapSceneDetails(scene, stashDbOrigin(), media?.filter(req.user)),
      onUserWatchlist: await isOnWatchlist(MediaType.SCENE, scene.id, req.user),
    });
  } catch (e) {
    return handleError(e, next, 'Unable to retrieve scene.', {
      sceneId: parsed.data,
    });
  }
});

export default sceneRoutes;
