import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import StashDbAPI from '@server/api/stashdb';
import cacheManager from '@server/lib/cache';
import { getSettings } from '@server/lib/settings';
import type { AxiosResponse, InternalAxiosRequestConfig } from 'axios';

class TestStashDbAPI extends StashDbAPI {
  public requests: InternalAxiosRequestConfig[] = [];

  constructor(responses: unknown[]) {
    super({ endpoint: 'https://stashdb.test/graphql', apiKey: 'secret' });

    this.axios.defaults.adapter = (config) => {
      this.requests.push(config);
      return Promise.resolve({
        data: responses.shift(),
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
        request: {},
      } as AxiosResponse);
    };
  }
}

const scene = {
  id: '01a138c1-a8cf-74b2-a8bb-e617e9c6f20f',
  title: 'Scene',
  deleted: false,
  images: [],
  performers: [],
  urls: [],
  tags: [],
};

beforeEach(() => {
  cacheManager.getCache('stashdb').flush();
});

describe('StashDbAPI', () => {
  it('sends the API key and the scene id as a GraphQL variable', async () => {
    const api = new TestStashDbAPI([{ data: { findScene: scene } }]);

    assert.deepStrictEqual(await api.getScene(scene.id), scene);

    const [request] = api.requests;
    assert.strictEqual(request.headers.ApiKey, 'secret');
    assert.deepStrictEqual(JSON.parse(request.data).variables, {
      id: scene.id,
    });
  });

  it('caches scene lookups', async () => {
    const api = new TestStashDbAPI([{ data: { findScene: scene } }]);

    await api.getScene(scene.id);
    await api.getScene(scene.id);

    assert.strictEqual(api.requests.length, 1);
  });

  it('throws on GraphQL errors without caching them', async () => {
    const api = new TestStashDbAPI([
      { errors: [{ message: 'not authorized' }], data: null },
      { data: { findScene: scene } },
    ]);

    await assert.rejects(() => api.getScene(scene.id), /not authorized/);
    assert.deepStrictEqual(await api.getScene(scene.id), scene);
    assert.strictEqual(api.requests.length, 2);
  });

  it('filters scene queries by studio, performer and tag', async () => {
    const api = new TestStashDbAPI([
      { data: { s0: { child_studios: [{ id: 'child' }] } } },
      { data: { queryScenes: { count: 0, scenes: [] } } },
    ]);

    await api.queryScenes({
      studioIds: ['studio'],
      tagIds: ['a', 'b'],
      sort: 'DATE',
      date: { value: '2026-01-01', modifier: 'GREATER_THAN' },
    });

    // Networks take in the studios under them
    assert.deepStrictEqual(JSON.parse(api.requests[0].data).variables, {
      s0: 'studio',
    });
    const { input } = JSON.parse(api.requests[1].data).variables;
    assert.deepStrictEqual(input.studios, {
      value: ['studio', 'child'],
      modifier: 'INCLUDES',
    });
    assert.deepStrictEqual(input.tags, {
      value: ['a', 'b'],
      modifier: 'INCLUDES_ALL',
    });
    assert.deepStrictEqual(input.date, {
      value: '2026-01-01',
      modifier: 'GREATER_THAN',
    });
    assert.strictEqual(input.performers, undefined);
    assert.strictEqual(input.sort, 'DATE');
  });

  it('counts every scene, not only the trending ones', async () => {
    const api = new TestStashDbAPI([{ data: { c0: { count: 3 } } }]);

    assert.deepStrictEqual(
      await api.countScenes([{ tagIds: ['tag'], sort: 'TRENDING' }]),
      [3]
    );
    const { c0 } = JSON.parse(api.requests[0].data).variables;
    assert.strictEqual(c0.sort, 'DATE');
  });

  it('shares one request between callers asking the same at once', async () => {
    const api = new TestStashDbAPI([{ data: { findScene: scene } }]);

    const [first, second] = await Promise.all([
      api.getScene(scene.id),
      api.getScene(scene.id),
    ]);

    assert.deepStrictEqual(first, scene);
    assert.deepStrictEqual(second, scene);
    assert.strictEqual(api.requests.length, 1);
  });

  it('looks up the studios of all counts in one request', async () => {
    const api = new TestStashDbAPI([
      {
        data: {
          s0: { child_studios: [{ id: 'child' }] },
          s1: { child_studios: [] },
        },
      },
      { data: { c0: { count: 1 }, c1: { count: 2 }, c2: { count: 0 } } },
    ]);

    assert.deepStrictEqual(
      await api.countScenes([
        { studioIds: ['network'] },
        { studioIds: ['network'], exclude: { studioIds: ['ignored'] } },
        { exclude: { studioIds: ['excluded'] } },
      ]),
      [1, 2, 0]
    );

    assert.strictEqual(api.requests.length, 2);
    // An exclusion next to an included studio is left to the caller
    assert.deepStrictEqual(JSON.parse(api.requests[0].data).variables, {
      s0: 'network',
      s1: 'excluded',
    });
    const { c0, c2 } = JSON.parse(api.requests[1].data).variables;
    assert.deepStrictEqual(c0.studios, {
      value: ['network', 'child'],
      modifier: 'INCLUDES',
    });
    assert.deepStrictEqual(c2.studios, {
      value: ['excluded'],
      modifier: 'EXCLUDES',
    });
  });

  it('finds the holders of many addresses in batches', async () => {
    const urls = Array.from(
      { length: 151 },
      (_, i) => `https://theporndb.net/sites/site-${i}`
    );
    const api = new TestStashDbAPI([
      { data: { u1: { studios: [{ id: 'studio' }] } } },
      { data: { u0: { studios: [] } } },
    ]);

    const ids = await api.findIdsByUrls('studio', urls);

    assert.strictEqual(api.requests.length, 2);
    assert.strictEqual(ids.length, 151);
    assert.strictEqual(ids[1], 'studio');
    assert.strictEqual(ids.filter(Boolean).length, 1);
    const first = JSON.parse(api.requests[0].data);
    assert.match(first.query, /u149: queryStudios\(input: \{ url: \$u149/);
    assert.strictEqual(first.variables.u1, urls[1]);
    assert.deepStrictEqual(JSON.parse(api.requests[1].data).variables, {
      u0: urls[150],
    });
  });

  it('prefers the holder named like the linked item', async () => {
    const api = new TestStashDbAPI([
      {
        data: {
          u0: {
            studios: [
              { id: 'adult-time', name: 'Adult Time x Blacked' },
              { id: 'blacked', name: 'Blacked' },
            ],
          },
          u1: { studios: [{ id: 'other', name: 'Tushy Raw' }] },
        },
      },
    ]);

    const ids = await api.findIdsByUrls(
      'studio',
      ['https://theporndb.net/sites/blacked', 'https://theporndb.net/sites/x'],
      ['Blacked', 'Tushy']
    );

    assert.deepStrictEqual(ids, ['blacked', 'other']);
  });

  it('keeps one client per endpoint and key', () => {
    const settings = getSettings();
    const previous = settings.stashdb;
    settings.stashdb = {
      endpoint: 'https://stashdb.test/graphql',
      apiKey: 'a',
    };

    const first = StashDbAPI.fromSettings();
    assert.strictEqual(StashDbAPI.fromSettings(), first);
    settings.stashdb = {
      endpoint: 'https://stashdb.test/graphql',
      apiKey: 'b',
    };
    assert.notStrictEqual(StashDbAPI.fromSettings(), first);

    settings.stashdb = previous;
  });
});
