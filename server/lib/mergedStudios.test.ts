import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type StashDbAPI from '@server/api/stashdb';
import type TpdbAPI from '@server/api/tpdb';
import { MergedStudioList, mergedStudioList } from '@server/lib/mergedStudios';

const stashDb = (names: string[], networks: string[] = []) =>
  ({
    queryStudios: async ({ page = 1 }: { page?: number }) => ({
      count: names.length,
      studios: names.slice((page - 1) * 100, page * 100).map((name) => ({
        id: `s-${name}`,
        name,
        images: [],
        child_studios: networks.includes(name) ? [{ id: 'child' }] : [],
      })),
    }),
  }) as unknown as StashDbAPI;

const tpdb = (names: string[]) =>
  ({
    listSites: async (page: number) => ({
      data: names
        .slice((page - 1) * 100, page * 100)
        .map((name, i) => ({ id: page * 1000 + i, uuid: '', name })),
      meta: {
        current_page: page,
        last_page: Math.max(1, Math.ceil(names.length / 100)),
        per_page: 100,
        total: names.length,
      },
    }),
  }) as unknown as TpdbAPI;

describe('MergedStudioList', () => {
  it('adds ThePornDB sites StashDB has no studio for, by name', async () => {
    const list = new MergedStudioList(
      stashDb(
        ['Blacked', 'Bratty Sis', 'Vixen Media Group'],
        ['Vixen Media Group']
      ),
      tpdb([
        'Adult Prime',
        'Blacked.com',
        'BrattySis',
        'Manyvids: Someone',
        'Tushy',
        'Vixen Media Group',
      ])
    );

    const names = (await list.page(1, 40)).map(
      ({ name, source }) => `${name}${source ? ` (${source})` : ''}`
    );

    assert.deepStrictEqual(names, [
      'Adult Prime (tpdb)',
      'Blacked',
      'Bratty Sis',
      'Tushy (tpdb)',
    ]);
    assert.strictEqual(list.total, 4);
  });

  it('leaves out ThePornDB sites a StashDB studio links to', async () => {
    const api = stashDb(['Blacked']) as unknown as {
      findIdsByUrls: (type: string, urls: string[]) => Promise<unknown[]>;
    };
    api.findIdsByUrls = async (_type, urls) =>
      urls.map((url) =>
        url === 'https://theporndb.net/sites/1001' ? 's-Blacked' : undefined
      );
    const list = new MergedStudioList(
      api as unknown as StashDbAPI,
      tpdb(['Adult Prime', 'Blacked Raw', 'Tushy'])
    );

    const names = (await list.page(1, 40)).map(({ name }) => name);

    assert.deepStrictEqual(names, ['Adult Prime', 'Blacked', 'Tushy']);
  });

  it('reads on from where the last page stopped', async () => {
    const list = new MergedStudioList(
      stashDb(Array.from({ length: 150 }, (_, i) => `S${1000 + i}`)),
      tpdb(Array.from({ length: 150 }, (_, i) => `T${1000 + i}`))
    );

    const [first, second] = await Promise.all([
      list.page(1, 100),
      list.page(2, 100),
    ]);

    assert.strictEqual(first[0].name, 'S1000');
    assert.strictEqual(second[0].name, 'S1100');
    assert.strictEqual(second[50].name, 'T1000');
    assert.strictEqual((await list.page(3, 100))[0].name, 'T1050');
    assert.strictEqual((await list.page(4, 100)).length, 0);
    assert.strictEqual(list.total, 300);
  });

  it('keeps a list for the same clients only', () => {
    const stashDbApi = stashDb([]);
    const tpdbApi = tpdb([]);
    const list = mergedStudioList(stashDbApi, tpdbApi, 'Kept');

    assert.strictEqual(mergedStudioList(stashDbApi, tpdbApi, 'kept'), list);
    assert.notStrictEqual(mergedStudioList(stashDb([]), tpdbApi, 'kept'), list);
  });
});
