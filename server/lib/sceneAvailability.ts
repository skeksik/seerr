import StashAPI from '@server/api/stash';
import { MediaStatus } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import { mediaExistsInWhisparr } from '@server/lib/whisparrMedia';
import logger from '@server/logger';

// A scene stays available while Stash still has it or Whisparr still has its
// file. Lookup failures count as present so an outage never deletes media.
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

  const inWhisparr = !inStash && (await mediaExistsInWhisparr(media, false));
  let changed = false;

  if (!inStash && media.stashMediaId) {
    media.stashMediaId = null;
    changed = true;
  }

  if (!inStash && !inWhisparr && media.status === MediaStatus.AVAILABLE) {
    media.status = MediaStatus.DELETED;
    changed = true;
    logger.info(`Scene ${media.stashId} is no longer in Stash or Whisparr`, {
      label: 'AvailabilitySync',
      mediaId: media.id,
    });
  }

  if (changed) {
    await getRepository(Media).save(media);
  }
};
