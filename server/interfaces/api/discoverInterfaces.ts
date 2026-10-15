export interface GenreSliderItem {
  id: number;
  name: string;
  backdrops: string[];
}

export interface WatchlistItem {
  id: number;
  ratingKey: string;
  // Null for scenes and adult movies, which carry an externalId
  tmdbId: number | null;
  externalId?: string | null;
  mediaType: 'movie' | 'tv' | 'scene' | 'adultmovie';
  title: string;
}

export interface WatchlistResponse {
  page: number;
  totalPages: number;
  totalResults: number;
  results: WatchlistItem[];
}
