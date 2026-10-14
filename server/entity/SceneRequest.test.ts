import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';

import ExternalAPI from '@server/api/externalapi';
import type { WhisparrItem } from '@server/api/servarr/whisparr';
import WhisparrAPI from '@server/api/servarr/whisparr';
import StashDbAPI from '@server/api/stashdb';
import {
  MediaRequestStatus,
  MediaStatus,
  MediaType,
} from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import {
  DuplicateMediaRequestError,
  MediaRequest,
  QuotaRestrictedError,
  RequestPermissionError,
} from '@server/entity/MediaRequest';
import { User } from '@server/entity/User';
import { Permission } from '@server/lib/permissions';
import type { WhisparrSettings } from '@server/lib/settings';
import { getSettings } from '@server/lib/settings';
import { setupTestDb } from '@server/test/db';

const STASH_ID = '01a138c1-a8cf-74b2-a8bb-e617e9c6f20f';

const whisparrServer: WhisparrSettings = {
  id: 0,
  name: 'Whisparr',
  hostname: 'whisparr.test',
  port: 6969,
  apiKey: 'key',
  useSsl: false,
  activeProfileId: 4,
  activeProfileName: 'HD-1080p',
  activeDirectory: '/data/xxx',
  tags: [],
  is4k: false,
  isDefault: true,
  syncEnabled: true,
  preventSearch: false,
  tagRequests: false,
  overrideRule: [],
};

const lookupItem: WhisparrItem = {
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
  tags: [],
};

mock.method(MediaRequest, 'sendNotification', async () => undefined);

setupTestDb();

beforeEach(() => {
  const settings = getSettings();
  settings.main.enableAdult = true;
  settings.stashdb = { endpoint: 'https://stashdb.test/graphql', apiKey: 'k' };
  settings.whisparr = [];
  mock.method(StashDbAPI.prototype, 'getScene', async (id: string) => ({
    id,
    title: 'Scene',
    deleted: false,
    images: [],
    performers: [],
    urls: [],
    tags: [],
  }));
});

afterEach(() => {
  getSettings().main.enableAdult = false;
  getSettings().whisparr = [];
  mock.restoreAll();
  mock.method(MediaRequest, 'sendNotification', async () => undefined);
});

function createUser(email: string, permissions: number): Promise<User> {
  return getRepository(User).save(new User({ email, permissions, avatar: '' }));
}

const requestScene = (user: User) =>
  MediaRequest.request({ mediaType: MediaType.SCENE, stashId: STASH_ID }, user);

// Whisparr adds run detached from the request save
const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

describe('Scene requests', () => {
  it('creates a pending scene request keyed by stash id', async () => {
    const user = await createUser(
      'scene@seerr.dev',
      Permission.REQUEST | Permission.ADULT
    );

    const request = await requestScene(user);

    assert.strictEqual(request.status, MediaRequestStatus.PENDING);
    assert.strictEqual(request.type, MediaType.SCENE);
    const media = await Media.getMediaByStashId(STASH_ID);
    assert.ok(media);
    assert.strictEqual(media.tmdbId, null);
    assert.strictEqual(media.status, MediaStatus.PENDING);
  });

  it('requires the adult permission', async () => {
    const user = await createUser('noadult@seerr.dev', Permission.REQUEST);

    await assert.rejects(() => requestScene(user), RequestPermissionError);
  });

  it('rejects scene requests while adult content is disabled', async () => {
    getSettings().main.enableAdult = false;
    const user = await createUser(
      'disabled@seerr.dev',
      Permission.REQUEST | Permission.ADULT
    );

    await assert.rejects(() => requestScene(user), RequestPermissionError);
  });

  it('blocks a second active request for the same scene', async () => {
    const user = await createUser(
      'dupe@seerr.dev',
      Permission.REQUEST | Permission.ADULT
    );

    await requestScene(user);

    await assert.rejects(() => requestScene(user), DuplicateMediaRequestError);
  });

  it('sends auto-approved scene requests to the default Whisparr', async () => {
    getSettings().whisparr = [whisparrServer];
    const lookupScene = mock.method(
      WhisparrAPI.prototype,
      'lookupScene',
      async () => lookupItem
    );
    const addItem = mock.method(WhisparrAPI.prototype, 'addItem', async () => ({
      ...lookupItem,
      id: 42,
      monitored: true,
    }));
    const user = await createUser(
      'auto@seerr.dev',
      Permission.REQUEST | Permission.AUTO_APPROVE | Permission.ADULT
    );

    const request = await requestScene(user);
    await settle();

    assert.strictEqual(request.status, MediaRequestStatus.APPROVED);
    assert.strictEqual(lookupScene.mock.calls[0].arguments[0], STASH_ID);
    assert.deepStrictEqual(addItem.mock.calls[0].arguments[1], {
      qualityProfileId: 4,
      rootFolderPath: '/data/xxx',
      tags: [],
      monitored: true,
      searchNow: true,
    });
    const media = await Media.getMediaByStashId(STASH_ID);
    assert.strictEqual(media?.serviceId, 0);
    assert.strictEqual(media?.externalServiceId, 42);
    assert.strictEqual(media?.externalServiceSlug, STASH_ID);
  });

  it('marks the request failed when Whisparr rejects the add', async () => {
    getSettings().whisparr = [whisparrServer];
    mock.method(WhisparrAPI.prototype, 'lookupScene', async () => lookupItem);
    mock.method(WhisparrAPI.prototype, 'addItem', async () => {
      throw new Error('boom');
    });
    const user = await createUser(
      'fail@seerr.dev',
      Permission.REQUEST | Permission.AUTO_APPROVE | Permission.ADULT
    );

    const request = await requestScene(user);
    await settle();

    const saved = await getRepository(MediaRequest).findOneOrFail({
      where: { id: request.id },
    });
    assert.strictEqual(saved.status, MediaRequestStatus.FAILED);
  });
});

