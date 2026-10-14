import type { MediaType } from '@server/constants/media';

// Scenes have no TMDB id, so reaching TMDB-only code with one is a bug
export const requireTmdbId = (media: {
  id?: number;
  mediaType: MediaType;
  tmdbId: number | null;
}): number => {
  if (media.tmdbId === null) {
    throw new Error(`Media ${media.id} (${media.mediaType}) has no TMDB ID`);
  }

  return media.tmdbId;
};

// App path of a media item; scenes are keyed by their StashDB id
export const getMediaPath = (media: {
  mediaType: MediaType;
  tmdbId: number | null;
  stashId?: string | null;
}): string =>
  media.mediaType === 'scene'
    ? `/scene/${media.stashId}`
    : `/${media.mediaType}/${media.tmdbId}`;
