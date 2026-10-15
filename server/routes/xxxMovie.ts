import StashDbAPI, { StashDbNotConfiguredError } from '@server/api/stashdb';
import type { MovieSortOptions } from '@server/api/themoviedb';
import TheMovieDb from '@server/api/themoviedb';
import type { TpdbMovieQuery } from '@server/api/tpdb';
import TpdbAPI, { TpdbNotConfiguredError } from '@server/api/tpdb';
import type { TpdbMovie, TpdbMovieSort } from '@server/api/tpdb/interfaces';
import { MediaType } from '@server/constants/media';
import Media from '@server/entity/Media';
import type { User } from '@server/entity/User';
import { isOnWatchlist } from '@server/lib/adultMedia';
import { XxxMovieSource, getSettings } from '@server/lib/settings';
import logger from '@server/logger';
import { mapMovieResult } from '@server/models/Search';
import type {
  XxxMovieListResponse,
  XxxMovieStudio,
} from '@server/models/XxxMovie';
import { mapXxxMovieDetails, mapXxxMovieResult } from '@server/models/XxxMovie';
import { isoDate } from '@server/utils/dateHelpers';
import type { NextFunction, Request } from 'express';
import { Router } from 'express';
import { z } from 'zod';

const PAGE_SIZE = 20;

const xxxMovieRoutes = Router();

export const xxxMovieSorts = [
  'released',
  'oldest',
  'added',
  'popularity',
  'title',
  'duration',
] as const;

const ids = z
  .string()
  .regex(/^\d+(,\d+)*$/)
  .transform((value) => value.split(',').map(Number));

const discoverQuery = z.object({
  // Performer and studio pages always list ThePornDB movies
  source: z.nativeEnum(XxxMovieSource).optional(),
  page: z.coerce.number().int().positive().default(1),
  sort: z.enum(xxxMovieSorts).default('released'),
  studio: z.coerce.number().int().positive().optional(),
  // ThePornDB takes one site but any number of performers
  performer: ids.optional(),
  tags: ids.optional(),
  year: z.coerce.number().int().min(1900).max(2100).optional(),
  // ThePornDB takes one date bound, so both sources use one here
  released: z.enum(['after', 'before']).optional(),
  releaseDate: isoDate.optional(),
  upcoming: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
});

type DiscoverQuery = z.infer<typeof discoverQuery>;

const searchQuery = z.object({
  query: z.string().trim().min(1),
  page: z.coerce.number().int().positive().default(1),
});

const lookupQuery = z.object({ query: z.string().trim().min(1) });

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
  // ThePornDB has no popularity or title order
  popularity: 'recently_released',
  title: 'recently_released',
  duration: 'duration_desc',
};

const discoverTpdb = async (
  query: DiscoverQuery,
  user?: User
): Promise<XxxMovieListResponse> => {
  // ThePornDB takes one date bound; future dates are often placeholders
  // like 3024, so released lists stop at today
  let dateBound: TpdbMovieQuery['date'];
  if (query.upcoming) {
    dateBound = { value: today(), operation: '>' };
  } else if (query.releaseDate && query.released !== 'before') {
    dateBound = { value: query.releaseDate, operation: '>=' };
  } else {
    dateBound = { value: query.releaseDate ?? today(), operation: '<=' };
  }

  const list = await TpdbAPI.fromSettings().getMovies({
    page: query.page,
    perPage: PAGE_SIZE,
    sort: query.upcoming ? 'former_released' : tpdbSorts[query.sort],
    siteId: query.studio,
    performerIds: query.performer,
    tagIds: query.tags,
    year: query.year,
    date: dateBound,
  });
  const media = await Media.getRelatedXxxMovies(
    list.data.map((m) => m.id),
    user
  );

  return {
    page: query.page,
    totalPages: list.meta.last_page,
    totalResults: list.meta.total,
    results: list.data.map((movie) =>
      mapXxxMovieResult(
        movie,
        media.find((m) => m.tpdbId === movie.id)
      )
    ),
  };
};

const tmdbSorts: Record<(typeof xxxMovieSorts)[number], MovieSortOptions> = {
  released: 'primary_release_date.desc',
  oldest: 'primary_release_date.asc',
  added: 'primary_release_date.desc',
  popularity: 'popularity.desc',
  title: 'original_title.asc',
  duration: 'popularity.desc',
};

