import type { StashDbLookup } from '@server/api/stashdb';
import StashDbAPI from '@server/api/stashdb';
import type { StashDbImage } from '@server/api/stashdb/interfaces';
import type { TpdbMovieQuery } from '@server/api/tpdb';
import TpdbAPI, { tpdbUrl } from '@server/api/tpdb';
import type { TpdbMovie, TpdbMovieSort } from '@server/api/tpdb/interfaces';
import { MediaType } from '@server/constants/media';
import Media from '@server/entity/Media';
import type { User } from '@server/entity/User';
import type { AdultMovieIds, LinkVia } from '@server/lib/adultLinks';
import {
  linkedStashDbPerformers,
  linkedStashDbStudios,
  linkedTpdbPerformer,
  linkedTpdbSite,
  tpdbFilterIds,
  tpdbProfileIds,
} from '@server/lib/adultLinks';
import {
  handleError,
  lookupQuery,
  pageParam,
  pageQuery,
  pickedAndExcluded,
  sharedFilters,
  tpdbDateOperations,
} from '@server/lib/adultLists';
import { isOnWatchlist, mapAdultMovieList } from '@server/lib/adultMedia';
import logger from '@server/logger';
import type { AdultMovieListResponse } from '@server/models/AdultMovie';
import {
  MAX_DURATION,
  mapAdultMovieDetails,
  moviePerformers,
} from '@server/models/AdultMovie';
import { today } from '@server/utils/dateHelpers';
import { Router } from 'express';
import { z } from 'zod';

const PAGE_SIZE = 20;

const adultMovieRoutes = Router();

// Named like the Movies tab's sorts (field.direction)
const adultMovieSorts = [
  'release_date.desc',
  'release_date.asc',
  'created_at.desc',
  'created_at.asc',
  'duration.desc',
  'duration.asc',
] as const;

const tpdbId = z
  .string()
  .regex(/^\d+$/)
  .transform(Number)
  .pipe(z.number().int().positive());

const ids = z
  .string()
  .regex(/^\d+(,\d+)*$/)
  .transform((value) => value.split(',').map(Number));

// A studio or performer: a StashDB id, which the Filters panel picks and
// tpdbFilterIds translates, or ThePornDB's own, which the pages' lists pass
const ref = z.union([tpdbId, z.string().uuid()]);

const refs = z
  .string()
  .transform((value) => value.split(','))
  .pipe(z.array(ref));

// The Filters panel
const movieFilters = z.object({
  studio: ref.optional(),
  // ThePornDB takes one site but any number of performers
  performer: refs.optional(),
  tags: ids.optional(),
  // ThePornDB cannot leave anything out, so these are filtered here
  excludeStudios: refs.optional(),
  excludePerformers: refs.optional(),
  excludeTags: ids.optional(),
  year: z.coerce.number().int().min(1900).max(2100).optional(),
  ...sharedFilters,
});

type MovieFilterRefs = z.infer<typeof movieFilters>;

// The same with ThePornDB's ids, which its query takes
type MovieFilters = Omit<MovieFilterRefs, keyof AdultMovieIds> & AdultMovieIds;

const discoverQuery = movieFilters.extend({
  page: pageParam,
  sortBy: z.enum(adultMovieSorts).catch('release_date.desc'),
});

type DiscoverQuery = z.infer<typeof discoverQuery>;

interface MovieListFilter {
  siteIds?: number[];
  performerIds?: number[];
  tagIds?: number[];
}

// ThePornDB has no exclusions, so excluded studios, performers and tags are
// filtered here
const filterMovies = (
  movies: TpdbMovie[],
  exclude: MovieListFilter
): TpdbMovie[] => {
  const sites = new Set(exclude.siteIds);
  const performers = new Set(exclude.performerIds);
  const tags = new Set(exclude.tagIds);

  return movies.filter(
    (movie) =>
      ![movie.site?.id, movie.site?.parent_id, movie.site?.network_id].some(
        (id) => id != null && sites.has(id)
      ) &&
      !movie.performers?.some(
        (performer) =>
          performers.has(performer._id) ||
          (performer.parent?._id != null &&
            performers.has(performer.parent._id))
      ) &&
      !movie.tags?.some((tag) => tags.has(tag.id))
  );
};

interface MoviePlan {
  query: TpdbMovieQuery;
  filter: MovieListFilter;
  // No movie can show, like with a tag both picked and excluded
  empty: boolean;
}

// The ThePornDB query for the picked filters, and what is left to filter
// here
const planMovies = (filters: MovieFilters): MoviePlan => {
  // ThePornDB takes one date bound; future dates are often placeholders
  // like 3024, so released lists stop at today
  let date: TpdbMovieQuery['date'];
  if (filters.upcoming) {
    date = { value: today(), operation: '>' };
  } else if (filters.releaseDate) {
    date = {
      value: filters.releaseDate,
      operation: tpdbDateOperations[filters.released ?? 'gte'],
    };
  } else {
    date = { value: today(), operation: '<=' };
  }

  return {
    query: {
      siteId: filters.studio,
      performerIds: filters.performer,
      tagIds: filters.tags,
      anyTag: false,
      year: filters.year,
      date,
    },
    filter: {
      siteIds: filters.excludeStudios,
      performerIds: filters.excludePerformers,
      tagIds: filters.excludeTags,
    },
    empty:
      pickedAndExcluded(filters) ||
      (filters.studio !== undefined &&
        !!filters.excludeStudios?.includes(filters.studio)),
  };
};

