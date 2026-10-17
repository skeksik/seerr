import assert from 'node:assert/strict';
import { afterEach, before, beforeEach, describe, it, mock } from 'node:test';

import WhisparrAPI from '@server/api/servarr/whisparr';
import StashDbAPI from '@server/api/stashdb';
import type {
  StashDbPerformer,
  StashDbScene,
} from '@server/api/stashdb/interfaces';
import TpdbAPI from '@server/api/tpdb';
import { MediaStatus, MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import { User } from '@server/entity/User';
import { Permission } from '@server/lib/permissions';
import type { WhisparrSettings } from '@server/lib/settings';
import { getSettings } from '@server/lib/settings';
import { isAdultAllowed } from '@server/middleware/adult';
import { checkUser } from '@server/middleware/auth';
import { setupTestDb } from '@server/test/db';
import type { Express } from 'express';
import express from 'express';
import session from 'express-session';
import request from 'supertest';
import authRoutes from './auth';
import sceneRoutes from './scene';

const SCENE_ID = '01a138c1-a8cf-74b2-a8bb-e617e9c6f20f';
const INCLUDED_TAG = '2a9b3c4d-5e6f-4a1b-8c2d-3e4f5a6b7c8d';
const EXCLUDED_TAG = '3b0c4d5e-6f7a-4b2c-9d3e-4f5a6b7c8d9e';
const MOVIE_ID = '144b1c4a-1129-40b6-b57a-564cbef6631d';

const scene: StashDbScene = {
  id: SCENE_ID,
  title: 'Slo-Mo',
  release_date: '2023-07-01',
  duration: 316,
  deleted: false,
  images: [
    { id: 'first', url: 'https://stashdb.test/images/first' },
    { id: 'second', url: 'https://stashdb.test/images/second' },
  ],
  studio: { id: 'studio', name: 'Studio', parent: null },
  performers: [
    {
      as: null,
      performer: {
        id: 'performer',
        name: 'Performer',
        gender: 'FEMALE',
        // The first is picked, whatever follows
        images: [
          { url: 'https://stashdb.test/images/performer-first' },
          { url: 'https://stashdb.test/images/performer-second' },
        ],
      },
    },
  ],
  urls: [{ url: 'https://studio.test/scene', site: { name: 'Studio' } }],
  tags: [{ id: 'tag', name: 'Tag' }],
};

let app: Express;

function createApp() {
  const app = express();
  app.use(express.json());
  app.use(
    session({ secret: 'test-secret', resave: false, saveUninitialized: false })
  );
  app.use(checkUser);
  app.use('/auth', authRoutes);
  app.use('/scene', isAdultAllowed, sceneRoutes);
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
  return app;
}

before(() => {
  app = createApp();
});

setupTestDb();

beforeEach(() => {
  const settings = getSettings();
  settings.main.enableAdult = true;
  settings.main.localLogin = true;
  settings.stashdb = {
    endpoint: 'https://stashdb.test/graphql',
    apiKey: 'key',
  };
});

afterEach(() => {
  getSettings().main.enableAdult = false;
  getSettings().whisparr = [];
  mock.restoreAll();
});

const whisparrServer: WhisparrSettings = {
  id: 0,
  name: 'Whisparr',
  hostname: 'whisparr.test',
  port: 6969,
  apiKey: 'key',
  useSsl: false,
  activeProfileId: 4,
  activeProfileName: 'HD-1080p',
  activeDirectory: '/data/xxx',
  tags: [2],
  is4k: false,
  isDefault: true,
  syncEnabled: true,
  preventSearch: false,
  tagRequests: false,
  overrideRule: [],
};

const performer: StashDbPerformer = {
  id: SCENE_ID,
  name: 'Performer',
  disambiguation: null,
  gender: 'FEMALE',
  aliases: ['Alias'],
  birth_date: '1990-01-01',
  career_start_year: 2010,
  career_end_year: null,
  country: 'US',
  scene_count: 12,
  images: [],
  urls: [],
};

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

describe('GET /scene/:sceneId', () => {
  it('returns the scene with its media info', async () => {
    mock.method(StashDbAPI.prototype, 'getScene', async () => scene);
    await getRepository(Media).save(
      new Media({
        mediaType: MediaType.SCENE,
        stashId: SCENE_ID,
        tmdbId: null,
        status: MediaStatus.AVAILABLE,
      })
    );

    const agent = await loginAs(
      'demo@seerr.dev',
      Permission.REQUEST | Permission.ADULT
    );
    const res = await agent.get(`/scene/${SCENE_ID}`);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.mediaType, 'scene');
    assert.strictEqual(res.body.imageUrl, 'https://stashdb.test/images/first');
    assert.strictEqual(res.body.performers[0].name, 'Performer');
    assert.strictEqual(
      res.body.performers[0].imageUrl,
      'https://stashdb.test/images/performer-first'
    );
    assert.strictEqual(res.body.mediaInfo.status, MediaStatus.AVAILABLE);
  });

  it('rejects users without the adult permission', async () => {
    const agent = await loginAs('demo@seerr.dev', Permission.REQUEST);
    const res = await agent.get(`/scene/${SCENE_ID}`);

    assert.strictEqual(res.status, 403);
  });

  it('rejects everyone, admins included, while adult content is disabled', async () => {
    getSettings().main.enableAdult = false;

    const agent = await loginAs('admin@seerr.dev');
    const res = await agent.get(`/scene/${SCENE_ID}`);

    assert.strictEqual(res.status, 403);
  });

  it('returns 404 for ids that are not UUIDs and for deleted scenes', async () => {
    mock.method(StashDbAPI.prototype, 'getScene', async () => ({
      ...scene,
      deleted: true,
    }));
    const agent = await loginAs('admin@seerr.dev');

    assert.strictEqual((await agent.get('/scene/123')).status, 404);
    assert.strictEqual((await agent.get(`/scene/${SCENE_ID}`)).status, 404);
  });

  it('returns 503 when StashDB has no API key', async () => {
    getSettings().stashdb = {
      endpoint: 'https://stashdb.test/graphql',
      apiKey: '',
    };
    const agent = await loginAs('admin@seerr.dev');

    const res = await agent.get(`/scene/${SCENE_ID}`);

    assert.strictEqual(res.status, 503);
  });
});

