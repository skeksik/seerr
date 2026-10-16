import type { AdultMovieResult } from '@server/models/AdultMovie';
import type { SceneResult } from '@server/models/Scene';

// stash-box resizes images on request; full size covers are several megabytes
export type StashImageSize = 300 | 600 | 1280;

export const stashImageUrl = (
  url: string | undefined,
  size: StashImageSize
): string | undefined => (url ? `${url}?size=${size}` : undefined);

interface AdultArtwork {
  poster?: string;
  // Wide artwork for page, row and modal backgrounds
  backdrop?: string;
  imageType: 'stashdb' | 'tpdb';
  // Adult movie covers are portrait, scene stills landscape
  portrait: boolean;
}

// Poster and backdrop of a scene or adult movie
export const adultArtwork = (
  title: SceneResult | AdultMovieResult,
  posterSize: StashImageSize = 600
): AdultArtwork =>
  title.mediaType === 'scene'
    ? {
        poster: stashImageUrl(title.imageUrl, posterSize),
        backdrop: stashImageUrl(title.imageUrl, 1280),
        imageType: 'stashdb',
        portrait: false,
      }
    : {
        poster: title.posterUrl,
        backdrop: title.backdropUrl ?? title.posterUrl,
        imageType: 'tpdb',
        portrait: true,
      };