const tpdbSorts: Record<(typeof adultMovieSorts)[number], TpdbMovieSort> = {
  'release_date.desc': 'recently_released',
  'release_date.asc': 'former_released',
  'created_at.desc': 'recently_created',
  'created_at.asc': 'former_created',
  'duration.desc': 'duration_desc',
  'duration.asc': 'duration_asc',
};

const discoverMovies = async (
  { page, sortBy, ...refs }: DiscoverQuery,
  user?: User
): Promise<AdultMovieListResponse> => {
  const filters = await tpdbFilterIds(refs);
  const plan = filters && planMovies(filters);

  // Filters that leave nothing, like a tag both picked and excluded or a
  // studio with no ThePornDB counterpart, find no movie rather than pages
  // of nothing
  if (!plan || plan.empty) {
    return { page, totalPages: 1, totalResults: 0, results: [] };
  }

  const list = await TpdbAPI.fromSettings().getMovies({
    ...plan.query,
    page,
    perPage: PAGE_SIZE,
    sort: filters.upcoming ? 'former_released' : tpdbSorts[sortBy],
    // Some durations are far off, like 535 hours, and would lead the list
    maxDuration: sortBy.startsWith('duration') ? MAX_DURATION : undefined,
  });

  return {
    page,
    totalPages: list.meta.last_page,
    totalResults: list.meta.total,
    results: await mapAdultMovieList(
      filterMovies(list.data, plan.filter),
      user
    ),
  };
};

adultMovieRoutes.get('/discover', async (req, res, next) => {
  const parsed = discoverQuery.safeParse(req.query);

  if (!parsed.success) {
    return next({ status: 400, message: 'Invalid discover parameters.' });
  }

  try {
    const list = await discoverMovies(parsed.data, req.user);

    return res.status(200).json(list);
  } catch (e) {
    return handleError(e, next, 'Unable to retrieve adult movies.', {
      query: req.query,
    });
  }
});

// Movies for the viewer, with media info
const mapMovieList = async (
  movies: TpdbMovie[],
  page: number,
  totalPages: number,
  totalResults: number,
  user?: User
): Promise<AdultMovieListResponse> => ({
  page,
  totalPages,
  totalResults,
  results: await mapAdultMovieList(movies, user),
});

// The StashDB studios or performers among a search's matches linked to
// ThePornDB, whose movies the filter can find, without their links. Only
// the links tell, so a search's 25 matches may leave few
const linkedToTpdb = (
  found: StashDbLookup[],
  type: 'performer' | 'studio'
): StashDbLookup[] =>
  found.flatMap(({ urls, ...lookup }) =>
    tpdbProfileIds(urls ?? [], type).length > 0 ? [lookup] : []
  );

// Lookups for the Adult Movies filters, by path. Studios and performers are
// StashDB's, like the scene filters', the ones linked to ThePornDB; tags are
// ThePornDB's own
const lookups: Record<
  string,
  (query: string) => Promise<
    {
      id: number | string;
      name: string;
      disambiguation?: string | null;
      imageUrl?: string;
    }[]
  >
> = {
  studios: async (query) =>
    linkedToTpdb(
      await StashDbAPI.fromSettings().searchStudios(query, { urls: true }),
      'studio'
    ),
  performers: async (query) =>
    linkedToTpdb(
      await StashDbAPI.fromSettings().searchPerformers(query, { urls: true }),
      'performer'
    ),
  tags: async (query) =>
    (await TpdbAPI.fromSettings().searchTags(query)).map((tag) => ({
      id: tag.id,
      name: tag.name,
    })),
};

for (const [path, lookup] of Object.entries(lookups)) {
  adultMovieRoutes.get(`/${path}`, async (req, res, next) => {
    const parsed = lookupQuery.safeParse(req.query);

    if (!parsed.success) {
      return next({ status: 400, message: 'A query is required.' });
    }

    try {
      return res.status(200).json(await lookup(parsed.data.query));
    } catch (e) {
      return handleError(e, next, `Unable to search ${path}.`, {
        query: parsed.data.query,
      });
    }
  });
}

