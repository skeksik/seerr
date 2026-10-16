import { stashImageUrl } from '@app/utils/stashImage';

type AdultMediaType = 'scene' | 'adultmovie';
type CreditType = 'performer' | 'studio';

// Performer and studio pages, like /person/[id]: /performer/[id] and
// /studio/[id] serve both sources. StashDB ids are UUIDs and ThePornDB's
// numbers, so they never collide. ThePornDB performers and studios linked to
// StashDB ones have StashDB's page only, so links pass the StashDB id when
// there is one
export const creditHref = (type: CreditType, id: string | number): string =>
  `/${type}/${id}`;

// ThePornDB's numeric ids, as opposed to StashDB's UUIDs
export const isTpdbCreditId = (id: string | number | undefined): boolean =>
  id !== undefined && /^\d+$/.test(String(id));

// A performer's or studio's titles, newest first. Their pages and the
// title pages' studio banner share these, so they share the SWR cache
export const creditTitlesUrl = (
  mediaType: AdultMediaType,
  type: CreditType,
  id: string | number
): string =>
  mediaType === 'scene'
    ? `/api/v1/scene/discover?page=1&sort=date&${type}=${id}`
    : `/api/v1/adultmovie/discover?page=1&sort=released&${type}=${id}`;

// The browse tab filtered to them, which sorts
export const creditBrowseHref = (
  mediaType: AdultMediaType,
  type: CreditType,
  id: string | number
): string =>
  mediaType === 'scene'
    ? `/discover/scenes?sort=date&${type}=${id}`
    : `/discover/adultmovies?${type}=${id}`;

// PersonCard's props for a performer
export interface SliderPerformer {
  personId: string;
  name: string;
  subName?: string;
  href: string | null;
  image?: { src: string; type: 'stashdb' | 'tpdb' };
}

// Scene, adult movie and search result performers, which differ a little
interface AdultPerformer {
  id: string;
  name: string;
  imageUrl?: string;
  // Credited as, on scenes
  as?: string;
  disambiguation?: string;
  // ThePornDB's numeric id, which its pages take
  tpdbId?: number;
  // The StashDB performer a ThePornDB one is linked to, which has its page
  stashDbId?: string;
  // StashDB performers in search results can carry ThePornDB's image
  imageType?: 'tpdb';
}

// A performer of the given kind of title, as cast rows and lists show them
export const toSliderPerformer = (
  mediaType: AdultMediaType,
  performer: AdultPerformer
): SliderPerformer => {
  const imageType =
    performer.imageType ?? (mediaType === 'scene' ? 'stashdb' : 'tpdb');
  const src =
    imageType === 'stashdb'
      ? stashImageUrl(performer.imageUrl, 300)
      : performer.imageUrl;

  return {
    personId: performer.id,
    name: performer.name,
    subName: performer.as ?? performer.disambiguation,
    // ThePornDB performers have a page by their numeric id only
    href:
      mediaType === 'adultmovie' && !performer.stashDbId && !performer.tpdbId
        ? null
        : creditHref(
            'performer',
            performer.stashDbId ?? performer.tpdbId ?? performer.id
          ),
    image: src ? { src, type: imageType } : undefined,
  };
};
