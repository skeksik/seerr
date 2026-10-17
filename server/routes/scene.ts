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
  pageParam,
  pageQuery,
  pickedAndExcluded,
  searchQuery,
  sharedFilters,
  stashDbDate,
} from '@server/lib/adultLists';
import { isOnWatchlist } from '@server/lib/adultMedia';
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

// Each sort, named like the Movies tab's (field.direction), with its
// stash-box order and direction
const sceneSorts = {
  'trending.desc': ['TRENDING', 'DESC'],
  'popularity.desc': ['POPULARITY', 'DESC'],
  'popularity.asc': ['POPULARITY', 'ASC'],
  'release_date.desc': ['DATE', 'DESC'],
  'release_date.asc': ['DATE', 'ASC'],
  'original_title.asc': ['TITLE', 'ASC'],
  'original_title.desc': ['TITLE', 'DESC'],
  'duration.desc': ['DURATION', 'DESC'],
  'duration.asc': ['DURATION', 'ASC'],
  'created_at.desc': ['CREATED_AT', 'DESC'],
  'created_at.asc': ['CREATED_AT', 'ASC'],
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
  excludeStudios: uuids.optional(),
  excludePerformers: uuids.optional(),
  excludeTags: uuids.optional(),
  ...sharedFilters,
});

// Recommendations ask for scenes with any of the performers
type SceneFilters = z.infer<typeof sceneFilters> & { anyPerformer?: boolean };