// The ThePornDB performer or site linked to a StashDB performer or studio,
// whose movies its page adds, and how they are linked, as Whisparr only
// monitors the movies of ones StashDB links itself
adultMovieRoutes.get<{ type: string; id: string }>(
  '/match/:type/:id',
  async (req, res, next) => {
    const id = z.string().uuid().safeParse(req.params.id);

    if (!id.success || !['studio', 'performer'].includes(req.params.type)) {
      return next({ status: 404, message: 'Not found.' });
    }

    try {
      const stashDb = StashDbAPI.fromSettings();
      let match: {
        id: number;
        name: string;
        url: string;
        via: LinkVia;
      } | null = null;

      if (req.params.type === 'performer') {
        const found = await linkedTpdbPerformer(id.data, stashDb);
        match = found
          ? {
              id: found.match._id,
              name: found.match.name,
              url: tpdbUrl('performers', found.match.id),
              via: found.via,
            }
          : null;
      } else {
        const found = await linkedTpdbSite(id.data, stashDb);
        match = found
          ? {
              id: found.match.id,
              name: found.match.name,
              url: tpdbUrl('sites', found.match.uuid),
              via: found.via,
            }
          : null;
      }

      if (!match) {
        return next({ status: 404, message: 'No ThePornDB match.' });
      }

      return res.status(200).json(match);
    } catch (e) {
      return handleError(e, next, 'Unable to match on ThePornDB.', {
        type: req.params.type,
        id: id.data,
      });
    }
  }
);

const movieId = z.string().uuid();

// The StashDB images of a movie's linked cast, who show their StashDB photo
// like everywhere else; the page keeps ThePornDB's when StashDB fails
const linkedPerformerImages = async (
  links: Map<number, string>
): Promise<Map<string, StashDbImage[]>> => {
  const ids = [...new Set(links.values())];

  if (ids.length === 0) {
    return new Map();
  }

  try {
    return await StashDbAPI.fromSettings().getPerformerImages(ids);
  } catch (e) {
    logger.debug('Unable to read performer images from StashDB', {
      label: 'API',
      ids,
      errorMessage: e.message,
    });
    return new Map();
  }
};

// Released movies with any of this movie's performers, newest first
adultMovieRoutes.get<{ id: string }>(
  '/:id/recommendations',
  async (req, res, next) => {
    const id = movieId.safeParse(req.params.id);
    const query = pageQuery.safeParse(req.query);

    if (!id.success || !query.success) {
      return next({ status: 404, message: 'Movie not found.' });
    }

    try {
      const tpdb = TpdbAPI.fromSettings();
      const movie = await tpdb.getMovie(id.data);

      if (!movie) {
        return next({ status: 404, message: 'Movie not found.' });
      }

      const performerIds = [
        ...new Set((movie.performers ?? []).map((p) => p.parent?._id ?? p._id)),
      ];

      if (performerIds.length === 0) {
        return res.status(200).json(await mapMovieList([], 1, 0, 0, req.user));
      }

      const list = await tpdb.getMovies({
        page: query.data.page,
        perPage: PAGE_SIZE,
        sort: 'recently_released',
        performerIds,
        anyPerformer: true,
        date: { value: today(), operation: '<=' },
      });

      return res.status(200).json(
        await mapMovieList(
          list.data.filter((m) => m.id !== movie.id),
          query.data.page,
          list.meta.last_page,
          Math.max(list.meta.total - 1, 0),
          req.user
        )
      );
    } catch (e) {
      return handleError(e, next, 'Unable to retrieve recommendations.', {
        id: id.data,
      });
    }
  }
);

// ThePornDB's similar movies, a single page
adultMovieRoutes.get<{ id: string }>('/:id/similar', async (req, res, next) => {
  const id = movieId.safeParse(req.params.id);

  if (!id.success) {
    return next({ status: 404, message: 'Movie not found.' });
  }

  try {
    const similar = await TpdbAPI.fromSettings().getSimilarMovies(id.data);
    const movies = similar.filter((m) => m.id !== id.data);

    return res
      .status(200)
      .json(await mapMovieList(movies, 1, 1, movies.length, req.user));
  } catch (e) {
    return handleError(e, next, 'Unable to retrieve similar movies.', {
      id: id.data,
    });
  }
});

adultMovieRoutes.get('/:id', async (req, res, next) => {
  const parsed = z.string().uuid().safeParse(req.params.id);

  if (!parsed.success) {
    return next({ status: 404, message: 'Movie not found.' });
  }

  try {
    const movie = await TpdbAPI.fromSettings().getMovie(parsed.data);

    if (!movie) {
      return next({ status: 404, message: 'Movie not found.' });
    }

    const [media, onUserWatchlist, performers, studios] = await Promise.all([
      Media.getAdultMedia(MediaType.ADULT_MOVIE, movie.id),
      isOnWatchlist(MediaType.ADULT_MOVIE, movie.id, req.user),
      // Linked performers and studios open their StashDB page
      linkedStashDbPerformers(
        moviePerformers(movie).filter((performer) => performer.hasProfile)
      ),
      linkedStashDbStudios(
        movie.site
          ? [movie.site, ...(movie.site.network ? [movie.site.network] : [])]
          : []
      ),
    ]);

    return res.status(200).json({
      ...mapAdultMovieDetails(movie, media?.filter(req.user), {
        performers,
        studios,
        performerImages: await linkedPerformerImages(performers),
      }),
      onUserWatchlist,
    });
  } catch (e) {
    return handleError(e, next, 'Unable to retrieve movie.', {
      id: parsed.data,
    });
  }
});

export default adultMovieRoutes;
