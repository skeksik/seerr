import { MediaType } from '@server/constants/media';
import type Media from '@server/entity/Media';
import type { User } from '@server/entity/User';
import { Permission } from '@server/lib/permissions';
import { getSettings } from '@server/lib/settings';

// Adult content needs the global switch and the user's permission, and the
// user must not have safe mode on
export const canViewAdult = (user?: User | null): boolean =>
  getSettings().main.enableAdult &&
  !!user?.hasPermission(Permission.ADULT) &&
  !user.settings?.adultSafeMode;

export const isAdultMedia = (
  media: Pick<Media, 'mediaType' | 'isAdult'>
): boolean =>
  media.mediaType === MediaType.SCENE ||
  media.mediaType === MediaType.XXX_MOVIE ||
  media.isAdult;
