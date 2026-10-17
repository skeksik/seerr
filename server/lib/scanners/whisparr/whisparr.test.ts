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
  const OTHER_ID = '6f1b8f3e-2c4d-4b7a-9a51-2d1e5c7a9b10';
  const TPDB_ID = '02b1383e-b871-4fd6-a731-2119a3aa93a7';
  const movieItem = (overrides: Partial<WhisparrItem>) =>
    item({ itemType: 'movie', stashId: null, tpdbId: TPDB_ID, ...overrides });

  const save = (init: Partial<Media>) =>
    getRepository(Media).save(new Media({ tmdbId: null, ...init }));

  it('tracks every monitored title like the Radarr scan, requested or not', async () => {
    mock.method(WhisparrAPI.prototype, 'getMonitoredItems', async () => [
      item({
        id: 26592,
        movieFile: {
          id: 1,
          size: 1,
          dateAdded: '2026-10-01T10:00:00Z',
        },
      }),
      item({ id: 7, foreignId: OTHER_ID, stashId: OTHER_ID, hasFile: false }),
    ]);

    await whisparrScanner.run();

    const available = await Media.getAdultMedia(MediaType.SCENE, SCENE_ID);
    assert.strictEqual(available?.status, MediaStatus.AVAILABLE);
    assert.strictEqual(available?.serviceId, 3);
    assert.strictEqual(available?.externalServiceId, 26592);
    // Dated for Recently Added by the Whisparr file
    assert.strictEqual(
      available?.mediaAddedAt?.toISOString(),
      '2026-10-01T10:00:00.000Z'
    );
    const processing = await Media.getAdultMedia(MediaType.SCENE, OTHER_ID);
    assert.strictEqual(processing?.status, MediaStatus.PROCESSING);
    assert.strictEqual(processing?.externalServiceId, 7);
    assert.strictEqual(await getRepository(MediaRequest).count(), 0);
  });

  it('keeps available and deleted titles as the Radarr scan does', async () => {
    await save({
      mediaType: MediaType.SCENE,
      stashId: SCENE_ID,
      status: MediaStatus.AVAILABLE,
    });
    await save({
      mediaType: MediaType.SCENE,
      stashId: OTHER_ID,
      status: MediaStatus.DELETED,
    });
    mock.method(WhisparrAPI.prototype, 'getMonitoredItems', async () => [
      item({ id: 14, hasFile: false }),
      item({ id: 15, foreignId: OTHER_ID, stashId: OTHER_ID, hasFile: false }),
    ]);

    await whisparrScanner.run();

    const available = await Media.getAdultMedia(MediaType.SCENE, SCENE_ID);
    assert.strictEqual(available?.status, MediaStatus.AVAILABLE);
    assert.strictEqual(available?.externalServiceId, 14);
    // Searched for again, but deleted until the file is back
    const deleted = await Media.getAdultMedia(MediaType.SCENE, OTHER_ID);
    assert.strictEqual(deleted?.status, MediaStatus.DELETED);
    assert.strictEqual(deleted?.externalServiceId, 15);
  });

  it('dates titles anew when their file comes back', async () => {
    await save({
      mediaType: MediaType.SCENE,
      stashId: SCENE_ID,
      status: MediaStatus.DELETED,
      mediaAddedAt: new Date('2025-01-01T00:00:00Z'),
    });
    mock.method(WhisparrAPI.prototype, 'getMonitoredItems', async () => [
      item({
        id: 14,
        movieFile: { id: 1, size: 1, dateAdded: '2026-10-01T10:00:00Z' },
      }),
    ]);

    await whisparrScanner.run();

    const media = await Media.getAdultMedia(MediaType.SCENE, SCENE_ID);
    assert.strictEqual(media?.status, MediaStatus.AVAILABLE);
    assert.strictEqual(
      media?.mediaAddedAt?.toISOString(),
      '2026-10-01T10:00:00.000Z'
    );
  });

  it('tracks the 4K versions on 4K servers', async () => {
    getSettings().whisparr[0].is4k = true;
    mock.method(WhisparrAPI.prototype, 'getMonitoredItems', async () => [
      item({ id: 21, hasFile: false }),
      item({ id: 22, foreignId: OTHER_ID, stashId: OTHER_ID }),
    ]);

    await whisparrScanner.run();

    const processing4k = await Media.getAdultMedia(MediaType.SCENE, SCENE_ID);
    assert.strictEqual(processing4k?.status4k, MediaStatus.PROCESSING);
    assert.strictEqual(processing4k?.status, MediaStatus.UNKNOWN);
    assert.strictEqual(processing4k?.serviceId4k, 3);
    assert.strictEqual(processing4k?.externalServiceId4k, 21);
    assert.strictEqual(processing4k?.externalServiceId, null);
    const available4k = await Media.getAdultMedia(MediaType.SCENE, OTHER_ID);
    assert.strictEqual(available4k?.status4k, MediaStatus.AVAILABLE);
    assert.strictEqual(available4k?.status, MediaStatus.UNKNOWN);
  });

  it('leaves TMDB movies to Radarr', async () => {
    await save({
      mediaType: MediaType.MOVIE,
      tmdbId: 555,
      serviceId: 0,
      externalServiceId: 99,
      status: MediaStatus.PROCESSING,
    });
    mock.method(WhisparrAPI.prototype, 'getMonitoredItems', async () => [
      item({ id: 10, itemType: 'movie', stashId: null, tmdbId: 555 }),
      item({
        id: 9,
        itemType: 'movie',
        stashId: null,
        tmdbId: 1288332,
        hasFile: false,
      }),
    ]);

    await whisparrScanner.run();

    const movies = await getRepository(Media).find({
      where: { mediaType: MediaType.MOVIE },
    });
    assert.strictEqual(movies.length, 1);
    assert.strictEqual(movies[0].serviceId, 0);
    assert.strictEqual(movies[0].externalServiceId, 99);
    assert.strictEqual(movies[0].status, MediaStatus.PROCESSING);
  });

  it('tracks ThePornDB movies as adult movies', async () => {
    mock.method(WhisparrAPI.prototype, 'getMonitoredItems', async () => [
      movieItem({ id: 11, tmdbId: 0 }),
    ]);

    await whisparrScanner.run();

    const movie = await Media.getAdultMedia(MediaType.ADULT_MOVIE, TPDB_ID);
    assert.strictEqual(movie?.mediaType, MediaType.ADULT_MOVIE);
    assert.strictEqual(movie?.status, MediaStatus.AVAILABLE);
    assert.strictEqual(movie?.externalServiceId, 11);
  });
});

