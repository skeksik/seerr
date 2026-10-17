import assert from 'node:assert/strict';
import { afterEach, before, beforeEach, describe, it, mock } from 'node:test';

import StashDbAPI from '@server/api/stashdb';
import { MediaStatus, MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import { MediaRequest } from '@server/entity/MediaRequest';
import { User } from '@server/entity/User';
import { Permission, addPermissions } from '@server/lib/permissions';
import { getSettings } from '@server/lib/settings';
import { checkUser } from '@server/middleware/auth';
import { setupTestDb } from '@server/test/db';
import type { Express } from 'express';
import express from 'express';
import session from 'express-session';
import request from 'supertest';
import authRoutes from './auth';
import watchlistRoutes from './watchlist';

const SCENE_ID = '01a138c1-a8cf-74b2-a8bb-e617e9c6f20f';

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
  settings.stashdb = { endpoint: 'https://stashdb.test/graphql', apiKey: 'k' };
  mock.method(StashDbAPI.prototype, 'getScene', async (id: string) => ({
    id,
    title: 'Scene',
    deleted: false,
    images: [],
    performers: [],
    urls: [],
    tags: [],
  }));
});

afterEach(() => {
  const settings = getSettings();
  settings.main.enableAdult = false;
  settings.stashdb = { endpoint: 'https://stashdb.org/graphql', apiKey: '' };
  mock.restoreAll();
});

// The seeded non-admin user, with the given permissions
async function loginAs(permissions: number) {
  const userRepository = getRepository(User);
  const user = await userRepository.findOneOrFail({
    where: { email: 'demo@seerr.dev' },
  });
  user.permissions = permissions;
  await userRepository.save(user);

  const agent = request.agent(app);
  const res = await agent
    .post('/auth/local')
    .send({ email: 'demo@seerr.dev', password: 'test1234' });
  assert.strictEqual(res.status, 200);
  return { agent, user };
}

const requestsFor = (stashId: string) =>
  getRepository(MediaRequest).find({
    where: { media: { stashId } },
  });

// Like for movies, only the Plex watchlist sync requests titles
describe('POST /watchlist', () => {
  it('never requests scenes, even with Auto-Request', async () => {
    const { agent } = await loginAs(
      addPermissions(
        Permission.REQUEST | Permission.ADULT | Permission.AUTO_REQUEST,
        Permission.AUTO_REQUEST_SCENE
      )
    );

    const res = await agent
      .post('/watchlist')
      .send({ mediaType: 'scene', externalId: SCENE_ID });

    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.externalId, SCENE_ID);
    assert.strictEqual(res.body.media.status, MediaStatus.UNKNOWN);
    assert.deepStrictEqual(await requestsFor(SCENE_ID), []);
  });

  it('keeps the status of titles already in the library', async () => {
    const { agent } = await loginAs(
      Permission.REQUEST | Permission.AUTO_REQUEST | Permission.ADULT
    );
    await getRepository(Media).save(
      new Media({
        mediaType: MediaType.SCENE,
        stashId: SCENE_ID,
        tmdbId: null,
        status: MediaStatus.AVAILABLE,
      })
    );

    const res = await agent
      .post('/watchlist')
      .send({ mediaType: 'scene', externalId: SCENE_ID });

    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.media.status, MediaStatus.AVAILABLE);
    assert.deepStrictEqual(await requestsFor(SCENE_ID), []);
  });
});
