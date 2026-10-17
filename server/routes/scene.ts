import type {
  WhisparrCredit,
  WhisparrCreditType,
} from '@server/api/servarr/whisparr';
import WhisparrAPI from '@server/api/servarr/whisparr';
import type { StashDbSceneQuery } from '@server/api/stashdb';
import StashDbAPI from '@server/api/stashdb';
import type {
  StashDbSceneList,
  StashDbSceneSort,
  StashDbSceneSummary,
} from '@server/api/stashdb/interfaces';
import TpdbAPI from '@server/api/tpdb';
import { MediaType } from '@server/constants/media';
import Media from '@server/entity/Media';
import type { User } from '@server/entity/User';
import {
  handleError,
  lookupQuery,
  mergeByDate,
  pageParam,
  pageQuery,
  pickedAndExcluded,
  searchQuery,
  sharedFilters,
  stashDbDate,
  withoutSeen,
} from '@server/lib/adultLists';
import { isOnWatchlist } from '@server/lib/adultMedia';
import { mergedStudioList } from '@server/lib/mergedStudios';
import type {
  Narrow,
  Orientation,
  StashDbOrientationTagIds,
} from '@server/lib/orientation';
import {
  ORIENTATIONS,
  STASHDB_MISSING_PERFORMER_TAGS,
  STASHDB_ORIENTATION_TAGS,
  classifyScene,
  isHidden,
  joinedPlan,
  onlyUnidentified,
  planOrientationTags,
  tagHint,
} from '@server/lib/orientation';
import { Permission } from '@server/lib/permissions';
import { getSettings } from '@server/lib/settings';
import {
  getWhisparrServer,
  whisparrServiceUrl,
} from '@server/lib/whisparrMedia';
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
import { today } from '@server/utils/dateHelpers';
import type { Request } from 'express';
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

// The Filters panel
const sceneFilters = z.object({
  // Comma-separated StashDB ids
  studio: uuids.optional(),
  performer: uuids.optional(),
  tags: uuids.optional(),
  studioExclude: uuids.optional(),
  performerExclude: uuids.optional(),
  tagsExclude: uuids.optional(),
  ...sharedFilters,
});

// Recommendations ask for scenes with any of the performers
type SceneFilters = z.infer<typeof sceneFilters> & { anyPerformer?: boolean };

const discoverQuery = sceneFilters.extend({
  page: pageParam,
  sort: z.enum(sortValues).default('popularity'),
});

const sceneId = z.string().uuid();

const monitorBody = z.object({
  monitored: z.boolean(),
  search: z.boolean().default(false),
});

const stashDbOrigin = () => new URL(getSettings().stashdb.endpoint).origin;

const whisparrClient = () => {
  const server = getWhisparrServer(false);

  return server ? { server, api: WhisparrAPI.forServer(server) } : undefined;
};

const monitorStatus = async (
  whisparr: NonNullable<ReturnType<typeof whisparrClient>>,
  type: WhisparrCreditType,
  foreignId: string,
  credit: WhisparrCredit | null
): Promise<WhisparrMonitorStatus> => {
  let moviesAvailable: boolean | undefined;

  if (credit) {
    try {
      moviesAvailable = WhisparrAPI.canMonitorMovies(
        credit,
        await whisparr.api.getMovieMetadataSource()
      );
    } catch (e) {
      logger.debug('Unable to retrieve the Whisparr movie metadata source', {
        label: 'API',
        errorMessage: e.message,
      });
    }
  }

  return {
    monitored: !!credit?.monitored,
    moviesMonitored: !!credit?.moviesMonitored,
    moviesAvailable,
    serviceUrl: whisparrServiceUrl(whisparr.server, `/${type}/${foreignId}`),
  };
};

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
    return await monitorStatus(whisparr, type, foreignId, credit);
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

// Names that find StashDB's group and point of view tags
const GROUP_TAG_SEARCHES = ['some (', 'Gangbang (', 'Orgy (', 'POV'];

// Tags are rarely renamed, so their ids are kept for hours per client, which
// is one per endpoint and key
const ORIENTATION_TAG_TTL = 6 * 60 * 60 * 1000;
const keptTagIds = new WeakMap<
  StashDbAPI,
  { ids: StashDbOrientationTagIds; expires: number }
>();