describe('WhisparrScanner orphan cleanup', () => {
  const ORPHAN_ID = '6f1b8f3e-2c4d-4b7a-9a51-2d1e5c7a9b10';

  // A scene Whisparr was asked for: processing, request approved. Written
  // directly, so no request is sent to Whisparr
  const approved = async (is4k = false): Promise<Media> => {
    const media = await getRepository(Media).save(
      new Media({
        mediaType: MediaType.SCENE,
        stashId: ORPHAN_ID,
        tmdbId: null,
      })
    );
    const request = await getRepository(MediaRequest).save(
      new MediaRequest({
        type: MediaType.SCENE,
        status: MediaRequestStatus.DECLINED,
        media,
        requestedBy: await getRepository(User).findOneByOrFail({ id: 1 }),
        is4k,
      })
    );
    const tier = is4k ? '4k' : '';
    await getRepository(Media).query(
      `UPDATE media SET status${tier} = ?, serviceId${tier} = 3, externalServiceId${tier} = 30 WHERE id = ?`,
      [MediaStatus.PROCESSING, media.id]
    );
    await getRepository(Media).query(
      'UPDATE media_request SET status = ? WHERE id = ?',
      [MediaRequestStatus.APPROVED, request.id]
    );
    return media;
  };

  const stateOf = async () => {
    const media = await getRepository(Media).findOneOrFail({
      where: { stashId: ORPHAN_ID },
      relations: { requests: true },
    });
    return {
      status: media.status,
      status4k: media.status4k,
      requestStatus: media.requests[0].status,
    };
  };

  // Other titles stay monitored, so the server did not come back empty
  const monitored = () =>
    mock.method(WhisparrAPI.prototype, 'getMonitoredItems', async () => [
      item({ id: 1 }),
    ]);

  const notFound = async (): Promise<WhisparrItem> => {
    throw new Error('404', { cause: { response: { status: 404 } } });
  };

  it('resets processing titles Whisparr removed', async () => {
    await approved();
    monitored();
    mock.method(WhisparrAPI.prototype, 'getItem', notFound);
    // Lookups of titles outside the library have no id
    mock.method(WhisparrAPI.prototype, 'lookupScene', async () =>
      item({ id: undefined, stashId: ORPHAN_ID, monitored: false })
    );

    await whisparrScanner.run();

    assert.deepStrictEqual(await stateOf(), {
      status: MediaStatus.UNKNOWN,
      status4k: MediaStatus.UNKNOWN,
      requestStatus: MediaRequestStatus.DECLINED,
    });
  });

  it('resets processing titles nobody requested', async () => {
    // Monitored in Whisparr by an earlier scan, never requested
    await getRepository(Media).save(
      new Media({
        mediaType: MediaType.SCENE,
        stashId: ORPHAN_ID,
        tmdbId: null,
        status: MediaStatus.PROCESSING,
        serviceId: 3,
        externalServiceId: 30,
      })
    );
    monitored();
    mock.method(WhisparrAPI.prototype, 'getItem', notFound);
    mock.method(WhisparrAPI.prototype, 'lookupScene', async () =>
      item({ id: undefined, stashId: ORPHAN_ID, monitored: false })
    );

    await whisparrScanner.run();

    const media = await Media.getAdultMedia(MediaType.SCENE, ORPHAN_ID);
    assert.strictEqual(media?.status, MediaStatus.UNKNOWN);
  });

  it('resets processing titles left unmonitored without a file', async () => {
    await approved();
    monitored();
    mock.method(WhisparrAPI.prototype, 'getItem', async () =>
      item({ id: 30, stashId: ORPHAN_ID, monitored: false, hasFile: false })
    );

    await whisparrScanner.run();

    const state = await stateOf();
    assert.strictEqual(state.status, MediaStatus.UNKNOWN);
    assert.strictEqual(state.requestStatus, MediaRequestStatus.DECLINED);
  });

  it('marks unmonitored titles with a file available', async () => {
    await approved();
    monitored();
    mock.method(WhisparrAPI.prototype, 'getItem', async () =>
      item({ id: 30, stashId: ORPHAN_ID, monitored: false, hasFile: true })
    );

    await whisparrScanner.run();

    const state = await stateOf();
    assert.strictEqual(state.status, MediaStatus.AVAILABLE);
    assert.notStrictEqual(state.requestStatus, MediaRequestStatus.DECLINED);
  });

  it('leaves titles alone when Whisparr cannot answer', async () => {
    await approved();
    monitored();
    mock.method(WhisparrAPI.prototype, 'getItem', async () => {
      throw new Error('503', { cause: { response: { status: 503 } } });
    });

    await whisparrScanner.run();

    assert.strictEqual((await stateOf()).status, MediaStatus.PROCESSING);
  });

  it('skips cleanup when a server returns no monitored items', async () => {
    await approved();
    mock.method(WhisparrAPI.prototype, 'getMonitoredItems', async () => []);
    const getItem = mock.method(WhisparrAPI.prototype, 'getItem', notFound);

    await whisparrScanner.run();

    assert.strictEqual((await stateOf()).status, MediaStatus.PROCESSING);
    assert.strictEqual(getItem.mock.callCount(), 0);
  });

  it('skips cleanup when a server of the tier is not synced', async () => {
    getSettings().whisparr.push({
      ...getSettings().whisparr[0],
      id: 4,
      hostname: 'other.test',
      syncEnabled: false,
    });
    await approved();
    monitored();
    mock.method(WhisparrAPI.prototype, 'getItem', notFound);

    await whisparrScanner.run();

    assert.strictEqual((await stateOf()).status, MediaStatus.PROCESSING);
  });

  it('cleans up 4K versions only after scanning the 4K servers', async () => {
    await approved(true);
    monitored();
    mock.method(WhisparrAPI.prototype, 'getItem', notFound);
    mock.method(WhisparrAPI.prototype, 'lookupScene', async () =>
      item({ id: undefined, stashId: ORPHAN_ID })
    );

    // Only a non-4K server so far
    await whisparrScanner.run();
    assert.strictEqual((await stateOf()).status4k, MediaStatus.PROCESSING);

    getSettings().whisparr.push({
      ...getSettings().whisparr[0],
      id: 5,
      hostname: 'whisparr4k.test',
      is4k: true,
    });
    await whisparrScanner.run();

    const state = await stateOf();
    assert.strictEqual(state.status4k, MediaStatus.UNKNOWN);
    assert.strictEqual(state.requestStatus, MediaRequestStatus.DECLINED);
  });
});
