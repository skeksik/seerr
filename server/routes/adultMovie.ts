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
  tpdbNetworkFor,
  tpdbPerformerFor,
  tpdbSiteFor,
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
] as const;

const ids = z
  .string()
  .regex(/^\d+(,\d+)*$/)
  .transform((value) => value.split(',').map(Number));

// The Filters panel
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
  sort: z.enum(adultMovieSorts).catch('released'),
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
      siteIds: filters.studioExclude,
      performerIds: filters.performerExclude,
      tagIds: filters.tagsExclude,
    },
    empty:
      pickedAndExcluded(filters) ||
      (filters.studio !== undefined &&
        !!filters.studioExclude?.includes(filters.studio)),
  };
};

const tpdbSorts: Record<(typeof adultMovieSorts)[number], TpdbMovieSort> = {
  released: 'recently_released',
  oldest: 'former_released',
  added: 'recently_created',
  added_asc: 'former_created',
  duration: 'duration_desc',
  duration_asc: 'duration_asc',
};

const discoverMovies = async (
  { page, sort, ...filters }: DiscoverQuery,
  user?: User
): Promise<AdultMovieListResponse> => {
  const plan = planMovies(filters);

  // Filters that leave nothing, like a tag both picked and excluded, find
  // no movie rather than pages of nothing
  if (plan.empty) {
    return { page, totalPages: 1, totalResults: 0, results: [] };
  }

  const list = await TpdbAPI.fromSettings().getMovies({
    ...plan.query,
    page,
    perPage: PAGE_SIZE,
    sort: filters.upcoming ? 'former_released' : tpdbSorts[sort],
    // Some durations are far off, like 535 hours, and would lead the list
    maxDuration: sort.startsWith('duration') ? MAX_DURATION : undefined,
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

// Lookups for the ThePornDB filters, by path: what ThePornDB's search finds
const lookups: Record<
  string,
  (
    tpdb: TpdbAPI,
    query: string
  ) => Promise<{ id: number; name: string; imageUrl?: string }[]>
> = {
  studios: async (tpdb, query) =>
    (await tpdb.searchSites(query)).map((site) => ({
      id: site.id,
      name: site.name,
    })),
  performers: async (tpdb, query) =>
    (await tpdb.searchPerformers(query)).map((performer) => ({
      id: performer._id,
      name: performer.name,
      imageUrl: performer.image ?? undefined,
    })),
  tags: async (tpdb, query) =>
    (await tpdb.searchTags(query)).map((tag) => ({
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
      return res
        .status(200)
        .json(await lookup(TpdbAPI.fromSettings(), parsed.data.query));
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
        // A network linking no site of its own has its studios' network
        const found =
          studio &&
          ((await tpdbSiteFor(studio)) ??
            (await tpdbNetworkFor(studio, stashDb)));
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
