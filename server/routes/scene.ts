import type { WhisparrCreditType } from '@server/api/servarr/whisparr';
import WhisparrAPI from '@server/api/servarr/whisparr';
import type { StashDbSceneQuery } from '@server/api/stashdb';
import StashDbAPI, { StashDbNotConfiguredError } from '@server/api/stashdb';
import type {
  StashDbSceneList,
  StashDbSceneSort,
  StashDbSceneSummary,
} from '@server/api/stashdb/interfaces';
import TpdbAPI from '@server/api/tpdb';
import { MediaType } from '@server/constants/media';
import Media from '@server/entity/Media';
import type { User } from '@server/entity/User';
import { isOnWatchlist } from '@server/lib/adultMedia';
import { mergedStudioList } from '@server/lib/mergedStudios';
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
  tagHint,
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

// Each sort with its stash-box order and direction
const sceneSorts = {
  trending: ['TRENDING', 'DESC'],
  popularity: ['POPULARITY', 'DESC'],
  popularity_asc: ['POPULARITY', 'ASC'],
  date: ['DATE', 'DESC'],
  oldest: ['DATE', 'ASC'],
  title: ['TITLE', 'ASC'],
  title_desc: ['TITLE', 'DESC'],
  duration: ['DURATION', 'DESC'],
  duration_asc: ['DURATION', 'ASC'],
  created_at: ['CREATED_AT', 'DESC'],
  created_at_asc: ['CREATED_AT', 'ASC'],
} as const satisfies Record<string, [StashDbSceneSort, 'ASC' | 'DESC']>;

const sortValues = Object.keys(sceneSorts) as [
  keyof typeof sceneSorts,
  ...(keyof typeof sceneSorts)[],
];

const uuids = z
  .string()
  .transform((value) => value.split(',').filter(Boolean))
  .pipe(z.array(z.string().uuid()).max(25));

const filterMode = z.enum(['and', 'or']).optional();

