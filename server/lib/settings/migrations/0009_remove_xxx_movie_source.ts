import type { AllSettings } from '@server/lib/settings';

// XXX movies only come from ThePornDB now, so the source setting and its
// TMDB studio list are gone
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const removeXxxMovieSource = (settings: any): AllSettings => {
  if (
    Array.isArray(settings.migrations) &&
    settings.migrations.includes('0009_remove_xxx_movie_source')
  ) {
    return settings;
  }

  delete settings.xxxMovies;

  if (!Array.isArray(settings.migrations)) {
    settings.migrations = [];
  }
  settings.migrations.push('0009_remove_xxx_movie_source');

  return settings;
};

export default removeXxxMovieSource;
