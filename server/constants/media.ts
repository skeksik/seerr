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
}

// Media types whose metadata comes from TMDB
export type TmdbMediaType = MediaType.MOVIE | MediaType.TV;

export const isTmdbMedia = <
  T extends { mediaType: MediaType; tmdbId: number | null },
>(
  media: T
): media is T & { mediaType: TmdbMediaType; tmdbId: number } =>
  media.mediaType !== MediaType.SCENE && media.tmdbId !== null;

export enum MediaStatus {
  UNKNOWN = 1,
  PENDING,
  PROCESSING,
  PARTIALLY_AVAILABLE,
  AVAILABLE,
  BLOCKLISTED,
  DELETED,
}