// The Filters panel; lists and filter suggestions take the same
const sceneFilters = z.object({
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

type SceneFilters = z.infer<typeof sceneFilters>;

const discoverQuery = sceneFilters.extend({
  page: z.coerce.number().int().positive().default(1),
  sort: z.enum(sortValues).default('trending'),
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

// What lists need besides the picked filters, looked up once per request
interface SceneContext {
  tagIds: StashDbOrientationTagIds;
}

// Names that find StashDB's group tags
const GROUP_TAG_SEARCHES = ['some (', 'Gangbang (', 'Orgy ('];

// Orientation tag ids for this stash-box instance; without them the cast
// alone decides
const orientationTagIds = async (
  api: StashDbAPI
): Promise<StashDbOrientationTagIds> => {
  try {
    const names = Object.values(STASHDB_ORIENTATION_TAGS).filter(
      (name): name is string => !!name
    );
    const [ids, groupTags] = await Promise.all([
      api.getTagIds([
        ...names,
        ...Object.values(STASHDB_MISSING_PERFORMER_TAGS),
      ]),
      // Group tags, like "Threesome (BGG)" or "Orgy (Lesbian)"
      Promise.all(GROUP_TAG_SEARCHES.map((name) => api.queryTags(name)))
        .then((lists) => lists.flat())
        // The cast still decides without them
        .catch(() => []),
    ]);
    return {
      groups: Object.fromEntries(
        groupTags.flatMap((tag) => {
          const hint = tagHint(tag.name);
          return hint ? [[tag.id, hint]] : [];
        })
      ),
      orientations: Object.fromEntries(
        ORIENTATIONS.flatMap((orientation) => {
          const name = STASHDB_ORIENTATION_TAGS[orientation];
          const id = name ? ids[name] : undefined;
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

const sceneContext = async (api: StashDbAPI): Promise<SceneContext> => {
  return { tagIds: await orientationTagIds(api) };
};

// Lists read this many scenes a page when most may be filtered out here
const DENSE_PAGE_SIZE = 100;

// Filtered lists can take StashDB longer than the client's 15s
const LIST_TIMEOUT = 60000;

const emptyList: StashDbSceneList = { count: 0, scenes: [] };

interface ScenePlan {
  query: StashDbSceneQuery;
  filter: SceneListFilter;
  dense: boolean;
  // Asked for tagged scenes only, which leaves out unidentified ones
  narrowed: boolean;
}

// The stash-box query for the picked filters, and what is left to filter
// here
const planScenes = (
  user: User | undefined,
  filters: SceneFilters,
  { tagIds: orientationIds }: SceneContext,
  narrow = true
): ScenePlan => {
  const hidden = hiddenOrientations(user, filters.orientation);
  const idsOf = (keys: Orientation[]) =>
    keys.flatMap((key) => {
      const id = orientationIds.orientations[key];
      return id ? [id] : [];
    });
  const picked = [
    ...(filters.tags ?? []),
    ...(filters.tag ? [filters.tag] : []),
  ];
  const anyTag = filters.tagMode === 'or';
  const needed = idsOf(tagsNeeded(hidden));
  // Without straight, scenes tagged with a shown orientation are asked for:
  // any of them without picked tags, or the one shown next to all of those
  const narrowed =
    narrow &&
    needed.length > 0 &&
    (!picked.length || (needed.length === 1 && !anyTag));
  const tagIds = !narrowed
    ? picked
    : picked.length
      ? [...picked, ...needed]
      : needed;
  // Tags of hidden features go along when no tag is included; a hidden
  // audience tag cannot, as the scene may suit a shown one too
  const featureTags = tagIds.length
    ? []
    : idsOf(FEATURE_ORIENTATIONS.filter((key) => hidden.has(key)));
  const exclude = {
    studioIds: filters.studioExclude ?? [],
    performerIds: filters.performerExclude ?? [],
    tagIds: filters.tagsExclude ?? [],
  };
  const today = new Date().toISOString().slice(0, 10);

  return {
    query: {
      studioIds: filters.studio,
      performerIds: filters.performer,
      tagIds,
      any: {
        performers: filters.performerMode === 'or',
        tags: narrowed && !picked.length ? true : anyTag,
      },
      exclude: { ...exclude, tagIds: [...exclude.tagIds, ...featureTags] },
      date: filters.upcoming
        ? { value: today, modifier: 'GREATER_THAN' }
        : filters.releaseDate
          ? {
              value: filters.releaseDate,
              modifier:
                filters.released === 'before' ? 'LESS_THAN' : 'GREATER_THAN',
            }
          : undefined,
    },
    filter: { hidden, exclude },
    // Hiding straight without asking for other tags leaves few per page
    dense: hidden.has('straight') && !narrowed,
    narrowed,
  };
};

// Leaves out what stash-box could not: exclusions next to inclusions on the
// same field, and hidden sexual preferences
const filterScenes = async (
  api: StashDbAPI,
  scenes: StashDbSceneSummary[],
  { hidden, exclude }: SceneListFilter,
  tagIds: StashDbOrientationTagIds
): Promise<StashDbSceneSummary[]> => {
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
      !(hidden.size && isHidden(classifyScene(scene, tagIds), hidden))
  );
};

// A list for the viewer: filtered, with media info and sexual preferences.
// Without a filter, the viewer's defaults apply
const mapSceneList = async (
  list: StashDbSceneList,
  page: number,
  user?: User,
  options: {
    filter?: SceneListFilter;
    perPage?: number;
    context?: SceneContext;
  } = {}
): Promise<SceneListResponse> => {
  const api = StashDbAPI.fromSettings();
  const context = options.context ?? (await sceneContext(api));
  const filter = options.filter ?? planScenes(user, {}, context).filter;
  const scenes = await filterScenes(api, list.scenes, filter, context.tagIds);
  const media = await Media.getRelatedScenes(
    scenes.map((s) => s.id),
    user
  );

  return {
    page,
    totalPages: Math.ceil(list.count / (options.perPage ?? PAGE_SIZE)),
    totalResults: list.count,
    results: scenes.map((scene) => ({
      ...mapSceneResult(
        scene,
        media.find((m) => m.stashId === scene.id)
      ),
      orientations: classifyScene(scene, context.tagIds),
    })),
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

  const { page, sort, ...filters } = parsed.data;

  try {
    const api = StashDbAPI.fromSettings();
    const context = await sceneContext(api);
    const plan = planScenes(req.user, filters, context);
    const perPage = plan.dense ? DENSE_PAGE_SIZE : PAGE_SIZE;
    // Upcoming rows want the soonest first
    const [order, direction] = filters.upcoming
      ? (['DATE', 'ASC'] as const)
      : sceneSorts[sort];
    const query = { page, sort: order, direction, timeout: LIST_TIMEOUT };
    // Unidentified scenes carry no orientation tag, so when they show next
    // to tagged ones they are read apart and joined in
    const unidentified =
      plan.narrowed && !plan.filter.hidden.has('unidentified')
        ? planScenes(req.user, filters, context, false)
        : undefined;
    const [list, extra] = await Promise.all([
      api.queryScenes({ ...plan.query, ...query, perPage }),
      unidentified
        ? api.queryScenes({
            ...unidentified.query,
            ...query,
            perPage: DENSE_PAGE_SIZE,
          })
        : undefined,
    ]);
    const [main, rest] = await Promise.all([
      mapSceneList(list, page, req.user, {
        filter: plan.filter,
        perPage,
        context,
      }),
      unidentified && extra
        ? mapSceneList(extra, page, req.user, {
            filter: {
              ...unidentified.filter,
              hidden: new Set(
                ORIENTATIONS.filter((key) => key !== 'unidentified')
              ),
            },
            perPage: DENSE_PAGE_SIZE,
            context,
          })
        : undefined,
    ]);

    return res.status(200).json(
      rest
        ? {
            ...main,
            totalPages: Math.max(main.totalPages, rest.totalPages),
            results: [...main.results, ...rest.results],
          }
        : main
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

const lookupQuery = sceneFilters.extend({
  query: z.string().trim().min(1),
});

type LookupType = 'studios' | 'performers' | 'tags';

const lookupTypes: LookupType[] = ['studios', 'performers', 'tags'];

// The picked filters with a suggestion added to its field: alone where the
// field takes any of its values, next to the others where it needs all
const withSuggestion = (
  filters: SceneFilters,
  type: LookupType,
  id: string
): SceneFilters =>
  type === 'studios'
    ? { ...filters, studio: [id] }
    : type === 'performers'
      ? {
          ...filters,
          performer:
            filters.performerMode === 'or'
              ? [id]
              : [...(filters.performer ?? []), id],
        }
      : {
          ...filters,
          tag: undefined,
          tags:
            filters.tagMode === 'or'
              ? [id]
              : [
                  ...(filters.tags ?? []),
                  ...(filters.tag ? [filters.tag] : []),
                  id,
                ],
        };

// Drops suggestions that would find no scene next to everything else picked
const withMatches = async <T extends { id: string }>(
  api: StashDbAPI,
  user: User | undefined,
  type: LookupType,
  results: T[],
  filters: SceneFilters
): Promise<T[]> => {
  const context = await sceneContext(api);
  const picked = Object.entries(filters).some(
    ([key, value]) =>
      !['performerMode', 'tagMode', 'released'].includes(key) &&
      value !== undefined
  );

  // With nothing picked or hidden, every suggestion has scenes
  if (
    results.length === 0 ||
    (!picked && hiddenOrientations(user).size === 0)
  ) {
    return results;
  }

  try {
    const counts = await api.countScenes(
      results.map(
        (result) =>
          planScenes(user, withSuggestion(filters, type, result.id), context)
            .query
      )
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

    // ThePornDB sites StashDB has no studio for join the studios by name
    if (type === 'studios' && sort === 'name' && TpdbAPI.isConfigured()) {
      const list = mergedStudioList(api, TpdbAPI.fromSettings(), query);
      const results = await list.page(page, RANKED_PAGE_SIZE);

      return res.status(200).json({
        page,
        totalPages: Math.ceil(list.total / RANKED_PAGE_SIZE),
        totalResults: list.total,
        results,
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
  const type = req.params.type as LookupType;

  if (!lookupTypes.includes(type)) {
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
      .json(await withMatches(stashDb, req.user, type, results, filters));
  } catch (e) {
    return handleError(e, next, 'Unable to search StashDB.', {
      type,
      query: req.query.query,
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

// The StashDB scenes a ThePornDB movie is cut into, found by the
// fingerprints and studio pages ThePornDB keeps for its scenes
sceneRoutes.get<{ movieId: string }>(
  '/movie/:movieId',
  async (req, res, next) => {
    const movieId = z.string().uuid().safeParse(req.params.movieId);

    if (!movieId.success) {
      return next({ status: 404, message: 'Movie not found.' });
    }

    try {
      const movie = await TpdbAPI.fromSettings().getMovie(movieId.data);
      const parts = movie?.scenes ?? [];

      if (parts.length === 0) {
        return res.status(200).json(await mapSceneList(emptyList, 1, req.user));
      }

      const api = StashDbAPI.fromSettings();
      const byFingerprint = await api.findScenesByFingerprints(
        parts.map((part) =>
          (part.hashes ?? []).flatMap(({ hash, type }) =>
            type === 'OSHASH' || type === 'PHASH' || type === 'MD5'
              ? [{ hash, algorithm: type }]
              : []
          )
        )
      );
      const unmatched = parts.filter(
        (part, i) => !byFingerprint[i]?.length && part.url
      );
      const byUrl = await api.findScenesByUrls(
        unmatched.map((part) => part.url as string)
      );
      const scenes = parts.flatMap((part, i) => {
        const found =
          byFingerprint[i]?.[0] ?? byUrl[unmatched.indexOf(part)] ?? undefined;
        return found ? [found] : [];
      });
      const unique = scenes.filter(
        (scene, i) => scenes.findIndex((other) => other.id === scene.id) === i
      );

      return res
        .status(200)
        .json(
          await mapSceneList(
            { count: unique.length, scenes: unique },
            1,
            req.user
          )
        );
    } catch (e) {
      return handleError(e, next, 'Unable to retrieve the movie scenes.', {
        movieId: movieId.data,
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
    const api = StashDbAPI.fromSettings();
    const scene = await api.getScene(parsed.data);

    if (!scene || scene.deleted) {
      return next({ status: 404, message: 'Scene not found.' });
    }

    const media = await Media.getMediaByStashId(scene.id);

    return res.status(200).json({
      ...mapSceneDetails(scene, stashDbOrigin(), media?.filter(req.user)),
      orientations: classifyScene(scene, await orientationTagIds(api)),
      onUserWatchlist: await isOnWatchlist(MediaType.SCENE, scene.id, req.user),
    });
  } catch (e) {
    return handleError(e, next, 'Unable to retrieve scene.', {
      sceneId: parsed.data,
    });
  }
});

export default sceneRoutes;
