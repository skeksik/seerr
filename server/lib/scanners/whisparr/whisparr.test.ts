import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';

import type { WhisparrItem } from '@server/api/servarr/whisparr';
import WhisparrAPI from '@server/api/servarr/whisparr';
import {
  MediaRequestStatus,
  MediaStatus,
  MediaType,
} from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import { MediaRequest } from '@server/entity/MediaRequest';
import { User } from '@server/entity/User';
import { whisparrScanner } from '@server/lib/scanners/whisparr';
import { getSettings } from '@server/lib/settings';
import { setupTestDb } from '@server/test/db';

const SCENE_ID = '01a0de25-5c7e-75b7-b319-ee76dd9a4879';

const item = (overrides: Partial<WhisparrItem>): WhisparrItem => ({
  id: 1,
  title: 'Item',
  itemType: 'scene',
  foreignId: SCENE_ID,
  stashId: SCENE_ID,
  tmdbId: 0,
  titleSlug: SCENE_ID,
  year: 2026,
  monitored: true,
  hasFile: true,
  isAvailable: true,
  qualityProfileId: 1,
  tags: [],
  ...overrides,
});

setupTestDb();

// A media row with a Seerr request, the only kind the scan tracks
const requested = async (init: Partial<Media>): Promise<Media> => {
  const media = await getRepository(Media).save(
    new Media({ tmdbId: null, status: MediaStatus.PENDING, ...init })
  );
  await getRepository(MediaRequest).save(
    new MediaRequest({
      type: init.mediaType,
      // Any request counts; a declined one never goes to Whisparr
      status: MediaRequestStatus.DECLINED,
      media,
      requestedBy: await getRepository(User).findOneByOrFail({ id: 1 }),
      is4k: false,
    })
  );
  return media;
};

beforeEach(() => {
  getSettings().whisparr = [
    {
      id: 3,
      name: 'Whisparr',
      hostname: 'whisparr.test',
      port: 6969,
      apiKey: 'key',
      useSsl: false,
      activeProfileId: 1,
      activeProfileName: 'Any',
      activeDirectory: '/data',
      tags: [],
      is4k: false,
      isDefault: true,
      syncEnabled: true,
      preventSearch: false,
      tagRequests: false,
      overrideRule: [],
    },
  ];
});

afterEach(() => {
  getSettings().whisparr = [];
  mock.restoreAll();
});

