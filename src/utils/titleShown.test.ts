import { MediaStatus } from '@server/constants/media';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isTitleShown } from './titleShown';

const all = { hideAvailable: true, hideBlocklisted: true, hideRequested: true };
const none = {
  hideAvailable: false,
  hideBlocklisted: false,
  hideRequested: false,
};

const title = (
  mediaType: string,
  status = MediaStatus.UNKNOWN,
  hasActiveRequest?: boolean
) => ({ mediaType, mediaInfo: { status, hasActiveRequest } });

describe('isTitleShown', () => {
  it('hides requested scenes and adult movies like movies and series', () => {
    const shown = isTitleShown({ hideRequested: true }, all);

    for (const mediaType of ['movie', 'tv', 'scene', 'adultmovie']) {
      assert.strictEqual(
        shown(title(mediaType, MediaStatus.PROCESSING, true)),
        false,
        mediaType
      );
      assert.strictEqual(
        shown(title(mediaType, MediaStatus.PROCESSING, false)),
        true,
        mediaType
      );
      // Without media info, or read before the flag was known
      assert.strictEqual(shown({ mediaType }), true, mediaType);
      assert.strictEqual(
        shown(title(mediaType, MediaStatus.PENDING)),
        true,
        mediaType
      );
    }
  });

  it('shows requested titles while the setting is off', () => {
    const shown = isTitleShown({ hideRequested: false }, all);

    assert.strictEqual(shown(title('scene', MediaStatus.PENDING, true)), true);
    assert.strictEqual(
      shown(title('adultmovie', MediaStatus.PENDING, true)),
      true
    );
  });

  it('shows requested titles in lists that keep them, like search', () => {
    const shown = isTitleShown({ hideRequested: true }, none);

    assert.strictEqual(shown(title('scene', MediaStatus.PENDING, true)), true);
    assert.strictEqual(
      shown(title('adultmovie', MediaStatus.PENDING, true)),
      true
    );
  });

  it('hides available and blocklisted scenes and adult movies', () => {
    const shown = isTitleShown(
      { hideAvailable: true, hideBlocklisted: true },
      all
    );

    assert.strictEqual(shown(title('scene', MediaStatus.AVAILABLE)), false);
    assert.strictEqual(
      shown(title('adultmovie', MediaStatus.PARTIALLY_AVAILABLE)),
      false
    );
    assert.strictEqual(shown(title('scene', MediaStatus.BLOCKLISTED)), false);
    assert.strictEqual(shown(title('scene', MediaStatus.PROCESSING)), true);
  });

  it('always shows people and collections', () => {
    const shown = isTitleShown(all, all);

    assert.strictEqual(
      shown(title('person', MediaStatus.AVAILABLE, true)),
      true
    );
  });
});