describe('GET /scene/:sceneId/recommendations', () => {
  it('lists scenes with any of its performers, without itself', async () => {
    mock.method(StashDbAPI.prototype, 'getScene', async () => scene);
    const other = { ...scene, id: '01a138c1-a8cf-74b2-a8bb-e617e9c6f210' };
    const queryScenes = mock.method(
      StashDbAPI.prototype,
      'queryScenes',
      async () => ({ count: 2, scenes: [scene, other] })
    );
    const agent = await loginAs('admin@seerr.dev');

    const res = await agent.get(`/scene/${SCENE_ID}/recommendations?page=1`);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.totalResults, 1);
    assert.deepStrictEqual(
      res.body.results.map((r: { id: string }) => r.id),
      [other.id]
    );
    const query = queryScenes.mock.calls[0].arguments[0];
    assert.strictEqual(query?.page, 1);
    assert.strictEqual(query?.sort, 'POPULARITY');
    assert.deepStrictEqual(query?.performerIds, ['performer']);
    assert.strictEqual(query?.any?.performers, true);
  });
});

describe('GET /scene/:sceneId/similar', () => {
  it('ranks popular scenes by shared tags', async () => {
    mock.method(StashDbAPI.prototype, 'getScene', async () => ({
      ...scene,
      tags: [
        { id: 'a', name: 'A' },
        { id: 'b', name: 'B' },
      ],
    }));
    const one = {
      ...scene,
      id: '01a138c1-a8cf-74b2-a8bb-e617e9c6f211',
      tags: [{ id: 'a' }],
    };
    const two = {
      ...scene,
      id: '01a138c1-a8cf-74b2-a8bb-e617e9c6f212',
      tags: [{ id: 'a' }, { id: 'b' }],
    };
    const queryScenes = mock.method(
      StashDbAPI.prototype,
      'queryScenes',
      async () => ({
        count: 3,
        scenes: [one, scene, two],
      })
    );
    const agent = await loginAs('admin@seerr.dev');

    const res = await agent.get(`/scene/${SCENE_ID}/similar?page=1`);

    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(
      res.body.results.map((r: { id: string }) => r.id),
      [two.id, one.id]
    );
    assert.strictEqual(
      queryScenes.mock.calls[0].arguments[0]?.sort,
      'POPULARITY'
    );
    assert.strictEqual(queryScenes.mock.calls[0].arguments[0]?.timeout, 60000);
  });
});

