import assert from 'node:assert/strict';
import { afterEach, before, beforeEach, describe, it, mock } from 'node:test';

import ExternalAPI from '@server/api/externalapi';
import StashDbAPI from '@server/api/stashdb';
import TpdbAPI from '@server/api/tpdb';
import type { TpdbMovie } from '@server/api/tpdb/interfaces';
import { MediaStatus, MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import { User } from '@server/entity/User';
import { Permission } from '@server/lib/permissions';
import { XxxMovieSource, getSettings } from '@server/lib/settings';
import { isAdultAllowed } from '@server/middleware/adult';
import { checkUser } from '@server/middleware/auth';
import { setupTestDb } from '@server/test/db';
import type { Express } from 'express';
import express from 'express';
import session from 'express-session';
import request from 'supertest';
import authRoutes from './auth';
import xxxMovieRoutes from './xxxMovie';

const MOVIE_ID = '144b1c4a-1129-40b6-b57a-564cbef6631d';

const movie: TpdbMovie = {
  id: MOVIE_ID,
  _id: 5335406,
  title: '2 of a Kind',
  type: 'Movie',
  date: '1991-01-01',
  duration: 5040,
  posters: { large: 'https://cdn.theporndb.net/scene/a/large.jpg' },
  site: { id: 37335, uuid: 'site', name: 'The Classic Porn' },
  performers: [
    {
      id: 'site-performer',
      _id: 1815349,
      name: 'Erica Boyer',
      parent: {
        id: 'performer',
        _id: 99899,
        name: 'Erica Boyer',
        extras: {
          links: {
            StashDB:
              'https://stashdb.org/performers/3b1d6e04-0b4c-4b8b-a6a4-ee9d81a5a64c',
          },
        },
      },
    },
  ],
  tags: [{ id: 70, name: 'Anal' }],
};

let app: Express;

before(() => {
  app = express();
  app.use(express.json());
  app.use(
    session({ secret: 'test-secret', resave: false, saveUninitialized: false })
  );
  app.use(checkUser);
  app.use('/auth', authRoutes);
  app.use('/xxxmovie', isAdultAllowed, xxxMovieRoutes);
  app.use(
    (
      err: { status?: number; message?: string },
      _req: express.Request,
      res: express.Response,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      _next: express.NextFunction
    ) => {
      res
        .status(err.status ?? 500)
        .json({ status: err.status ?? 500, message: err.message });
    }
  );
});

setupTestDb();

beforeEach(() => {
  const settings = getSettings();
  settings.main.enableAdult = true;
  settings.main.localLogin = true;
  settings.tpdb = { apiKey: 'key' };
});

afterEach(() => {
  const settings = getSettings();
  settings.main.enableAdult = false;
  settings.tpdb = { apiKey: '' };
  settings.xxxMovies = { source: XxxMovieSource.TPDB, tmdbCompanies: [] };
  settings.stashdb = { endpoint: 'https://stashdb.org/graphql', apiKey: '' };
  mock.restoreAll();
});

async function loginAs(email: string, permissions?: number) {
  if (permissions !== undefined) {
    const userRepository = getRepository(User);
    const user = await userRepository.findOneOrFail({ where: { email } });
    user.permissions = permissions;
    await userRepository.save(user);
  }

  const agent = request.agent(app);
  const res = await agent
    .post('/auth/local')
    .send({ email, password: 'test1234' });
  assert.strictEqual(res.status, 200);
  return agent;
}

describe('GET /xxxmovie/discover', () => {
  it('lists released ThePornDB movies with their media info', async () => {
    await getRepository(Media).save(
      new Media({
        mediaType: MediaType.XXX_MOVIE,
        tpdbId: MOVIE_ID,
        tmdbId: null,
        isAdult: true,
        status: MediaStatus.AVAILABLE,
      })
    );
    const getMovies = mock.method(TpdbAPI.prototype, 'getMovies', async () => ({
      data: [movie],
      meta: { current_page: 1, last_page: 3, per_page: 20, total: 50 },
    }));
    const agent = await loginAs('admin@seerr.dev');

    const res = await agent.get('/xxxmovie/discover?sort=added&studio=37335');

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.totalPages, 3);
    assert.strictEqual(res.body.results[0].mediaType, 'xxxmovie');
    assert.strictEqual(
      res.body.results[0].posterUrl,
      'https://cdn.theporndb.net/scene/a/large.jpg'
    );
    assert.strictEqual(
      res.body.results[0].mediaInfo.status,
      MediaStatus.AVAILABLE
    );
    const query = getMovies.mock.calls[0].arguments[0];
    assert.strictEqual(query?.sort, 'recently_created');
    assert.strictEqual(query?.siteId, 37335);
    assert.strictEqual(query?.date?.operation, '<=');
  });

  it('lists the configured studios from TMDB with the TMDB source', async () => {
    getSettings().xxxMovies = {
      source: XxxMovieSource.TMDB,
      tmdbCompanies: [6463, 97187],
    };
    const get = mock.method(
      ExternalAPI.prototype as unknown as {
        get: (
          endpoint: string,
          config?: { params?: Record<string, unknown> }
        ) => Promise<unknown>;
      },
      'get',
      async () => ({
        page: 1,
        total_pages: 1,
        total_results: 1,
        results: [
          {
            id: 1786674,
            title: 'Anal Teachings',
            adult: true,
            genre_ids: [],
            original_language: 'en',
            original_title: 'Anal Teachings',
            overview: '',
            popularity: 1,
            release_date: '2026-10-09',
            video: false,
            vote_average: 0,
            vote_count: 0,
            poster_path: '/p.jpg',
          },
        ],
      })
    );
    const agent = await loginAs('admin@seerr.dev');

    const res = await agent.get('/xxxmovie/discover');

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.results[0].mediaType, 'movie');
    assert.strictEqual(res.body.results[0].adult, true);
    const [endpoint, config] = get.mock.calls[0].arguments;
    assert.strictEqual(endpoint, '/discover/movie');
    assert.strictEqual(config?.params?.with_companies, '6463|97187');
    assert.strictEqual(config?.params?.include_adult, true);
  });

  it('pads release dates from the date picker', async () => {
    const getMovies = mock.method(TpdbAPI.prototype, 'getMovies', async () => ({
      data: [],
      meta: { current_page: 1, last_page: 1, per_page: 20, total: 0 },
    }));
    const agent = await loginAs('admin@seerr.dev');

    const res = await agent.get('/xxxmovie/discover?releaseDate=2026-10-7');

    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(getMovies.mock.calls[0].arguments[0]?.date, {
      value: '2026-10-07',
      operation: '>=',
    });
  });

  it('lists ThePornDB movies on request with the TMDB source', async () => {
    getSettings().xxxMovies = {
      source: XxxMovieSource.TMDB,
      tmdbCompanies: [6463],
    };
    const getMovies = mock.method(TpdbAPI.prototype, 'getMovies', async () => ({
      data: [movie],
      meta: { current_page: 1, last_page: 1, per_page: 20, total: 1 },
    }));
    const agent = await loginAs('admin@seerr.dev');

    const res = await agent.get(
      '/xxxmovie/discover?source=tpdb&performer=99899'
    );

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.results[0].mediaType, 'xxxmovie');
    assert.deepStrictEqual(
      getMovies.mock.calls[0].arguments[0]?.performerIds,
      [99899]
    );
  });

  it('rejects users without the adult permission', async () => {
    const agent = await loginAs('demo@seerr.dev', Permission.REQUEST);

    assert.strictEqual((await agent.get('/xxxmovie/discover')).status, 403);
  });

  it('returns 503 without a ThePornDB key', async () => {
    getSettings().tpdb = { apiKey: '' };
    const agent = await loginAs('admin@seerr.dev');

    assert.strictEqual((await agent.get('/xxxmovie/discover')).status, 503);
  });
});

