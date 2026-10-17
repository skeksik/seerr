import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';

import StashDbAPI from '@server/api/stashdb';
import type { StashDbStudio } from '@server/api/stashdb/interfaces';
import TpdbAPI from '@server/api/tpdb';
import type { TpdbSiteSummary } from '@server/api/tpdb/interfaces';
import { tpdbFilterIds, tpdbSiteFor } from '@server/lib/adultLinks';
import cacheManager from '@server/lib/cache';
import { getSettings } from '@server/lib/settings';

const blacked = {
  id: 200,
  uuid: 'b1',
  short_name: 'blacked',
  name: 'Blacked',
} as TpdbSiteSummary;

const studio = (id: string, name: string): StashDbStudio => ({
  id,
  name,
  aliases: [],
  images: [],
  urls: [
    { url: 'https://theporndb.net/sites/blacked', site: { name: 'ThePornDB' } },
  ],
});

beforeEach(() => {
  const settings = getSettings();
  settings.tpdb = { url: 'https://api.theporndb.net', apiKey: 'key' };
  settings.stashdb = { endpoint: 'https://stashdb.org/graphql', apiKey: 'key' };
  for (const name of ['stashdb', 'tpdb'] as const) {
    cacheManager.getCache(name).flush();
  }
  mock.method(TpdbAPI.prototype, 'getSite', async () => blacked);
  mock.method(
    StashDbAPI.prototype,
    'findIdsByUrls',
    async (_type: string, urls: string[]) =>
      urls.map((url) =>
        url === 'https://theporndb.net/sites/blacked' ? 'blacked' : undefined
      )
  );
});

afterEach(() => {
  const settings = getSettings();
  settings.tpdb = { url: 'https://api.theporndb.net', apiKey: '' };
  settings.stashdb = { endpoint: 'https://stashdb.org/graphql', apiKey: '' };
  mock.restoreAll();
});

describe('tpdbSiteFor', () => {
  it('gives a site to the studio it belongs to', async () => {
    assert.strictEqual(
      (await tpdbSiteFor(studio('blacked', 'Blacked')))?.id,
      200
    );
  });

  it('leaves it out for other studios linking it too', async () => {
    assert.strictEqual(
      await tpdbSiteFor(studio('adult-time-blacked', 'Adult Time x Blacked')),
      null
    );
  });
});

describe('tpdbFilterIds', () => {
  const DRAGON = 'aaa97940-4c08-410d-bebb-641e2a145be6';

  beforeEach(() => {
    mock.method(StashDbAPI.prototype, 'getStudio', async (id: string) =>
      id === 'blacked' ? studio(id, 'Blacked') : null
    );
    mock.method(StashDbAPI.prototype, 'getPerformer', async (id: string) =>
      id === DRAGON
        ? {
            id,
            name: 'Little Dragon',
            aliases: [],
            scene_count: 0,
            images: [],
            urls: [
              {
                url: 'https://theporndb.net/performers/little-dragon',
                site: { name: 'ThePornDB' },
              },
            ],
          }
        : null
    );
    mock.method(TpdbAPI.prototype, 'getPerformer', async () => ({
      id: 'da50f9cc',
      _id: 114293,
      name: 'Little Dragon',
    }));
  });

  it('translates StashDB ids and passes ThePornDB ones, keeping the rest', async () => {
    assert.deepStrictEqual(
      await tpdbFilterIds({
        studio: 'blacked',
        excludeStudios: [1, 'blacked'],
        performer: [DRAGON, 7],
        excludePerformers: [DRAGON],
        year: 2020,
      }),
      {
        studio: 200,
        excludeStudios: [1, 200],
        performer: [114293, 7],
        excludePerformers: [114293],
        year: 2020,
      }
    );
  });

  it('leaves nothing for a pick without a ThePornDB counterpart', async () => {
    assert.strictEqual(await tpdbFilterIds({ studio: 'unknown' }), null);
    assert.strictEqual(
      await tpdbFilterIds({ performer: [DRAGON, 'unknown'] }),
      null
    );
  });

  it('drops exclusions without one', async () => {
    assert.deepStrictEqual(
      await tpdbFilterIds({
        excludeStudios: ['unknown', 3],
        excludePerformers: ['unknown'],
      }),
      {
        studio: undefined,
        excludeStudios: [3],
        performer: undefined,
        excludePerformers: [],
      }
    );
  });

  it('leaves StashDB alone for ThePornDB ids', async () => {
    getSettings().stashdb = { endpoint: '', apiKey: '' };

    assert.deepStrictEqual(
      await tpdbFilterIds({
        studio: 4,
        performer: [5],
        excludePerformers: [6],
      }),
      {
        studio: 4,
        excludeStudios: undefined,
        performer: [5],
        excludePerformers: [6],
      }
    );
  });
});
