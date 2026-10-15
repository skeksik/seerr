import StashDbAPI, { StashDbNotConfiguredError } from '@server/api/stashdb';
import type { TpdbMovieQuery } from '@server/api/tpdb';
import TpdbAPI, { TpdbNotConfiguredError } from '@server/api/tpdb';
import type { TpdbMovie, TpdbMovieSort } from '@server/api/tpdb/interfaces';
import { MediaType } from '@server/constants/media';
import Media from '@server/entity/Media';
import type { User } from '@server/entity/User';
import { isOnWatchlist } from '@server/lib/adultMedia';
import type { Orientation } from '@server/lib/orientation';
import {
  TPDB_ORIENTATION_TAG_IDS,
  classifyMovie,
  hiddenOrientations,
  isHidden,
  tagsNeeded,
} from '@server/lib/orientation';
import logger from '@server/logger';
import type { SiteLink } from '@server/models/Scene';
import {
  mapXxxPerformerDetails,
  mapXxxStudioDetails,
} from '@server/models/XxxCredit';
import type {
  XxxMovieListResponse,
  XxxMovieResult,
  XxxMovieStudio,
} from '@server/models/XxxMovie';
import {
  MAX_DURATION,
  mapXxxMovieDetails,
  mapXxxMovieResult,
} from '@server/models/XxxMovie';
import { isoDate } from '@server/utils/dateHelpers';
import type { NextFunction } from 'express';
import { Router } from 'express';
import { z } from 'zod';

const PAGE_SIZE = 20;

const xxxMovieRoutes = Router();

export const xxxMovieSorts = [
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
  // Whether a movie needs all of the performers or tags, or any
  performerMode: z.enum(['and', 'or']).optional(),
  tagMode: z.enum(['and', 'or']).optional(),
  // Comma-separated sexual preferences to show; the user's defaults if unset
  orientation: z.string().optional(),
  year: z.coerce.number().int().min(1900).max(2100).optional(),
  // ThePornDB takes one date bound
  released: z.enum(['after', 'before']).optional(),
  releaseDate: isoDate.optional(),
  upcoming: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
});

type MovieFilters = z.infer<typeof movieFilters>;

const discoverQuery = movieFilters.extend({
  page: z.coerce.number().int().positive().default(1),
  sort: z.enum(xxxMovieSorts).default('released'),
});

type DiscoverQuery = z.infer<typeof discoverQuery>;

const searchQuery = z.object({
  query: z.string().trim().min(1),
  page: z.coerce.number().int().positive().default(1),
});

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
// hidden sexual preferences are filtered here
const filterMovies = (
  movies: TpdbMovie[],
  { hidden, exclude }: MovieListFilter
): TpdbMovie[] => {
  const sites = new Set(exclude?.siteIds);
  const performers = new Set(exclude?.performerIds);
  const tags = new Set(exclude?.tagIds);

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
      !movie.tags?.some((tag) => tags.has(tag.id)) &&
      !(hidden.size && isHidden(classifyMovie(movie), hidden))
  );
};

// Lists read this many movies a page when most may be filtered out here
const DENSE_PAGE_SIZE = 60;

interface MoviePlan {
  query: TpdbMovieQuery;
  filter: MovieListFilter;
  dense: boolean;
}

