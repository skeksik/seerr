import { stashImageUrl } from '@app/utils/stashImage';

type AdultMediaType = 'scene' | 'adultmovie';
type CreditType = 'performer' | 'studio';

// Performer and studio pages, like /person/[id]: /performer/[id] and
// /studio/[id] serve StashDB's performers and studios, by their UUIDs.
// ThePornDB's have no page of their own: linked to a StashDB one, by a link
// on either side, they share its page, so links pass the StashDB id
export const creditHref = (type: CreditType, id: string | number): string =>
  `/${type}/${id}`;

// A performer's or studio's titles, newest first, as an endpoint and its
// params, which useDiscover pages through
export const creditTitlesQuery = (
  mediaType: AdultMediaType,
  type: CreditType,
  id: string | number
): { endpoint: string; params: Record<string, string> } => ({
  endpoint: `/api/v1/${mediaType}/discover`,
  params: {
    sort: mediaType === 'scene' ? 'date' : 'released',
    [type]: String(id),
  },
});

// Their first page. Their pages and the title pages' studio banner share
// it, so they share the SWR cache
export const creditTitlesUrl = (
  mediaType: AdultMediaType,
  type: CreditType,
  id: string | number
): string => {
  const { endpoint, params } = creditTitlesQuery(mediaType, type, id);

  return `${endpoint}?${new URLSearchParams({ page: '1', ...params })}`;
};

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
  // The StashDB performer a ThePornDB one is linked to, which has the page
  stashDbId?: string;
}

// A performer of the given kind of title, as cast rows and lists show them.
// Scene and search result performers are StashDB's; adult movie performers
// are ThePornDB's, with a page only when linked to a StashDB one
export const toSliderPerformer = (
  mediaType: AdultMediaType,
  performer: AdultPerformer
): SliderPerformer => {
  const isScene = mediaType === 'scene';
  const src = isScene
    ? stashImageUrl(performer.imageUrl, 300)
    : performer.imageUrl;
  const stashDbId = isScene ? performer.id : performer.stashDbId;

  return {
    personId: performer.id,
    name: performer.name,
    subName: performer.as ?? performer.disambiguation,
    href: stashDbId ? creditHref('performer', stashDbId) : null,
    image: src ? { src, type: isScene ? 'stashdb' : 'tpdb' } : undefined,
  };
};
