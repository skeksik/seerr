import globalMessages from '@app/i18n/globalMessages';
import type { MessageDescriptor } from 'react-intl';

// Scenes and adult movies are keyed by StashDB and ThePornDB UUIDs
export type AdultMediaType = 'scene' | 'adultmovie';

export const isAdultMediaType = (
  type?: string | null
): type is AdultMediaType => type === 'scene' || type === 'adultmovie';

// Name of a media type, e.g. for "{mediaType} Not Found"
export const mediaTypeMessage = (type?: string | null): MessageDescriptor => {
  switch (type) {
    case 'movie':
      return globalMessages.movie;
    case 'collection':
      return globalMessages.collection;
    case 'scene':
      return globalMessages.scene;
    case 'adultmovie':
      return globalMessages.adultMovie;
    default:
      return globalMessages.tvshow;
  }
};

// The *arr a title goes to; adult TMDB movies go to Whisparr too
export const arrName = (media: {
  mediaType?: string | null;
  isAdult?: boolean;
}): 'Radarr' | 'Sonarr' | 'Whisparr' =>
  isAdultMediaType(media.mediaType) || media.isAdult
    ? 'Whisparr'
    : media.mediaType === 'movie'
      ? 'Radarr'
      : 'Sonarr';

// StashDB scene or ThePornDB movie UUID of a media item
export const adultMediaId = (media: {
  mediaType?: string | null;
  stashId?: string | null;
  tpdbId?: string | null;
}): string | undefined =>
  (media.mediaType === 'scene' ? media.stashId : media.tpdbId) ?? undefined;

// Studio and year of a scene or adult movie
export const adultSubtitle = (
  studio?: { name: string },
  releaseDate?: string
): string =>
  [studio?.name, releaseDate?.slice(0, 4)].filter(Boolean).join(' · ');