// The ThePornDB query for the picked filters, and what is left to filter
// here
const planMovies = (
  user: User | undefined,
  filters: MovieFilters
): MoviePlan => {
  const hidden = hiddenOrientations(user, filters.orientation);
  const picked = filters.tags ?? [];
  const anyTag = filters.tagMode === 'or';
  const needed = tagsNeeded(hidden).flatMap((key) => {
    const id = TPDB_ORIENTATION_TAG_IDS[key];
    return id ? [id] : [];
  });
  // Without straight, movies tagged with a shown orientation are asked for:
  // any of them without picked tags, or the one shown next to all of those
  const narrowed =
    needed.length > 0 && (!picked.length || (needed.length === 1 && !anyTag));

  // ThePornDB takes one date bound; future dates are often placeholders
  // like 3024, so released lists stop at today
  let date: TpdbMovieQuery['date'];
  if (filters.upcoming) {
    date = { value: today(), operation: '>' };
  } else if (filters.releaseDate && filters.released !== 'before') {
    date = { value: filters.releaseDate, operation: '>=' };
  } else {
    date = { value: filters.releaseDate ?? today(), operation: '<=' };
  }

  return {
    query: {
      siteId: filters.studio,
      performerIds: filters.performer,
      anyPerformer: filters.performerMode === 'or',
      tagIds: !narrowed
        ? picked
        : picked.length
          ? [...picked, ...needed]
          : needed,
      anyTag: narrowed && !picked.length ? true : anyTag,
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
    // Hiding straight without asking for other tags leaves few per page
    dense: hidden.has('straight') && !narrowed,
  };
};

// ThePornDB allows two requests a second, so only the first suggestions are
// checked
const CHECKED_SUGGESTIONS = 10;

type LookupType = 'studio' | 'performer' | 'tag';

// The picked filters with a suggestion added to its field: alone where the
// field takes one or any of its values, next to the others where it needs
// all of them
const withSuggestion = (
  filters: MovieFilters,
  type: LookupType,
  id: number
): MovieFilters =>
  type === 'studio'
    ? { ...filters, studio: id }
    : type === 'performer'
      ? {
          ...filters,
          performer:
            filters.performerMode === 'or'
              ? [id]
              : [...(filters.performer ?? []), id],
        }
      : {
          ...filters,
          tags: filters.tagMode === 'or' ? [id] : [...(filters.tags ?? []), id],
        };

// Drops suggestions that would find no movie next to the picked filters
const withMatches = async <T extends { id: number }>(
  user: User | undefined,
  type: LookupType,
  results: T[],
  filters: MovieFilters
): Promise<T[]> => {
  const picked = Object.entries(filters).some(
    ([key, value]) =>
      !['performerMode', 'tagMode', 'released'].includes(key) &&
      value !== undefined
  );

  if (!picked || results.length === 0) {
    return results;
  }

  try {
    const tpdb = TpdbAPI.fromSettings();
    const checked = results.slice(0, CHECKED_SUGGESTIONS);
    const totals = await Promise.all(
      checked.map(async (result) => {
        const { query } = planMovies(
          user,
          withSuggestion(filters, type, result.id)
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

// Movies for the viewer, with media info and sexual preferences
const toResults = async (
  movies: TpdbMovie[],
  user?: User
): Promise<XxxMovieResult[]> => {
  const media = await Media.getRelatedXxxMovies(
    movies.map((m) => m.id),
    user
  );

  return movies.map((movie) => ({
    ...mapXxxMovieResult(
      movie,
      media.find((m) => m.tpdbId === movie.id)
    ),
    orientations: classifyMovie(movie),
  }));
};

// The viewer's defaults, for lists without filters
const defaultFilter = async (user?: User): Promise<MovieListFilter> =>
  planMovies(user, {}).filter;

const today = () => new Date().toISOString().slice(0, 10);

const handleError = (
  e: Error,
  next: NextFunction,
  message: string,
  meta: Record<string, unknown>
) => {
  if (e instanceof TpdbNotConfiguredError) {
    return next({ status: 503, message: 'ThePornDB is not configured.' });
  }

  if (e instanceof StashDbNotConfiguredError) {
    return next({ status: 503, message: 'StashDB is not configured.' });
  }

  logger.debug(message, { label: 'API', errorMessage: e.message, ...meta });
  return next({ status: 500, message });
};

const tpdbSorts: Record<(typeof xxxMovieSorts)[number], TpdbMovieSort> = {
  released: 'recently_released',
  oldest: 'former_released',
  added: 'recently_created',
  added_asc: 'former_created',
  duration: 'duration_desc',
  duration_asc: 'duration_asc',
  popularity: 'recently_released',
  title: 'recently_released',
};

const discoverTpdb = async (
  { page, sort, ...filters }: DiscoverQuery,
  user?: User
): Promise<XxxMovieListResponse> => {
  const plan = planMovies(user, filters);
  const list = await TpdbAPI.fromSettings().getMovies({
    ...plan.query,
    page,
    perPage: plan.dense ? DENSE_PAGE_SIZE : PAGE_SIZE,
    sort: filters.upcoming ? 'former_released' : tpdbSorts[sort],
    // Some durations are far off, like 535 hours, and would lead the list
    maxDuration: sort.startsWith('duration') ? MAX_DURATION : undefined,
  });

  return {
    page,
    totalPages: list.meta.last_page,
    totalResults: list.meta.total,
    results: await toResults(filterMovies(list.data, plan.filter), user),
  };
};

xxxMovieRoutes.get('/discover', async (req, res, next) => {
  const parsed = discoverQuery.safeParse(req.query);

  if (!parsed.success) {
    return next({ status: 400, message: 'Invalid discover parameters.' });
  }

  try {
    const list = await discoverTpdb(parsed.data, req.user);

    return res.status(200).json(list);
  } catch (e) {
    return handleError(e, next, 'Unable to retrieve XXX movies.', {
      query: req.query,
    });
  }
});

xxxMovieRoutes.get('/search', async (req, res, next) => {
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
    const movies = filterMovies(list.data, await defaultFilter(req.user));

    return res.status(200).json({
      page,
      totalPages: list.meta.last_page,
      totalResults: list.meta.total,
      results: await toResults(movies, req.user),
    } satisfies XxxMovieListResponse);
  } catch (e) {
    return handleError(e, next, 'Unable to search XXX movies.', { query });
  }
});

// Lookups for the ThePornDB filters
xxxMovieRoutes.get('/studios', async (req, res, next) => {
  const parsed = lookupQuery.safeParse(req.query);

  if (!parsed.success) {
    return next({ status: 400, message: 'A query is required.' });
  }

  try {
    const { query, ...filters } = parsed.data;
    const sites = await TpdbAPI.fromSettings().searchSites(query);

    return res.status(200).json(
      await withMatches(
        req.user,
        'studio',
        sites.map((site) => ({ id: site.id, name: site.name })),
        filters
      )
    );
  } catch (e) {
    return handleError(e, next, 'Unable to search studios.', {
      query: parsed.data.query,
    });
  }
});

xxxMovieRoutes.get('/performers', async (req, res, next) => {
  const parsed = lookupQuery.safeParse(req.query);

  if (!parsed.success) {
    return next({ status: 400, message: 'A query is required.' });
  }

  try {
    const { query, ...filters } = parsed.data;
    const performers = await TpdbAPI.fromSettings().searchPerformers(query);

    return res.status(200).json(
      await withMatches(
        req.user,
        'performer',
        performers.map((performer) => ({
          id: performer._id,
          name: performer.name,
          imageUrl: performer.image ?? undefined,
        })),
        filters
      )
    );
  } catch (e) {
    return handleError(e, next, 'Unable to search performers.', {
      query: parsed.data.query,
    });
  }
});

xxxMovieRoutes.get('/tags', async (req, res, next) => {
  const parsed = lookupQuery.safeParse(req.query);

  if (!parsed.success) {
    return next({ status: 400, message: 'A query is required.' });
  }

  try {
    const { query, ...filters } = parsed.data;
    const tags = await TpdbAPI.fromSettings().searchTags(query);

    return res.status(200).json(
      await withMatches(
        req.user,
        'tag',
        tags.map((tag) => ({ id: tag.id, name: tag.name })),
        filters
      )
    );
  } catch (e) {
    return handleError(e, next, 'Unable to search tags.', {
      query: parsed.data.query,
    });
  }
});

// The ThePornDB performer or site behind a StashDB performer or studio
xxxMovieRoutes.get<{ type: string; id: string }>(
  '/match/:type/:id',
  async (req, res, next) => {
    const id = z.string().uuid().safeParse(req.params.id);

    if (!id.success || !['studio', 'performer'].includes(req.params.type)) {
      return next({ status: 404, message: 'Not found.' });
    }

    try {
      const stashDb = StashDbAPI.fromSettings();
      const tpdb = TpdbAPI.fromSettings();
      let match: { id: number; name: string; url?: string } | null = null;

      if (req.params.type === 'performer') {
        const performer = await stashDb.getPerformer(id.data);
        const found =
          performer &&
          (await tpdb.findPerformerByStashDbId(performer.id, performer.name));
        match = found
          ? {
              id: found._id,
              name: found.name,
              url: `https://theporndb.net/performers/${found.id}`,
            }
          : null;
      } else {
        const studio = await stashDb.getStudio(id.data);
        const found = studio && (await tpdb.findSiteByName(studio.name));
        match = found ? { id: found.id, name: found.name } : null;
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
const pageQuery = z.object({
  page: z.coerce.number().int().positive().default(1),
});

const mapMovieList = async (
  movies: TpdbMovie[],
  page: number,
  totalPages: number,
  totalResults: number,
  user?: User
): Promise<XxxMovieListResponse> => ({
  page,
  totalPages,
  totalResults,
  results: await toResults(
    filterMovies(movies, await defaultFilter(user)),
    user
  ),
});

// Released movies with any of this movie's performers, newest first
xxxMovieRoutes.get<{ id: string }>(
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
xxxMovieRoutes.get<{ id: string }>('/:id/similar', async (req, res, next) => {
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

xxxMovieRoutes.get<{ type: string; id: string }>(
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
        const performer = await tpdb.getPerformer(id);

        if (!performer) {
          return next({ status: 404, message: 'Not found.' });
        }

        const details = mapXxxPerformerDetails(performer);

        return res.status(200).json({
          ...details,
          links: await withSiteIcons(details.links),
        });
      }

      const [site, sites] = await Promise.all([
        tpdb.getSite(id),
        tpdb.getNetworkSites(id),
      ]);

      if (!site) {
        return next({ status: 404, message: 'Not found.' });
      }

      const details = mapXxxStudioDetails(site, sites);
      const match = await withStashDbStudio(details);

      return res.status(200).json({ ...details, stashDbId: match?.stashDbId });
    } catch (e) {
      return handleError(e, next, 'Unable to retrieve filter.', {
        type: req.params.type,
        id,
      });
    }
  }
);

// Studio links go to the StashDB studio page when StashDB has the studio
const withStashDbStudio = async (
  studio?: XxxMovieStudio
): Promise<XxxMovieStudio | undefined> => {
  if (!studio) {
    return undefined;
  }

  try {
    const match = await StashDbAPI.fromSettings().findStudioByName(studio.name);
    return match ? { ...studio, stashDbId: match.id } : studio;
  } catch (e) {
    logger.debug('No StashDB studio for ThePornDB site.', {
      label: 'API',
      site: studio.name,
      errorMessage: e.message,
    });
    return studio;
  }
};

const siteHost = (url: string): string => {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
};

// ThePornDB links carry no icons, so borrow StashDB's for the same sites
const withSiteIcons = async (links: SiteLink[]): Promise<SiteLink[]> => {
  try {
    const sites = await StashDbAPI.fromSettings().getSites();

    return links.map((link) => {
      const host = siteHost(link.url);
      const site = sites.find(
        (site) => site.icon && site.url && siteHost(site.url) === host
      );
      return site?.icon ? { ...link, icon: site.icon } : link;
    });
  } catch (e) {
    logger.debug('No StashDB site icons for ThePornDB links.', {
      label: 'API',
      errorMessage: e.message,
    });
    return links;
  }
};

xxxMovieRoutes.get('/:id', async (req, res, next) => {
  const parsed = z.string().uuid().safeParse(req.params.id);

  if (!parsed.success) {
    return next({ status: 404, message: 'Movie not found.' });
  }

  try {
    const movie = await TpdbAPI.fromSettings().getMovie(parsed.data);

    if (!movie) {
      return next({ status: 404, message: 'Movie not found.' });
    }

    const media = await Media.getMediaByTpdbId(movie.id);
    const details = mapXxxMovieDetails(movie, media?.filter(req.user));
    const [studio, network] = await Promise.all([
      withStashDbStudio(details.studio),
      withStashDbStudio(details.network),
    ]);

    return res.status(200).json({
      ...details,
      studio,
      network,
      onUserWatchlist: await isOnWatchlist(
        MediaType.XXX_MOVIE,
        movie.id,
        req.user
      ),
    });
  } catch (e) {
    return handleError(e, next, 'Unable to retrieve movie.', {
      id: parsed.data,
    });
  }
});

export default xxxMovieRoutes;
