import type DiscoverSlider from '@server/entity/DiscoverSlider';

export enum DiscoverSliderType {
  RECENTLY_ADDED = 1,
  RECENT_REQUESTS,
  PLEX_WATCHLIST,
  TRENDING,
  POPULAR_MOVIES,
  MOVIE_GENRES,
  UPCOMING_MOVIES,
  STUDIOS,
  POPULAR_TV,
  TV_GENRES,
  UPCOMING_TV,
  NETWORKS,
  TMDB_MOVIE_KEYWORD,
  TMDB_MOVIE_GENRE,
  TMDB_TV_KEYWORD,
  TMDB_TV_GENRE,
  TMDB_SEARCH,
  TMDB_STUDIO,
  TMDB_NETWORK,
  TMDB_MOVIE_STREAMING_SERVICES,
  TMDB_TV_STREAMING_SERVICES,
  TRENDING_SCENES,
  POPULAR_SCENES,
  NEW_SCENES,
  UPCOMING_SCENES,
  ADULT_STUDIOS,
  ADULT_NETWORKS,
  NEW_ADULT_MOVIES,
  // Retired with the TMDB source for adult movies; kept so the types after it
  // keep their stored numbers
  POPULAR_ADULT_MOVIES,
  UPCOMING_ADULT_MOVIES,
  // Custom rows admins create, like the TMDB keyword ones
  SCENE_TAG,
  SCENE_PERFORMER,
  SCENE_STUDIO,
  SCENE_SEARCH,
  ADULT_MOVIE_TAG,
  ADULT_MOVIE_PERFORMER,
  ADULT_MOVIE_STUDIO,
  ADULT_MOVIE_SEARCH,
}

// Removed from existing installs at startup
export const retiredSliderTypes = [DiscoverSliderType.POPULAR_ADULT_MOVIES];

// The built-in adult rows, only shown to users with adult access; this is
// also their default order
export const adultSliderTypes = [
  DiscoverSliderType.TRENDING_SCENES,
  DiscoverSliderType.POPULAR_SCENES,
  DiscoverSliderType.NEW_SCENES,
  DiscoverSliderType.UPCOMING_SCENES,
  DiscoverSliderType.NEW_ADULT_MOVIES,
  DiscoverSliderType.UPCOMING_ADULT_MOVIES,
  DiscoverSliderType.ADULT_STUDIOS,
  DiscoverSliderType.ADULT_NETWORKS,
];

// The adult rows admins create themselves, gated the same way but not
// bootstrapped
export const adultCustomSliderTypes = [
  DiscoverSliderType.SCENE_TAG,
  DiscoverSliderType.SCENE_PERFORMER,
  DiscoverSliderType.SCENE_STUDIO,
  DiscoverSliderType.SCENE_SEARCH,
  DiscoverSliderType.ADULT_MOVIE_TAG,
  DiscoverSliderType.ADULT_MOVIE_PERFORMER,
  DiscoverSliderType.ADULT_MOVIE_STUDIO,
  DiscoverSliderType.ADULT_MOVIE_SEARCH,
];

export const isAdultSliderType = (type: DiscoverSliderType): boolean =>
  adultSliderTypes.includes(type) || adultCustomSliderTypes.includes(type);

export const defaultSliders: Partial<DiscoverSlider>[] = [
  {
    type: DiscoverSliderType.RECENTLY_ADDED,
    enabled: true,
    isBuiltIn: true,
    order: 0,
  },
  {
    type: DiscoverSliderType.RECENT_REQUESTS,
    enabled: true,
    isBuiltIn: true,
    order: 1,
  },
  {
    type: DiscoverSliderType.PLEX_WATCHLIST,
    enabled: true,
    isBuiltIn: true,
    order: 2,
  },
  {
    type: DiscoverSliderType.TRENDING,
    enabled: true,
    isBuiltIn: true,
    order: 3,
  },
  {
    type: DiscoverSliderType.POPULAR_MOVIES,
    enabled: true,
    isBuiltIn: true,
    order: 4,
  },
  {
    type: DiscoverSliderType.MOVIE_GENRES,
    enabled: true,
    isBuiltIn: true,
    order: 5,
  },
  {
    type: DiscoverSliderType.UPCOMING_MOVIES,
    enabled: true,
    isBuiltIn: true,
    order: 6,
  },
  {
    type: DiscoverSliderType.STUDIOS,
    enabled: true,
    isBuiltIn: true,
    order: 7,
  },
  {
    type: DiscoverSliderType.POPULAR_TV,
    enabled: true,
    isBuiltIn: true,
    order: 8,
  },
  {
    type: DiscoverSliderType.TV_GENRES,
    enabled: true,
    isBuiltIn: true,
    order: 9,
  },
  {
    type: DiscoverSliderType.UPCOMING_TV,
    enabled: true,
    isBuiltIn: true,
    order: 10,
  },
  {
    type: DiscoverSliderType.NETWORKS,
    enabled: true,
    isBuiltIn: true,
    order: 11,
  },
  // Adult rows go last; existing installs get them appended
  ...adultSliderTypes.map((type, index) => ({
    type,
    enabled: true,
    isBuiltIn: true,
    order: 12 + index,
  })),
];
