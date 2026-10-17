import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';

import ExternalAPI from '@server/api/externalapi';
import TpdbAPI, {
  TpdbNotConfiguredError,
  stashDbPerformerId,
} from '@server/api/tpdb';
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
    getSettings().tpdb = { url: 'https://api.theporndb.net', apiKey: '' };
    mock.restoreAll();
  });

  it('needs an API key', () => {
    assert.strictEqual(TpdbAPI.isConfigured(), false);
    assert.throws(() => TpdbAPI.fromSettings(), TpdbNotConfiguredError);
  });

  it('maps movie filters to ThePornDB query parameters', async () => {
    const get = stubGet({ data: [], meta: { total: 0 } });

    await new TpdbAPI({ apiKey: 'key' }).getMovies({
      page: 2,
      siteId: 4611,
      performerIds: [82918, 1815349],
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
      site_operation: 'Site/Parent/Network',
      'performers[82918]': 82918,
      'performers[1815349]': 1815349,
      performer_and: 1,
      'tags[70]': 70,
      'tags[1139]': 1139,
      tag_and: 1,
      year: undefined,
      date: '2026-10-14',
      date_operation: '<=',
      duration: undefined,
      duration_operation: undefined,
    });
  });

  it('sorts searches by relevance', async () => {
    const get = stubGet({ data: [], meta: { total: 0 } });

    await new TpdbAPI({ apiKey: 'key' }).getMovies({ query: 'anal teachings' });

    assert.strictEqual(
      get.mock.calls[0].arguments[1]?.params?.orderBy,
      'most_relevant'
    );
  });

  it('reads StashDB links to the configured instance only', () => {
    const extras = {
      links: {
        StashDB:
          'https://stashdb.org/performers/BCB98A6E-08F3-48A9-90D5-F223901A56A5/',
      },
    };

    assert.strictEqual(
      stashDbPerformerId(extras, 'stashdb.org'),
      'bcb98a6e-08f3-48a9-90d5-f223901a56a5'
    );
    assert.strictEqual(stashDbPerformerId(extras, 'fansdb.cc'), undefined);
    assert.strictEqual(
      stashDbPerformerId({ links: {} }, 'stashdb.org'),
      undefined
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

    assert.strictEqual(
      await new TpdbAPI({ apiKey: 'key' }).getMovie('missing'),
      null
    );
  });
});
