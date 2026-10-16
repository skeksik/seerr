import StashAPI from '@server/api/stash';
import { MediaRequestStatus, MediaStatus } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import MediaRequest from '@server/entity/MediaRequest';
import { mediaExistsInWhisparr } from '@server/lib/whisparrMedia';
import logger from '@server/logger';

// Marks one version deleted like AvailabilitySync.mediaUpdater: the Whisparr
// link stays while an approved request still waits for it
const markDeleted = async (media: Media, is4k: boolean): Promise<void> => {
  const processing = await getRepository(MediaRequest).exist({
    where: {
      media: { id: media.id },
      is4k,
      status: MediaRequestStatus.APPROVED,
    },
  });

  media[is4k ? 'status4k' : 'status'] = MediaStatus.DELETED;

  if (!processing) {
    media[is4k ? 'serviceId4k' : 'serviceId'] = null;
    media[is4k ? 'externalServiceId4k' : 'externalServiceId'] = null;
    media[is4k ? 'externalServiceSlug4k' : 'externalServiceSlug'] = null;
  }

  logger.info(
    `The ${is4k ? '4K' : 'non-4K'} ${media.mediaType} ${
      media.stashId ?? media.tpdbId
    } is no longer available`,
    { label: 'AvailabilitySync', mediaId: media.id }
  );
};

// A scene stays available while Stash still has it or Whisparr still has its
// file; adult movies only live in Whisparr. Stash is the companion library of
// the non-4K version, while the 4K version is checked on the 4K Whisparr
// server alone. Lookup failures count as present so an outage never deletes
// media.
export const syncSceneAvailability = async (media: Media): Promise<void> => {
  let inStash = false;

  if (media.stashMediaId && StashAPI.isConfigured()) {
    try {
      inStash = !!(await StashAPI.fromSettings().getScene(media.stashMediaId));
    } catch (e) {
      logger.debug('Could not check scene in Stash, skipping', {
        label: 'AvailabilitySync',
        mediaId: media.id,
        errorMessage: e.message,
      });
      return;
    }
  }

  let changed = false;

  if (!inStash && media.stashMediaId) {
    media.stashMediaId = null;
    changed = true;
  }

  if (
    media.status === MediaStatus.AVAILABLE &&
    !inStash &&
    !(await mediaExistsInWhisparr(media, false))
  ) {
    await markDeleted(media, false);
    changed = true;
  }

  if (
    media.status4k === MediaStatus.AVAILABLE &&
    !(await mediaExistsInWhisparr(media, true))
  ) {
    await markDeleted(media, true);
    changed = true;
  }

  if (changed) {
    await getRepository(Media).save(media);
  }
};
