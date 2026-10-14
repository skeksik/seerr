import type { WhisparrItem } from '@server/api/servarr/whisparr';
import WhisparrAPI from '@server/api/servarr/whisparr';
import { MediaType } from '@server/constants/media';
import type { WhisparrSettings } from '@server/lib/settings';
import { getSettings } from '@server/lib/settings';

// Scenes always go to Whisparr; movies only when flagged adult at request time
export const isWhisparrMedia = (media: {
  mediaType: MediaType;
  isAdult?: boolean;
}): boolean =>
  media.mediaType === MediaType.SCENE ||
  media.mediaType === MediaType.XXX_MOVIE ||
  (media.mediaType === MediaType.MOVIE && !!media.isAdult);

// Finds the Whisparr item for a scene, XXX movie or adult TMDB movie
export const lookupWhisparrItem = (
  whisparr: WhisparrAPI,
  media: {
    mediaType: MediaType;
    tmdbId: number | null;
    stashId?: string | null;
    tpdbId?: string | null;
  }
): Promise<WhisparrItem> =>
  media.mediaType === MediaType.SCENE && media.stashId
    ? whisparr.lookupScene(media.stashId)
    : media.mediaType === MediaType.XXX_MOVIE && media.tpdbId
      ? whisparr.lookupTpdbMovie(media.tpdbId)
      : whisparr.lookupMovie(media.tmdbId ?? 0);

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

// Availability check counterpart of AvailabilitySync.mediaExistsInRadarr.
// Errors other than 404 count as present so an outage never deletes media.
export const mediaExistsInWhisparr = async (
  media: {
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

  const whisparr = new WhisparrAPI({
    apiKey: server.apiKey,
    url: WhisparrAPI.buildUrl(server, '/api/v3'),
  });

  try {
    const item = await whisparr.getItem({ id: externalId });
    return item.hasFile;
  } catch (e) {
    return !e.message.includes('404');
  }
};
