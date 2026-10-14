import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';

import ExternalAPI from '@server/api/externalapi';
import TpdbAPI, { TpdbNotConfiguredError } from '@server/api/tpdb';
import { getSettings } from '@server/lib/settings';

type Get = (
  endpoint: string,
  config?: { params?: Record<string, unknown> }
) => Promise<unknown>;

const stubGet = (response: unknown) =>
  mock.method(
    ExternalAPI.prototype as unknown as { get: Get },
    'get',
    async () => response
  );

describe('TpdbAPI', () => {
  afterEach(() => {
    getSettings().tpdb = { apiKey: '' };
    mock.restoreAll();
  });

  it('needs an API key', () => {
    assert.strictEqual(TpdbAPI.isConfigured(), false);
    assert.throws(() => TpdbAPI.fromSettings(), TpdbNotConfiguredError);
  });

  it('maps movie filters to ThePornDB query parameters', async () => {
    const get = stubGet({ data: [], meta: { total: 0 } });

    await new TpdbAPI('key').getMovies({
      page: 2,
      siteId: 4611,
      performerId: 82918,
      tagIds: [70, 1139],
      date: { value: '2026-10-14', operation: '<=' },
    });

    const [endpoint, config] = get.mock.calls[0].arguments;
    assert.strictEqual(endpoint, '/movies');
    assert.deepStrictEqual(config?.params, {
      page: 2,
      per_page: 20,
      q: undefined,
      orderBy: 'recently_released',
      site_id: 4611,
      performer_id: 82918,
      'tags[70]': 70,
      'tags[1139]': 1139,
      year: undefined,
      date: '2026-10-14',
      date_operation: '<=',
    });
  });

  it('sorts searches by relevance', async () => {
    const get = stubGet({ data: [], meta: { total: 0 } });

    await new TpdbAPI('key').getMovies({ query: 'anal teachings' });

    assert.strictEqual(
      get.mock.calls[0].arguments[1]?.params?.orderBy,
      'most_relevant'
    );
  });

  it('returns null for unknown movies', async () => {
    mock.method(
      ExternalAPI.prototype as unknown as { get: Get },
      'get',
      async () => {
        throw Object.assign(new Error('Not Found'), {
          response: { status: 404 },
        });
      }
    );

    assert.strictEqual(await new TpdbAPI('key').getMovie('missing'), null);
  });
});
