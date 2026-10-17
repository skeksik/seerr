import assert from 'node:assert/strict';
import { afterEach, before, beforeEach, describe, it, mock } from 'node:test';

import StashDbAPI from '@server/api/stashdb';
import TpdbAPI from '@server/api/tpdb';
import type { TpdbMovie } from '@server/api/tpdb/interfaces';
import { MediaStatus, MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import { User } from '@server/entity/User';
import cacheManager from '@server/lib/cache';
import { Permission } from '@server/lib/permissions';
import { getSettings } from '@server/lib/settings';
import { isAdultAllowed } from '@server/middleware/adult';
import { checkUser } from '@server/middleware/auth';
import { setupTestDb } from '@server/test/db';
import type { Express } from 'express';
import express from 'express';
import session from 'express-session';
import request from 'supertest';
import adultMovieRoutes from './adultMovie';
import authRoutes from './auth';

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
  app.use('/adultmovie', isAdultAllowed, adultMovieRoutes);
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
  settings.tpdb = { url: 'https://api.theporndb.net', apiKey: 'key' };
});

afterEach(() => {
  const settings = getSettings();
  settings.main.enableAdult = false;
  settings.tpdb = { url: 'https://api.theporndb.net', apiKey: '' };
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

describe('GET /adultmovie/discover', () => {
  it('lists released ThePornDB movies with their media info', async () => {
    await getRepository(Media).save(
      new Media({
        mediaType: MediaType.ADULT_MOVIE,
        tpdbId: MOVIE_ID,
        tmdbId: null,
        status: MediaStatus.AVAILABLE,
      })
    );
    const getMovies = mock.method(TpdbAPI.prototype, 'getMovies', async () => ({
      data: [movie],
      meta: { current_page: 1, last_page: 3, per_page: 20, total: 50 },
    }));
    const agent = await loginAs('admin@seerr.dev');

    const res = await agent.get('/adultmovie/discover?sort=added&studio=37335');

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.totalPages, 3);
    assert.strictEqual(res.body.results[0].mediaType, 'adultmovie');
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

  it('falls back to the release order for unknown sorts', async () => {
    const getMovies = mock.method(TpdbAPI.prototype, 'getMovies', async () => ({
      data: [],
      meta: { current_page: 1, last_page: 1, per_page: 20, total: 0 },
    }));
    const agent = await loginAs('admin@seerr.dev');

    const res = await agent.get('/adultmovie/discover?sort=popularity');

    assert.strictEqual(res.status, 200);
    assert.strictEqual(
      getMovies.mock.calls[0].arguments[0]?.sort,
      'recently_released'
    );
  });

  it('leaves out excluded movies, which ThePornDB cannot', async () => {
    const excluded = {
      ...movie,
      id: 'excluded',
      tags: [{ id: 71, name: 'Blonde' }],
    };
    const getMovies = mock.method(TpdbAPI.prototype, 'getMovies', async () => ({
      data: [movie, excluded],
      meta: { current_page: 1, last_page: 1, per_page: 20, total: 2 },
    }));
    const agent = await loginAs('admin@seerr.dev');

    const res = await agent.get('/adultmovie/discover?tags=1,2&tagsExclude=71');

    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(
      res.body.results.map((result: { id: string }) => result.id),
      [MOVIE_ID]
    );
    const query = getMovies.mock.calls[0].arguments[0];
    assert.strictEqual(query?.perPage, 20);
    assert.deepStrictEqual(query?.tagIds, [1, 2]);
    // Movies need all of the picked tags
    assert.strictEqual(query?.anyTag, false);
  });

  it('finds nothing for filters that leave nothing', async () => {
    const getMovies = mock.method(TpdbAPI.prototype, 'getMovies', async () => ({
      data: [movie],
      meta: { current_page: 1, last_page: 1, per_page: 20, total: 1 },
    }));
    const agent = await loginAs('admin@seerr.dev');

    for (const url of [
      '/adultmovie/discover?tags=70&tagsExclude=70',
      '/adultmovie/discover?performer=99899&performerExclude=99899',
      '/adultmovie/discover?studio=37335&studioExclude=37335',
    ]) {
      const res = await agent.get(url);

      assert.strictEqual(res.status, 200, url);
      assert.deepStrictEqual(
        res.body,
        { page: 1, totalPages: 1, totalResults: 0, results: [] },
        url
      );
    }
    assert.strictEqual(getMovies.mock.callCount(), 0);
  });

  it('pads release dates from the date picker', async () => {
    const getMovies = mock.method(TpdbAPI.prototype, 'getMovies', async () => ({
      data: [],
      meta: { current_page: 1, last_page: 1, per_page: 20, total: 0 },
    }));
    const agent = await loginAs('admin@seerr.dev');

    const res = await agent.get('/adultmovie/discover?releaseDate=2026-10-7');

    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(getMovies.mock.calls[0].arguments[0]?.date, {
      value: '2026-10-07',
      operation: '>=',
    });
  });

  it('rejects users without the adult permission', async () => {
    const agent = await loginAs('demo@seerr.dev', Permission.REQUEST);

    assert.strictEqual((await agent.get('/adultmovie/discover')).status, 403);
  });

  it('returns 503 without a ThePornDB key', async () => {
    getSettings().tpdb = { url: 'https://api.theporndb.net', apiKey: '' };
    const agent = await loginAs('admin@seerr.dev');

    assert.strictEqual((await agent.get('/adultmovie/discover')).status, 503);
  });
});

describe('Adult movie filter lookups', () => {
  beforeEach(() => {
    getSettings().stashdb = {
      endpoint: 'https://stashdb.test/graphql',
      apiKey: 'key',
    };
  });

  it('offers the StashDB studios linked to ThePornDB, without their links', async () => {
    const searchStudios = mock.method(
      StashDbAPI.prototype,
      'searchStudios',
      async () => [
        {
          id: BRAZZERS_STASHDB,
          name: 'Brazzers',
          disambiguation: 'Mindgeek',
          urls: [
            {
              url: 'https://theporndb.net/sites/brazzers',
              site: { name: 'ThePornDB' },
            },
          ],
        },
        {
          id: 'unlinked',
          name: 'Brazzers Live',
          urls: [{ url: 'https://brazzers.com', site: { name: 'Home' } }],
        },
      ]
    );
    const agent = await loginAs('admin@seerr.dev');

    const res = await agent.get('/adultmovie/studios?query=brazzers');

    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(res.body, [
      { id: BRAZZERS_STASHDB, name: 'Brazzers', disambiguation: 'Mindgeek' },
    ]);
    assert.deepStrictEqual(searchStudios.mock.calls[0].arguments, [
      'brazzers',
      { urls: true },
    ]);
  });

  it('offers the StashDB performers linked to ThePornDB', async () => {
    mock.method(StashDbAPI.prototype, 'searchPerformers', async () => [
      {
        id: GAL_STASHDB,
        name: 'Gal Ritchie',
        imageUrl: 'https://stashdb.test/images/gal',
        urls: [
          {
            url: 'https://theporndb.net/performers/gal-ritchie',
            site: { name: 'ThePornDB' },
          },
        ],
      },
      { id: DRAGON_STASHDB, name: 'Little Dragon', urls: [] },
    ]);
    const agent = await loginAs('admin@seerr.dev');

    const res = await agent.get('/adultmovie/performers?query=gal');

    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(res.body, [
      {
        id: GAL_STASHDB,
        name: 'Gal Ritchie',
        imageUrl: 'https://stashdb.test/images/gal',
      },
    ]);
  });

  it("returns all of ThePornDB's suggestions whatever else is picked", async () => {
    const searchTags = mock.method(TpdbAPI.prototype, 'searchTags', async () =>
      Array.from({ length: 25 }, (_, i) => ({ id: i + 1, name: `Tag ${i}` }))
    );
    const getMovies = mock.method(TpdbAPI.prototype, 'getMovies');
    const agent = await loginAs('admin@seerr.dev');

    const res = await agent.get('/adultmovie/tags?query=cream%20pie&tags=70');

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.length, 25);
    assert.deepStrictEqual(searchTags.mock.calls[0].arguments, ['cream pie']);
    assert.strictEqual(getMovies.mock.callCount(), 0);
  });
});

describe('GET /adultmovie/:id', () => {
  it('maps performers to their cross-site ids', async () => {
    getSettings().stashdb = {
      endpoint: 'https://stashdb.org/graphql',
      apiKey: 'key',
    };
    mock.method(TpdbAPI.prototype, 'getMovie', async () => movie);
    mock.method(StashDbAPI.prototype, 'findIdsByUrls', async () => []);
    const agent = await loginAs('admin@seerr.dev');

    const res = await agent.get(`/adultmovie/${MOVIE_ID}`);

    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(res.body.performers, [
      {
        id: 'performer',
        stashDbId: '3b1d6e04-0b4c-4b8b-a6a4-ee9d81a5a64c',
        name: 'Erica Boyer',
      },
    ]);
    assert.strictEqual(res.body.studio.name, 'The Classic Porn');
  });

  it('shows the large poster on the page and the medium one in lists', async () => {
    const posters = {
      large: 'https://cdn.theporndb.net/scene/a/large.jpg',
      medium: 'https://cdn.theporndb.net/scene/a/medium.jpg',
    };
    mock.method(TpdbAPI.prototype, 'getMovie', async () => ({
      ...movie,
      posters,
    }));
    mock.method(TpdbAPI.prototype, 'getMovies', async () => ({
      data: [{ ...movie, posters }],
      meta: { current_page: 1, last_page: 1, per_page: 20, total: 1 },
    }));
    const agent = await loginAs('admin@seerr.dev');

    const page = await agent.get(`/adultmovie/${MOVIE_ID}`);
    const list = await agent.get('/adultmovie/discover');

    assert.strictEqual(page.body.posterUrl, posters.large);
    assert.strictEqual(list.body.results[0].posterUrl, posters.medium);
  });

  it('returns 404 for ids that are not UUIDs', async () => {
    const agent = await loginAs('admin@seerr.dev');

    assert.strictEqual((await agent.get('/adultmovie/123')).status, 404);
  });
});

describe('GET /adultmovie/:id/recommendations', () => {
  it('lists released movies with any of its performers', async () => {
    mock.method(TpdbAPI.prototype, 'getMovie', async () => movie);
    const other = { ...movie, id: '144b1c4a-1129-40b6-b57a-564cbef66320' };
    const getMovies = mock.method(TpdbAPI.prototype, 'getMovies', async () => ({
      data: [movie, other],
      meta: { total: 2, last_page: 1, current_page: 1, per_page: 20 },
    }));
    const agent = await loginAs('admin@seerr.dev');

    const res = await agent.get(
      `/adultmovie/${MOVIE_ID}/recommendations?page=1`
    );

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

describe('GET /adultmovie/:id/similar', () => {
  it('returns ThePornDB similar movies without itself', async () => {
    const other = { ...movie, id: '144b1c4a-1129-40b6-b57a-564cbef66321' };
    mock.method(TpdbAPI.prototype, 'getSimilarMovies', async () => [
      movie,
      other,
    ]);
    const agent = await loginAs('admin@seerr.dev');

    const res = await agent.get(`/adultmovie/${MOVIE_ID}/similar`);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.totalPages, 1);
    assert.deepStrictEqual(
      res.body.results.map((r: { id: string }) => r.id),
      [other.id]
    );
  });
});

// Gal Ritchie's ThePornDB profile links her StashDB one; Little Dragon has a
// profile on both that neither links
const GAL_STASHDB = '05d78e11-91f7-492b-9bb5-760b16d63ec9';
const GAL_TPDB = {
  id: '83c4081c-8e1e-4483-9241-f95c63b42572',
  _id: 241509,
  slug: 'gal-ritchie',
  name: 'Gal Ritchie',
  extras: {
    links: { StashDB: `https://stashdb.test/performers/${GAL_STASHDB}` },
  },
};
const DRAGON_STASHDB = 'aaa97940-4c08-410d-bebb-641e2a145be6';
const DRAGON_TPDB = {
  id: 'da50f9cc-5179-4028-9628-6ccecd1376a3',
  _id: 114293,
  slug: 'little-dragon',
  name: 'Little Dragon',
  extras: { links: { Twitter: 'http://twitter.com/yourspicydragon' } },
};
const stashDbPerformer = (id: string, name: string, urls: string[] = []) => ({
  id,
  name,
  aliases: [],
  scene_count: 0,
  images: [],
  urls: urls.map((url) => ({ url, site: { name: 'Site' } })),
});
const BRAZZERS_STASHDB = '3b1e408c-e111-4fe4-aa86-379ccc83b3cc';
const brazzers = {
  id: 92,
  uuid: 'e3b61b3e-0c20-4bea-9441-b88430ed6317',
  short_name: 'brazzers',
  name: 'Brazzers',
};

// StashDB's answer to address lookups, from the addresses it holds
const stashDbHolding =
  (held: Record<string, string>) => async (_type: string, urls: string[]) =>
    urls.map((url) => held[url]);

describe('linking StashDB and ThePornDB', () => {
  beforeEach(() => {
    getSettings().stashdb = {
      endpoint: 'https://stashdb.test/graphql',
      apiKey: 'key',
    };
    cacheManager.getCache('tpdb').flush();
  });

  describe('GET /adultmovie/match/:type/:id', () => {
    it('follows a ThePornDB link on the StashDB performer', async () => {
      mock.method(StashDbAPI.prototype, 'getPerformer', async () =>
        stashDbPerformer(DRAGON_STASHDB, 'Sasha Paige', [
          'https://theporndb.net/performers/sasha-paige',
        ])
      );
      const getPerformer = mock.method(
        TpdbAPI.prototype,
        'getPerformer',
        async () => ({ id: 'sasha', _id: 169067, name: 'Sasha Paige' })
      );
      const agent = await loginAs('admin@seerr.dev');

      const res = await agent.get(
        `/adultmovie/match/performer/${DRAGON_STASHDB}`
      );

      assert.strictEqual(res.status, 200);
      assert.deepStrictEqual(res.body, {
        id: 169067,
        name: 'Sasha Paige',
        url: 'https://theporndb.net/performers/sasha',
      });
      assert.deepStrictEqual(getPerformer.mock.calls[0].arguments, [
        'sasha-paige',
      ]);
    });

    it('finds the ThePornDB performer linking back to StashDB', async () => {
      mock.method(StashDbAPI.prototype, 'getPerformer', async () =>
        stashDbPerformer(GAL_STASHDB, 'Gal Ritchie', [
          'https://twitter.com/thegalritchie',
        ])
      );
      const search = mock.method(
        TpdbAPI.prototype,
        'searchPerformers',
        async () => [{ ...GAL_TPDB, _id: 1, extras: null }, GAL_TPDB]
      );
      const agent = await loginAs('admin@seerr.dev');

      const res = await agent.get(`/adultmovie/match/performer/${GAL_STASHDB}`);

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.id, 241509);
      assert.deepStrictEqual(search.mock.calls[0].arguments, ['Gal Ritchie']);
    });

    it('does not match performers on their name alone', async () => {
      mock.method(StashDbAPI.prototype, 'getPerformer', async () =>
        stashDbPerformer(DRAGON_STASHDB, 'Little Dragon')
      );
      mock.method(TpdbAPI.prototype, 'searchPerformers', async () => [
        DRAGON_TPDB,
      ]);
      const agent = await loginAs('admin@seerr.dev');

      const res = await agent.get(
        `/adultmovie/match/performer/${DRAGON_STASHDB}`
      );

      assert.strictEqual(res.status, 404);
    });

    it('follows a ThePornDB site link on the StashDB studio', async () => {
      mock.method(StashDbAPI.prototype, 'getStudio', async () => ({
        id: BRAZZERS_STASHDB,
        name: 'Brazzers',
        aliases: [],
        images: [],
        urls: [
          {
            url: 'https://theporndb.net/sites/brazzers',
            site: { name: 'ThePornDB' },
          },
        ],
      }));
      const getSite = mock.method(
        TpdbAPI.prototype,
        'getSite',
        async () => brazzers
      );
      const agent = await loginAs('admin@seerr.dev');

      const res = await agent.get(
        `/adultmovie/match/studio/${BRAZZERS_STASHDB}`
      );

      assert.strictEqual(res.status, 200);
      assert.deepStrictEqual(res.body, {
        id: 92,
        name: 'Brazzers',
        url: `https://theporndb.net/sites/${brazzers.uuid}`,
      });
      assert.deepStrictEqual(getSite.mock.calls[0].arguments, ['brazzers']);
    });

    it('does not match studios on their name', async () => {
      mock.method(StashDbAPI.prototype, 'getStudio', async () => ({
        id: BRAZZERS_STASHDB,
        name: 'Brazzers',
        aliases: [],
        images: [],
        urls: [],
      }));
      const searchSites = mock.method(
        TpdbAPI.prototype,
        'searchSites',
        async () => [brazzers]
      );
      const agent = await loginAs('admin@seerr.dev');

      const res = await agent.get(
        `/adultmovie/match/studio/${BRAZZERS_STASHDB}`
      );

      assert.strictEqual(res.status, 404);
      assert.strictEqual(searchSites.mock.callCount(), 0);
    });
  });

  describe('GET /adultmovie/discover with StashDB ids', () => {
    beforeEach(() => {
      // Sites belong to the studio linking them; none does here
      mock.method(StashDbAPI.prototype, 'findIdsByUrls', async () => []);
    });

    const page = (data: TpdbMovie[] = []) => ({
      data,
      meta: { current_page: 1, last_page: 1, per_page: 20, total: data.length },
    });
    const linkedStudio = (id: string, slug: string) => ({
      id,
      name: slug,
      aliases: [],
      images: [],
      urls: [
        {
          url: `https://theporndb.net/sites/${slug}`,
          site: { name: 'ThePornDB' },
        },
      ],
    });

    it('translates a StashDB studio to its ThePornDB site', async () => {
      mock.method(StashDbAPI.prototype, 'getStudio', async () =>
        linkedStudio(BRAZZERS_STASHDB, 'brazzers')
      );
      mock.method(TpdbAPI.prototype, 'getSite', async () => brazzers);
      const getMovies = mock.method(TpdbAPI.prototype, 'getMovies', async () =>
        page([movie])
      );
      const agent = await loginAs('admin@seerr.dev');

      const res = await agent.get(
        `/adultmovie/discover?studio=${BRAZZERS_STASHDB}`
      );

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.totalResults, 1);
      assert.strictEqual(getMovies.mock.calls[0].arguments[0]?.siteId, 92);
    });

    it('translates StashDB performers to their ThePornDB ones', async () => {
      mock.method(StashDbAPI.prototype, 'getPerformer', async (id: string) =>
        stashDbPerformer(id, 'Sasha Paige', [
          `https://theporndb.net/performers/${id}`,
        ])
      );
      mock.method(TpdbAPI.prototype, 'getPerformer', async (id: string) => ({
        id,
        _id: id === DRAGON_STASHDB ? 169067 : 241509,
        name: 'Performer',
      }));
      const getMovies = mock.method(TpdbAPI.prototype, 'getMovies', async () =>
        page([movie])
      );
      const agent = await loginAs('admin@seerr.dev');

      const res = await agent.get(
        `/adultmovie/discover?performer=${DRAGON_STASHDB},${GAL_STASHDB}&performerExclude=99899`
      );

      assert.strictEqual(res.status, 200);
      const query = getMovies.mock.calls[0].arguments[0];
      assert.deepStrictEqual(query?.performerIds, [169067, 241509]);
      // ThePornDB's own ids still work, for the pages' lists
      assert.deepStrictEqual(res.body.results, []);
    });

    it('finds nothing for a pick without a ThePornDB counterpart', async () => {
      mock.method(StashDbAPI.prototype, 'getStudio', async () => null);
      mock.method(StashDbAPI.prototype, 'getPerformer', async (id: string) =>
        stashDbPerformer(id, 'Little Dragon')
      );
      mock.method(TpdbAPI.prototype, 'searchPerformers', async () => []);
      const getMovies = mock.method(TpdbAPI.prototype, 'getMovies', async () =>
        page([movie])
      );
      const agent = await loginAs('admin@seerr.dev');

      for (const url of [
        `/adultmovie/discover?studio=${BRAZZERS_STASHDB}`,
        `/adultmovie/discover?performer=${DRAGON_STASHDB}`,
      ]) {
        const res = await agent.get(url);

        assert.strictEqual(res.status, 200, url);
        assert.deepStrictEqual(
          res.body,
          { page: 1, totalPages: 1, totalResults: 0, results: [] },
          url
        );
      }
      assert.strictEqual(getMovies.mock.callCount(), 0);
    });

    it('drops exclusions without a ThePornDB counterpart', async () => {
      mock.method(StashDbAPI.prototype, 'getStudio', async () => null);
      mock.method(StashDbAPI.prototype, 'getPerformer', async () => null);
      const getMovies = mock.method(TpdbAPI.prototype, 'getMovies', async () =>
        page([movie])
      );
      const agent = await loginAs('admin@seerr.dev');

      const res = await agent.get(
        `/adultmovie/discover?studio=37335&studioExclude=${BRAZZERS_STASHDB},1&performerExclude=${DRAGON_STASHDB}`
      );

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.totalResults, 1);
      assert.strictEqual(getMovies.mock.calls[0].arguments[0]?.siteId, 37335);
    });

    it('finds nothing for a studio excluded under its StashDB id', async () => {
      mock.method(StashDbAPI.prototype, 'getStudio', async () =>
        linkedStudio(BRAZZERS_STASHDB, 'brazzers')
      );
      mock.method(TpdbAPI.prototype, 'getSite', async () => brazzers);
      const getMovies = mock.method(TpdbAPI.prototype, 'getMovies');
      const agent = await loginAs('admin@seerr.dev');

      const res = await agent.get(
        `/adultmovie/discover?studio=92&studioExclude=${BRAZZERS_STASHDB}`
      );

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.totalResults, 0);
      assert.strictEqual(getMovies.mock.callCount(), 0);
    });

    it('rejects ids that are neither', async () => {
      const agent = await loginAs('admin@seerr.dev');

      assert.strictEqual(
        (await agent.get('/adultmovie/discover?studio=brazzers')).status,
        400
      );
      assert.strictEqual(
        (await agent.get('/adultmovie/discover?performer=1,,2')).status,
        400
      );
    });
  });

  it('links a movie cast and studio to StashDB either way', async () => {
    mock.method(TpdbAPI.prototype, 'getMovie', async () => ({
      ...movie,
      site: brazzers,
      performers: [
        { ...GAL_TPDB, id: 'site-gal', _id: 1, parent: GAL_TPDB },
        { ...DRAGON_TPDB, id: 'site-dragon', _id: 2, parent: DRAGON_TPDB },
        {
          ...DRAGON_TPDB,
          id: 'site-sasha',
          _id: 3,
          parent: {
            ...DRAGON_TPDB,
            id: 'sasha',
            _id: 169067,
            slug: 'sasha-paige',
          },
        },
        // Credited on the site only, without a performer page
        { id: 'site-only', _id: 4, name: 'Carra', parent: null },
      ],
    }));
    mock.method(
      StashDbAPI.prototype,
      'findIdsByUrls',
      stashDbHolding({
        'https://theporndb.net/performers/sasha-paige': 'sasha-stashdb',
        'https://theporndb.net/sites/brazzers': BRAZZERS_STASHDB,
      })
    );
    const agent = await loginAs('admin@seerr.dev');

    const res = await agent.get(`/adultmovie/${MOVIE_ID}`);

    assert.deepStrictEqual(
      res.body.performers.map((p: { id: string; stashDbId?: string }) => [
        p.id,
        p.stashDbId,
      ]),
      [
        [GAL_TPDB.id, GAL_STASHDB],
        [DRAGON_TPDB.id, undefined],
        ['sasha', 'sasha-stashdb'],
        ['site-only', undefined],
      ]
    );
    assert.strictEqual(res.body.studio.stashDbId, BRAZZERS_STASHDB);
  });
});
