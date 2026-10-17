import type { WhisparrItem } from '@server/api/servarr/whisparr';
import WhisparrAPI from '@server/api/servarr/whisparr';
import { MediaType } from '@server/constants/media';
import type { WhisparrSettings } from '@server/lib/settings';
import { getSettings } from '@server/lib/settings';

type WhisparrMedia = {
  mediaType: MediaType;
  stashId?: string | null;
  tpdbId?: string | null;
};

// Finds the Whisparr item for a scene or adult movie
export const lookupWhisparrItem = (
  whisparr: WhisparrAPI,
  media: WhisparrMedia
): Promise<WhisparrItem> => {
  if (media.mediaType === MediaType.SCENE && media.stashId) {
    return whisparr.lookupScene(media.stashId);
  }
  if (media.mediaType === MediaType.ADULT_MOVIE && media.tpdbId) {
    return whisparr.lookupTpdbMovie(media.tpdbId);
  }
  return Promise.reject(
    new Error(`No Whisparr id for ${media.mediaType} media`)
  );
};

// Whether a Whisparr item is this title, as a library id may have been
// reused or point elsewhere
const isItemOf = (item: WhisparrItem, media: WhisparrMedia): boolean =>
  media.mediaType === MediaType.SCENE
    ? !!media.stashId && item.stashId === media.stashId
    : media.mediaType === MediaType.ADULT_MOVIE &&
      !!media.tpdbId &&
      item.tpdbId === media.tpdbId;

// The library item by its known id, or else by looking the title up
export const findWhisparrItem = async (
  whisparr: WhisparrAPI,
  media: WhisparrMedia,
  externalServiceId?: number | null
): Promise<WhisparrItem> => {
  if (externalServiceId != null) {
    try {
      const item = await whisparr.getItem({ id: externalServiceId });
      if (isItemOf(item, media)) {
        return item;
      }
    } catch (e) {
      if (e.cause?.response?.status !== 404) {
        throw e;
      }
    }
  }

  return lookupWhisparrItem(whisparr, media);
};

// A page on the Whisparr web app, at its external address when one is set
export const whisparrServiceUrl = (
  server: WhisparrSettings,
  path: string
): string =>
  server.externalUrl
    ? `${server.externalUrl.replace(/\/+$/, '')}${path}`
    : WhisparrAPI.buildUrl(server, path);

export const getWhisparrServer = (
  is4k: boolean,
  serverId?: number | null
): WhisparrSettings | undefined => {
  const { whisparr } = getSettings();

  if (serverId !== undefined && serverId !== null && serverId >= 0) {
    const override = whisparr.find((server) => server.id === serverId);

    if (override) {
      return override;
    }
  }

  return whisparr.find((server) => server.isDefault && server.is4k === is4k);
};

// Availability check counterpart of AvailabilitySync.mediaExistsInRadarr:
// an item that is another title counts as gone. Errors other than 404 count
// as present so an outage never deletes media.
export const mediaExistsInWhisparr = async (
  media: WhisparrMedia & {
    serviceId?: number | null;
    serviceId4k?: number | null;
    externalServiceId?: number | null;
    externalServiceId4k?: number | null;
  },
  is4k: boolean
): Promise<boolean> => {
  const serviceId = is4k ? media.serviceId4k : media.serviceId;
  const externalId = is4k ? media.externalServiceId4k : media.externalServiceId;
  const server = getSettings().whisparr.find((s) => s.id === serviceId);

  if (!server || externalId == null) {
    return false;
  }

  try {
    const item = await WhisparrAPI.forServer(server).getItem({
      id: externalId,
    });
    return isItemOf(item, media) && item.hasFile;
  } catch (e) {
    return e.cause?.response?.status !== 404;
  }
};
