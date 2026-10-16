import StashDbAPI from '@server/api/stashdb';
import type { TpdbMovieQuery } from '@server/api/tpdb';
import TpdbAPI, { tpdbUrl } from '@server/api/tpdb';
import type { TpdbMovie, TpdbMovieSort } from '@server/api/tpdb/interfaces';
import { MediaType } from '@server/constants/media';
import Media from '@server/entity/Media';
import type { User } from '@server/entity/User';
import {
  linkedStashDbPerformers,
  linkedStashDbStudios,
  tpdbPerformerFor,
  tpdbSiteFor,
} from '@server/lib/adultLinks';
import type { SuggestionType } from '@server/lib/adultLists';
import {
  handleError,
  hasPickedFilters,
  mergeByDate,
  pageParam,
  pageQuery,
  searchQuery,
  sharedFilters,
  tpdbDateOperations,
  withSuggestion,
  withoutSeen,
} from '@server/lib/adultLists';
import type { ClassifiedMovie } from '@server/lib/adultMedia';
import {
  classifyMovies,
  isOnWatchlist,
  mapAdultMovieList,
} from '@server/lib/adultMedia';
import type { Narrow, Orientation } from '@server/lib/orientation';
import {
  TPDB_ORIENTATION_TAG_IDS,
  isHidden,
  joinedPlan,
  onlyUnidentified,
  planOrientationTags,
} from '@server/lib/orientation';
import logger from '@server/logger';
import {
  mapAdultPerformerDetails,
  mapAdultStudioDetails,
} from '@server/models/AdultCredit';
import type { AdultMovieListResponse } from '@server/models/AdultMovie';
import {
  MAX_DURATION,
  mapAdultMovieDetails,
  moviePerformers,
} from '@server/models/AdultMovie';
import type { SiteLink } from '@server/models/Scene';
import { today } from '@server/utils/dateHelpers';
import { Router } from 'express';
import { z } from 'zod';

const PAGE_SIZE = 20;

const adultMovieRoutes = Router();

const adultMovieSorts = [
  'released',
  'oldest',
  'added',
  'added_asc',
  'duration',
  'duration_asc',
  // ThePornDB has no popularity or title order; kept for older links
  'popularity',
  'title',
] as const;

const ids = z
  .string()
  .regex(/^\d+(,\d+)*$/)
  .transform((value) => value.split(',').map(Number));

// The Filters panel; lists and filter suggestions take the same
const movieFilters = z.object({
  studio: z.coerce.number().int().positive().optional(),
  // ThePornDB takes one site but any number of performers
  performer: ids.optional(),
  tags: ids.optional(),
  // ThePornDB cannot leave anything out, so these are filtered here
  studioExclude: ids.optional(),
  performerExclude: ids.optional(),
  tagsExclude: ids.optional(),
  year: z.coerce.number().int().min(1900).max(2100).optional(),
  ...sharedFilters,
});

type MovieFilters = z.infer<typeof movieFilters>;

const discoverQuery = movieFilters.extend({
  page: pageParam,
  sort: z.enum(adultMovieSorts).default('released'),
});

type DiscoverQuery = z.infer<typeof discoverQuery>;

const lookupQuery = movieFilters.extend({
  query: z.string().trim().min(1),
});

interface MovieListFilter {
  hidden: Set<Orientation>;
  exclude?: {
    siteIds?: number[];
    performerIds?: number[];
    tagIds?: number[];
  };
}

// ThePornDB has no exclusions, so excluded studios, performers and tags and
// hidden sexual preferences are filtered here. Each movie is classified once,
// for the filter and the results
const filterMovies = (
  movies: TpdbMovie[],
  { hidden, exclude }: MovieListFilter
): ClassifiedMovie[] => {
  const sites = new Set(exclude?.siteIds);
  const performers = new Set(exclude?.performerIds);
  const tags = new Set(exclude?.tagIds);

  return classifyMovies(
    movies.filter(
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
    )
  ).filter(
    ({ orientations }) => !(hidden.size && isHidden(orientations, hidden))
  );
};

// Lists read this many movies a page when most may be filtered out here
const DENSE_PAGE_SIZE = 60;

interface MoviePlan {
  query: TpdbMovieQuery;
  filter: MovieListFilter;
  dense: boolean;
  // Asked for tagged movies only, which leaves out unidentified ones
  narrowed: boolean;
}

// The ThePornDB query for the picked filters, and what is left to filter
// here
const planMovies = (
  user: User | undefined,
  filters: MovieFilters,
  narrow: Narrow = 'needed'
): MoviePlan => {
  const { hidden, tagIds, anyTag, narrowed } = planOrientationTags(
    user,
    {
      orientation: filters.orientation,
      picked: filters.tags ?? [],
      tagMode: filters.tagMode,
    },
    TPDB_ORIENTATION_TAG_IDS,
    narrow
  );

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
      anyPerformer: filters.performerMode === 'or',
      tagIds,
      anyTag,
      year: filters.year,
      date,
    },
    filter: {
      hidden,
      exclude: {
        siteIds: filters.studioExclude,
        performerIds: filters.performerExclude,
        tagIds: filters.tagsExclude,
      },
    },
    // Hiding any without asking for tags leaves few per page, as most
    // movies are unidentified
    dense: hidden.size > 0 && !narrowed,
    narrowed,
  };
};