describe('GET /scene/discover', () => {
  it('maps sort and filters and attaches media info', async () => {
    const queryScenes = mock.method(
      StashDbAPI.prototype,
      'queryScenes',
      async () => ({ count: 41, scenes: [scene] })
    );
    await getRepository(Media).save(
      new Media({
        mediaType: MediaType.SCENE,
        stashId: SCENE_ID,
        tmdbId: null,
        status: MediaStatus.PENDING,
      })
    );
    const agent = await loginAs('admin@seerr.dev');

    const res = await agent.get(
      '/scene/discover?sortBy=release_date.desc&page=2&studio=6f1b8f3e-2c4d-4b7a-9a51-2d1e5c7a9b10'
    );

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.totalPages, 3);
    assert.strictEqual(res.body.page, 2);
    assert.strictEqual(
      res.body.results[0].mediaInfo.status,
      MediaStatus.PENDING
    );
    assert.deepStrictEqual(queryScenes.mock.calls[0].arguments[0], {
      page: 2,
      perPage: 20,
      sort: 'DATE',
      direction: 'DESC',
      studioIds: ['6f1b8f3e-2c4d-4b7a-9a51-2d1e5c7a9b10'],
      performerIds: undefined,
      tagIds: [],
      any: { performers: false, tags: false },
      exclude: { studioIds: [], performerIds: [], tagIds: [] },
      date: undefined,
      timeout: 60000,
    });
  });

  it('excludes what StashDB can and filters out the rest', async () => {
    const queryScenes = mock.method(
      StashDbAPI.prototype,
      'queryScenes',
      async () => ({
        count: 3,
        scenes: [
          scene,
          { ...scene, id: 'excluded', tags: [{ id: EXCLUDED_TAG }] },
        ],
      })
    );
    const agent = await loginAs('admin@seerr.dev');

    const res = await agent.get(
      `/scene/discover?tags=${INCLUDED_TAG}&excludeTags=${EXCLUDED_TAG}`
    );

    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(
      res.body.results.map((result: { id: string }) => result.id),
      [SCENE_ID]
    );
    const query = queryScenes.mock.calls[0].arguments[0];
    assert.deepStrictEqual(query?.any, { performers: false, tags: false });
    // Tags are included, so the exclusions cannot go along to StashDB
    assert.deepStrictEqual(query?.tagIds, [INCLUDED_TAG]);
  });

  it('finds nothing for filters that leave nothing', async () => {
    const STUDIO = '6f1b8f3e-2c4d-4b7a-9a51-2d1e5c7a9b10';
    const NETWORK = '6f1b8f3e-2c4d-4b7a-9a51-2d1e5c7a9b11';
    const queryScenes = mock.method(
      StashDbAPI.prototype,
      'queryScenes',
      async () => ({ count: 1, scenes: [scene] })
    );
    mock.method(
      StashDbAPI.prototype,
      'withChildStudios',
      async (ids: string[]) => (ids.includes(NETWORK) ? [NETWORK, STUDIO] : ids)
    );
    const agent = await loginAs('admin@seerr.dev');

    for (const url of [
      `/scene/discover?tags=${INCLUDED_TAG}&excludeTags=${INCLUDED_TAG}`,
      `/scene/discover?performer=${SCENE_ID}&excludePerformers=${SCENE_ID}`,
      `/scene/discover?studio=${STUDIO}&excludeStudios=${STUDIO}`,
      `/scene/discover?studio=${STUDIO}&excludeStudios=${NETWORK}`,
    ]) {
      const res = await agent.get(url);

      assert.strictEqual(res.status, 200, url);
      assert.deepStrictEqual(
        res.body,
        { page: 1, totalPages: 1, totalResults: 0, results: [] },
        url
      );
    }
    assert.strictEqual(queryScenes.mock.callCount(), 0);
  });

  it('maps release date bounds and upcoming scenes', async () => {
    const queryScenes = mock.method(
      StashDbAPI.prototype,
      'queryScenes',
      async () => ({ count: 0, scenes: [] })
    );
    const agent = await loginAs('admin@seerr.dev');

    await agent.get(
      `/scene/discover?released=lt&releaseDate=2026-01-01&tags=${SCENE_ID},${SCENE_ID}`
    );
    await agent.get('/scene/discover?upcoming=true');

    const [filtered, upcoming] = queryScenes.mock.calls.map(
      (call) => call.arguments[0]
    );
    assert.deepStrictEqual(filtered?.date, {
      value: '2026-01-01',
      modifier: 'LESS_THAN',
    });
    // A tag asked for twice would find nothing
    assert.deepStrictEqual(filtered?.tagIds, [SCENE_ID]);
    assert.strictEqual(upcoming?.sort, 'DATE');
    assert.strictEqual(upcoming?.direction, 'ASC');
    assert.strictEqual(upcoming?.date?.modifier, 'GREATER_THAN');
  });

  it('rejects unknown sorts, like the older names', async () => {
    const queryScenes = mock.method(
      StashDbAPI.prototype,
      'queryScenes',
      async () => ({ count: 0, scenes: [] })
    );
    const agent = await loginAs('admin@seerr.dev');

    assert.strictEqual(
      (await agent.get('/scene/discover?sortBy=random')).status,
      400
    );
    assert.strictEqual(
      (await agent.get('/scene/discover?sortBy=date')).status,
      400
    );
    // The older sort param is not a filter, so it is left out
    assert.strictEqual(
      (await agent.get('/scene/discover?sort=date')).status,
      200
    );
    assert.strictEqual(
      queryScenes.mock.calls[0].arguments[0]?.sort,
      'POPULARITY'
    );
  });

  it('sorts by popularity without a sort', async () => {
    const queryScenes = mock.method(
      StashDbAPI.prototype,
      'queryScenes',
      async () => ({ count: 0, scenes: [] })
    );
    const agent = await loginAs('admin@seerr.dev');

    assert.strictEqual((await agent.get('/scene/discover')).status, 200);
    const query = queryScenes.mock.calls[0].arguments[0];
    assert.strictEqual(query?.sort, 'POPULARITY');
    assert.strictEqual(query?.direction, 'DESC');
  });
});

