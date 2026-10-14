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
      { data: { queryScenes: { count: 0, scenes: [] } } },
    ]);

    await api.queryScenes({ studioId: 'studio', sort: 'DATE' });

    const { input } = JSON.parse(api.requests[0].data).variables;
    assert.deepStrictEqual(input.studios, {
      value: ['studio'],
      modifier: 'INCLUDES',
    });
    assert.strictEqual(input.performers, undefined);
    assert.strictEqual(input.sort, 'DATE');
  });
});
