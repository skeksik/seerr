import { stashImageUrl } from '@app/utils/stashImage';

type AdultMediaType = 'scene' | 'adultmovie';
type CreditType = 'performer' | 'studio';

// Performer and studio pages: StashDB's under scenes, ThePornDB's under
// adult movies
export const creditHref = (
  mediaType: AdultMediaType,
  type: CreditType,
  id: string | number
): string =>
  `/discover/${mediaType === 'scene' ? 'scenes' : 'adultmovies'}/${type}/${id}`;

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
  href: string;
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
    href: creditHref(mediaType, 'performer', performer.tpdbId ?? performer.id),
    image: src ? { src, type: imageType } : undefined,
  };
};