describe('studio rankings', () => {
  const image = (id: string) => [
    { id, url: `https://stashdb.test/images/${id}` },
  ];
  const ref = (id: string) => ({ id, name: id, images: image(id) });
  // Two scenes of studio a and one of b under network n, one of network n
  // itself, and one of top-level studio c
  const studios = [
    { ...ref('a'), parent: ref('n') },
    { ...ref('b'), parent: ref('n') },
    { ...ref('a'), parent: ref('n') },
    ref('n'),
    ref('c'),
  ];

  it('lists studios by their popular scenes by default, leaving out networks', async () => {
    const getSceneStudios = mock.method(
      StashDbAPI.prototype,
      'getSceneStudios',
      async () => studios
    );
    const agent = await loginAs('admin@seerr.dev');

    const res = await agent.get('/scene/studios');

    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(
      res.body.results.map((studio: { id: string }) => studio.id),
      ['a', 'b', 'c']
    );
    assert.strictEqual(
      res.body.results[0].imageUrl,
      'https://stashdb.test/images/a'
    );
    assert.strictEqual(res.body.totalPages, 1);
    assert.strictEqual(getSceneStudios.mock.callCount(), 1);
  });

  it('no longer lists by trending', async () => {
    const getSceneStudios = mock.method(
      StashDbAPI.prototype,
      'getSceneStudios',
      async () => studios
    );
    const agent = await loginAs('admin@seerr.dev');

    assert.strictEqual(
      (await agent.get('/scene/studios?sortBy=trending.desc')).status,
      400
    );
    assert.strictEqual(getSceneStudios.mock.callCount(), 0);
  });

  it('ranks networks by the popular scenes of their studios', async () => {
    const getSceneStudios = mock.method(
      StashDbAPI.prototype,
      'getSceneStudios',
      async () => [...studios, { ...ref('d'), parent: ref('m') }]
    );
    const agent = await loginAs('admin@seerr.dev');

    const res = await agent.get(
      '/scene/studios?type=networks&sortBy=popularity.desc&query=N'
    );

    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(
      res.body.results.map((studio: { id: string }) => studio.id),
      ['n']
    );
    assert.strictEqual(getSceneStudios.mock.callCount(), 1);
  });
});

