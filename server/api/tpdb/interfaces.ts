// Subset of the ThePornDB REST API used by Seerr.
// See https://api.theporndb.net/docs

export interface TpdbImageSizes {
  full?: string | null;
  large?: string | null;
  medium?: string | null;
  small?: string | null;
}

export interface TpdbSiteSummary {
  id: number;
  uuid: string;
  name: string;
  // The site's slug, as in its ThePornDB address
  short_name?: string | null;
  network?: {
    id: number;
    uuid: string;
    name: string;
    short_name?: string | null;
  } | null;
  // Movies name their site's parent and network by id only
  parent_id?: number | null;
  network_id?: number | null;
}

// Profile links by site name, e.g. { StashDB: 'https://stashdb.org/…' }
export interface TpdbPerformerExtras {
  links?: Record<string, string> | null;
}

export interface TpdbPerformerSummary {
  id: string;
  _id: number;
  // As in the performer's ThePornDB address, like the id
  slug?: string | null;
  name: string;
  image?: string | null;
  extras?: TpdbPerformerExtras | null;
  // The performer across all sites; site performers point to it
  parent?: {
    id: string;
    _id?: number;
    slug?: string | null;
    name: string;
    image?: string | null;
    extras?: TpdbPerformerExtras | null;
  } | null;
}

export interface TpdbTag {
  id: number;
  uuid?: string;
  name: string;
}

export interface TpdbMovie {
  id: string;
  _id: number;
  title: string;
  type: string;
  description?: string | null;
  date?: string | null;
  duration?: number | null;
  url?: string | null;
  image?: string | null;
  back_image?: string | null;
  posters?: TpdbImageSizes | null;
  background?: TpdbImageSizes | null;
  // The studio's trailer, as they host it: mostly MP4 files, some HLS
  // playlists and links signed to expire
  trailer?: string | null;
  site?: TpdbSiteSummary | null;
  performers?: TpdbPerformerSummary[];
  tags?: TpdbTag[];
  // Movie details only: the scenes it is cut into
  scenes?: {
    id: string;
    title?: string | null;
    url?: string | null;
    hashes?: { hash: string; type: string }[] | null;
  }[];
  directors?: { id: number; name: string }[];
}

export interface TpdbPage<T> {
  data: T[];
  meta: {
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
  };
}

export type TpdbMovieSort =
  | 'recently_released'
  | 'former_released'
  | 'recently_created'
  | 'former_created'
  | 'duration_desc'
  | 'duration_asc'
  | 'most_relevant';
