import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';

import type { WhisparrItem } from '@server/api/servarr/whisparr';
import WhisparrAPI from '@server/api/servarr/whisparr';
import { MediaStatus, MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
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
    await getRepository(Media).save(
      new Media({
        mediaType: MediaType.MOVIE,
        tmdbId: 555,
        serviceId: 0,
        externalServiceId: 99,
        status: MediaStatus.PROCESSING,
      })
    );
    mock.method(WhisparrAPI.prototype, 'getMonitoredItems', async () => [
      item({ id: 10, itemType: 'movie', stashId: null, tmdbId: 555 }),
    ]);

    await whisparrScanner.run();

    const movie = await Media.getMedia(555, MediaType.MOVIE);
    assert.strictEqual(movie?.isAdult, false);
    assert.strictEqual(movie?.externalServiceId, 99);
  });
});
