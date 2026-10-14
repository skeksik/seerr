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
import { Watchlist } from '@server/entity/Watchlist';
import { whisparrScanner } from '@server/lib/scanners/whisparr';
import { XxxMovieSource, getSettings } from '@server/lib/settings';
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
  getSettings().xxxMovies = { source: XxxMovieSource.TPDB, tmdbCompanies: [] };
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

  it('tracks ThePornDB movies as XXX movies', async () => {
    await requested({
      mediaType: MediaType.XXX_MOVIE,
      tpdbId: TPDB_ID,
      isAdult: true,
    });
    mock.method(WhisparrAPI.prototype, 'getMonitoredItems', async () => [
      movieItem({ id: 11, tmdbId: 0 }),
    ]);

    await whisparrScanner.run();

    const movie = await Media.getMediaByTpdbId(TPDB_ID);
    assert.strictEqual(movie?.mediaType, MediaType.XXX_MOVIE);
    assert.strictEqual(movie?.isAdult, true);
    assert.strictEqual(movie?.status, MediaStatus.AVAILABLE);
    assert.strictEqual(movie?.externalServiceId, 11);
  });

  it('uses the TMDB id when TMDB is the XXX movie source', async () => {
    await requested({ mediaType: MediaType.MOVIE, tmdbId: 1786674 });
    getSettings().xxxMovies = {
      source: XxxMovieSource.TMDB,
      tmdbCompanies: [],
    };
    mock.method(WhisparrAPI.prototype, 'getMonitoredItems', async () => [
      movieItem({ id: 12, tmdbId: 1786674 }),
    ]);

    await whisparrScanner.run();

    assert.strictEqual(await Media.getMediaByTpdbId(TPDB_ID), undefined);
    const movie = await Media.getMedia(1786674, MediaType.MOVIE);
    assert.strictEqual(movie?.isAdult, true);
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

  it('skips titles nobody requested through Seerr', async () => {
    mock.method(WhisparrAPI.prototype, 'getMonitoredItems', async () => [
      item({ id: 14, hasFile: false }),
      movieItem({ id: 15, tmdbId: 0 }),
      item({ id: 16, itemType: 'movie', stashId: null, tmdbId: 777 }),
    ]);

    await whisparrScanner.run();

    assert.strictEqual(await getRepository(Media).count(), 0);
  });

  it('stops tracking titles earlier scans added without a request', async () => {
    const mediaRepository = getRepository(Media);
    // Added by an earlier scan: dropped
    await mediaRepository.save(
      new Media({
        mediaType: MediaType.XXX_MOVIE,
        tpdbId: TPDB_ID,
        tmdbId: null,
        isAdult: true,
        status: MediaStatus.PROCESSING,
        serviceId: 3,
        externalServiceId: 20,
      })
    );
    // In the Stash library: only the Whisparr link goes
    await mediaRepository.save(
      new Media({
        mediaType: MediaType.SCENE,
        stashId: SCENE_ID,
        tmdbId: null,
        stashMediaId: '12',
        status: MediaStatus.AVAILABLE,
        serviceId: 3,
        externalServiceId: 21,
      })
    );
    // On someone's watchlist: kept as is
    const watched = await mediaRepository.save(
      new Media({
        mediaType: MediaType.SCENE,
        stashId: '6f1b8f3e-2c4d-4b7a-9a51-2d1e5c7a9b10',
        tmdbId: null,
        status: MediaStatus.PROCESSING,
        serviceId: 3,
      })
    );
    await getRepository(Watchlist).save(
      new Watchlist({
        mediaType: MediaType.SCENE,
        externalId: watched.stashId,
        tmdbId: null,
        title: 'Watched',
        media: watched,
        requestedBy: await getRepository(User).findOneByOrFail({ id: 1 }),
      })
    );
    mock.method(WhisparrAPI.prototype, 'getMonitoredItems', async () => []);

    await whisparrScanner.run();

    assert.strictEqual(await Media.getMediaByTpdbId(TPDB_ID), undefined);
    const inStash = await Media.getMediaByStashId(SCENE_ID);
    assert.strictEqual(inStash?.status, MediaStatus.AVAILABLE);
    assert.strictEqual(inStash?.serviceId, null);
    assert.strictEqual(
      (await Media.getMediaByStashId(watched.stashId as string))?.serviceId,
      3
    );
  });
});
