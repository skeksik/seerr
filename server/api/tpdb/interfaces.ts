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
  url?: string | null;
  logo?: string | null;
  network?: { id: number; uuid: string; name: string } | null;
  parent?: { id: number; uuid: string; name: string } | null;
}

export interface TpdbPerformerSummary {
  id: string;
  _id: number;
  name: string;
  image?: string | null;
  // The performer across all sites; site performers point to it
  parent?: {
    id: string;
    _id?: number;
    name: string;
    image?: string | null;
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
  site?: TpdbSiteSummary | null;
  performers?: TpdbPerformerSummary[];
  tags?: TpdbTag[];
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
  | 'duration_desc'
  | 'duration_asc'
  | 'most_relevant';