// Orientation tag ids for this stash-box instance; without them the cast
// alone decides
const orientationIds = async (
  api: StashDbAPI
): Promise<StashDbOrientationTagIds> => {
  const kept = keptTagIds.get(api);
  if (kept && kept.expires > Date.now()) {
    return kept.ids;
  }

  try {
    const names = Object.values(STASHDB_ORIENTATION_TAGS).filter(
      (name): name is string => !!name
    );
    let complete = true;
    const [ids, groupTags] = await Promise.all([
      api.getTagIds([
        ...names,
        ...Object.values(STASHDB_MISSING_PERFORMER_TAGS),
      ]),
      // Group tags, like "Threesome (BGG)" or "Orgy (Lesbian)"
      Promise.all(GROUP_TAG_SEARCHES.map((name) => api.queryTags(name)))
        .then((lists) => lists.flat())
        // The cast still decides without them, until they are looked up again
        .catch(() => {
          complete = false;
          return [];
        }),
    ]);
    const tagIds: StashDbOrientationTagIds = {
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

    if (complete) {
      keptTagIds.set(api, {
        ids: tagIds,
        expires: Date.now() + ORIENTATION_TAG_TTL,
      });
    }
    return tagIds;
  } catch (e) {
    logger.debug('Unable to look up StashDB orientation tags', {
      label: 'API',
      errorMessage: e.message,
    });
    return { orientations: {}, missing: {} };
  }
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
  // No scene can show, like with a tag both picked and excluded
  empty: boolean;
  // A picked tag stands for an orientation, so no scene is unidentified
  identified: boolean;
}

// The stash-box query for the picked filters, and what is left to filter
// here
const planScenes = (
  user: User | undefined,
  filters: SceneFilters,
  orientationTags: StashDbOrientationTagIds,
  narrow: Narrow = 'needed'
): ScenePlan => {
  const { hidden, tagIds, anyTag, hiddenTagIds, narrowed, empty, identified } =
    planOrientationTags(
      user,
      {
        orientation: filters.orientation,
        picked: filters.tags ?? [],
        excluded: filters.tagsExclude,
      },
      orientationTags.orientations,
      narrow
    );
  const exclude = {
    studioIds: filters.studioExclude ?? [],
    performerIds: filters.performerExclude ?? [],
    tagIds: filters.tagsExclude ?? [],
  };

  return {
    query: {
      studioIds: filters.studio,
      performerIds: filters.performer,
      tagIds,
      any: { performers: !!filters.anyPerformer, tags: anyTag },
      // A scene with a hidden orientation's tag is always hidden, so those
      // go along too when no tag is included
      exclude: {
        ...exclude,
        tagIds: [...new Set([...exclude.tagIds, ...hiddenTagIds])],
      },
      date: filters.upcoming
        ? { value: today(), modifier: 'GREATER_THAN' }
        : filters.releaseDate
          ? stashDbDate(filters.releaseDate, filters.released)
          : undefined,
    },
    filter: { hidden, exclude },
    // Hiding straight without asking for other tags leaves few per page
    dense: hidden.has('straight') && !narrowed,
    narrowed,
    empty: empty || (!filters.anyPerformer && pickedAndExcluded(filters)),
    identified,
  };
};

// A scene with the sexual preferences it suits, classified once
interface ClassifiedScene {
  scene: StashDbSceneSummary;
  orientations: Orientation[];
}

// Leaves out what stash-box could not: exclusions next to inclusions on the
// same field, and hidden sexual preferences
const filterScenes = async (
  api: StashDbAPI,
  scenes: StashDbSceneSummary[],
  { hidden, exclude }: SceneListFilter,
  tagIds: StashDbOrientationTagIds
): Promise<ClassifiedScene[]> => {
  const studios = new Set(
    exclude?.studioIds?.length
      ? await api.withChildStudios(exclude.studioIds)
      : []
  );
  const performers = new Set(exclude?.performerIds);
  const tags = new Set(exclude?.tagIds);

  return scenes
    .filter(
      (scene) =>
        !(scene.studio && studios.has(scene.studio.id)) &&
        !(scene.studio?.parent && studios.has(scene.studio.parent.id)) &&
        !scene.performers.some(({ performer }) =>
          performers.has(performer.id)
        ) &&
        !scene.tags?.some((tag) => tags.has(tag.id))
    )
    .map((scene) => ({ scene, orientations: classifyScene(scene, tagIds) }))
    .filter(
      ({ orientations }) => !(hidden.size && isHidden(orientations, hidden))
    );
};

// A list for the viewer: filtered, with media info and sexual preferences.
// Without a filter, the viewer's defaults apply
const mapSceneList = async (
  api: StashDbAPI,
  list: StashDbSceneList,
  page: number,
  user?: User,
  options: {
    filter?: SceneListFilter;
    perPage?: number;
    tagIds?: StashDbOrientationTagIds;
  } = {}
): Promise<SceneListResponse> => {
  const totals = {
    page,
    totalPages: Math.ceil(list.count / (options.perPage ?? PAGE_SIZE)),
    totalResults: list.count,
  };

  if (list.scenes.length === 0) {
    return { ...totals, results: [] };
  }

  const tagIds = options.tagIds ?? (await orientationIds(api));
  const filter = options.filter ?? planScenes(user, {}, tagIds).filter;
  const scenes = await filterScenes(api, list.scenes, filter, tagIds);
  const media = await Media.getRelatedScenes(
    scenes.map(({ scene }) => scene.id),
    user
  );
  const byId = new Map(media.map((m) => [m.stashId, m]));

  return {
    ...totals,
    results: scenes.map(({ scene, orientations }) => ({
      ...mapSceneResult(scene, byId.get(scene.id)),
      orientations,
    })),
  };
};

// Whether every included studio is excluded, itself or as one under an
// excluded studio
const studiosExcluded = async (
  api: StashDbAPI,
  { studio, studioExclude }: SceneFilters
): Promise<boolean> => {
  if (!studio?.length || !studioExclude?.length) {
    return false;
  }
  const excluded = new Set(await api.withChildStudios(studioExclude));
  return studio.every((id) => excluded.has(id));
};

// The Scenes tab's list: the picked filters, the viewer's sexual
// preferences and the order, as far as stash-box can ask for them
const discoverScenes = async (
  api: StashDbAPI,
  user: User | undefined,
  filters: SceneFilters,
  page: number,
  sort: keyof typeof sceneSorts
): Promise<SceneListResponse> => {
  const tagIds = await orientationIds(api);
  const plan = planScenes(user, filters, tagIds);

  // Filters that leave nothing, like a tag both picked and excluded, find
  // no scene rather than pages of nothing
  if (plan.empty || (await studiosExcluded(api, filters))) {
    return { page, totalPages: 1, totalResults: 0, results: [] };
  }

  const perPage = plan.dense ? DENSE_PAGE_SIZE : PAGE_SIZE;
  // Upcoming rows want the soonest first
  const [order, direction] = filters.upcoming
    ? (['DATE', 'ASC'] as const)
    : sceneSorts[sort];
  const query = { page, sort: order, direction, timeout: LIST_TIMEOUT };
  const joined = joinedPlan(plan, (narrow) =>
    planScenes(user, filters, tagIds, narrow)
  );
  const [list, extra] = await Promise.all([
    api.queryScenes({ ...plan.query, ...query, perPage }),
    joined
      ? api.queryScenes({
          ...joined.query,
          ...query,
          perPage: DENSE_PAGE_SIZE,
        })
      : undefined,
  ]);
  const [main, rest] = await Promise.all([
    mapSceneList(api, list, page, user, {
      filter: plan.filter,
      perPage,
      tagIds,
    }),
    joined && extra
      ? mapSceneList(api, extra, page, user, {
          filter: onlyUnidentified(joined.filter),
          perPage: DENSE_PAGE_SIZE,
          tagIds,
        })
      : undefined,
  ]);

  if (!rest) {
    return main;
  }

  return {
    ...main,
    totalPages: Math.max(main.totalPages, rest.totalPages),
    results: mergeByDate(
      main.results,
      withoutSeen(rest.results, main.results),
      (scene) => scene.releaseDate,
      order === 'DATE' ? direction : undefined
    ),
  };
};

sceneRoutes.get('/discover', async (req, res, next) => {
  const parsed = discoverQuery.safeParse(req.query);

  if (!parsed.success) {
    return next({ status: 400, message: 'Invalid discover parameters.' });
  }

  const { page, sort, ...filters } = parsed.data;

  try {
    return res
      .status(200)
      .json(
        await discoverScenes(
          StashDbAPI.fromSettings(),
          req.user,
          filters,
          page,
          sort
        )
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
    const api = StashDbAPI.fromSettings();
    const list = await api.searchScenes({ query, page, perPage: PAGE_SIZE });

    return res.status(200).json(await mapSceneList(api, list, page, req.user));
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

const studioListQuery = z.object({
  type: z.enum(['studios', 'networks']).default('studios'),
  page: pageParam,
  sort: z
    .enum([
      'name',
      'name_desc',
      'newest',
      'newest_asc',
      'trending',
      'popular',
      'popular_asc',
    ])
    .default('name'),
  query: z.string().trim().optional(),
});

// Networks are top-level studios with studios under them; StashDB cannot
// filter on that, so each page reads this many top-level studios
const NETWORK_PAGE_READS = 3;
const NETWORK_READ_SIZE = 100;
const STUDIO_PAGE_SIZE = 40;

// The full lists behind the Studios and Networks rows
sceneRoutes.get('/studios', async (req, res, next) => {
  const parsed = studioListQuery.safeParse(req.query);

  if (!parsed.success) {
    return next({ status: 400, message: 'Invalid studio list parameters.' });
  }

  const { type, page, sort, query } = parsed.data;
  try {
    const api = StashDbAPI.fromSettings();

    if (sort === 'trending' || sort.startsWith('popular')) {
      const rank = rankStudios(
        await api.getSceneStudios(
          sort === 'trending' ? 'TRENDING' : 'POPULARITY'
        ),
        type
      );
      const ranked = (sort === 'popular_asc' ? rank.reverse() : rank).filter(
        (studio) =>
          !query || studio.name.toLowerCase().includes(query.toLowerCase())
      );

      return res.status(200).json({
        page,
        totalPages: Math.ceil(ranked.length / STUDIO_PAGE_SIZE),
        totalResults: ranked.length,
        results: ranked.slice(
          (page - 1) * STUDIO_PAGE_SIZE,
          page * STUDIO_PAGE_SIZE
        ),
      });
    }

    // ThePornDB sites StashDB has no studio for join the studios by name
    if (type === 'studios' && sort === 'name' && TpdbAPI.isConfigured()) {
      const list = mergedStudioList(api, TpdbAPI.fromSettings(), query);
      const results = await list.page(page, STUDIO_PAGE_SIZE);

      return res.status(200).json({
        page,
        totalPages: Math.ceil(list.total / STUDIO_PAGE_SIZE),
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
          perPage: type === 'networks' ? NETWORK_READ_SIZE : STUDIO_PAGE_SIZE,
          sort: sort.startsWith('newest') ? 'CREATED_AT' : 'NAME',
          direction: sort === 'name_desc' || sort === 'newest' ? 'DESC' : 'ASC',
          name: query,
          topLevel: type === 'networks',
        })
      )
    );
    const count = lists[0]?.count ?? 0;
    const perPage =
      type === 'networks'
        ? NETWORK_READ_SIZE * NETWORK_PAGE_READS
        : STUDIO_PAGE_SIZE;

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

// Autocomplete for the scene filters: what StashDB's search finds
sceneRoutes.get<{ type: string }>('/lookup/:type', async (req, res, next) => {
  const parsed = lookupQuery.safeParse(req.query);
  const type = req.params.type;

  if (!['studios', 'performers', 'tags'].includes(type)) {
    return next({ status: 404, message: 'Not found.' });
  }

  if (!parsed.success) {
    return next({ status: 400, message: 'A query is required.' });
  }

  try {
    const { query } = parsed.data;
    const stashDb = StashDbAPI.fromSettings();
    const results =
      type === 'studios'
        ? await stashDb.searchStudios(query)
        : type === 'performers'
          ? await stashDb.searchPerformers(query)
          : await stashDb.searchTags(query);

    return res.status(200).json(results);
  } catch (e) {
    return handleError(e, next, 'Unable to search StashDB.', {
      type,
      query: req.query.query,
    });
  }
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

      if (performerIds.length === 0) {
        return res
          .status(200)
          .json(await mapSceneList(stashDb, emptyList, 1, req.user));
      }

      // The Scenes tab's list of them, so sexual preferences narrow it the
      // same way
      const list = await discoverScenes(
        stashDb,
        req.user,
        { performer: performerIds, anyPerformer: true },
        query.data.page,
        'popularity'
      );

      // It has its own performers, so it is among them
      return res.status(200).json({
        ...list,
        totalResults: Math.max(list.totalResults - 1, 0),
        results: list.results.filter((result) => result.id !== scene.id),
      });
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
      const orientationTags = await orientationIds(stashDb);
      const plan = planScenes(req.user, {}, orientationTags);
      const popular = (ids: string[]) =>
        stashDb.queryScenes({
          perPage: SIMILAR_POOL,
          sort: 'POPULARITY',
          tagIds: ids,
          any: { tags: true },
          // StashDB sorts most of its catalogue by popularity when a scene
          // has many tags, which takes 10-20s
          timeout: SIMILAR_TIMEOUT,
        });
      // Without straight, the popular ones are mostly hidden, so popular
      // scenes tagged with a shown orientation are ranked too
      const pools = tagIds.size
        ? await Promise.all([
            popular([...tagIds]),
            plan.narrowed ? popular(plan.query.tagIds ?? []) : emptyList,
          ])
        : [];
      const candidates = [
        ...new Map(
          pools.flatMap(({ scenes }) => scenes).map((s) => [s.id, s])
        ).values(),
      ];
      const shared = (candidate: { tags?: { id: string }[] }) =>
        (candidate.tags ?? []).filter((tag) => tagIds.has(tag.id)).length;
      // Hidden sexual preferences go before the top ones are picked, so they
      // don't take their places
      const shown = await filterScenes(
        stashDb,
        candidates,
        plan.filter,
        orientationTags
      );
      // Array.sort is stable, so popularity breaks ties
      const ranked = shown
        .map(({ scene: candidate }) => candidate)
        .filter((candidate) => candidate.id !== scene.id)
        .sort((a, b) => shared(b) - shared(a))
        .slice(0, SIMILAR_LIMIT);
      const start = (query.data.page - 1) * PAGE_SIZE;

      return res.status(200).json(
        await mapSceneList(
          stashDb,
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
      const api = StashDbAPI.fromSettings();

      if (parts.length === 0) {
        return res
          .status(200)
          .json(await mapSceneList(api, emptyList, 1, req.user));
      }

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
      const urlScenes = new Map(unmatched.map((part, i) => [part, byUrl[i]]));
      // Parts of one scene count once
      const unique = new Map<string, StashDbSceneSummary>();
      parts.forEach((part, i) => {
        const found = byFingerprint[i]?.[0] ?? urlScenes.get(part);
        if (found && !unique.has(found.id)) {
          unique.set(found.id, found);
        }
      });

      return res
        .status(200)
        .json(
          await mapSceneList(
            api,
            { count: unique.size, scenes: [...unique.values()] },
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
        const [studio, whisparr] = await Promise.all([
          stashDb.getStudio(parsed.data),
          getMonitorStatus(req, 'studio', parsed.data),
        ]);
        details = studio && {
          ...mapStudioDetails(studio, stashDbOrigin()),
          whisparr,
        };
      } else if (req.params.type === 'performer') {
        const [performer, whisparr] = await Promise.all([
          stashDb.getPerformer(parsed.data),
          getMonitorStatus(req, 'performer', parsed.data),
        ]);
        details = performer && {
          ...mapPerformerDetails(performer, stashDbOrigin()),
          whisparr,
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

      return res
        .status(200)
        .json(await monitorStatus(whisparr, type, parsedId.data, credit));
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

    const [media, tagIds, onUserWatchlist] = await Promise.all([
      Media.getAdultMedia(MediaType.SCENE, scene.id),
      orientationIds(api),
      isOnWatchlist(MediaType.SCENE, scene.id, req.user),
    ]);

    return res.status(200).json({
      ...mapSceneDetails(scene, stashDbOrigin(), media?.filter(req.user)),
      orientations: classifyScene(scene, tagIds),
      onUserWatchlist,
    });
  } catch (e) {
    return handleError(e, next, 'Unable to retrieve scene.', {
      sceneId: parsed.data,
    });
  }
});

export default sceneRoutes;
