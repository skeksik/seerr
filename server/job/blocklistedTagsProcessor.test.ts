import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';

import StashDbAPI from '@server/api/stashdb';
import type {
  StashDbSceneSummary,
  StashDbTag,
} from '@server/api/stashdb/interfaces';
import TpdbAPI from '@server/api/tpdb';
import type { TpdbMovie } from '@server/api/tpdb/interfaces';
import { MediaStatus, MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import { Blocklist } from '@server/entity/Blocklist';
import Media from '@server/entity/Media';
import blocklistedTagsProcessor from '@server/job/blocklistedTagsProcessor';
import { withBlocklistedTagNames } from '@server/lib/adultBlocklistedTags';
import { getSettings } from '@server/lib/settings';
import { setupTestDb } from '@server/test/db';

const SCENE_A = '0b0b0b0b-0000-4000-8000-00000000000a';
const SCENE_B = '0b0b0b0b-0000-4000-8000-00000000000b';
const TAG = '7a7a7a7a-0000-4000-8000-000000000001';
const MOVIE = '0c0c0c0c-0000-4000-8000-000000000001';

const scene = (id: string, title: string) =>
  ({ id, title, images: [], performers: [] }) as StashDbSceneSummary;

const moviePage = (movies: { id: string; title: string }[]) => ({
  data: movies as TpdbMovie[],
  meta: { current_page: 1, last_page: 1, per_page: 20, total: movies.length },
});

const blocklistOf = (externalId: string, mediaType: MediaType) =>
  getRepository(Blocklist).findOne({ where: { externalId, mediaType } });

setupTestDb();

beforeEach(() => {
  const settings = getSettings();
  settings.main.enableAdult = true;
  settings.main.blocklistedTags = '';
  settings.main.blocklistedTagsLimit = 2;
  settings.main.blocklistedSceneTags = '';
  settings.main.blocklistedSceneTagNames = '';
  settings.main.blocklistedAdultMovieTags = '';
  settings.main.blocklistedAdultMovieTagNames = '';
  settings.stashdb = { endpoint: 'https://stashdb.test/graphql', apiKey: 'k' };
  settings.tpdb = { url: 'https://tpdb.test', apiKey: 'k' };
  mock.method(settings, 'save', async () => undefined);
});

afterEach(() => {
  const settings = getSettings();
  settings.main.enableAdult = false;
  settings.main.blocklistedTagsLimit = 50;
  mock.restoreAll();
});

describe('Process Blocklisted Tags for scenes and adult movies', () => {
  it('blocklists scenes with a StashDB tag, requested ones too', async () => {
    getSettings().main.blocklistedSceneTags = TAG;
    getSettings().main.blocklistedSceneTagNames = 'Some Tag';
    mock.method(
      StashDbAPI.prototype,
      'getTag',
      async () => ({ id: TAG, name: 'Some Tag' }) as StashDbTag
    );
    const queryScenes = mock.method(
      StashDbAPI.prototype,
      'queryScenes',
      async () => ({
        count: 2,
        scenes: [scene(SCENE_A, 'Scene A'), scene(SCENE_B, 'Scene B')],
      })
    );
    // Requested, and blocklisted by hand
    await getRepository(Media).save(
      new Media({
        mediaType: MediaType.SCENE,
        stashId: SCENE_A,
        tmdbId: null,
        status: MediaStatus.PROCESSING,
      })
    );
    await Blocklist.addAdultToBlocklist({
      mediaType: MediaType.SCENE,
      externalId: SCENE_B,
      title: 'Scene B',
    });

    await blocklistedTagsProcessor.run();

    // One page, so it is read once in the first sort
    assert.strictEqual(queryScenes.mock.callCount(), 1);
    const query = queryScenes.mock.calls[0].arguments[0];
    assert.deepStrictEqual(query?.tagIds, [TAG]);
    assert.strictEqual(query?.sort, 'DATE');

    const entry = await blocklistOf(SCENE_A, MediaType.SCENE);
    assert.strictEqual(entry?.blocklistedTags, `,${TAG},`);
    assert.strictEqual(entry?.title, 'Scene A');
    const media = await getRepository(Media).findOneOrFail({
      where: { stashId: SCENE_A, mediaType: MediaType.SCENE },
    });
    assert.strictEqual(media.status, MediaStatus.BLOCKLISTED);
    assert.strictEqual(media.status4k, MediaStatus.BLOCKLISTED);

    // Manual entries are left as they are
    const manual = await blocklistOf(SCENE_B, MediaType.SCENE);
    assert.ok(manual);
    assert.strictEqual(manual.blocklistedTags, null);

    assert.deepStrictEqual(
      withBlocklistedTagNames(entry as Blocklist).blocklistedTagNames,
      ['Some Tag']
    );
  });

  it('reads the limit of pages into each sort', async () => {
    getSettings().main.blocklistedSceneTags = TAG;
    mock.method(
      StashDbAPI.prototype,
      'getTag',
      async () => ({ id: TAG, name: 'Some Tag' }) as StashDbTag
    );
    const queryScenes = mock.method(
      StashDbAPI.prototype,
      'queryScenes',
      async () => ({ count: 1000, scenes: [] })
    );

    await blocklistedTagsProcessor.run();

    assert.deepStrictEqual(
      queryScenes.mock.calls.map((call) => [
        call.arguments[0]?.page,
        call.arguments[0]?.sort,
      ]),
      [
        [1, 'DATE'],
        [1, 'TRENDING'],
        [1, 'POPULARITY'],
        [1, 'CREATED_AT'],
        [2, 'DATE'],
        [2, 'TRENDING'],
        [2, 'POPULARITY'],
        [2, 'CREATED_AT'],
      ]
    );
  });

  it('drops StashDB tags that are gone, with their names', async () => {
    const settings = getSettings();
    settings.main.blocklistedSceneTags = `${TAG},gone`;
    settings.main.blocklistedSceneTagNames = 'Some Tag|Gone';
    mock.method(StashDbAPI.prototype, 'getTag', async (id: string) =>
      id === TAG ? ({ id: TAG, name: 'Some Tag' } as StashDbTag) : null
    );
    mock.method(StashDbAPI.prototype, 'queryScenes', async () => ({
      count: 0,
      scenes: [],
    }));

    await blocklistedTagsProcessor.run();

    assert.strictEqual(settings.main.blocklistedSceneTags, TAG);
    assert.strictEqual(settings.main.blocklistedSceneTagNames, 'Some Tag');
  });

  it('blocklists adult movies with ThePornDB tags, adding each tag', async () => {
    getSettings().main.blocklistedAdultMovieTags = '70,71';
    getSettings().main.blocklistedAdultMovieTagNames = 'Anal|Other';
    const getMovies = mock.method(TpdbAPI.prototype, 'getMovies', async () =>
      moviePage([{ id: MOVIE, title: 'A Movie' }])
    );

    await blocklistedTagsProcessor.run();

    assert.deepStrictEqual(
      getMovies.mock.calls.map((call) => [
        call.arguments[0]?.tagIds,
        call.arguments[0]?.sort,
      ]),
      [
        [[70], 'recently_released'],
        [[71], 'recently_released'],
      ]
    );
    const entry = await blocklistOf(MOVIE, MediaType.ADULT_MOVIE);
    assert.strictEqual(entry?.blocklistedTags, ',70,71,');
    assert.deepStrictEqual(
      withBlocklistedTagNames(entry as Blocklist).blocklistedTagNames,
      ['Anal', 'Other']
    );
    const media = await getRepository(Media).findOneOrFail({
      where: { tpdbId: MOVIE, mediaType: MediaType.ADULT_MOVIE },
    });
    assert.strictEqual(media.status, MediaStatus.BLOCKLISTED);
  });

  it('clears entries of tags no longer blocklisted, keeping manual ones', async () => {
    getSettings().main.blocklistedAdultMovieTags = '70';
    mock.method(TpdbAPI.prototype, 'getMovies', async () =>
      moviePage([{ id: MOVIE, title: 'A Movie' }])
    );
    await blocklistedTagsProcessor.run();
    await Blocklist.addAdultToBlocklist({
      mediaType: MediaType.SCENE,
      externalId: SCENE_B,
      title: 'Scene B',
    });
    assert.ok(await blocklistOf(MOVIE, MediaType.ADULT_MOVIE));

    getSettings().main.blocklistedAdultMovieTags = '';
    await blocklistedTagsProcessor.run();

    assert.strictEqual(await blocklistOf(MOVIE, MediaType.ADULT_MOVIE), null);
    assert.strictEqual(
      await getRepository(Media).findOne({
        where: { tpdbId: MOVIE, mediaType: MediaType.ADULT_MOVIE },
      }),
      null
    );
    assert.ok(await blocklistOf(SCENE_B, MediaType.SCENE));
  });

  it('leaves adult tags alone while adult content is off', async () => {
    getSettings().main.enableAdult = false;
    getSettings().main.blocklistedSceneTags = TAG;
    getSettings().main.blocklistedAdultMovieTags = '70';
    const queryScenes = mock.method(
      StashDbAPI.prototype,
      'queryScenes',
      async () => ({ count: 0, scenes: [] })
    );
    const getMovies = mock.method(TpdbAPI.prototype, 'getMovies', async () =>
      moviePage([])
    );

    await blocklistedTagsProcessor.run();

    assert.strictEqual(queryScenes.mock.callCount(), 0);
    assert.strictEqual(getMovies.mock.callCount(), 0);
  });
});
