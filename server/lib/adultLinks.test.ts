import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';

import StashDbAPI from '@server/api/stashdb';
import type { StashDbStudio } from '@server/api/stashdb/interfaces';
import TpdbAPI from '@server/api/tpdb';
import type { TpdbSiteSummary } from '@server/api/tpdb/interfaces';
import { tpdbSiteFor } from '@server/lib/adultLinks';
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
