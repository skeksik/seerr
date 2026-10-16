import StashDbAPI from '@server/api/stashdb';
import TheMovieDb from '@server/api/themoviedb';
import type { TmdbSearchMultiResponse } from '@server/api/themoviedb/interfaces';
import TpdbAPI from '@server/api/tpdb';
import Media from '@server/entity/Media';
import type { User } from '@server/entity/User';
import { canViewAdult } from '@server/lib/adult';
import { linkedStashDbPerformers } from '@server/lib/adultLinks';
import { classifyMovies, mapAdultMovieList } from '@server/lib/adultMedia';
import { hiddenOrientations, isHidden } from '@server/lib/orientation';
import { findSearchProvider } from '@server/lib/search';
import logger from '@server/logger';
import type { AdultMovieResult } from '@server/models/AdultMovie';
import type { PerformerResult } from '@server/models/Scene';
import { mapSearchResults } from '@server/models/Search';
import { Router } from 'express';

const PERFORMER_LIMIT = 10;

interface AdultSearchResults {
  results: (PerformerResult | AdultMovieResult)[];
  totalPages: number;
  totalResults: number;
}

// An unconfigured or failing adult source leaves the TMDB results intact
const tryAdultSource = async <T>(
  source: string,
  load: () => Promise<T>
): Promise<T | null> => {
  try {
    return await load();
  } catch (e) {
    logger.debug(`Unable to search ${source}`, {
      label: 'API',
      errorMessage: e.message,
    });
    return null;
  }
};

// StashDB performers lead the first page, then ThePornDB's; ThePornDB
// movies join TMDB's results page by page
const searchAdult = async (
  query: string,
  page: number,
  user?: User
): Promise<AdultSearchResults> => {
  if (!canViewAdult(user)) {
    return { results: [], totalPages: 0, totalResults: 0 };
  }

  const [performers, tpdbPerformers, movies] = await Promise.all([
    page === 1
      ? tryAdultSource('StashDB performers', () =>
          StashDbAPI.fromSettings().searchPerformers(query)
        )
      : null,
    page === 1
      ? tryAdultSource('ThePornDB performers', () =>
          TpdbAPI.fromSettings().searchPerformers(query)
        )
      : null,
    tryAdultSource('ThePornDB movies', () =>
      TpdbAPI.fromSettings().getMovies({ query, page, perPage: 20 })
    ),
  ]);
  const stashDbResults = (performers ?? []).slice(0, PERFORMER_LIMIT).map(
    (performer): PerformerResult => ({
      id: performer.id,
      mediaType: 'performer',
      name: performer.name,
      disambiguation: performer.disambiguation ?? undefined,
      imageUrl: performer.imageUrl,
    })
  );
  // ThePornDB performers linked to a StashDB one open its page, and are left
  // out next to it; the others open their ThePornDB page
  const tpdbFound = (tpdbPerformers ?? []).slice(0, PERFORMER_LIMIT);
  const links = await linkedStashDbPerformers(tpdbFound);
  const listed = new Set(stashDbResults.map((performer) => performer.id));
  const tpdbResults = tpdbFound.flatMap((performer): PerformerResult[] => {
    const stashDbId = links.get(performer._id);

    if (stashDbId) {
      if (listed.has(stashDbId)) {
        return [];
      }
      listed.add(stashDbId);
    }

    return [
      stashDbId
        ? {
            id: stashDbId,
            mediaType: 'performer',
            name: performer.name,
            imageUrl: performer.image ?? undefined,
            imageType: 'tpdb',
          }
        : {
            id: String(performer._id),
            mediaType: 'performer',
            name: performer.name,
            disambiguation: 'ThePornDB',
            imageUrl: performer.image ?? undefined,
            source: 'tpdb',
            imageType: 'tpdb',
          },
    ];
  });
  const performerResults = [...stashDbResults, ...tpdbResults];
  // Disabled and unchecked sexual preferences stay out of search too
  const hidden = hiddenOrientations(user);
  const shownMovies = classifyMovies(movies?.data ?? []).filter(
    ({ orientations }) => !isHidden(orientations, hidden)
  );

  return {
    results: [
      ...performerResults,
      ...(await mapAdultMovieList(shownMovies, user)),
    ],
    totalPages: movies?.meta.last_page ?? 0,
    totalResults: (movies?.meta.total ?? 0) + performerResults.length,
  };
};

const searchRoutes = Router();

searchRoutes.get('/', async (req, res, next) => {
  const queryString = req.query.query as string;
  const searchProvider = findSearchProvider(queryString.toLowerCase());
  let results: TmdbSearchMultiResponse;
  let adult: AdultSearchResults | undefined;

  try {
    if (searchProvider) {
      const [id] = queryString
        .toLowerCase()
        .match(searchProvider.pattern) as RegExpMatchArray;
      results = await searchProvider.search({
        id,
        language: (req.query.language as string) ?? req.locale,
        query: queryString,
      });
    } else {
      const tmdb = new TheMovieDb();

      [results, adult] = await Promise.all([
        tmdb.searchMulti({
          query: queryString,
          page: Number(req.query.page),
          includeAdult: canViewAdult(req.user),
          language: (req.query.language as string) ?? req.locale,
        }),
        searchAdult(queryString, Number(req.query.page) || 1, req.user),
      ]);
    }

    const media = await Media.getRelatedMedia(
      req.user,
      results.results.map((result) => ({
        tmdbId: result.id,
        mediaType: result.media_type,
      }))
    );

    return res.status(200).json({
      page: results.page,
      totalPages: Math.max(results.total_pages, adult?.totalPages ?? 0),
      totalResults: results.total_results + (adult?.totalResults ?? 0),
      results: [
        ...mapSearchResults(results.results, media),
        ...(adult?.results ?? []),
      ],
    });
  } catch (e) {
    logger.debug('Something went wrong retrieving search results', {
      label: 'API',
      errorMessage: e.message,
      query: req.query.query,
    });
    return next({
      status: 500,
      message: 'Unable to retrieve search results.',
    });
  }
});

searchRoutes.get('/keyword', async (req, res, next) => {
  const tmdb = new TheMovieDb();

  try {
    const results = await tmdb.searchKeyword({
      query: req.query.query as string,
      page: Number(req.query.page),
    });

    return res.status(200).json(results);
  } catch (e) {
    logger.debug('Something went wrong retrieving keyword search results', {
      label: 'API',
      errorMessage: e.message,
      query: req.query.query,
    });
    return next({
      status: 500,
      message: 'Unable to retrieve keyword search results.',
    });
  }
});

searchRoutes.get('/company', async (req, res, next) => {
  const tmdb = new TheMovieDb();

  try {
    const results = await tmdb.searchCompany({
      query: req.query.query as string,
      page: Number(req.query.page),
    });

    return res.status(200).json(results);
  } catch (e) {
    logger.debug('Something went wrong retrieving company search results', {
      label: 'API',
      errorMessage: e.message,
      query: req.query.query,
    });
    return next({
      status: 500,
      message: 'Unable to retrieve company search results.',
    });
  }
});

export default searchRoutes;
