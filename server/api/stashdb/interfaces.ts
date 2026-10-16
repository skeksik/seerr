// Subset of the stash-box GraphQL schema used by Seerr.
// See https://github.com/stashapp/stash-box/tree/master/graphql/schema

export interface StashDbGraphqlResponse<T> {
  data?: T;
  errors?: { message: string; path?: string[] }[];
}

// Only the url and width are asked for
export interface StashDbImage {
  id?: string;
  url: string;
  width: number;
  height?: number;
}

export interface StashDbUrl {
  url: string;
  // The site's favicon, served by stash-box
  site: { name: string; icon?: string | null };
}

export interface StashDbSite {
  name: string;
  url?: string | null;
  icon?: string | null;
}

// The studio of a ranked scene, with its network up to two levels up
export interface StashDbSceneStudio extends StashDbStudioRef {
  parent?: (StashDbStudioRef & { parent?: StashDbStudioRef | null }) | null;
}

export interface StashDbStudioRef {
  id: string;
  name: string;
  images: StashDbImage[];
}

export interface StashDbStudioSummary {
  id: string;
  name: string;
  parent?: { id: string; name: string } | null;
}

export interface StashDbStudio extends StashDbStudioSummary {
  aliases: string[];
  urls: StashDbUrl[];
  images: StashDbImage[];
  // The studios under a network
  child_studios?: { id: string; name: string; images: StashDbImage[] }[];
}

export type StashDbGender =
  | 'MALE'
  | 'FEMALE'
  | 'TRANSGENDER_MALE'
  | 'TRANSGENDER_FEMALE'
  | 'INTERSEX'
  | 'NON_BINARY';

export interface StashDbPerformerSummary {
  id: string;
  name: string;
  disambiguation?: string | null;
  gender?: StashDbGender | null;
  images: StashDbImage[];
}

export interface StashDbPerformer extends StashDbPerformerSummary {
  aliases: string[];
  birth_date?: string | null;
  career_start_year?: number | null;
  career_end_year?: number | null;
  country?: string | null;
  scene_count: number;
  urls: StashDbUrl[];
}

export interface StashDbTag {
  id: string;
  name: string;
  description?: string | null;
}

export interface StashDbSceneSummary {
  id: string;
  title?: string | null;
  details?: string | null;
  release_date?: string | null;
  duration?: number | null;
  images: StashDbImage[];
  studio?: StashDbStudioSummary | null;
  performers: { as?: string | null; performer: StashDbPerformerSummary }[];
  // Ids only in lists, for ranking by shared tags and orientation
  tags?: { id: string }[];
}

export interface StashDbScene extends StashDbSceneSummary {
  production_date?: string | null;
  code?: string | null;
  director?: string | null;
  deleted: boolean;
  urls: StashDbUrl[];
  tags: StashDbTag[];
}

export interface StashDbSceneList {
  count: number;
  scenes: StashDbSceneSummary[];
}

export type StashDbSceneSort =
  | 'TITLE'
  | 'DATE'
  | 'DURATION'
  | 'TRENDING'
  | 'POPULARITY'
  | 'CREATED_AT'
  | 'UPDATED_AT';

export interface StashDbVersion {
  version: string;
}
