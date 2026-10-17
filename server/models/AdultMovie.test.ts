import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { TpdbMovie } from '@server/api/tpdb/interfaces';
import {
  mapAdultMovieDetails,
  playableTrailer,
} from '@server/models/AdultMovie';

const movie = (trailer?: string | null): TpdbMovie => ({
  id: '14ef5f0f-b4a2-49fb-a38f-e7076359e6bf',
  _id: 165899,
  title: 'Casa Del Sol',
  type: 'Movie',
  trailer,
});

describe('playableTrailer', () => {
  it('keeps video files', () => {
    const url =
      'https://trailers-buddies.gammacdn.com/9/9/8/5/6/c165899/trailers/tr_165899_hd.mp4';

    assert.strictEqual(playableTrailer(url), url);
    assert.strictEqual(
      mapAdultMovieDetails(movie(url)).trailerUrl,
      url,
      'details carry the trailer'
    );
  });

  it('leaves out movies without one', () => {
    assert.strictEqual(mapAdultMovieDetails(movie(null)).trailerUrl, undefined);
    assert.strictEqual(mapAdultMovieDetails(movie()).trailerUrl, undefined);
    assert.strictEqual(playableTrailer(''), undefined);
  });

  it('leaves out streaming playlists and other links', () => {
    assert.strictEqual(
      playableTrailer(
        'https://trailer.adultempire.com/hls/trailer/4938134/master.m3u8'
      ),
      undefined
    );
    assert.strictEqual(
      playableTrailer('https://example.com/trailer.mpd'),
      undefined
    );
    assert.strictEqual(playableTrailer('javascript:alert(1)'), undefined);
    assert.strictEqual(playableTrailer('not a url'), undefined);
  });

  it('leaves out signed links once they expire', () => {
    const signed = (validto: number) =>
      `https://nsnetworktour.newsensations.com/trailers/mp4-movie/TheVixenHotwives_trailer.mp4?validfrom=1729343921&validto=${validto}&hash=FA22`;
    const now = Date.UTC(2026, 9, 17);

    assert.strictEqual(playableTrailer(signed(1729351121), now), undefined);
    assert.strictEqual(
      playableTrailer(signed(now / 1000 + 3600), now),
      signed(now / 1000 + 3600)
    );
  });
});
