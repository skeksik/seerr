import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import {
  isTmdbMedia,
  MediaRequestStatus,
  MediaStatus,
  MediaType,
} from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import { MediaRequest } from '@server/entity/MediaRequest';
import { User } from '@server/entity/User';
import { getSettings } from '@server/lib/settings';
import { setupTestDb } from '@server/test/db';
import { getMediaPath, requireTmdbId } from '@server/utils/mediaIds';

setupTestDb();

const SCENE_ID = '6f1b8f3e-2c4d-4b7a-9a51-2d1e5c7a9b10';

describe('Scene media', () => {
  it('stores a scene without a TMDB id and finds it by stash id', async () => {
    const mediaRepository = getRepository(Media);
    await mediaRepository.save(
      new Media({ mediaType: MediaType.SCENE, stashId: SCENE_ID, tmdbId: null })
    );

    const media = await Media.getAdultMedia(MediaType.SCENE, SCENE_ID);

    assert.ok(media);
    assert.strictEqual(media.mediaType, MediaType.SCENE);
    assert.strictEqual(media.tmdbId, null);
  });

  it('rejects a second scene with the same stash id', async () => {
    const mediaRepository = getRepository(Media);
    await mediaRepository.save(
      new Media({ mediaType: MediaType.SCENE, stashId: SCENE_ID, tmdbId: null })
    );

    await assert.rejects(() =>
      mediaRepository.save(
        new Media({
          mediaType: MediaType.SCENE,
          stashId: SCENE_ID,
          tmdbId: null,
        })
      )
    );
  });

  it('does not return movies from the stash id lookup', async () => {
    const mediaRepository = getRepository(Media);
    await mediaRepository.save(
      new Media({ mediaType: MediaType.MOVIE, stashId: SCENE_ID, tmdbId: 1 })
    );

    assert.strictEqual(
      await Media.getAdultMedia(MediaType.SCENE, SCENE_ID),
      undefined
    );
  });
});

// Lists hide requested scenes and adult movies by it, like movies
describe('Active requests', () => {
  const OTHER_ID = '01a138c1-a8cf-74b2-a8bb-e617e9c6f20f';
  const MOVIE_ID = 'b3c5e0f2-7d41-4f8e-9a6b-1c2d3e4f5a6b';

  afterEach(() => {
    getSettings().main.hideRequested = false;
  });

  const saveRequested = async (
    init: Partial<Media>,
    ...statuses: MediaRequestStatus[]
  ) => {
    const media = await getRepository(Media).save(
      new Media({ tmdbId: null, status: MediaStatus.PENDING, ...init })
    );
    const user = await getRepository(User).findOneOrFail({
      where: { email: 'demo@seerr.dev' },
    });
    for (const status of statuses) {
      await getRepository(MediaRequest).save(
        new MediaRequest({
          type: media.mediaType,
          status,
          media,
          requestedBy: user,
        })
      );
    }
  };

  const scene = (stashId: string) => ({
    mediaType: MediaType.SCENE,
    stashId,
  });

  it('marks scenes with a pending or approved request', async () => {
    getSettings().main.hideRequested = true;
    await saveRequested(scene(SCENE_ID), MediaRequestStatus.PENDING);
    await saveRequested(scene(OTHER_ID), MediaRequestStatus.APPROVED);

    const media = await Media.getRelatedScenes([SCENE_ID, OTHER_ID]);
    const byId = new Map(media.map((m) => [m.stashId, m]));

    assert.strictEqual(byId.get(SCENE_ID)?.hasActiveRequest, true);
    assert.strictEqual(byId.get(OTHER_ID)?.hasActiveRequest, true);
  });

  // Like upstream's movies: declined, failed and completed requests are
  // not active
  it('does not mark scenes whose requests are over', async () => {
    getSettings().main.hideRequested = true;
    await saveRequested(
      scene(SCENE_ID),
      MediaRequestStatus.DECLINED,
      MediaRequestStatus.FAILED,
      MediaRequestStatus.COMPLETED
    );
    await saveRequested(scene(OTHER_ID));

    const media = await Media.getRelatedScenes([SCENE_ID, OTHER_ID]);

    assert.deepStrictEqual(
      media.map((m) => m.hasActiveRequest),
      [false, false]
    );
  });

  it('marks adult movies with an active request', async () => {
    getSettings().main.hideRequested = true;
    await saveRequested(
      { mediaType: MediaType.ADULT_MOVIE, tpdbId: MOVIE_ID },
      MediaRequestStatus.DECLINED,
      MediaRequestStatus.APPROVED
    );

    const [media] = await Media.getRelatedAdultMovies([MOVIE_ID]);

    assert.strictEqual(media.hasActiveRequest, true);
  });

  // Lists read while the setting was off keep it, so turning the setting on
  // hides their requested titles without reading them again
  it('marks them while requested media is not hidden too', async () => {
    await saveRequested(scene(SCENE_ID), MediaRequestStatus.PENDING);
    await saveRequested(
      { mediaType: MediaType.ADULT_MOVIE, tpdbId: MOVIE_ID },
      MediaRequestStatus.APPROVED
    );

    const [sceneMedia] = await Media.getRelatedScenes([SCENE_ID]);
    const [movieMedia] = await Media.getRelatedAdultMovies([MOVIE_ID]);

    assert.strictEqual(sceneMedia.hasActiveRequest, true);
    assert.strictEqual(movieMedia.hasActiveRequest, true);
  });

  it('marks movies only for lists that ask for it', async () => {
    await saveRequested(
      { mediaType: MediaType.MOVIE, tmdbId: 550 },
      MediaRequestStatus.APPROVED
    );
    const items = [{ tmdbId: 550, mediaType: MediaType.MOVIE }];

    const [listed] = await Media.getRelatedMedia(undefined, items, {
      includeActiveRequest: true,
    });
    const [other] = await Media.getRelatedMedia(undefined, items);

    assert.strictEqual(listed.hasActiveRequest, true);
    assert.strictEqual(other.hasActiveRequest, undefined);
  });
});

describe('TMDB id helpers', () => {
  const scene = { id: 1, mediaType: MediaType.SCENE, tmdbId: null };
  const movie = { id: 2, mediaType: MediaType.MOVIE, tmdbId: 603 };

  it('isTmdbMedia only accepts movies and series with a TMDB id', () => {
    assert.strictEqual(isTmdbMedia(scene), false);
    assert.strictEqual(isTmdbMedia(movie), true);
    assert.strictEqual(
      isTmdbMedia({ mediaType: MediaType.TV, tmdbId: null }),
      false
    );
  });

  it('requireTmdbId returns the id or throws for scenes', () => {
    assert.strictEqual(requireTmdbId(movie), 603);
    assert.throws(() => requireTmdbId(scene), /has no TMDB ID/);
  });

  it('getMediaPath links scenes by stash id and others by TMDB id', () => {
    assert.strictEqual(getMediaPath(movie), '/movie/603');
    assert.strictEqual(
      getMediaPath({ ...scene, stashId: 'abc' }),
      '/scene/abc'
    );
  });
});