// ThePornDB allows two requests a second, so only the first suggestions are
// checked
const CHECKED_SUGGESTIONS = 10;

// Drops suggestions that would find no movie next to the picked filters
const withMatches = async <T extends { id: number }>(
  user: User | undefined,
  type: SuggestionType,
  results: T[],
  filters: MovieFilters
): Promise<T[]> => {
  if (!hasPickedFilters(filters) || results.length === 0) {
    return results;
  }

  try {
    const tpdb = TpdbAPI.fromSettings();
    const checked = results.slice(0, CHECKED_SUGGESTIONS);
    const totals = await Promise.all(
      checked.map(async (result) => {
        const { query } = planMovies(
          user,
          withSuggestion(filters, type, result.id, { studio: result.id })
        );
        const list = await tpdb.getMovies({ ...query, perPage: 1 });
        return list.meta.total;
      })
    );
    return checked.filter((_, i) => totals[i] > 0);
  } catch (e) {
    logger.debug('Unable to count movies for filter suggestions', {
      label: 'API',
      errorMessage: e.message,
    });
    return results;
  }
};

const tpdbSorts: Record<(typeof adultMovieSorts)[number], TpdbMovieSort> = {
  released: 'recently_released',
  oldest: 'former_released',
  added: 'recently_created',
  added_asc: 'former_created',
  duration: 'duration_desc',
  duration_asc: 'duration_asc',
  popularity: 'recently_released',
  title: 'recently_released',
};

// Release date orders, which joined lists keep
const dateDirections: Partial<Record<TpdbMovieSort, 'ASC' | 'DESC'>> = {
  recently_released: 'DESC',
  former_released: 'ASC',
};

const discoverMovies = async (
  { page, sort, ...filters }: DiscoverQuery,
  user?: User
): Promise<AdultMovieListResponse> => {
  const tpdb = TpdbAPI.fromSettings();
  const plan = planMovies(user, filters);
  const query = {
    page,
    sort: filters.upcoming ? 'former_released' : tpdbSorts[sort],
    // Some durations are far off, like 535 hours, and would lead the list
    maxDuration: sort.startsWith('duration') ? MAX_DURATION : undefined,
  } as const;
  const joined = joinedPlan(plan, (narrow) =>
    planMovies(user, filters, narrow)
  );
  const [list, extra] = await Promise.all([
    tpdb.getMovies({
      ...plan.query,
      ...query,
      perPage: plan.dense ? DENSE_PAGE_SIZE : PAGE_SIZE,
    }),
    joined
      ? tpdb.getMovies({
          ...joined.plan.query,
          ...query,
          perPage: DENSE_PAGE_SIZE,
        })
      : undefined,
  ]);
  const shown = filterMovies(list.data, plan.filter);
  const rest =
    joined && extra
      ? filterMovies(
          withoutSeen(
            extra.data,
            shown.map(({ movie }) => movie)
          ),
          joined.unidentified
            ? onlyUnidentified(joined.plan.filter)
            : joined.plan.filter
        )
      : [];
  const movies = mergeByDate(
    shown,
    rest,
    ({ movie }) => movie.date,
    dateDirections[query.sort]
  );

  return {
    page,
    totalPages: Math.max(list.meta.last_page, extra?.meta.last_page ?? 0),
    totalResults: list.meta.total,
    results: await mapAdultMovieList(movies, user),
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

// Movies for the viewer, with the viewer's defaults for lists without
// filters
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
  results: await mapAdultMovieList(
    filterMovies(movies, planMovies(user, {}).filter),
    user
  ),
});

adultMovieRoutes.get('/search', async (req, res, next) => {
  const parsed = searchQuery.safeParse(req.query);

  if (!parsed.success) {
    return next({ status: 400, message: 'Invalid search parameters.' });
  }

  const { query, page } = parsed.data;

  try {
    const list = await TpdbAPI.fromSettings().getMovies({
      query,
      page,
      perPage: PAGE_SIZE,
    });

    return res
      .status(200)
      .json(
        await mapMovieList(
          list.data,
          page,
          list.meta.last_page,
          list.meta.total,
          req.user
        )
      );
  } catch (e) {
    return handleError(e, next, 'Unable to search adult movies.', { query });
  }
});

// Lookups for the ThePornDB filters, by path
const lookups: Record<
  string,
  {
    type: SuggestionType;
    search: (
      tpdb: TpdbAPI,
      query: string
    ) => Promise<{ id: number; name: string; imageUrl?: string }[]>;
  }
