import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';

import type { AxiosInstance } from 'axios';

import type { WhisparrItem } from '@server/api/servarr/whisparr';
import WhisparrAPI from '@server/api/servarr/whisparr';

const STASH_ID = '01a138c1-a8cf-74b2-a8bb-e617e9c6f20f';

function buildWhisparr(): WhisparrAPI {
  return new WhisparrAPI({
    url: 'http://localhost:6969/api/v3',
    apiKey: 'test',
  });
}

function getAxios(whisparr: WhisparrAPI): AxiosInstance {
  return (whisparr as unknown as { axios: AxiosInstance }).axios;
}

function lookupResult(overrides: Partial<WhisparrItem> = {}): WhisparrItem {
  return {
    title: 'Scene',
    itemType: 'scene',
    foreignId: STASH_ID,
    stashId: STASH_ID,
    tmdbId: 0,
    titleSlug: STASH_ID,
    year: 2023,
    monitored: false,
    hasFile: false,
    isAvailable: true,
    qualityProfileId: 0,
    folder: 'scenes/Studio/Scene',
    tags: [],
    ...overrides,
  };
}

const options = {
  qualityProfileId: 4,
  rootFolderPath: '/data/xxx',
  tags: [2],
  searchNow: true,
};

describe('WhisparrAPI addItem', () => {
  afterEach(() => mock.restoreAll());

  it('adds a new scene monitored with only the scene monitored', async () => {
    const whisparr = buildWhisparr();
    const post = mock.method(getAxios(whisparr), 'post', async () => ({
      data: { ...lookupResult(), id: 12, monitored: true },
    }));

    const added = await whisparr.addItem(lookupResult(), options);

    assert.strictEqual(added.id, 12);
    assert.strictEqual(post.mock.callCount(), 1);
    const [url, body] = post.mock.calls[0].arguments as [string, WhisparrItem];
    assert.strictEqual(url, '/movie');
    assert.deepStrictEqual(
      { ...body },
      {
        ...lookupResult(),
        qualityProfileId: 4,
        rootFolderPath: '/data/xxx',
        tags: [2],
        monitored: true,
        addOptions: {
          searchForMovie: true,
          monitor: 'movieOnly',
          addMethod: 'manual',
        },
      }
    );
  });

  it('monitors an existing unmonitored scene instead of adding it', async () => {
    const whisparr = buildWhisparr();
    const put = mock.method(getAxios(whisparr), 'put', async () => ({
      data: { ...lookupResult({ id: 9, tags: [1, 2] }), monitored: true },
    }));
    const post = mock.method(getAxios(whisparr), 'post', async () => ({
      data: {},
    }));

    await whisparr.addItem(lookupResult({ id: 9, tags: [1] }), options);

    assert.strictEqual(put.mock.callCount(), 1);
    const body = put.mock.calls[0].arguments[1] as WhisparrItem;
    assert.strictEqual(body.monitored, true);
    assert.deepStrictEqual(body.tags, [1, 2]);
    // MoviesSearch goes through the command endpoint
    assert.strictEqual(post.mock.callCount(), 1);
    assert.strictEqual(post.mock.calls[0].arguments[0], '/command');
  });

  it('leaves items that already have a file alone', async () => {
    const whisparr = buildWhisparr();
    const put = mock.method(getAxios(whisparr), 'put', async () => ({}));
    const post = mock.method(getAxios(whisparr), 'post', async () => ({}));

    await whisparr.addItem(
      lookupResult({ id: 9, monitored: true, hasFile: true }),
      options
    );

    assert.strictEqual(put.mock.callCount(), 0);
    assert.strictEqual(post.mock.callCount(), 0);
  });
});

describe('WhisparrAPI getMonitoredItems', () => {
  afterEach(() => mock.restoreAll());

  it('pages through monitored items only', async () => {
    const whisparr = buildWhisparr();
    const pages = [
      Array.from({ length: 1000 }, (_v, i) => lookupResult({ id: i })),
      [lookupResult({ id: 1000 })],
    ];
    const post = mock.method(getAxios(whisparr), 'post', async () => ({
      data: { totalRecords: 1001, records: pages.shift() },
    }));

    const items = await whisparr.getMonitoredItems();

    assert.strictEqual(items.length, 1001);
    assert.strictEqual(post.mock.callCount(), 2);
    assert.deepStrictEqual(post.mock.calls[1].arguments[1], {
      page: 2,
      pageSize: 1000,
      filters: [{ key: 'monitored', value: true }],
    });
  });
});

