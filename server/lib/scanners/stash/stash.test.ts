import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';

import WhisparrAPI from '@server/api/servarr/whisparr';
import type { StashScene } from '@server/api/stash';
import StashAPI from '@server/api/stash';
import { MediaStatus, MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import { stashScanner } from '@server/lib/scanners/stash';
import { syncSceneAvailability } from '@server/lib/sceneAvailability';
import { getSettings } from '@server/lib/settings';
import { setupTestDb } from '@server/test/db';

const SCENE_ID = '01a0de25-5c7e-75b7-b319-ee76dd9a4879';

const stashScene = (overrides: Partial<StashScene> = {}): StashScene => ({
  id: '56',
  title: 'Scene',
  created_at: '2026-09-28T18:59:13Z',
  stash_ids: [{ endpoint: 'https://stashdb.org/graphql/', stash_id: SCENE_ID }],
  ...overrides,
});

setupTestDb();

beforeEach(() => {
  const settings = getSettings();
  settings.stash = { url: 'http://stash.test', apiKey: 'key' };
  settings.stashdb = { endpoint: 'https://stashdb.org/graphql', apiKey: 'k' };
});

afterEach(() => {
  getSettings().stash = { url: '', apiKey: '' };
  getSettings().whisparr = [];
  mock.restoreAll();
});

describe('StashScanner', () => {
  it('marks matched scenes available and builds the Stash play link', async () => {
    mock.method(StashAPI.prototype, 'getLinkedScenes', async () => [
      stashScene(),
      // Linked to another stash-box only, so it cannot be matched
      stashScene({
        id: '57',
        stash_ids: [
          { endpoint: 'https://theporndb.net/graphql', stash_id: 'tpdb' },
        ],
      }),
    ]);

    await stashScanner.run();

    const media = await Media.getMediaByStashId(SCENE_ID);
    assert.strictEqual(media?.status, MediaStatus.AVAILABLE);
    assert.strictEqual(media?.stashMediaId, '56');
    assert.strictEqual(media?.mediaUrl, 'http://stash.test/scenes/56');
    assert.strictEqual(await getRepository(Media).count(), 1);
  });

  it('does nothing while Stash is not configured', async () => {
    getSettings().stash = { url: '', apiKey: '' };
    const linked = mock.method(
      StashAPI.prototype,
      'getLinkedScenes',
      async () => []
    );

    await stashScanner.run();

    assert.strictEqual(linked.mock.callCount(), 0);
  });
});

describe('syncSceneAvailability', () => {
  const saveScene = (overrides: Partial<Media> = {}) =>
    getRepository(Media).save(
      new Media({
        mediaType: MediaType.SCENE,
        stashId: SCENE_ID,
        tmdbId: null,
        status: MediaStatus.AVAILABLE,
        stashMediaId: '56',
        ...overrides,
      })
    );

  it('keeps scenes that are still in Stash', async () => {
    const media = await saveScene();
    mock.method(StashAPI.prototype, 'getScene', async () => stashScene());

    await syncSceneAvailability(media);

    const latest = await Media.getMediaByStashId(SCENE_ID);
    assert.strictEqual(latest?.status, MediaStatus.AVAILABLE);
  });

  it('marks scenes gone from Stash and Whisparr as deleted', async () => {
    const media = await saveScene();
    mock.method(StashAPI.prototype, 'getScene', async () => null);

    await syncSceneAvailability(media);

    const latest = await Media.getMediaByStashId(SCENE_ID);
    assert.strictEqual(latest?.status, MediaStatus.DELETED);
    assert.strictEqual(latest?.stashMediaId, null);
  });

  it('keeps scenes whose file is still in Whisparr', async () => {
    getSettings().whisparr = [
      {
        id: 0,
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
    const media = await saveScene({
      stashMediaId: null,
      serviceId: 0,
      externalServiceId: 9,
    });
    mock.method(WhisparrAPI.prototype, 'getItem', async () => ({
      hasFile: true,
    }));

    await syncSceneAvailability(media);

    const latest = await Media.getMediaByStashId(SCENE_ID);
    assert.strictEqual(latest?.status, MediaStatus.AVAILABLE);
  });

  it('leaves scenes alone when Stash cannot be reached', async () => {
    const media = await saveScene();
    mock.method(StashAPI.prototype, 'getScene', async () => {
      throw new Error('ECONNREFUSED');
    });

    await syncSceneAvailability(media);

    const latest = await Media.getMediaByStashId(SCENE_ID);
    assert.strictEqual(latest?.status, MediaStatus.AVAILABLE);
    assert.strictEqual(latest?.stashMediaId, '56');
  });
});