> = {
  studios: {
    type: 'studio',
    search: async (tpdb, query) =>
      (await tpdb.searchSites(query)).map((site) => ({
        id: site.id,
        name: site.name,
      })),
  },
  performers: {
    type: 'performer',
    search: async (tpdb, query) =>
      (await tpdb.searchPerformers(query)).map((performer) => ({
        id: performer._id,
        name: performer.name,
        imageUrl: performer.image ?? undefined,
      })),
  },
  tags: {
    type: 'tag',
    search: async (tpdb, query) =>
      (await tpdb.searchTags(query)).map((tag) => ({
        id: tag.id,
        name: tag.name,
      })),
  },
};

for (const [path, lookup] of Object.entries(lookups)) {
  adultMovieRoutes.get(`/${path}`, async (req, res, next) => {
    const parsed = lookupQuery.safeParse(req.query);

    if (!parsed.success) {
      return next({ status: 400, message: 'A query is required.' });
    }

    try {
      const { query, ...filters } = parsed.data;
      const results = await lookup.search(TpdbAPI.fromSettings(), query);

      return res
        .status(200)
        .json(await withMatches(req.user, lookup.type, results, filters));
    } catch (e) {
      return handleError(e, next, `Unable to search ${path}.`, {
        query: parsed.data.query,
      });
    }
  });
}

// The ThePornDB performer or site linked to a StashDB performer or studio,
// whose movies its page adds
adultMovieRoutes.get<{ type: string; id: string }>(
  '/match/:type/:id',
  async (req, res, next) => {
    const id = z.string().uuid().safeParse(req.params.id);

    if (!id.success || !['studio', 'performer'].includes(req.params.type)) {
      return next({ status: 404, message: 'Not found.' });
    }

    try {
      const stashDb = StashDbAPI.fromSettings();
      let match: { id: number; name: string; url: string } | null = null;

      if (req.params.type === 'performer') {
        const performer = await stashDb.getPerformer(id.data);
        const found = performer && (await tpdbPerformerFor(performer));
        match = found
          ? {
              id: found._id,
              name: found.name,
              url: tpdbUrl('performers', found.id),
            }
          : null;
      } else {
        const studio = await stashDb.getStudio(id.data);
        const found = studio && (await tpdbSiteFor(studio));
        match = found
          ? {
              id: found.id,
              name: found.name,
              url: tpdbUrl('sites', found.uuid),
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

adultMovieRoutes.get<{ type: string; id: string }>(
  '/:type/:id',
  async (req, res, next) => {
    const id = Number(req.params.id);

    if (
      !Number.isInteger(id) ||
      id <= 0 ||
      !['studio', 'performer'].includes(req.params.type)
    ) {
      return next({ status: 404, message: 'Not found.' });
    }

    try {
      const tpdb = TpdbAPI.fromSettings();

      if (req.params.type === 'performer') {
        const [performer, sites] = await Promise.all([
          tpdb.getPerformer(id),
          stashDbSites(),
        ]);

        if (!performer) {
          return next({ status: 404, message: 'Not found.' });
        }

        const links = await linkedStashDbPerformers([performer]);
        const details = mapAdultPerformerDetails(
          performer,
          links.get(performer._id)
        );

        return res.status(200).json({
          ...details,
          links: withSiteIcons(details.links, sites),
        });
      }

      const [site, sites] = await Promise.all([
        tpdb.getSite(id),
        tpdb.getNetworkSites(id),
      ]);

      if (!site) {
        return next({ status: 404, message: 'Not found.' });
      }

      // The site, its network and its sites may each have a StashDB studio
      const links = await linkedStashDbStudios([
        site,
        ...(site.network ? [site.network] : []),
        ...sites,
      ]);
      return res.status(200).json(mapAdultStudioDetails(site, sites, links));
    } catch (e) {
      return handleError(e, next, 'Unable to retrieve filter.', {
        type: req.params.type,
        id,
      });
    }
  }
);

const siteHost = (url: string): string => {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
};

// StashDB's site icons by host; links go without icons when it fails
const stashDbSites = async (): Promise<Map<string, string>> => {
  const icons = new Map<string, string>();

  try {
    for (const site of await StashDbAPI.fromSettings().getSites()) {
      const host = site.icon && site.url ? siteHost(site.url) : undefined;
      if (site.icon && host !== undefined && !icons.has(host)) {
        icons.set(host, site.icon);
      }
    }
  } catch (e) {
    logger.debug('No StashDB site icons for ThePornDB links.', {
      label: 'API',
      errorMessage: e.message,
    });
  }

  return icons;
};

// ThePornDB links carry no icons, so borrow StashDB's for the same sites
const withSiteIcons = (
  links: SiteLink[],
  icons: Map<string, string>
): SiteLink[] =>
  links.map((link) => {
    const icon = icons.get(siteHost(link.url));
    return icon ? { ...link, icon } : link;
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
      linkedStashDbPerformers(moviePerformers(movie)),
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
