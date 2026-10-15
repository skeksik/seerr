import assert from 'node:assert/strict';
import { afterEach, before, beforeEach, describe, it, mock } from 'node:test';

import WhisparrAPI from '@server/api/servarr/whisparr';
import StashDbAPI from '@server/api/stashdb';
import type {
  StashDbPerformer,
  StashDbScene,
} from '@server/api/stashdb/interfaces';
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
const GAY_TAG = '237e0f29-4db5-4d01-af7c-a620a73ed432';
const TRANS_TAG = 'dc81ff52-bad0-4441-b20c-fd258b087d77';

const scene: StashDbScene = {
  id: SCENE_ID,
  title: 'Slo-Mo',
  release_date: '2023-07-01',
  duration: 316,
  deleted: false,
  images: [
    {
      id: 'small',
      url: 'https://stashdb.test/images/small',
      width: 640,
      height: 360,
    },
    {
      id: 'large',
      url: 'https://stashdb.test/images/large',
      width: 1920,
      height: 1080,
    },
  ],
  studio: { id: 'studio', name: 'Studio', parent: null },
  performers: [
    {
      as: null,
      performer: {
        id: 'performer',
        name: 'Performer',
        gender: 'FEMALE',
        images: [],
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
    assert.strictEqual(res.body.imageUrl, 'https://stashdb.test/images/large');
    assert.strictEqual(res.body.performers[0].name, 'Performer');
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
    assert.deepStrictEqual(queryScenes.mock.calls[0].arguments[0], {
      page: 1,
      perPage: 20,
      sort: 'POPULARITY',
      performerIds: ['performer'],
      any: { performers: true },
    });
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
      '/scene/discover?sort=date&page=2&studio=6f1b8f3e-2c4d-4b7a-9a51-2d1e5c7a9b10'
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
      exclude: { studioIds: undefined, performerIds: undefined, tagIds: [] },
      date: undefined,
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
          {
            ...scene,
            id: 'gay',
            performers: [
              {
                performer: { id: 'm1', name: 'M1', gender: 'MALE', images: [] },
              },
              {
                performer: { id: 'm2', name: 'M2', gender: 'MALE', images: [] },
              },
            ],
          },
        ],
      })
    );
    mock.method(StashDbAPI.prototype, 'getTagIds', async () => ({
      Gay: GAY_TAG,
    }));
    const agent = await loginAs('admin@seerr.dev');

    const res = await agent.get(
      `/scene/discover?tags=${INCLUDED_TAG}&tagsExclude=${EXCLUDED_TAG}&performerMode=or&orientation=straight,lesbian`
    );

    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(
      res.body.results.map((result: { id: string }) => result.id),
      [SCENE_ID]
    );
    const query = queryScenes.mock.calls[0].arguments[0];
    assert.deepStrictEqual(query?.any, { performers: true, tags: false });
    // Tags are included, so the exclusions cannot go along to StashDB
    assert.deepStrictEqual(query?.tagIds, [INCLUDED_TAG]);
  });

  it('sends hidden feature tags along when no tag is included', async () => {
    const queryScenes = mock.method(
      StashDbAPI.prototype,
      'queryScenes',
      async () => ({ count: 0, scenes: [] })
    );
    mock.method(StashDbAPI.prototype, 'getTagIds', async () => ({
      Gay: GAY_TAG,
      Transgender: TRANS_TAG,
    }));
    const agent = await loginAs('admin@seerr.dev');

    // Gay is hidden too, but a gay-tagged scene may also be tagged straight
    const res = await agent.get(
      '/scene/discover?orientation=straight,lesbian,bisexual,futa'
    );

    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(
      queryScenes.mock.calls[0].arguments[0]?.exclude?.tagIds,
      [TRANS_TAG]
    );
  });

  it('maps release date bounds and upcoming scenes', async () => {
    const queryScenes = mock.method(
      StashDbAPI.prototype,
      'queryScenes',
      async () => ({ count: 0, scenes: [] })
    );
    const agent = await loginAs('admin@seerr.dev');

    await agent.get(
      `/scene/discover?released=before&releaseDate=2026-01-01&tags=${SCENE_ID},${SCENE_ID}`
    );
    await agent.get('/scene/discover?upcoming=true');

    const [filtered, upcoming] = queryScenes.mock.calls.map(
      (call) => call.arguments[0]
    );
    assert.deepStrictEqual(filtered?.date, {
      value: '2026-01-01',
      modifier: 'LESS_THAN',
    });
    assert.strictEqual(filtered?.tagIds?.length, 2);
    assert.strictEqual(upcoming?.sort, 'DATE');
    assert.strictEqual(upcoming?.direction, 'ASC');
    assert.strictEqual(upcoming?.date?.modifier, 'GREATER_THAN');
  });

  it('rejects unknown sorts', async () => {
    const agent = await loginAs('admin@seerr.dev');

    assert.strictEqual(
      (await agent.get('/scene/discover?sort=random')).status,
      400
    );
  });
});

