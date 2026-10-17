import StashDbAPI from '@server/api/stashdb';
import TpdbAPI from '@server/api/tpdb';
import type { TpdbMovie } from '@server/api/tpdb/interfaces';
import type { AdultMediaType } from '@server/constants/media';
import { adultIdField, MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import type { User } from '@server/entity/User';
import { Watchlist } from '@server/entity/Watchlist';
import type { AdultMovieResult } from '@server/models/AdultMovie';
import { mapAdultMovieResult } from '@server/models/AdultMovie';
import { mapSceneResult } from '@server/models/Scene';
import type { EntityManager } from 'typeorm';

// Movies for the viewer, with media info
export const mapAdultMovieList = async (
  movies: TpdbMovie[],
  user?: User
): Promise<AdultMovieResult[]> => {
  const media = await Media.getRelatedAdultMovies(
    movies.map((movie) => movie.id),
    user
  );
  const byId = new Map(media.map((m) => [m.tpdbId, m]));

  return movies.map((movie) => mapAdultMovieResult(movie, byId.get(movie.id)));
};

// The scene on StashDB or the movie on ThePornDB, or null when it is gone
export const lookupAdultTitle = async (
  mediaType: AdultMediaType,
  id: string
): Promise<{ id: string; title: string } | null> => {
  if (mediaType === MediaType.SCENE) {
    const scene = await StashDbAPI.fromSettings().getScene(id);
    return scene && !scene.deleted
      ? { id: scene.id, title: scene.title ?? '' }
      : null;
  }

  const movie = await TpdbAPI.fromSettings().getMovie(id);
  return movie ? { id: movie.id, title: movie.title } : null;
};

// Media rows for scenes and adult movies are keyed by their external id
export const findOrCreateAdultMedia = async (
  em: EntityManager,
  mediaType: AdultMediaType,
  externalId: string
): Promise<Media> => {
  const idField = adultIdField(mediaType);
  const media = await em.getRepository(Media).findOne({
    where: { [idField]: externalId, mediaType },
  });

  return (
    media ??
    new Media({
      mediaType,
      [idField]: externalId,
      tmdbId: null,
    })
  );
};

export const isOnWatchlist = async (
  mediaType: AdultMediaType,
  externalId: string,
  user?: User
): Promise<boolean> =>
  !!user &&
  getRepository(Watchlist).exist({
    where: { mediaType, externalId, requestedBy: { id: user.id } },
  });

const withYear = (title: string, date?: string | null): string =>
  `${title}${date ? ` (${date.slice(0, 4)})` : ''}`;

// Notification subject, image, overview and studio for a scene or adult
// movie, like the TMDB title and poster for movies
export const describeAdultMedia = async (
  media: Media
): Promise<{
  title: string;
  image?: string;
  overview?: string;
  studio?: string;
}> => {
  if (media.mediaType === MediaType.SCENE && media.stashId) {
    const scene = await StashDbAPI.fromSettings().getScene(media.stashId);

    if (!scene) {
      throw new Error(`Scene ${media.stashId} not found on StashDB`);
    }

    const details = mapSceneResult(scene);
    return {
      title: withYear(details.title, details.releaseDate),
      image: details.imageUrl ? `${details.imageUrl}?size=600` : undefined,
      overview: scene.details ?? undefined,
      studio: details.studio?.name,
    };
  }

  if (media.mediaType === MediaType.ADULT_MOVIE && media.tpdbId) {
    const movie = await TpdbAPI.fromSettings().getMovie(media.tpdbId);

    if (!movie) {
      throw new Error(`Movie ${media.tpdbId} not found on ThePornDB`);
    }

    return {
      title: withYear(movie.title, movie.date),
      image: movie.posters?.large ?? movie.image ?? undefined,
      overview: movie.description ?? undefined,
      studio: movie.site?.name,
    };
  }

  throw new Error(`Media ${media.id} is not a scene or adult movie`);
};