describe('GET /scene/lookup/:type', () => {
  it("returns StashDB's suggestions whatever else is picked", async () => {
    const searchTags = mock.method(
      StashDbAPI.prototype,
      'searchTags',
      async () => [
        { id: 'a', name: 'A' },
        { id: 'b', name: 'B' },
      ]
    );
    const agent = await loginAs('admin@seerr.dev');

    const res = await agent.get(
      `/scene/lookup/tags?query=${encodeURIComponent(' cream pie ')}&tags=${INCLUDED_TAG}`
    );

    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(res.body, [
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B' },
    ]);
    assert.deepStrictEqual(searchTags.mock.calls[0].arguments, ['cream pie']);
  });

  it('searches studios and performers, and nothing else', async () => {
    mock.method(StashDbAPI.prototype, 'searchStudios', async () => [
      { id: 'a', name: 'A' },
    ]);
    const searchPerformers = mock.method(
      StashDbAPI.prototype,
      'searchPerformers',
      async () => [{ id: 'p', name: 'Molly Little' }]
    );
    const agent = await loginAs('admin@seerr.dev');

    assert.strictEqual(
      (await agent.get('/scene/lookup/studios?query=x')).body.length,
      1
    );
    assert.strictEqual(
      (await agent.get('/scene/lookup/performers?query=Molly%20Little')).body
        .length,
      1
    );
    assert.deepStrictEqual(searchPerformers.mock.calls[0].arguments, [
      'Molly Little',
    ]);
    assert.strictEqual(
      (await agent.get('/scene/lookup/scenes?query=x')).status,
      404
    );
  });
});

describe('GET /scene/movie/:movieId', () => {
  it('finds the scenes of a ThePornDB movie by fingerprint, then page', async () => {
    getSettings().tpdb = { url: 'https://api.theporndb.net', apiKey: 'key' };
    mock.method(TpdbAPI.prototype, 'getMovie', async () => ({
      id: MOVIE_ID,
      _id: 1,
      title: 'Movie',
      type: 'Movie',
      scenes: [
        { id: 'a', hashes: [{ hash: 'abc', type: 'OSHASH' }] },
        { id: 'b', url: 'https://studio.test/scene/b', hashes: [] },
      ],
    }));
    const byFingerprint = mock.method(
      StashDbAPI.prototype,
      'findScenesByFingerprints',
      async () => [[scene], []]
    );
    const byUrl = mock.method(
      StashDbAPI.prototype,
      'findScenesByUrls',
      async () => [{ ...scene, id: 'other' }]
    );
    const agent = await loginAs('admin@seerr.dev');

    const res = await agent.get(`/scene/movie/${MOVIE_ID}`);

    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(
      res.body.results.map((result: { id: string }) => result.id),
      [SCENE_ID, 'other']
    );
    assert.deepStrictEqual(byFingerprint.mock.calls[0].arguments[0], [
      [{ hash: 'abc', algorithm: 'OSHASH' }],
      [],
    ]);
    assert.deepStrictEqual(byUrl.mock.calls[0].arguments[0], [
      'https://studio.test/scene/b',
    ]);
  });
});

describe('GET /scene/search', () => {
  it('searches StashDB for queries with spaces, however encoded', async () => {
    const searchScenes = mock.method(
      StashDbAPI.prototype,
      'searchScenes',
      async () => ({ count: 1, scenes: [scene] })
    );
    const agent = await loginAs('admin@seerr.dev');

    for (const query of [
      'molly%20little',
      'molly+little',
      'molly%20little%20',
    ]) {
      const res = await agent.get(`/scene/search?query=${query}&page=2`);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.results.length, 1);
    }
    assert.deepStrictEqual(
      searchScenes.mock.calls.map((call) => call.arguments[0]?.query),
      ['molly little', 'molly little', 'molly little']
    );
  });

  it('requires a query', async () => {
    const agent = await loginAs('admin@seerr.dev');

    assert.strictEqual((await agent.get('/scene/search')).status, 400);
  });
});

