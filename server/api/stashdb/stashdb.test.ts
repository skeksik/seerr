import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import StashDbAPI from '@server/api/stashdb';
import cacheManager from '@server/lib/cache';
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

  it('matches a same-named performer only on a shared profile link', async () => {
    const performers = {
      data: {
        searchPerformer: [
          {
            id: 'czech',
            name: 'Little Dragon',
            aliases: [],
            urls: [{ url: 'https://www.iafd.com/person.rme/id=other' }],
          },
          {
            id: 'spice',
            name: 'Cerise Spice',
            aliases: ['Little Dragon'],
            urls: [{ url: 'https://www.iafd.com/person.rme/id=6282' }],
          },
        ],
      },
    };
    const api = new TestStashDbAPI([performers]);

    assert.deepStrictEqual(
      await api.findPerformerByLinks('Little Dragon', [
        'http://iafd.com/person.rme/id=6282/',
      ]),
      { id: 'spice', name: 'Cerise Spice' }
    );
    assert.strictEqual(
      await new TestStashDbAPI([performers]).findPerformerByLinks(
        'Little Dragon',
        ['https://twitter.com/someone']
      ),
      null
    );
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
});