describe('studio rankings', () => {
  const image = (id: string) => [
    { id, url: `https://stashdb.test/images/${id}`, width: 300, height: 100 },
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

  it('ranks studios by their trending scenes, leaving out networks', async () => {
    const getSceneStudios = mock.method(
      StashDbAPI.prototype,
      'getSceneStudios',
      async () => studios
    );
    const agent = await loginAs('admin@seerr.dev');

    const res = await agent.get('/scene/studios?sort=trending');

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
    assert.deepStrictEqual(getSceneStudios.mock.calls[0].arguments, [
      'TRENDING',
    ]);
  });

  it('ranks networks by the popular scenes of their studios', async () => {
    const getSceneStudios = mock.method(
      StashDbAPI.prototype,
      'getSceneStudios',
      async () => [...studios, { ...ref('d'), parent: ref('m') }]
    );
    const agent = await loginAs('admin@seerr.dev');

    const res = await agent.get(
      '/scene/studios?type=networks&sort=popular&query=N'
    );

    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(
      res.body.results.map((studio: { id: string }) => studio.id),
      ['n']
    );
    assert.deepStrictEqual(getSceneStudios.mock.calls[0].arguments, [
      'POPULARITY',
    ]);
  });

  it('starts the trending rows the same way', async () => {
    mock.method(StashDbAPI.prototype, 'getSceneStudios', async () => studios);
    const agent = await loginAs('admin@seerr.dev');

    const res = await agent.get('/scene/trending-studios?type=networks');

    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(
      res.body.map((studio: { id: string }) => studio.id),
      ['n']
    );
  });
});

describe('GET /scene/lookup/:type', () => {
  it('leaves out suggestions that find nothing next to the picked filters', async () => {
    mock.method(StashDbAPI.prototype, 'searchTags', async () => [
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B' },
    ]);
    const countScenes = mock.method(
      StashDbAPI.prototype,
      'countScenes',
      async () => [3, 0]
    );
    const agent = await loginAs('admin@seerr.dev');

    const res = await agent.get(
      `/scene/lookup/tags?query=x&performer=${SCENE_ID}&tags=${INCLUDED_TAG}`
    );

    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(res.body, [{ id: 'a', name: 'A' }]);
    // Tags need all of them, so the picked one stays in each count
    assert.deepStrictEqual(countScenes.mock.calls[0].arguments[0]?.[1], {
      studioIds: undefined,
      performerIds: [SCENE_ID],
      tagIds: [INCLUDED_TAG, 'b'],
      any: { performers: false, tags: false },
    });
  });

  it('checks nothing without other filters', async () => {
    mock.method(StashDbAPI.prototype, 'searchStudios', async () => [
      { id: 'a', name: 'A' },
    ]);
    const countScenes = mock.method(
      StashDbAPI.prototype,
      'countScenes',
      async () => []
    );
    const agent = await loginAs('admin@seerr.dev');

    const res = await agent.get(
      `/scene/lookup/studios?query=x&studio=${INCLUDED_TAG}`
    );

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.length, 1);
    assert.strictEqual(countScenes.mock.callCount(), 0);
  });
});

describe('GET /scene/search', () => {
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
    const agent = await loginAs('admin@seerr.dev');

    const res = await agent.get(`/scene/studio/${SCENE_ID}`);

    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(res.body, {
      id: 'studio',
      name: 'Studio',
      aliases: [],
      studios: [
        { id: 'a', name: 'Alpha' },
        { id: 'b', name: 'Beta' },
      ],
      urls: [],
      stashDbUrl: 'https://stashdb.test/studios/studio',
    });
  });

  it('adds Whisparr monitoring status for request managers', async () => {
    getSettings().whisparr = [whisparrServer];
    mock.method(StashDbAPI.prototype, 'getPerformer', async () => performer);
    mock.method(WhisparrAPI.prototype, 'getCredit', async () => ({
      id: 1,
      foreignId: SCENE_ID,
      monitored: true,
      qualityProfileId: 1,
      searchOnAdd: false,
      tags: [],
    }));
    const admin = await loginAs('admin@seerr.dev');

    const res = await admin.get(`/scene/performer/${SCENE_ID}`);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.careerStart, 2010);
    assert.deepStrictEqual(res.body.whisparr, {
      monitored: true,
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
  it('monitors with the default server settings and no search by default', async () => {
    getSettings().whisparr = [whisparrServer];
    const monitor = mock.method(
      WhisparrAPI.prototype,
      'setCreditMonitored',
      async () => ({
        id: 1,
        foreignId: SCENE_ID,
        monitored: true,
        qualityProfileId: 4,
        searchOnAdd: false,
        tags: [2],
      })
    );
    const admin = await loginAs('admin@seerr.dev');

    const res = await admin
      .post(`/scene/studio/${SCENE_ID}/monitor`)
      .send({ monitored: true });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.monitored, true);
    assert.deepStrictEqual(monitor.mock.calls[0].arguments, [
      'studio',
      SCENE_ID,
      true,
      {
        qualityProfileId: 4,
        rootFolderPath: '/data/xxx',
        tags: [2],
        searchOnAdd: false,
      },
    ]);
  });

  it('requires the manage requests permission', async () => {
    getSettings().whisparr = [whisparrServer];
    const user = await loginAs(
      'demo@seerr.dev',
      Permission.REQUEST | Permission.ADULT
    );

    const res = await user
      .post(`/scene/performer/${SCENE_ID}/monitor`)
      .send({ monitored: true });

    assert.strictEqual(res.status, 403);
  });

  it('returns 409 without a default Whisparr server', async () => {
    const admin = await loginAs('admin@seerr.dev');

    const res = await admin
      .post(`/scene/performer/${SCENE_ID}/monitor`)
      .send({ monitored: true });

    assert.strictEqual(res.status, 409);
  });
});
