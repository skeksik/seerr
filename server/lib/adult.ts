import { isAdultMediaType, MediaType } from '@server/constants/media';
import type Media from '@server/entity/Media';
import type { User } from '@server/entity/User';
import { Permission } from '@server/lib/permissions';
import { getSettings } from '@server/lib/settings';
import type { FindOperator } from 'typeorm';
import { In } from 'typeorm';

// Adult content needs the global switch and the user's permission, and the
// user must not have safe mode on
export const canViewAdult = (user?: User | null): boolean =>
  getSettings().main.enableAdult &&
  !!user?.hasPermission(Permission.ADULT) &&
  !user.settings?.adultSafeMode;

export const isAdultMedia = (
  media: Pick<Media, 'mediaType' | 'isAdult'>
): boolean => isAdultMediaType(media.mediaType) || media.isAdult;

// Watchlist rows for a viewer: scenes and adult movies only for viewers who
// may see them
export const adultWatchlistWhere = (
  viewer?: User | null
): { mediaType?: FindOperator<MediaType> } =>
  canViewAdult(viewer)
    ? {}
    : { mediaType: In([MediaType.MOVIE, MediaType.TV]) };
