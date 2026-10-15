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
  // Movies name their site's parent and network by id only
  parent_id?: number | null;
  network_id?: number | null;
}

// Profile links by site name, e.g. { StashDB: 'https://stashdb.org/…' }
export interface TpdbPerformerExtras {
  gender?: string | null;
  links?: Record<string, string> | null;
  birthday?: string | null;
  birthplace?: string | null;
  career_start_year?: number | null;
  career_end_year?: number | null;
}

export interface TpdbPerformerSummary {
  id: string;
  _id: number;
  name: string;
  // Only on the performer endpoint
  bio?: string | null;
  aliases?: string[] | null;
  image?: string | null;
  extras?: TpdbPerformerExtras | null;
  // Movie performers carry theirs singular
  extra?: TpdbPerformerExtras | null;
  // The performer across all sites; site performers point to it
  parent?: {
    id: string;
    _id?: number;
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
