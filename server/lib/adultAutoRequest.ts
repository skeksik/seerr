import type { AdultMediaType } from '@server/constants/media';
import { MediaStatus, MediaType } from '@server/constants/media';
import {
  BlocklistedMediaError,
  DuplicateMediaRequestError,
  MediaRequest,
  QuotaRestrictedError,
  RequestPermissionError,
} from '@server/entity/MediaRequest';
import type { User } from '@server/entity/User';
import type { Watchlist } from '@server/entity/Watchlist';
import { mediaPermissions } from '@server/lib/permissions';
import logger from '@server/logger';

// Scenes and adult movies live on Seerr's own watchlist, so adding one is
// what a Plex watchlist sync is for movies: users with Auto-Request get a
// non-4K request on the default Whisparr server. Failures, like a used up
// quota or an earlier request, never fail the watchlist add.
export const autoRequestWatchlistItem = async (
  watchlist: Watchlist,
  user: User
): Promise<MediaRequest | undefined> => {
  const mediaType = watchlist.mediaType as AdultMediaType;
  const status = watchlist.media?.status ?? MediaStatus.UNKNOWN;

  if (
    !watchlist.externalId ||
    !user.hasPermission(mediaPermissions('autoRequest', mediaType), {
      type: 'or',
    }) ||
    // Like the Plex watchlist sync, only titles nobody has
    (status !== MediaStatus.UNKNOWN && status !== MediaStatus.DELETED)
  ) {
    return undefined;
  }

  try {
    const request = await MediaRequest.request(
      mediaType === MediaType.SCENE
        ? { mediaType, stashId: watchlist.externalId, is4k: false }
        : { mediaType, tpdbId: watchlist.externalId, is4k: false },
      user,
      { isAutoRequest: true }
    );

    logger.info("Created media request from user's watchlist", {
      label: 'Watchlist',
      userId: user.id,
      mediaType,
      externalId: watchlist.externalId,
    });

    return request;
  } catch (e) {
    const expected =
      e instanceof RequestPermissionError ||
      e instanceof DuplicateMediaRequestError ||
      e instanceof QuotaRestrictedError ||
      e instanceof BlocklistedMediaError;

    logger[expected ? 'debug' : 'error'](
      'Failed to create media request from watchlist',
      {
        label: 'Watchlist',
        userId: user.id,
        mediaType,
        externalId: watchlist.externalId,
        errorMessage: e instanceof Error ? e.message : String(e),
      }
    );
    return undefined;
  }
};
