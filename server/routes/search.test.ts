import assert from 'node:assert/strict';
import { afterEach, before, beforeEach, describe, it, mock } from 'node:test';

import ExternalAPI from '@server/api/externalapi';
import StashDbAPI from '@server/api/stashdb';
import TpdbAPI from '@server/api/tpdb';
import type { TpdbMovie } from '@server/api/tpdb/interfaces';
import { getRepository } from '@server/datasource';
import { User } from '@server/entity/User';
import { Permission } from '@server/lib/permissions';
import { getSettings } from '@server/lib/settings';
import { checkUser } from '@server/middleware/auth';
import { setupTestDb } from '@server/test/db';
import type { Express } from 'express';
import express from 'express';
import session from 'express-session';
import request from 'supertest';
import authRoutes from './auth';
import searchRoutes from './search';

const movie: TpdbMovie = {
  id: '144b1c4a-1129-40b6-b57a-564cbef6631d',
  _id: 5335406,
  title: 'Anal Teachings',
  type: 'Movie',
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
  app.use('/search', searchRoutes);
});

setupTestDb();

beforeEach(() => {
  const settings = getSettings();
  settings.main.enableAdult = true;
  settings.main.localLogin = true;
  settings.tpdb = { url: 'https://api.theporndb.net', apiKey: 'key' };
  settings.stashdb = {
    endpoint: 'https://stashdb.test/graphql',
    apiKey: 'key',
  };
  // TMDB's multi search
  mock.method(
    ExternalAPI.prototype as unknown as { get: () => Promise<unknown> },
    'get',
    async () => ({
      page: 1,
      total_pages: 1,
      total_results: 0,
      results: [],
    })
  );
  mock.method(StashDbAPI.prototype, 'searchPerformers', async () => [
    { id: 'bcb98a6e-08f3-48a9-90d5-f223901a56a5', name: 'Molly Little' },
  ]);
  mock.method(TpdbAPI.prototype, 'getMovies', async () => ({
    data: [movie],
    meta: { current_page: 1, last_page: 4, per_page: 20, total: 61 },
  }));
  mock.method(TpdbAPI.prototype, 'searchPerformers', async () => []);
  mock.method(StashDbAPI.prototype, 'findIdsByUrls', async () => []);
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

describe('GET /search', () => {
  it('adds StashDB performers and ThePornDB movies', async () => {
    const agent = await loginAs('admin@seerr.dev');

    const res = await agent.get('/search?query=molly&page=1');

    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(
      res.body.results.map((r: { mediaType: string }) => r.mediaType),
      ['performer', 'adultmovie']
    );
    assert.strictEqual(res.body.totalPages, 4);
  });

  it('adds ThePornDB performers StashDB has no page for', async () => {
    mock.method(TpdbAPI.prototype, 'searchPerformers', async () => [
      // Linked to the StashDB result, so left out next to it
      {
        id: 'a',
        _id: 1,
        name: 'Molly Little',
        image: 'https://cdn.theporndb.net/performer/a.jpg',
        extras: {
          links: {
            StashDB:
              'https://stashdb.test/performers/bcb98a6e-08f3-48a9-90d5-f223901a56a5',
          },
        },
      },
      // A StashDB performer links to it, so it opens that page
      {
        id: 'b',
        _id: 2,
        slug: 'molly-mae',
        name: 'Molly Mae',
        image: 'https://cdn.theporndb.net/performer/b.jpg',
      },
      // Neither side links it
      { id: 'c', _id: 3, name: 'Molly Moe' },
    ]);
    const findIds = mock.method(
      StashDbAPI.prototype,
      'findIdsByUrls',
      async (_type: string, urls: string[]) =>
        urls.map((url) =>
          url === 'https://theporndb.net/performers/molly-mae'
            ? '5f9a0b8e-2b1d-4c3e-9f4a-1b2c3d4e5f60'
            : undefined
        )
    );
    const agent = await loginAs('admin@seerr.dev');

    const res = await agent.get('/search?query=molly&page=1');

    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(res.body.results.slice(0, 3), [
      {
        id: 'bcb98a6e-08f3-48a9-90d5-f223901a56a5',
        mediaType: 'performer',
        name: 'Molly Little',
      },
      {
        id: '5f9a0b8e-2b1d-4c3e-9f4a-1b2c3d4e5f60',
        mediaType: 'performer',
        name: 'Molly Mae',
        imageUrl: 'https://cdn.theporndb.net/performer/b.jpg',
        imageType: 'tpdb',
      },
      {
        id: '3',
        tpdbId: 3,
        mediaType: 'performer',
        name: 'Molly Moe',
        source: 'tpdb',
        imageType: 'tpdb',
      },
    ]);
    assert.strictEqual(res.body.results.length, 4);
    // Only those ThePornDB does not link are looked up on StashDB
    assert.deepStrictEqual(findIds.mock.calls[0].arguments[1], [
      'https://theporndb.net/performers/b',
      'https://theporndb.net/performers/molly-mae',
      'https://theporndb.net/performers/c',
    ]);
  });

  it('leaves adult results out for users without adult access', async () => {
    const agent = await loginAs('demo@seerr.dev', Permission.REQUEST);

    const res = await agent.get('/search?query=molly&page=1');

    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(res.body.results, []);
  });

  it('keeps TMDB results when an adult source fails', async () => {
    mock.method(TpdbAPI.prototype, 'getMovies', async () => {
      throw new Error('down');
    });
    const agent = await loginAs('admin@seerr.dev');

    const res = await agent.get('/search?query=molly&page=1');

    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(
      res.body.results.map((r: { mediaType: string }) => r.mediaType),
      ['performer']
    );
  });
});
