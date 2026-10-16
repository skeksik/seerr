import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';

import type { AxiosInstance } from 'axios';

import type {
  WhisparrCredit,
  WhisparrItem,
} from '@server/api/servarr/whisparr';
import WhisparrAPI from '@server/api/servarr/whisparr';
import cacheManager from '@server/lib/cache';

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
  afterEach(() => {
    mock.restoreAll();
    cacheManager.getCache('whisparr').flush();
  });

  const monitorOptions = {
    qualityProfileId: 4,
    rootFolderPath: '/data/xxx',
    tags: [2],
    searchOnAdd: false,
  };

  const credit = (overrides: Partial<WhisparrCredit> = {}): WhisparrCredit => ({
    id: 7,
    foreignId: STASH_ID,
    monitored: false,
    moviesMonitored: false,
    tmdbId: 0,
    tpdbId: null,
    qualityProfileId: 1,
    rootFolderPath: '/data/old',
    searchOnAdd: false,
    tags: [],
    ...overrides,
  });

  const notFound = () =>
    Object.assign(new Error('Not Found'), { response: { status: 404 } });

  // Answers GETs by path: the credit (null for 404), Whisparr's host config
  // and its command list, one entry per poll
  const mockGets = (
    whisparr: WhisparrAPI,
    {
      credits = [],
      source = 'tpdb',
      commands = [[]],
    }: {
      credits?: (WhisparrCredit | null)[];
      source?: string | Error;
      commands?: unknown[][];
    }
  ) =>
    mock.method(getAxios(whisparr), 'get', async (url: string) => {
      if (url === '/config/host') {
        if (source instanceof Error) {
          throw source;
        }
        return { data: { whisparrMovieMetadataSource: source } };
      }
      if (url === '/command') {
        return { data: commands.length > 1 ? commands.shift() : commands[0] };
      }
      const found = credits.length > 1 ? credits.shift() : credits[0];
      if (!found) {
        throw notFound();
      }
      return { data: found };
    });

  it('adds performers Whisparr does not follow yet and monitors their movies', async () => {
    const whisparr = buildWhisparr();
    const added = credit({
      id: 3,
      monitored: true,
      tpdbId: '5679313f-78ed-428d-9438-ed0fcbd2c4b9',
      qualityProfileId: 4,
      rootFolderPath: '/data/xxx',
      tags: [2],
    });
    mockGets(whisparr, {
      credits: [null, added],
      commands: [
        [
          {
            name: 'RefreshPerformers',
            status: 'completed',
            body: { performerIds: [3] },
          },
        ],
      ],
    });
    const post = mock.method(getAxios(whisparr), 'post', async () => ({
      data: added,
    }));
    const put = mock.method(getAxios(whisparr), 'put', async () => ({
      data: { ...added, moviesMonitored: true },
    }));

    const result = await whisparr.setCreditMonitored(
      'performer',
      STASH_ID,
      true,
      monitorOptions
    );

    assert.strictEqual(result?.id, 3);
    assert.strictEqual(result?.moviesMonitored, true);
    assert.deepStrictEqual(post.mock.calls[0].arguments, [
      '/performer',
      {
        foreignId: STASH_ID,
        monitored: true,
        moviesMonitored: false,
        ...monitorOptions,
      },
    ]);
    assert.deepStrictEqual(put.mock.calls[0].arguments, [
      '/performer/3',
      { ...added, moviesMonitored: true },
    ]);
    assert.deepStrictEqual(post.mock.calls[1].arguments, [
      '/command',
      { name: 'RefreshPerformers', performerIds: [3] },
    ]);
  });

  it('waits for the refresh the add queued before monitoring movies', async () => {
    const whisparr = buildWhisparr();
    (
      whisparr as unknown as { refreshWait: { interval: number } }
    ).refreshWait.interval = 0;
    const added = credit({ id: 3, monitored: true, tpdbId: 'tpdb' });
    const running = (status: string) => [
      { name: 'RefreshStudios', status, body: { studioIds: [3] } },
    ];
    const get = mockGets(whisparr, {
      credits: [null, added],
      commands: [running('queued'), running('started'), running('completed')],
    });
    mock.method(getAxios(whisparr), 'post', async () => ({ data: added }));
    const put = mock.method(getAxios(whisparr), 'put', async () => ({
      data: { ...added, moviesMonitored: true },
    }));

    await whisparr.setCreditMonitored('studio', STASH_ID, true, monitorOptions);

    const polls = get.mock.calls.filter(
      (call) => call.arguments[0] === '/command'
    );
    assert.strictEqual(polls.length, 3);
    assert.strictEqual(put.mock.callCount(), 1);
  });

  it('adds performers without a link to the metadata source for scenes only', async () => {
    const whisparr = buildWhisparr();
    const added = credit({ id: 3, monitored: true, tmdbId: 1234 });
    mockGets(whisparr, { credits: [null] });
    const post = mock.method(getAxios(whisparr), 'post', async () => ({
      data: added,
    }));
    const put = mock.method(getAxios(whisparr), 'put', async () => ({}));

    const result = await whisparr.setCreditMonitored(
      'performer',
      STASH_ID,
      true,
      monitorOptions
    );

    assert.strictEqual(result?.moviesMonitored, false);
    assert.strictEqual(post.mock.callCount(), 1);
    assert.strictEqual(put.mock.callCount(), 0);
  });

  it('updates followed studios with their movies and refreshes them', async () => {
    const whisparr = buildWhisparr();
    const existing = credit({ tmdbId: 97187 });
    mockGets(whisparr, { credits: [existing], source: 'tmdb' });
    const put = mock.method(getAxios(whisparr), 'put', async () => ({
      data: { ...existing, monitored: true, moviesMonitored: true },
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
      moviesMonitored: true,
      searchOnAdd: true,
    });
    assert.deepStrictEqual(post.mock.calls[0].arguments, [
      '/command',
      { name: 'RefreshStudios', studioIds: [7] },
    ]);
  });

  it('monitors scenes only when the movie metadata source is unknown', async () => {
    const whisparr = buildWhisparr();
    const existing = credit({ tpdbId: 'tpdb', tmdbId: 97187 });
    mockGets(whisparr, { credits: [existing], source: new Error('down') });
    const put = mock.method(getAxios(whisparr), 'put', async () => ({
      data: { ...existing, monitored: true },
    }));
    mock.method(getAxios(whisparr), 'post', async () => ({ data: {} }));

    await whisparr.setCreditMonitored('studio', STASH_ID, true, monitorOptions);

    const body = put.mock.calls[0].arguments[1] as WhisparrCredit;
    assert.strictEqual(body.monitored, true);
    assert.strictEqual(body.moviesMonitored, false);
  });

  it('unmonitors scenes and movies without a refresh', async () => {
    const whisparr = buildWhisparr();
    const existing = credit({
      monitored: true,
      moviesMonitored: true,
      tpdbId: 'tpdb',
    });
    const get = mockGets(whisparr, { credits: [existing] });
    const put = mock.method(getAxios(whisparr), 'put', async () => ({
      data: { ...existing, monitored: false, moviesMonitored: false },
    }));
    const post = mock.method(getAxios(whisparr), 'post', async () => ({
      data: {},
    }));

    const result = await whisparr.setCreditMonitored(
      'performer',
      STASH_ID,
      false,
      monitorOptions
    );

    assert.strictEqual(result?.moviesMonitored, false);
    assert.deepStrictEqual(put.mock.calls[0].arguments[1], {
      ...existing,
      monitored: false,
      moviesMonitored: false,
    });
    assert.strictEqual(post.mock.callCount(), 0);
    assert.ok(
      !get.mock.calls.some((call) => call.arguments[0] === '/config/host')
    );
  });

  it('does nothing when unmonitoring something Whisparr does not follow', async () => {
    const whisparr = buildWhisparr();
    mockGets(whisparr, { credits: [null] });
    const post = mock.method(getAxios(whisparr), 'post', async () => ({
      data: {},
    }));

    const result = await whisparr.setCreditMonitored(
      'performer',
      STASH_ID,
      false,
      monitorOptions
    );

    assert.strictEqual(result, null);
    assert.strictEqual(post.mock.callCount(), 0);
  });
});

describe('WhisparrAPI canMonitorMovies', () => {
  it('needs the link to the movie metadata source', () => {
    const links = { tmdbId: 12, tpdbId: null };

    assert.strictEqual(WhisparrAPI.canMonitorMovies(links, 'tmdb'), true);
    assert.strictEqual(WhisparrAPI.canMonitorMovies(links, 'tpdb'), false);
    assert.strictEqual(
      WhisparrAPI.canMonitorMovies({ tmdbId: 0, tpdbId: 'a' }, 'tpdb'),
      true
    );
    assert.strictEqual(
      WhisparrAPI.canMonitorMovies({ tmdbId: 12, tpdbId: 'a' }, 'none'),
      false
    );
  });
});