const discoverQuery = sceneFilters.extend({
  page: pageParam,
  sortBy: z.enum(sortValues).default('popularity.desc'),
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

// What is left to filter here once stash-box has answered
type SceneListFilter = NonNullable<StashDbSceneQuery['exclude']>;

// Filtered lists can take StashDB longer than the client's 15s
const LIST_TIMEOUT = 60000;

const emptyList: StashDbSceneList = { count: 0, scenes: [] };

interface ScenePlan {
  query: StashDbSceneQuery;
  filter: SceneListFilter;
  // No scene can show, like with a tag both picked and excluded
  empty: boolean;
}

// The stash-box query for the picked filters, and what is left to filter
// here
const planScenes = (filters: SceneFilters): ScenePlan => {
  const exclude = {
    studioIds: filters.excludeStudios ?? [],
    performerIds: filters.excludePerformers ?? [],
    tagIds: filters.excludeTags ?? [],
  };

  return {
    query: {
      studioIds: filters.studio,
      performerIds: filters.performer,
      // A tag asked for twice finds nothing
      tagIds: [...new Set(filters.tags ?? [])],
      any: { performers: !!filters.anyPerformer, tags: false },
      exclude,
      date: filters.upcoming
        ? { value: today(), modifier: 'GREATER_THAN' }
        : filters.releaseDate
          ? stashDbDate(filters.releaseDate, filters.released)
          : undefined,
    },
    filter: exclude,
    empty: !filters.anyPerformer && pickedAndExcluded(filters),
  };
};

// Leaves out what stash-box could not: exclusions next to inclusions on the
// same field
const filterScenes = async (
  api: StashDbAPI,
  scenes: StashDbSceneSummary[],
  exclude: SceneListFilter
): Promise<StashDbSceneSummary[]> => {
  const studios = new Set(
    exclude.studioIds?.length
      ? await api.withChildStudios(exclude.studioIds)
      : []
  );
  const performers = new Set(exclude.performerIds);
  const tags = new Set(exclude.tagIds);

  return scenes.filter(
    (scene) =>
      !(scene.studio && studios.has(scene.studio.id)) &&
      !(scene.studio?.parent && studios.has(scene.studio.parent.id)) &&
      !scene.performers.some(({ performer }) => performers.has(performer.id)) &&
      !scene.tags?.some((tag) => tags.has(tag.id))
  );
};

// A list for the viewer, filtered when a filter is given, with media info
const mapSceneList = async (
  api: StashDbAPI,
  list: StashDbSceneList,
  page: number,
  user?: User,
  filter?: SceneListFilter
): Promise<SceneListResponse> => {
  const totals = {
    page,
    totalPages: Math.ceil(list.count / PAGE_SIZE),
    totalResults: list.count,
  };

  if (list.scenes.length === 0) {
    return { ...totals, results: [] };
  }

  const scenes = filter
    ? await filterScenes(api, list.scenes, filter)
    : list.scenes;
  const media = await Media.getRelatedScenes(
    scenes.map((scene) => scene.id),
    user
  );
  const byId = new Map(media.map((m) => [m.stashId, m]));

  return {
    ...totals,
    results: scenes.map((scene) => mapSceneResult(scene, byId.get(scene.id))),
  };
};

// Whether every included studio is excluded, itself or as one under an
// excluded studio
const studiosExcluded = async (
  api: StashDbAPI,
  { studio, excludeStudios }: SceneFilters
): Promise<boolean> => {
  if (!studio?.length || !excludeStudios?.length) {
    return false;
  }
  const excluded = new Set(await api.withChildStudios(excludeStudios));
  return studio.every((id) => excluded.has(id));
};

// The Scenes tab's list: the picked filters and the order, as far as
// stash-box can ask for them
const discoverScenes = async (
  api: StashDbAPI,
  user: User | undefined,
  filters: SceneFilters,
  page: number,
  sortBy: keyof typeof sceneSorts
): Promise<SceneListResponse> => {
  const plan = planScenes(filters);

  // Filters that leave nothing, like a tag both picked and excluded, find
  // no scene rather than pages of nothing
  if (plan.empty || (await studiosExcluded(api, filters))) {
    return { page, totalPages: 1, totalResults: 0, results: [] };
  }

  // Upcoming rows want the soonest first
  const [sort, direction] = filters.upcoming
    ? (['DATE', 'ASC'] as const)
    : sceneSorts[sortBy];
  const list = await api.queryScenes({
    ...plan.query,
    page,
    perPage: PAGE_SIZE,
    sort,
    direction,
    timeout: LIST_TIMEOUT,
  });

  return mapSceneList(api, list, page, user, plan.filter);
};

sceneRoutes.get('/discover', async (req, res, next) => {
  const parsed = discoverQuery.safeParse(req.query);

  if (!parsed.success) {
    return next({ status: 400, message: 'Invalid discover parameters.' });
  }

  const { page, sortBy, ...filters } = parsed.data;

  try {
    return res
      .status(200)
      .json(
        await discoverScenes(
          StashDbAPI.fromSettings(),
          req.user,
          filters,
          page,
          sortBy
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

// The Studios and Networks rows: studios (or their networks) ranked by how
// many trending scenes they have; stash-box cannot sort studios on that
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
  sortBy: z
    .enum([
      'popularity.desc',
      'popularity.asc',
      'name.asc',
      'name.desc',
      'created_at.desc',
      'created_at.asc',
    ])
    .default('popularity.desc'),
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

  const { type, page, sortBy, query } = parsed.data;
  const [field, direction] = sortBy.split('.');
  try {
    const api = StashDbAPI.fromSettings();

    // Ranked like the rows, by the most popular scenes instead
    if (field === 'popularity') {
      const rank = rankStudios(await api.getSceneStudios('POPULARITY'), type);
      const ranked = (direction === 'asc' ? rank.reverse() : rank).filter(
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
          sort: field === 'created_at' ? 'CREATED_AT' : 'NAME',
          direction: direction === 'desc' ? 'DESC' : 'ASC',
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

      // The Scenes tab's list of them
      const list = await discoverScenes(
        stashDb,
        req.user,
        { performer: performerIds, anyPerformer: true },
        query.data.page,
        'popularity.desc'
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
      const { scenes: candidates } = tagIds.size
        ? await stashDb.queryScenes({
            perPage: SIMILAR_POOL,
            sort: 'POPULARITY',
            tagIds: [...tagIds],
            any: { tags: true },
            // StashDB sorts most of its catalogue by popularity when a scene
            // has many tags, which takes 10-20s
            timeout: SIMILAR_TIMEOUT,
          })
        : emptyList;
      const shared = (candidate: { tags?: { id: string }[] }) =>
        (candidate.tags ?? []).filter((tag) => tagIds.has(tag.id)).length;
      // Array.sort is stable, so popularity breaks ties
      const ranked = candidates
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

    const [media, onUserWatchlist] = await Promise.all([
      Media.getAdultMedia(MediaType.SCENE, scene.id),
      isOnWatchlist(MediaType.SCENE, scene.id, req.user),
    ]);

    return res.status(200).json({
      ...mapSceneDetails(scene, stashDbOrigin(), media?.filter(req.user)),
      onUserWatchlist,
    });
  } catch (e) {
    return handleError(e, next, 'Unable to retrieve scene.', {
      sceneId: parsed.data,
    });
  }
});

export default sceneRoutes;
