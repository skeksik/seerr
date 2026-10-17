import assert from 'node:assert/strict';
import { afterEach, before, beforeEach, describe, it, mock } from 'node:test';

import StashDbAPI from '@server/api/stashdb';
import type { StashDbScene } from '@server/api/stashdb/interfaces';
import { MediaStatus, MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import { Blocklist } from '@server/entity/Blocklist';
import Media from '@server/entity/Media';
import { User } from '@server/entity/User';
import { Watchlist } from '@server/entity/Watchlist';
import { Permission } from '@server/lib/permissions';
import { getSettings } from '@server/lib/settings';
import { checkUser } from '@server/middleware/auth';
import { setupTestDb } from '@server/test/db';
import type { Express } from 'express';
import express from 'express';
import session from 'express-session';
import request from 'supertest';
import authRoutes from './auth';
import blocklistRoutes from './blocklist';
import discoverRoutes from './discover';
import watchlistRoutes from './watchlist';

const SCENE_ID = '01a138c1-a8cf-74b2-a8bb-e617e9c6f20f';

const scene = {
  id: SCENE_ID,
  title: 'Scene Title',
  deleted: false,
  images: [],
  performers: [],
  urls: [],
  tags: [],
} as unknown as StashDbScene;

let app: Express;

before(() => {
  app = express();
  app.use(express.json());
  app.use(
    session({ secret: 'test-secret', resave: false, saveUninitialized: false })
  );
  app.use(checkUser);
  app.use('/auth', authRoutes);
  app.use('/watchlist', watchlistRoutes);
  app.use('/blocklist', blocklistRoutes);
  app.use('/discover', discoverRoutes);
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
  settings.stashdb = {
    endpoint: 'https://stashdb.test/graphql',
    apiKey: 'key',
  };
  mock.method(StashDbAPI.prototype, 'getScene', async () => scene);
});

afterEach(() => {
  const settings = getSettings();
  settings.main.enableAdult = false;
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

describe('adult watchlist', () => {
  it('adds, lists and removes a scene', async () => {
    const agent = await loginAs('admin@seerr.dev');

    const added = await agent
      .post('/watchlist')
      .send({ mediaType: 'scene', externalId: SCENE_ID });

    assert.strictEqual(added.status, 201);
    assert.strictEqual(added.body.title, 'Scene Title');
    const media = await Media.getAdultMedia(MediaType.SCENE, SCENE_ID);
    assert.ok(media);
    assert.strictEqual(media.tmdbId, null);

    const duplicate = await agent
      .post('/watchlist')
      .send({ mediaType: 'scene', externalId: SCENE_ID });
    assert.strictEqual(duplicate.status, 409);

    // Plex users get their Plex watchlist instead
    await getRepository(User).update(
      { email: 'admin@seerr.dev' },
      { plexToken: '' }
    );
    const list = await agent.get('/discover/watchlist');
    assert.strictEqual(list.body.results[0].externalId, SCENE_ID);
    assert.strictEqual(list.body.results[0].mediaType, 'scene');

    const removed = await agent.delete(
      `/watchlist/${SCENE_ID}?mediaType=scene`
    );
    assert.strictEqual(removed.status, 204);
    assert.strictEqual(await getRepository(Watchlist).count(), 0);
  });

  it('keeps scenes off the watchlist of users without adult access', async () => {
    const agent = await loginAs('demo@seerr.dev', Permission.REQUEST);

    const added = await agent
      .post('/watchlist')
      .send({ mediaType: 'scene', externalId: SCENE_ID });

    assert.strictEqual(added.status, 403);
  });

  it('returns 404 for scenes StashDB does not know', async () => {
    mock.restoreAll();
    mock.method(StashDbAPI.prototype, 'getScene', async () => null);
    const agent = await loginAs('admin@seerr.dev');

    const added = await agent
      .post('/watchlist')
      .send({ mediaType: 'scene', externalId: SCENE_ID });

    assert.strictEqual(added.status, 404);
  });
});

describe('adult blocklist', () => {
  it('blocklists and restores a scene', async () => {
    const agent = await loginAs('admin@seerr.dev');

    const added = await agent
      .post('/blocklist')
      .send({ mediaType: 'scene', externalId: SCENE_ID });

    assert.strictEqual(added.status, 201);
    const media = await Media.getAdultMedia(MediaType.SCENE, SCENE_ID);
    assert.strictEqual(media?.status, MediaStatus.BLOCKLISTED);

    const again = await agent
      .post('/blocklist')
      .send({ mediaType: 'scene', externalId: SCENE_ID });
    assert.strictEqual(again.status, 412);

    const item = await agent.get(`/blocklist/${SCENE_ID}?mediaType=scene`);
    assert.strictEqual(item.body.title, 'Scene Title');

    const removed = await agent.delete(
      `/blocklist/${SCENE_ID}?mediaType=scene`
    );
    assert.strictEqual(removed.status, 204);
    assert.strictEqual(
      await Media.getAdultMedia(MediaType.SCENE, SCENE_ID),
      undefined
    );
  });

  it('hides adult items from viewers without adult access', async () => {
    await getRepository(Blocklist).save(
      new Blocklist({
        mediaType: MediaType.SCENE,
        externalId: SCENE_ID,
        tmdbId: null,
        title: 'Scene Title',
      })
    );
    const agent = await loginAs('demo@seerr.dev', Permission.VIEW_BLOCKLIST);

    const list = await agent.get('/blocklist');

    assert.strictEqual(list.status, 200);
    assert.strictEqual(list.body.results.length, 0);
  });
});
