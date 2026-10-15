export enum MediaRequestStatus {
  PENDING = 1,
  APPROVED,
  DECLINED,
  FAILED,
  COMPLETED,
}

export enum MediaType {
  MOVIE = 'movie',
  TV = 'tv',
  // Adult scene identified by its stash-box (StashDB) UUID, not a TMDB id
  SCENE = 'scene',
  // Adult movie identified by its ThePornDB UUID, not a TMDB id
  ADULT_MOVIE = 'adultmovie',
}

// Adult media types keyed by an external id and handled by Whisparr
export type AdultMediaType = MediaType.SCENE | MediaType.ADULT_MOVIE;

export const isAdultMediaType = (type: MediaType): type is AdultMediaType =>
  type === MediaType.SCENE || type === MediaType.ADULT_MOVIE;

// Media types whose metadata comes from TMDB
export type TmdbMediaType = MediaType.MOVIE | MediaType.TV;

export const isTmdbMedia = <
  T extends { mediaType: MediaType; tmdbId: number | null },
>(
  media: T
): media is T & { mediaType: TmdbMediaType; tmdbId: number } =>
  (media.mediaType === MediaType.MOVIE || media.mediaType === MediaType.TV) &&
  media.tmdbId !== null;

export enum MediaStatus {
  UNKNOWN = 1,
  PENDING,
  PROCESSING,
  PARTIALLY_AVAILABLE,
  AVAILABLE,
  BLOCKLISTED,
  DELETED,
}