describe('WhisparrScanner', () => {
  it('marks scenes with files available and links them to Whisparr', async () => {
    const OTHER_ID = '6f1b8f3e-2c4d-4b7a-9a51-2d1e5c7a9b10';
    await requested({ mediaType: MediaType.SCENE, stashId: SCENE_ID });
    await requested({ mediaType: MediaType.SCENE, stashId: OTHER_ID });
    mock.method(WhisparrAPI.prototype, 'getMonitoredItems', async () => [
      item({ id: 26592 }),
      item({
        id: 7,
        foreignId: 'b',
        stashId: '6f1b8f3e-2c4d-4b7a-9a51-2d1e5c7a9b10',
        hasFile: false,
      }),
    ]);

    await whisparrScanner.run();

    const available = await Media.getMediaByStashId(SCENE_ID);
    assert.strictEqual(available?.status, MediaStatus.AVAILABLE);
    assert.strictEqual(available?.serviceId, 3);
    assert.strictEqual(available?.externalServiceId, 26592);
    const processing = await Media.getMediaByStashId(
      '6f1b8f3e-2c4d-4b7a-9a51-2d1e5c7a9b10'
    );
    assert.strictEqual(processing?.status, MediaStatus.PROCESSING);
  });

  it('flags TMDB movies from Whisparr as adult and skips TPDB-only ones', async () => {
    await requested({ mediaType: MediaType.MOVIE, tmdbId: 1288332 });
    mock.method(WhisparrAPI.prototype, 'getMonitoredItems', async () => [
      item({ id: 8, itemType: 'movie', stashId: null, tmdbId: 1288332 }),
      item({ id: 9, itemType: 'movie', stashId: null, tmdbId: 0 }),
    ]);

    await whisparrScanner.run();

    const movies = await getRepository(Media).find({
      where: { mediaType: MediaType.MOVIE },
    });
    assert.strictEqual(movies.length, 1);
    assert.strictEqual(movies[0].tmdbId, 1288332);
    assert.strictEqual(movies[0].isAdult, true);
    assert.strictEqual(movies[0].status, MediaStatus.AVAILABLE);
  });

  it('leaves movies that Radarr manages alone', async () => {
    await requested({
      mediaType: MediaType.MOVIE,
      tmdbId: 555,
      serviceId: 0,
      externalServiceId: 99,
      status: MediaStatus.PROCESSING,
    });
    mock.method(WhisparrAPI.prototype, 'getMonitoredItems', async () => [
      item({ id: 10, itemType: 'movie', stashId: null, tmdbId: 555 }),
    ]);

    await whisparrScanner.run();

    const movie = await Media.getMedia(555, MediaType.MOVIE);
    assert.strictEqual(movie?.isAdult, false);
    assert.strictEqual(movie?.externalServiceId, 99);
  });

  const TPDB_ID = '02b1383e-b871-4fd6-a731-2119a3aa93a7';
  const movieItem = (overrides: Partial<WhisparrItem>) =>
    item({ itemType: 'movie', stashId: null, tpdbId: TPDB_ID, ...overrides });

  it('tracks ThePornDB movies as adult movies', async () => {
    await requested({
      mediaType: MediaType.ADULT_MOVIE,
      tpdbId: TPDB_ID,
      isAdult: true,
    });
    mock.method(WhisparrAPI.prototype, 'getMonitoredItems', async () => [
      movieItem({ id: 11, tmdbId: 0 }),
    ]);

    await whisparrScanner.run();

    const movie = await Media.getMediaByTpdbId(TPDB_ID);
    assert.strictEqual(movie?.mediaType, MediaType.ADULT_MOVIE);
    assert.strictEqual(movie?.isAdult, true);
    assert.strictEqual(movie?.status, MediaStatus.AVAILABLE);
    assert.strictEqual(movie?.externalServiceId, 11);
  });

  it('keeps movies already tracked as adult TMDB movies', async () => {
    await requested({
      mediaType: MediaType.MOVIE,
      tmdbId: 1786674,
      isAdult: true,
      status: MediaStatus.PROCESSING,
    });
    mock.method(WhisparrAPI.prototype, 'getMonitoredItems', async () => [
      movieItem({ id: 13, tmdbId: 1786674 }),
    ]);

    await whisparrScanner.run();

    assert.strictEqual(await Media.getMediaByTpdbId(TPDB_ID), undefined);
    const movie = await Media.getMedia(1786674, MediaType.MOVIE);
    assert.strictEqual(movie?.status, MediaStatus.AVAILABLE);
  });

  it('links titles nobody requested without marking them requested', async () => {
    const OTHER_ID = '6f1b8f3e-2c4d-4b7a-9a51-2d1e5c7a9b10';
    // An earlier scan marked this one processing
    await getRepository(Media).save(
      new Media({
        mediaType: MediaType.SCENE,
        stashId: OTHER_ID,
        tmdbId: null,
        status: MediaStatus.PROCESSING,
      })
    );
    mock.method(WhisparrAPI.prototype, 'getMonitoredItems', async () => [
      item({ id: 14, hasFile: false }),
      item({ id: 15, foreignId: OTHER_ID, stashId: OTHER_ID, hasFile: false }),
      movieItem({ id: 16, tmdbId: 0 }),
      item({
        id: 17,
        itemType: 'movie',
        stashId: null,
        tmdbId: 777,
        hasFile: false,
      }),
    ]);

    await whisparrScanner.run();

    const monitored = await Media.getMediaByStashId(SCENE_ID);
    assert.strictEqual(monitored?.status, MediaStatus.UNKNOWN);
    assert.strictEqual(monitored?.externalServiceId, 14);
    const stale = await Media.getMediaByStashId(OTHER_ID);
    assert.strictEqual(stale?.status, MediaStatus.UNKNOWN);
    // Downloaded titles are available whoever asked for them
    assert.strictEqual(
      (await Media.getMediaByTpdbId(TPDB_ID))?.status,
      MediaStatus.AVAILABLE
    );
    // TMDB movies without a file only get a row once requested
    assert.strictEqual(await Media.getMedia(777, MediaType.MOVIE), undefined);
  });
});