describe('WhisparrAPI lookupScene', () => {
  afterEach(() => mock.restoreAll());

  it('looks scenes up by stash id', async () => {
    const whisparr = buildWhisparr();
    const get = mock.method(getAxios(whisparr), 'get', async () => ({
      data: [lookupResult()],
    }));

    await whisparr.lookupScene(STASH_ID);

    assert.deepStrictEqual(get.mock.calls[0].arguments[1], {
      params: { term: `stash:${STASH_ID}`, itemType: 'scene' },
    });
  });

  it('throws when the lookup finds nothing', async () => {
    const whisparr = buildWhisparr();
    mock.method(getAxios(whisparr), 'get', async () => ({ data: [] }));

    await assert.rejects(() => whisparr.lookupScene(STASH_ID), /not found/);
  });
});

describe('WhisparrAPI setCreditMonitored', () => {
  afterEach(() => mock.restoreAll());

  const monitorOptions = {
    qualityProfileId: 4,
    rootFolderPath: '/data/xxx',
    tags: [2],
    searchOnAdd: false,
  };

  it('adds performers Whisparr does not follow yet', async () => {
    const whisparr = buildWhisparr();
    mock.method(getAxios(whisparr), 'get', async () => {
      throw Object.assign(new Error('Not Found'), {
        response: { status: 404 },
      });
    });
    const post = mock.method(getAxios(whisparr), 'post', async () => ({
      data: { id: 3, foreignId: STASH_ID, monitored: true },
    }));

    const credit = await whisparr.setCreditMonitored(
      'performer',
      STASH_ID,
      true,
      monitorOptions
    );

    assert.strictEqual(credit?.id, 3);
    assert.strictEqual(post.mock.calls[0].arguments[0], '/performer');
    assert.deepStrictEqual(post.mock.calls[0].arguments[1], {
      foreignId: STASH_ID,
      monitored: true,
      ...monitorOptions,
    });
  });

  it('updates followed studios and refreshes them', async () => {
    const whisparr = buildWhisparr();
    const existing = {
      id: 7,
      foreignId: STASH_ID,
      monitored: false,
      qualityProfileId: 1,
      rootFolderPath: '/data/old',
      searchOnAdd: false,
      tags: [],
    };
    mock.method(getAxios(whisparr), 'get', async () => ({ data: existing }));
    const put = mock.method(getAxios(whisparr), 'put', async () => ({
      data: { ...existing, monitored: true },
    }));
    const post = mock.method(getAxios(whisparr), 'post', async () => ({
      data: {},
    }));

    await whisparr.setCreditMonitored('studio', STASH_ID, true, {
      ...monitorOptions,
      searchOnAdd: true,
    });

    assert.strictEqual(put.mock.calls[0].arguments[0], '/studio/7');
    assert.deepStrictEqual(put.mock.calls[0].arguments[1], {
      ...existing,
      monitored: true,
      searchOnAdd: true,
    });
    assert.deepStrictEqual(post.mock.calls[0].arguments, [
      '/command',
      { name: 'RefreshStudios', studioIds: [7] },
    ]);
  });

  it('does nothing when unmonitoring something Whisparr does not follow', async () => {
    const whisparr = buildWhisparr();
    mock.method(getAxios(whisparr), 'get', async () => {
      throw Object.assign(new Error('Not Found'), {
        response: { status: 404 },
      });
    });
    const post = mock.method(getAxios(whisparr), 'post', async () => ({
      data: {},
    }));

    const credit = await whisparr.setCreditMonitored(
      'performer',
      STASH_ID,
      false,
      monitorOptions
    );

    assert.strictEqual(credit, null);
    assert.strictEqual(post.mock.callCount(), 0);
  });
});
