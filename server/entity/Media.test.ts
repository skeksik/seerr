import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { isTmdbMedia, MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
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

    const media = await Media.getMediaByStashId(SCENE_ID);

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

    assert.strictEqual(await Media.getMediaByStashId(SCENE_ID), undefined);
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