describe('GET /scene/:type/:id', () => {
  it("names a studio filter and lists a network's studios", async () => {
    mock.method(StashDbAPI.prototype, 'getStudio', async () => ({
      id: 'studio',
      name: 'Studio',
      aliases: [],
      urls: [],
      images: [],
      child_studios: [
        { id: 'b', name: 'Beta', images: [] },
        { id: 'a', name: 'Alpha', images: [] },
      ],
    }));
    const studioUrls = mock.method(
      StashDbAPI.prototype,
      'studioUrls',
      async () =>
        new Map([
          ['a', ['https://theporndb.net/sites/alpha']],
          ['b', []],
        ])
    );
    const agent = await loginAs('admin@seerr.dev');

    const res = await agent.get(`/scene/studio/${SCENE_ID}`);

    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(res.body, {
      id: 'studio',
      name: 'Studio',
      aliases: [],
      studios: [
        { id: 'a', name: 'Alpha', tpdbLinked: true },
        { id: 'b', name: 'Beta', tpdbLinked: false },
      ],
      urls: [],
      stashDbUrl: 'https://stashdb.test/studios/studio',
      tpdbLinked: false,
    });
    assert.deepStrictEqual(studioUrls.mock.calls[0].arguments[0], ['b', 'a']);
  });

  it("adds what Whisparr monitors of a network's studios from its list", async () => {
    getSettings().whisparr = [whisparrServer];
    mock.method(StashDbAPI.prototype, 'getStudio', async () => ({
      id: 'network',
      name: 'Network',
      aliases: [],
      urls: [{ url: 'https://theporndb.net/sites/network', site: {} }],
      images: [],
      child_studios: [
        { id: 'a', name: 'Alpha', images: [] },
        { id: 'b', name: 'Beta', images: [] },
      ],
    }));
    mock.method(StashDbAPI.prototype, 'studioUrls', async () => new Map());
    mock.method(WhisparrAPI.prototype, 'getCredit', async () => null);
    const listCredits = mock.method(
      WhisparrAPI.prototype,
      'listCredits',
      async () => [
        { id: 1, foreignId: 'a', monitored: true, moviesMonitored: false },
        { id: 2, foreignId: 'other', monitored: true, moviesMonitored: true },
      ]
    );
    const admin = await loginAs('admin@seerr.dev');

    const res = await admin.get(`/scene/studio/${SCENE_ID}`);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.tpdbLinked, true);
    assert.deepStrictEqual(res.body.studios, [
      {
        id: 'a',
        name: 'Alpha',
        tpdbLinked: false,
        whisparr: { monitored: true, moviesMonitored: false },
      },
      {
        id: 'b',
        name: 'Beta',
        tpdbLinked: false,
        whisparr: { monitored: false, moviesMonitored: false },
      },
    ]);
    assert.deepStrictEqual(res.body.whisparr, {
      monitored: false,
      moviesMonitored: false,
      monitorNewItems: true,
      searchOnAdd: false,
      serviceUrl: `http://whisparr.test:6969/studio/${SCENE_ID}`,
    });
    assert.deepStrictEqual(listCredits.mock.calls[0].arguments, ['studio']);

    // The list is for request managers alone, like the status
    const user = await loginAs(
      'demo@seerr.dev',
      Permission.REQUEST | Permission.ADULT
    );
    const plain = await user.get(`/scene/studio/${SCENE_ID}`);
    assert.strictEqual(plain.body.studios[0].whisparr, undefined);
    assert.strictEqual(listCredits.mock.callCount(), 1);
  });

  it('adds Whisparr monitoring status for request managers', async () => {
    getSettings().whisparr = [whisparrServer];
    mock.method(StashDbAPI.prototype, 'getPerformer', async () => performer);
    mock.method(WhisparrAPI.prototype, 'getCredit', async () => ({
      id: 1,
      foreignId: SCENE_ID,
      monitored: true,
      moviesMonitored: false,
      tpdbId: 'f1b2c3d4-0000-4000-8000-000000000000',
      whisparrMonitorNewItems: false,
      qualityProfileId: 1,
      searchOnAdd: true,
      tags: [],
    }));
    mock.method(
      WhisparrAPI.prototype,
      'getMovieMetadataSource',
      async () => 'tpdb'
    );
    const admin = await loginAs('admin@seerr.dev');

    const res = await admin.get(`/scene/performer/${SCENE_ID}`);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.careerStart, 2010);
    assert.strictEqual(res.body.tpdbLinked, false);
    assert.deepStrictEqual(res.body.whisparr, {
      monitored: true,
      moviesMonitored: false,
      moviesAvailable: true,
      monitorNewItems: false,
      searchOnAdd: true,
      serviceUrl: `http://whisparr.test:6969/performer/${SCENE_ID}`,
    });

    const user = await loginAs(
      'demo@seerr.dev',
      Permission.REQUEST | Permission.ADULT
    );
    const plain = await user.get(`/scene/performer/${SCENE_ID}`);
    assert.strictEqual(plain.status, 200);
    assert.strictEqual(plain.body.whisparr, undefined);
  });

  it('returns 404 for unknown filter types', async () => {
    const agent = await loginAs('admin@seerr.dev');

    assert.strictEqual(
      (await agent.get(`/scene/network/${SCENE_ID}`)).status,
      404
    );
  });
});

