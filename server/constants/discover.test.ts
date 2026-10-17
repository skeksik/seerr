import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  adultCustomSliderTypes,
  adultSliderTypes,
  defaultSliders,
  DiscoverSliderType,
  isAdultSliderType,
} from './discover';

describe('discover slider types', () => {
  it('keeps the stored numbers of the existing types', () => {
    assert.strictEqual(DiscoverSliderType.TMDB_TV_STREAMING_SERVICES, 21);
    assert.strictEqual(DiscoverSliderType.UPCOMING_ADULT_MOVIES, 30);
    assert.strictEqual(DiscoverSliderType.SCENE_TAG, 31);
    assert.strictEqual(DiscoverSliderType.ADULT_MOVIE_SEARCH, 38);
  });

  it('gates the custom adult rows like the built-in ones', () => {
    for (const type of [...adultSliderTypes, ...adultCustomSliderTypes]) {
      assert.ok(isAdultSliderType(type), DiscoverSliderType[type]);
    }
    assert.ok(!isAdultSliderType(DiscoverSliderType.TMDB_MOVIE_KEYWORD));
    assert.ok(!isAdultSliderType(DiscoverSliderType.TMDB_SEARCH));
  });

  it('bootstraps only the built-in adult rows', () => {
    const bootstrapped = defaultSliders.map((slider) => slider.type);

    for (const type of adultSliderTypes) {
      assert.ok(bootstrapped.includes(type), DiscoverSliderType[type]);
    }
    for (const type of adultCustomSliderTypes) {
      assert.ok(!bootstrapped.includes(type), DiscoverSliderType[type]);
    }
  });
});
