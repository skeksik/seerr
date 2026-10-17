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
  const RECENT = '/media?filter=allavailable&sort=mediaAdded';

  const seed = async () => {
    await available({ mediaType: MediaType.MOVIE, tmdbId: 1 });
    // Added in Whisparr, with no Seerr request
    await available({
      mediaType: MediaType.SCENE,
      stashId: '01a0de25-5c7e-75b7-b319-ee76dd9a4879',
    });
    const requested = await available({
      mediaType: MediaType.ADULT_MOVIE,
      tpdbId: '02b1383e-b871-4fd6-a731-2119a3aa93a7',
    });
    await getRepository(MediaRequest).save(
      new MediaRequest({
        type: MediaType.ADULT_MOVIE,
        status: MediaRequestStatus.COMPLETED,
        media: requested,
        requestedBy: await getRepository(User).findOneByOrFail({ id: 1 }),
        is4k: false,
      })
    );
  };

  const signIn = async (email: string) => {
    const agent = request.agent(app);
    await agent.post('/auth/local').send({ email, password: 'test1234' });
    return agent;
  };

  it('lists adult titles in Recently Added whoever added them', async () => {
    await seed();
    const agent = await signIn('admin@seerr.dev');

    const all = await agent.get(RECENT);
    const scenes = await agent.get(`${RECENT}&mediaType=scene`);

    assert.strictEqual(all.body.results.length, 3);
    assert.deepStrictEqual(
      scenes.body.results.map((m: Media) => m.stashId),
      ['01a0de25-5c7e-75b7-b319-ee76dd9a4879']
    );
  });

  it('leaves adult titles out for users without adult access', async () => {
    await seed();
    const agent = await signIn('demo@seerr.dev');

    const all = await agent.get(RECENT);
    const scenes = await agent.get(`${RECENT}&mediaType=scene`);

    assert.deepStrictEqual(
      all.body.results.map((m: Media) => m.tmdbId),
      [1]
    );
    assert.strictEqual(scenes.body.results.length, 0);
  });
});
