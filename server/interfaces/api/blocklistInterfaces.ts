import type { User } from '@server/entity/User';
import type { PaginatedResponse } from '@server/interfaces/api/common';

export interface BlocklistItem {
  // Null for scenes and XXX movies, which carry an externalId
  tmdbId: number | null;
  externalId?: string | null;
  mediaType: 'movie' | 'tv' | 'scene' | 'xxxmovie';
  title?: string;
  createdAt?: Date;
  user?: User;
  blocklistedTags?: string;
}

export interface BlocklistResultsResponse extends PaginatedResponse {
  results: BlocklistItem[];
}