describe('POST /scene/:type/:id/monitor', () => {
  const CHILD_A = '6f1b8f3e-2c4d-4b7a-9a51-2d1e5c7a9b10';
  const CHILD_B = '6f1b8f3e-2c4d-4b7a-9a51-2d1e5c7a9b11';
  const OTHER = '6f1b8f3e-2c4d-4b7a-9a51-2d1e5c7a9b12';

  const credit = (foreignId: string, moviesMonitored = true) => ({
    id: 1,
    foreignId,
    monitored: true,
    moviesMonitored,
    tmdbId: 97187,
    whisparrMonitorNewItems: false,
    qualityProfileId: 4,
    searchOnAdd: false,
    tags: [2],
  });

  const network = () =>
    mock.method(StashDbAPI.prototype, 'getStudio', async () => ({
      id: SCENE_ID,
      name: 'Network',
      aliases: [],
      urls: [],
      images: [],
      child_studios: [
        { id: CHILD_A, name: 'A', images: [] },
        { id: CHILD_B, name: 'B', images: [] },
      ],
    }));

  it('applies the options with the default server settings', async () => {
    getSettings().whisparr = [whisparrServer];
    const monitor = mock.method(
      WhisparrAPI.prototype,
      'applyCreditMonitoring',
      async () => credit(SCENE_ID)
    );
    mock.method(
      WhisparrAPI.prototype,
      'getMovieMetadataSource',
      async () => 'tmdb'
    );
    const admin = await loginAs('admin@seerr.dev');

    const res = await admin
      .post(`/scene/studio/${SCENE_ID}/monitor`)
      .send({ scenes: true, movies: true, monitorNewItems: false });

    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(res.body, {
      monitored: true,
      moviesMonitored: true,
      moviesAvailable: true,
      monitorNewItems: false,
      searchOnAdd: false,
      serviceUrl: `http://whisparr.test:6969/studio/${SCENE_ID}`,
    });
    assert.deepStrictEqual(monitor.mock.calls[0].arguments, [
      'studio',
      SCENE_ID,
      {
        scenes: true,
        movies: true,
        monitorNewItems: false,
        searchOnAdd: false,
        qualityProfileId: 4,
        rootFolderPath: '/data/xxx',
        tags: [2],
      },
    ]);
  });

  it("applies the same to a network's studios, reporting the ones that failed", async () => {
    getSettings().whisparr = [whisparrServer];
    network();
    const monitor = mock.method(
      WhisparrAPI.prototype,
      'applyCreditMonitoring',
      async (_type: string, foreignId: string) => {
        if (foreignId === CHILD_B) {
          throw new Error('Whisparr refused');
        }
        return credit(foreignId, foreignId === CHILD_A);
      }
    );
    mock.method(
      WhisparrAPI.prototype,
      'getMovieMetadataSource',
      async () => 'tmdb'
    );
    const admin = await loginAs('admin@seerr.dev');

    const res = await admin.post(`/scene/studio/${SCENE_ID}/monitor`).send({
      scenes: true,
      movies: true,
      search: true,
      studios: [CHILD_A, CHILD_B, CHILD_A],
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.monitored, true);
    assert.deepStrictEqual(res.body.studios, [
      { id: CHILD_A, monitored: true, moviesMonitored: true },
    ]);
    assert.deepStrictEqual(res.body.failed, [CHILD_B]);
    // The network first, then each studio once
    assert.deepStrictEqual(
      monitor.mock.calls.map((call) => call.arguments[1]),
      [SCENE_ID, CHILD_A, CHILD_B]
    );
    assert.strictEqual(monitor.mock.calls[1].arguments[2]?.searchOnAdd, true);
    assert.strictEqual(
      monitor.mock.calls[1].arguments[2]?.monitorNewItems,
      true
    );
  });

  it("rejects studios that are not the network's, and any for a performer", async () => {
    getSettings().whisparr = [whisparrServer];
    network();
    const monitor = mock.method(
      WhisparrAPI.prototype,
      'applyCreditMonitoring',
      async () => credit(SCENE_ID)
    );
    const admin = await loginAs('admin@seerr.dev');

    const other = await admin
      .post(`/scene/studio/${SCENE_ID}/monitor`)
      .send({ scenes: true, movies: false, studios: [CHILD_A, OTHER] });
    const performer = await admin
      .post(`/scene/performer/${SCENE_ID}/monitor`)
      .send({ scenes: true, movies: false, studios: [CHILD_A] });

    assert.strictEqual(other.status, 400);
    assert.strictEqual(performer.status, 400);
    assert.strictEqual(monitor.mock.callCount(), 0);
  });

  it('monitors scenes only when Whisparr cannot find the movies', async () => {
    getSettings().whisparr = [whisparrServer];
    const existing = {
      ...credit(SCENE_ID, false),
      tmdbId: 0,
      monitored: false,
    };
    mock.method(WhisparrAPI.prototype, 'getCredit', async () => existing);
    mock.method(
      WhisparrAPI.prototype,
      'getMovieMetadataSource',
      async () => 'tpdb'
    );
    const internals = WhisparrAPI.prototype as unknown as {
      updateCredit: (
        type: string,
        credit: unknown,
        changes: Record<string, unknown>
      ) => Promise<unknown>;
      refreshCredit: () => Promise<void>;
    };
    const update = mock.method(
      internals,
      'updateCredit',
      async (
        _type: string,
        _credit: unknown,
        changes: Record<string, unknown>
      ) => ({
        ...existing,
        ...changes,
      })
    );
    const refresh = mock.method(internals, 'refreshCredit', async () => {
      return;
    });
    const admin = await loginAs('admin@seerr.dev');

    const res = await admin
      .post(`/scene/performer/${SCENE_ID}/monitor`)
      .send({ scenes: true, movies: true, monitorNewItems: true });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.monitored, true);
    assert.strictEqual(res.body.moviesMonitored, false);
    assert.strictEqual(res.body.moviesAvailable, false);
    assert.strictEqual(res.body.monitorNewItems, true);
    assert.deepStrictEqual(update.mock.calls[0].arguments[2], {
      monitored: true,
      moviesMonitored: false,
      whisparrMonitorNewItems: true,
      searchOnAdd: false,
      rootFolderPath: '/data/xxx',
    });
    assert.strictEqual(refresh.mock.callCount(), 1);
  });

  it('requires the manage requests permission', async () => {
    getSettings().whisparr = [whisparrServer];
    const user = await loginAs(
      'demo@seerr.dev',
      Permission.REQUEST | Permission.ADULT
    );

    const res = await user
      .post(`/scene/performer/${SCENE_ID}/monitor`)
      .send({ scenes: true, movies: true });

    assert.strictEqual(res.status, 403);
  });

  it('reports nothing monitored after stopping', async () => {
    getSettings().whisparr = [whisparrServer];
    network();
    const monitor = mock.method(
      WhisparrAPI.prototype,
      'applyCreditMonitoring',
      async () => null
    );
    const admin = await loginAs('admin@seerr.dev');

    const res = await admin
      .post(`/scene/studio/${SCENE_ID}/monitor`)
      .send({ scenes: false, movies: false, studios: [CHILD_B] });

    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(res.body, {
      monitored: false,
      moviesMonitored: false,
      monitorNewItems: true,
      searchOnAdd: false,
      serviceUrl: `http://whisparr.test:6969/studio/${SCENE_ID}`,
      studios: [{ id: CHILD_B, monitored: false, moviesMonitored: false }],
    });
    assert.strictEqual(monitor.mock.callCount(), 2);
    assert.strictEqual(monitor.mock.calls[0].arguments[2]?.scenes, false);
  });

  it('rejects the old body and returns 409 without a default Whisparr server', async () => {
    const admin = await loginAs('admin@seerr.dev');

    const res = await admin
      .post(`/scene/performer/${SCENE_ID}/monitor`)
      .send({ scenes: true, movies: true });
    const old = await admin
      .post(`/scene/performer/${SCENE_ID}/monitor`)
      .send({ monitored: true });

    assert.strictEqual(res.status, 409);
    assert.strictEqual(old.status, 400);
  });
});
