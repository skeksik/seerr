import StashDbAPI from '@server/api/stashdb';
import TpdbAPI from '@server/api/tpdb';
import type { AdultMediaType } from '@server/constants/media';
import { MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import type { User } from '@server/entity/User';
import { Watchlist } from '@server/entity/Watchlist';
import type { EntityManager } from 'typeorm';

export const adultIdField = (
  mediaType: AdultMediaType
): 'stashId' | 'tpdbId' =>
  mediaType === MediaType.SCENE ? 'stashId' : 'tpdbId';

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

// Media rows for scenes and XXX movies are keyed by their external id
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
      isAdult: mediaType === MediaType.XXX_MOVIE,
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
