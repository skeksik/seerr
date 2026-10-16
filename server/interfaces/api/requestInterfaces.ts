import type { MediaType, TmdbMediaType } from '@server/constants/media';
import type { MediaRequest } from '@server/entity/MediaRequest';
import type { NonFunctionProperties, PaginatedResponse } from './common';

export interface RequestResultsResponse extends PaginatedResponse {
  results: (NonFunctionProperties<MediaRequest> & {
    profileName?: string;
    canRemove?: boolean;
  })[];
  serviceErrors: {
    radarr: { id: number; name: string }[];
    sonarr: { id: number; name: string }[];
    whisparr: { id: number; name: string }[];
  };
}

export type MediaRequestBody = {
  mediaType: TmdbMediaType;
  mediaId: number;
  tvdbId?: number;
  seasons?: number[] | 'all';
  is4k?: boolean;
  serverId?: number;
  profileId?: number;
  profileName?: string;
  rootFolder?: string;
  languageProfileId?: number;
  userId?: number;
  tags?: number[];
  ignoreQuota?: boolean;
};

// Scenes and adult movies have no TMDB id or seasons
type AdultRequestOptions = {
  is4k?: boolean;
  serverId?: number;
  profileId?: number;
  rootFolder?: string;
  userId?: number;
  tags?: number[];
  ignoreQuota?: boolean;
};

export type SceneRequestBody = AdultRequestOptions & {
  mediaType: MediaType.SCENE;
  stashId: string;
};

export type AdultMovieRequestBody = AdultRequestOptions & {
  mediaType: MediaType.ADULT_MOVIE;
  tpdbId: string;
};

export type AdultRequestBody = SceneRequestBody | AdultMovieRequestBody;