describe('GET /xxxmovie/:id', () => {
  it('maps performers to their cross-site ids', async () => {
    mock.method(TpdbAPI.prototype, 'getMovie', async () => movie);
    const agent = await loginAs('admin@seerr.dev');

    const res = await agent.get(`/xxxmovie/${MOVIE_ID}`);

    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(res.body.performers, [
      {
        id: 'performer',
        tpdbId: 99899,
        stashDbId: '3b1d6e04-0b4c-4b8b-a6a4-ee9d81a5a64c',
        name: 'Erica Boyer',
      },
    ]);
    assert.strictEqual(res.body.studio.name, 'The Classic Porn');
  });

  it('links the studio to the StashDB studio of the same name', async () => {
    getSettings().stashdb = {
      endpoint: 'https://stashdb.test/graphql',
      apiKey: 'key',
    };
    mock.method(TpdbAPI.prototype, 'getMovie', async () => movie);
    const searchStudios = mock.method(
      StashDbAPI.prototype,
      'searchStudios',
      async () => [
        { id: 'other', name: 'The Classic Porn Network' },
        { id: 'studio', name: 'the classic porn' },
      ]
    );
    const agent = await loginAs('admin@seerr.dev');

    const res = await agent.get(`/xxxmovie/${MOVIE_ID}`);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(
      searchStudios.mock.calls[0].arguments[0],
      'The Classic Porn'
    );
    assert.deepStrictEqual(res.body.studio, {
      id: 37335,
      name: 'The Classic Porn',
      stashDbId: 'studio',
    });
  });

  it('returns 404 for ids that are not UUIDs', async () => {
    const agent = await loginAs('admin@seerr.dev');

    assert.strictEqual((await agent.get('/xxxmovie/123')).status, 404);
  });
});

