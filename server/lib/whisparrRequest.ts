import type { WhisparrItem } from '@server/api/servarr/whisparr';
import WhisparrAPI from '@server/api/servarr/whisparr';
import {
  isAdultMediaType,
  MediaRequestStatus,
  MediaStatus,
} from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import { MediaRequest } from '@server/entity/MediaRequest';
import { Notification } from '@server/lib/notifications';
import {
  getWhisparrServer,
  lookupWhisparrItem,
} from '@server/lib/whisparrMedia';
import logger from '@server/logger';
import { sanitizeDisplayName } from '@server/utils/sanitizeDisplayName';
import { isEqual } from 'lodash';
import type { EntityManager } from 'typeorm';

// The request's own transaction, when it is still open, saves the failure
const markFailed = async (
  entity: MediaRequest,
  media: Media,
  manager?: EntityManager
) => {
  try {
    if (entity.status !== MediaRequestStatus.FAILED) {
      entity.status = MediaRequestStatus.FAILED;
      await (
        manager?.getRepository(MediaRequest) ?? getRepository(MediaRequest)
      ).save(entity);
    }
  } catch (e) {
    logger.error('Failed to mark request as FAILED', {
      label: 'Media Request',
      requestId: entity.id,
      errorMessage: e instanceof Error ? e.message : String(e),
    });
  }

  MediaRequest.sendNotification(entity, media, Notification.MEDIA_FAILED);
};

// Mirrors sendToRadarr for scenes and adult movies
export const sendToWhisparr = async (
  entity: MediaRequest,
  manager: EntityManager
): Promise<void> => {
  if (
    entity.status !== MediaRequestStatus.APPROVED ||
    !isAdultMediaType(entity.media.mediaType)
  ) {
    return;
  }

  const mediaRepository = manager.getRepository(Media);
  const media = await mediaRepository.findOne({
    where: { id: entity.media.id },
  });

  if (!media) {
    logger.error('Media data not found', {
      label: 'Media Request',
      requestId: entity.id,
      mediaId: entity.media.id,
    });
    return;
  }

  const server = getWhisparrServer(entity.is4k, entity.serverId);

  if (!server) {
    logger.warn(
      `There is no default ${entity.is4k ? '4K ' : ''}Whisparr server configured. Did you set any of your Whisparr servers as default?`,
      { label: 'Media Request', requestId: entity.id, mediaId: media.id }
    );
    return;
  }

  if (media[entity.is4k ? 'status4k' : 'status'] === MediaStatus.AVAILABLE) {
    logger.warn('Media already exists, marking request as COMPLETED', {
      label: 'Media Request',
      requestId: entity.id,
      mediaId: media.id,
    });
    entity.status = MediaRequestStatus.COMPLETED;
    await manager.getRepository(MediaRequest).save(entity);
    return;
  }

  const rootFolderPath =
    entity.rootFolder && entity.rootFolder !== ''
      ? entity.rootFolder
      : server.activeDirectory;
  const qualityProfileId = entity.profileId || server.activeProfileId;
  let tags =
    entity.tags && !isEqual(entity.tags, server.tags)
      ? [...entity.tags]
      : [...(server.tags ?? [])];

  const whisparr = WhisparrAPI.forServer(server);

  let item: WhisparrItem;

  try {
    item = await lookupWhisparrItem(whisparr, media);

    if (server.tagRequests) {
      const label = `${entity.requestedBy.id}-${sanitizeDisplayName(
        entity.requestedBy.displayName
      )}`;
      const existingTags = await whisparr.getTags();
      const userTag =
        existingTags.find((tag) =>
          tag.label.startsWith(`${entity.requestedBy.id}-`)
        ) ?? (await whisparr.createTag({ label }));

      if (userTag.id && !tags.includes(userTag.id)) {
        tags = [...tags, userTag.id];
      }
    }
  } catch (e) {
    logger.warn(
      'Failed to send request to Whisparr due to connection or configuration error, marking status as FAILED',
      {
        label: 'Media Request',
        requestId: entity.id,
        mediaId: media.id,
        errorMessage: e.message,
      }
    );
    await markFailed(entity, media, manager);
    return;
  }

  // Runs detached so the request is not held up by Whisparr
  whisparr
    .addItem(item, {
      qualityProfileId,
      rootFolderPath,
      tags,
      searchNow: !server.preventSearch,
    })
    .then(async (added) => {
      const latest = await getRepository(Media).findOne({
        where: { id: media.id },
      });

      if (!latest) {
        throw new Error('Media data not found');
      }

      latest[entity.is4k ? 'externalServiceId4k' : 'externalServiceId'] =
        added.id ?? null;
      latest[entity.is4k ? 'externalServiceSlug4k' : 'externalServiceSlug'] =
        added.titleSlug;
      latest[entity.is4k ? 'serviceId4k' : 'serviceId'] = server.id;
      await getRepository(Media).save(latest);
    })
    .catch(async (e) => {
      logger.warn(
        'Something went wrong sending request to Whisparr, marking status as FAILED',
        {
          label: 'Media Request',
          requestId: entity.id,
          mediaId: media.id,
          errorMessage: e.message,
        }
      );
      await markFailed(entity, media);
    });

  logger.info('Sent request to Whisparr', {
    label: 'Media Request',
    requestId: entity.id,
    mediaId: media.id,
  });
};
