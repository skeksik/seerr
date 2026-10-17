import type { AdultMediaType } from '@server/constants/media';
import { isAdultMediaType, MediaType } from '@server/constants/media';
import type { BlocklistItem } from '@server/interfaces/api/blocklistInterfaces';
import type { MainSettings } from '@server/lib/settings';
import { getSettings } from '@server/lib/settings';

export interface AdultBlocklistedTag {
  // StashDB tag UUID or ThePornDB tag id
  id: string;
  name: string;
}

// The StashDB or ThePornDB tags whose titles the Process Blocklisted Tags
// job blocklists, with the names saved next to them
export const adultBlocklistedTags = (
  mediaType: AdultMediaType,
  main: MainSettings = getSettings().main
): AdultBlocklistedTag[] => {
  const [ids, names] =
    mediaType === MediaType.SCENE
      ? [main.blocklistedSceneTags, main.blocklistedSceneTagNames]
      : [main.blocklistedAdultMovieTags, main.blocklistedAdultMovieTagNames];
  const nameList = (names ?? '').split('|');

  return (ids ?? '')
    .split(',')
    .map((id, index) => ({ id: id.trim(), name: nameList[index] ?? '' }))
    .filter((tag) => tag.id !== '')
    .map((tag) => ({ ...tag, name: tag.name || tag.id }));
};

// A blocklist entry with the names of the tags it was blocklisted for, for
// scenes and adult movies; the client names TMDB keywords itself
export const withBlocklistedTagNames = <T extends BlocklistItem>(
  item: T
): T & Pick<BlocklistItem, 'blocklistedTagNames'> => {
  const mediaType = item.mediaType as MediaType;

  if (!item.blocklistedTags || !isAdultMediaType(mediaType)) {
    return item;
  }

  const names = new Map(
    adultBlocklistedTags(mediaType).map((tag) => [tag.id, tag.name])
  );

  return Object.assign(item, {
    blocklistedTagNames: item.blocklistedTags
      .slice(1, -1)
      .split(',')
      .map((id) => names.get(id) ?? `[Invalid: ${id}]`),
  });
};