describe('GET /xxxmovie/:id/recommendations', () => {
  it('lists released movies with any of its performers', async () => {
    mock.method(TpdbAPI.prototype, 'getMovie', async () => movie);
    const other = { ...movie, id: '144b1c4a-1129-40b6-b57a-564cbef66320' };
    const getMovies = mock.method(TpdbAPI.prototype, 'getMovies', async () => ({
      data: [movie, other],
      meta: { total: 2, last_page: 1, current_page: 1, per_page: 20 },
    }));
    const agent = await loginAs('admin@seerr.dev');

    const res = await agent.get(`/xxxmovie/${MOVIE_ID}/recommendations?page=1`);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.totalResults, 1);
    assert.deepStrictEqual(
      res.body.results.map((r: { id: string }) => r.id),
      [other.id]
    );
    const options = getMovies.mock.calls[0].arguments[0];
    assert.deepStrictEqual(options?.performerIds, [99899]);
    assert.strictEqual(options?.anyPerformer, true);
    assert.strictEqual(options?.sort, 'recently_released');
  });
});

describe('GET /xxxmovie/:id/similar', () => {
  it('returns ThePornDB similar movies without itself', async () => {
    const other = { ...movie, id: '144b1c4a-1129-40b6-b57a-564cbef66321' };
    mock.method(TpdbAPI.prototype, 'getSimilarMovies', async () => [
      movie,
      other,
    ]);
    const agent = await loginAs('admin@seerr.dev');

    const res = await agent.get(`/xxxmovie/${MOVIE_ID}/similar`);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.totalPages, 1);
    assert.deepStrictEqual(
      res.body.results.map((r: { id: string }) => r.id),
      [other.id]
    );
  });
});

describe('GET /xxxmovie/match/:type/:id', () => {
  const STASH_ID = '3b1d6e04-0b4c-4b8b-a6a4-ee9d81a5a64c';

  beforeEach(() => {
    getSettings().stashdb = {
      endpoint: 'https://stashdb.test/graphql',
      apiKey: 'key',
    };
  });

  it('matches StashDB performers on their ThePornDB link', async () => {
    mock.method(StashDbAPI.prototype, 'getPerformer', async () => ({
      id: STASH_ID,
      name: 'Erica Boyer',
    }));
    const find = mock.method(
      TpdbAPI.prototype,
      'findPerformerByStashDbId',
      async () => ({ id: 'performer', _id: 99899, name: 'Erica Boyer' })
    );
    const agent = await loginAs('admin@seerr.dev');

    const res = await agent.get(`/xxxmovie/match/performer/${STASH_ID}`);

    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(res.body, { id: 99899, name: 'Erica Boyer' });
    assert.deepStrictEqual(find.mock.calls[0].arguments, [
      STASH_ID,
      'Erica Boyer',
    ]);
  });

  it('returns 404 when ThePornDB has no such site', async () => {
    mock.method(StashDbAPI.prototype, 'getStudio', async () => ({
      id: STASH_ID,
      name: 'Molly Little',
    }));
    mock.method(TpdbAPI.prototype, 'findSiteByName', async () => null);
    const agent = await loginAs('admin@seerr.dev');

    const res = await agent.get(`/xxxmovie/match/studio/${STASH_ID}`);

    assert.strictEqual(res.status, 404);
  });
});