describe('Scene quotas', () => {
  const OTHER_ID = '019d06d3-7924-7c2f-add1-c182b1549318';

  afterEach(() => {
    getSettings().main.defaultQuotas.scene = {};
  });

  it('counts scene requests against the scene quota', async () => {
    const user = await createUser(
      'quota@seerr.dev',
      Permission.REQUEST | Permission.ADULT
    );
    user.sceneQuotaLimit = 1;
    await getRepository(User).save(user);

    await requestScene(user);

    const quota = await user.getQuota();
    assert.strictEqual(quota.scene.used, 1);
    assert.strictEqual(quota.scene.restricted, true);
    assert.strictEqual(quota.movie.used, 0);
    await assert.rejects(
      () =>
        MediaRequest.request(
          { mediaType: MediaType.SCENE, stashId: OTHER_ID },
          user
        ),
      QuotaRestrictedError
    );
  });

  it('applies the default scene quota to users without their own', async () => {
    getSettings().main.defaultQuotas.scene = { quotaLimit: 1, quotaDays: 7 };
    const user = await createUser(
      'default-quota@seerr.dev',
      Permission.REQUEST | Permission.ADULT
    );

    await requestScene(user);

    await assert.rejects(
      () =>
        MediaRequest.request(
          { mediaType: MediaType.SCENE, stashId: OTHER_ID },
          user
        ),
      QuotaRestrictedError
    );
  });

  it('lets request managers bypass the scene quota', async () => {
    const requester = await createUser(
      'limited@seerr.dev',
      Permission.REQUEST | Permission.ADULT
    );
    requester.sceneQuotaLimit = 1;
    await getRepository(User).save(requester);
    const manager = await createUser(
      'manager@seerr.dev',
      Permission.MANAGE_USERS | Permission.MANAGE_REQUESTS | Permission.ADULT
    );
    await requestScene(requester);

    const request = await MediaRequest.request(
      {
        mediaType: MediaType.SCENE,
        stashId: OTHER_ID,
        userId: requester.id,
        ignoreQuota: true,
      },
      manager
    );

    assert.strictEqual(request.ignoreQuota, true);
    assert.strictEqual((await requester.getQuota()).scene.used, 1);
  });
});

describe('Adult movie requests', () => {
  const stubTmdbMovie = (adult: boolean) =>
    mock.method(
      ExternalAPI.prototype as unknown as {
        get: (endpoint: string) => Promise<unknown>;
      },
      'get',
      async (endpoint: string) => ({
        id: Number(endpoint.replace(/^\/movie\//, '')),
        adult,
        external_ids: {},
        videos: { results: [{ type: 'Trailer', key: 'trailer' }] },
      })
    );

  it('flags adult movies for Whisparr when one is configured', async () => {
    getSettings().whisparr = [whisparrServer];
    stubTmdbMovie(true);
    mock.method(WhisparrAPI.prototype, 'lookupMovie', async () => ({
      ...lookupItem,
      itemType: 'movie',
      tmdbId: 777,
    }));
    mock.method(WhisparrAPI.prototype, 'addItem', async () => ({
      ...lookupItem,
      id: 5,
    }));
    const user = await createUser(
      'adultmovie@seerr.dev',
      Permission.REQUEST | Permission.ADULT
    );

    await MediaRequest.request(
      { mediaType: MediaType.MOVIE, mediaId: 777 },
      user
    );

    const media = await Media.getMedia(777, MediaType.MOVIE);
    assert.strictEqual(media?.isAdult, true);
  });

  it('keeps adult movies on Radarr without a Whisparr server', async () => {
    stubTmdbMovie(true);
    const user = await createUser(
      'radarradult@seerr.dev',
      Permission.REQUEST | Permission.ADULT
    );

    await MediaRequest.request(
      { mediaType: MediaType.MOVIE, mediaId: 778 },
      user
    );

    const media = await Media.getMedia(778, MediaType.MOVIE);
    assert.strictEqual(media?.isAdult, false);
  });

  it('refuses adult movies to users without adult access', async () => {
    stubTmdbMovie(true);
    const user = await createUser('kid@seerr.dev', Permission.REQUEST);

    await assert.rejects(
      () =>
        MediaRequest.request(
          { mediaType: MediaType.MOVIE, mediaId: 779 },
          user
        ),
      RequestPermissionError
    );
  });
});
