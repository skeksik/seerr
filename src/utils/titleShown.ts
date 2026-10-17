import { MediaStatus } from '@server/constants/media';

export interface ShownTitle {
  mediaType: string;
  mediaInfo?: {
    status: MediaStatus;
    hasActiveRequest?: boolean;
  };
}

export interface HideSettings {
  hideAvailable?: boolean;
  hideBlocklisted?: boolean;
  hideRequested?: boolean;
}

// Titles the hide-available, hide-blocklisted and hide-requested settings
// leave out of lists: movies and series like upstream, and scenes and adult
// movies the same way. `wanted` turns each off for a list, as search does
export const isTitleShown =
  (settings: HideSettings, wanted: Required<HideSettings>) =>
  (title: ShownTitle): boolean => {
    if (!['movie', 'tv', 'scene', 'adultmovie'].includes(title.mediaType)) {
      return true;
    }
    const status = title.mediaInfo?.status;
    return !(
      (settings.hideAvailable &&
        wanted.hideAvailable &&
        (status === MediaStatus.AVAILABLE ||
          status === MediaStatus.PARTIALLY_AVAILABLE)) ||
      (settings.hideBlocklisted &&
        wanted.hideBlocklisted &&
        status === MediaStatus.BLOCKLISTED) ||
      (settings.hideRequested &&
        wanted.hideRequested &&
        title.mediaInfo?.hasActiveRequest)
    );
  };