// TMDB cannot list adult movies on their own, so list the movies of the
// configured adult studios instead
const discoverTmdb = async (
  req: Request,
  query: DiscoverQuery
): Promise<XxxMovieListResponse> => {
  const { tmdbCompanies } = getSettings().xxxMovies;
  const companies = query.studio ? [query.studio] : tmdbCompanies;

  if (companies.length === 0) {
    return { page: 1, totalPages: 0, totalResults: 0, results: [] };
  }

  const after =
    query.releaseDate && query.released !== 'before'
      ? query.releaseDate
      : undefined;
  const before =
    query.releaseDate && query.released === 'before'
      ? query.releaseDate
      : undefined;
  const releasedFrom = query.upcoming
    ? today()
    : (after ?? (query.year ? `${query.year}-01-01` : undefined));
  const releasedTo = query.upcoming
    ? undefined
    : (before ??
      (query.year
        ? `${query.year}-12-31`
        : query.sort === 'released' && !after
          ? today()
          : undefined));

  const tmdb = new TheMovieDb({
    discoverRegion: req.user?.settings?.discoverRegion,
  });
  const data = await tmdb.getDiscoverMovies({
    page: query.page,
    sortBy: query.upcoming ? 'primary_release_date.asc' : tmdbSorts[query.sort],
    includeAdult: true,
    originalLanguage: 'all',
    studio: companies.join('|'),
    primaryReleaseDateGte: releasedFrom,
    primaryReleaseDateLte: releasedTo,
  });
  const media = await Media.getRelatedMedia(
    req.user,
    data.results.map((result) => ({ tmdbId: result.id, mediaType: 'movie' }))
  );

  return {
    page: data.page,
    totalPages: data.total_pages,
    totalResults: data.total_results,
    // Adult studios also release non-adult titles, which Radarr would get
    results: data.results
      .filter((result) => result.adult)
      .map((result) =>
        mapMovieResult(
          result,
          media.find((m) => m.tmdbId === result.id && m.mediaType === 'movie')
        )
      ),
  };
};

xxxMovieRoutes.get('/discover', async (req, res, next) => {
  const parsed = discoverQuery.safeParse(req.query);

  if (!parsed.success) {
    return next({ status: 400, message: 'Invalid discover parameters.' });
  }

  try {
    const list =
      (parsed.data.source ?? getSettings().xxxMovies.source) ===
      XxxMovieSource.TMDB
        ? await discoverTmdb(req, parsed.data)
        : await discoverTpdb(parsed.data, req.user);

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
    const media = await Media.getRelatedXxxMovies(
      list.data.map((m) => m.id),
      req.user
    );

    return res.status(200).json({
      page,
      totalPages: list.meta.last_page,
      totalResults: list.meta.total,
      results: list.data.map((movie) =>
        mapXxxMovieResult(
          movie,
          media.find((m) => m.tpdbId === movie.id)
        )
      ),
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
    const sites = await TpdbAPI.fromSettings().searchSites(parsed.data.query);

    return res
      .status(200)
      .json(sites.map((site) => ({ id: site.id, name: site.name })));
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
    const performers = await TpdbAPI.fromSettings().searchPerformers(
      parsed.data.query
    );

    return res.status(200).json(
      performers.map((performer) => ({
        id: performer._id,
        name: performer.name,
        imageUrl: performer.image ?? undefined,
      }))
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
    const tags = await TpdbAPI.fromSettings().searchTags(parsed.data.query);

    return res
      .status(200)
      .json(tags.map((tag) => ({ id: tag.id, name: tag.name })));
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
      let match: { id: number; name: string } | null = null;

      if (req.params.type === 'performer') {
        const performer = await stashDb.getPerformer(id.data);
        const found =
          performer &&
          (await tpdb.findPerformerByStashDbId(performer.id, performer.name));
        match = found ? { id: found._id, name: found.name } : null;
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
): Promise<XxxMovieListResponse> => {
  const media = await Media.getRelatedXxxMovies(
    movies.map((m) => m.id),
    user
  );

  return {
    page,
    totalPages,
    totalResults,
    results: movies.map((movie) =>
      mapXxxMovieResult(
        movie,
        media.find((m) => m.tpdbId === movie.id)
      )
    ),
  };
};

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
      const found =
        req.params.type === 'studio'
          ? await tpdb.getSite(id)
          : await tpdb.getPerformer(id);

      if (!found) {
        return next({ status: 404, message: 'Not found.' });
      }

      return res.status(200).json({ id, name: found.name });
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
