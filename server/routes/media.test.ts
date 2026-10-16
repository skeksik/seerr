import assert from 'node:assert/strict';
import { afterEach, before, beforeEach, describe, it } from 'node:test';

import {
  MediaRequestStatus,
  MediaStatus,
  MediaType,
} from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import { MediaRequest } from '@server/entity/MediaRequest';
import { User } from '@server/entity/User';
import { getSettings } from '@server/lib/settings';
import { checkUser } from '@server/middleware/auth';
import { setupTestDb } from '@server/test/db';
import type { Express } from 'express';
import express from 'express';
import session from 'express-session';
import request from 'supertest';
import authRoutes from './auth';
import mediaRoutes from './media';

let app: Express;

before(() => {
  app = express();
  app.use(express.json());
  app.use(
    session({ secret: 'test-secret', resave: false, saveUninitialized: false })
  );
  app.use(checkUser);
  app.use('/auth', authRoutes);
  app.use('/media', mediaRoutes);
});

setupTestDb();

beforeEach(() => {
  getSettings().main.enableAdult = true;
  getSettings().main.localLogin = true;
});

afterEach(() => {
  getSettings().main.enableAdult = false;
});

const available = (init: Partial<Media>) =>
  getRepository(Media).save(
    new Media({
      tmdbId: null,
      status: MediaStatus.AVAILABLE,
      mediaAddedAt: new Date(),
      ...init,
    })
  );

describe('GET /media', () => {
  it('keeps unrequested adult titles out of Recently Added', async () => {
    await available({ mediaType: MediaType.MOVIE, tmdbId: 1 });
    await available({
      mediaType: MediaType.SCENE,
      stashId: '01a0de25-5c7e-75b7-b319-ee76dd9a4879',
    });
    const requested = await available({
      mediaType: MediaType.SCENE,
      stashId: '6f1b8f3e-2c4d-4b7a-9a51-2d1e5c7a9b10',
    });
    await getRepository(MediaRequest).save(
      new MediaRequest({
        type: MediaType.SCENE,
        status: MediaRequestStatus.COMPLETED,
        media: requested,
        requestedBy: await getRepository(User).findOneByOrFail({ id: 1 }),
        is4k: false,
      })
    );
    const agent = request.agent(app);
    await agent
      .post('/auth/local')
      .send({ email: 'admin@seerr.dev', password: 'test1234' });

    const all = await agent.get('/media?filter=allavailable&sort=mediaAdded');
    const recent = await agent.get(
      '/media?filter=allavailable&sort=mediaAdded&adultRequested=true'
    );

    assert.strictEqual(all.body.results.length, 3);
    assert.deepStrictEqual(
      recent.body.results.map((m: Media) => m.tmdbId ?? m.stashId).sort(),
      [1, '6f1b8f3e-2c4d-4b7a-9a51-2d1e5c7a9b10'].sort()
    );
  });
});
