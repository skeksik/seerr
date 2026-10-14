import { MediaType } from '@server/constants/media';
import type { WhisparrSettings } from '@server/lib/settings';
import { getSettings } from '@server/lib/settings';

// Scenes always go to Whisparr; movies only when flagged adult at request time
export const isWhisparrMedia = (media: {
  mediaType: MediaType;
  isAdult?: boolean;
}): boolean =>
  media.mediaType === MediaType.SCENE ||
  (media.mediaType === MediaType.MOVIE && !!media.isAdult);

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
