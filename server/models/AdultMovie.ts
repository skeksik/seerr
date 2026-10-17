import { tpdbUrl } from '@server/api/tpdb';
import type { TpdbMovie } from '@server/api/tpdb/interfaces';
import type Media from '@server/entity/Media';

export interface AdultMovieResult {
  // ThePornDB movie UUID
  id: string;
  mediaType: 'adultmovie';
  title: string;
  overview?: string;
  releaseDate?: string;
  // Seconds
  duration?: number;
  // Portrait front cover
  posterUrl?: string;
  // Landscape still, when ThePornDB has one
  backdropUrl?: string;
  studio?: { id: number; name: string };
  mediaInfo?: Media;
}

// A ThePornDB site
export interface AdultMovieStudio {
  id: number;
  name: string;
  // The StashDB studio it is linked to, which has its page
  stashDbId?: string;
}

export interface AdultMovieDetails extends AdultMovieResult {
  // Set by the details routes for the viewer
  onUserWatchlist?: boolean;
  backCoverUrl?: string;
  studio?: AdultMovieStudio;
  network?: AdultMovieStudio;
  performers: {
    id: string;
    // The StashDB performer it is linked to, which has its page; without one
    // the name is plain text
    stashDbId?: string;
    name: string;
    imageUrl?: string;
  }[];
  tags: { id: number; name: string }[];
  directors: string[];
  // Movie page on the studio's own site
  url?: string;
  // A video file a browser plays in a tab of its own
  trailerUrl?: string;
  tpdbUrl: string;
}

export interface AdultMovieListResponse {
  page: number;
  totalPages: number;
  totalResults: number;
  results: AdultMovieResult[];
}

// The CDN copies are the most reliable; studio-site images often vanish
const pickPoster = (movie: TpdbMovie): string | undefined =>
  movie.posters?.large ??
  movie.posters?.full ??
  movie.posters?.medium ??
  movie.image ??
  undefined;

// Cards are a few hundred pixels wide, so lists take the medium poster
// (530x750, a third of the large one's size) where there is one
const pickCardPoster = (movie: TpdbMovie): string | undefined =>
  movie.posters?.medium ?? pickPoster(movie);

// Some ThePornDB durations are far off, like 535 hours; longer than a day
// they are left out
export const MAX_DURATION = 24 * 60 * 60;

const saneDuration = (duration?: number | null): number | undefined =>
  duration && duration > 0 && duration <= MAX_DURATION ? duration : undefined;

export const mapAdultMovieResult = (
  movie: TpdbMovie,
  media?: Media
): AdultMovieResult => ({
  id: movie.id,
  mediaType: 'adultmovie',
  title: movie.title,
  releaseDate: movie.date ?? undefined,
  duration: saneDuration(movie.duration),
  overview: movie.description || undefined,
  posterUrl: pickCardPoster(movie),
  backdropUrl: movie.background?.large ?? movie.background?.full ?? undefined,
  studio: movie.site ? { id: movie.site.id, name: movie.site.name } : undefined,
  mediaInfo: media,
});

// Streaming playlists only play in Safari; elsewhere they download
const PLAYLIST = /\.(m3u8|mpd)$/i;
// Signed links name their end as a Unix time
const EXPIRY_PARAMS = ['validto', 'expires', 'exp'];

// ThePornDB keeps the trailer link it was given, so signed links stay
// expired; a fresh lookup would not help
export const playableTrailer = (
  trailer: string | null | undefined,
  now = Date.now()
): string | undefined => {
  if (!trailer) {
    return undefined;
  }

  let url: URL;
  try {
    url = new URL(trailer.trim());
  } catch {
    return undefined;
  }

  if (
    !['http:', 'https:'].includes(url.protocol) ||
    PLAYLIST.test(url.pathname)
  ) {
    return undefined;
  }

  const expired = EXPIRY_PARAMS.some((param) => {
    const value = url.searchParams.get(param);
    return value && /^\d{9,}$/.test(value) && Number(value) * 1000 < now;
  });

  return expired ? undefined : url.toString();
};

// The StashDB performers and studios a movie's ThePornDB ones are linked
// to, by ThePornDB id
export interface AdultMovieLinks {
  performers: Map<number, string>;
  studios: Map<number, string>;
}

// Site performers point to the performer across all sites
export const moviePerformers = (movie: TpdbMovie) =>
  (movie.performers ?? []).map((performer) => ({
    id: performer.parent?.id ?? performer.id,
    _id: performer.parent?._id ?? performer._id,
    slug: performer.parent ? performer.parent.slug : performer.slug,
    extras: performer.parent ? performer.parent.extras : performer.extras,
    name: performer.parent?.name ?? performer.name,
    image: performer.parent ? performer.parent.image : performer.image,
    // Site performers without a performer behind them have no profile to
    // link from
    hasProfile: !!performer.parent,
  }));

export const mapAdultMovieDetails = (
  movie: TpdbMovie,
  media?: Media,
  links: AdultMovieLinks = { performers: new Map(), studios: new Map() }
): AdultMovieDetails => ({
  ...mapAdultMovieResult(movie, media),
  // The page shows it larger
  posterUrl: pickPoster(movie),
  studio: movie.site
    ? {
        id: movie.site.id,
        name: movie.site.name,
        stashDbId: links.studios.get(movie.site.id),
      }
    : undefined,
  backCoverUrl: movie.back_image ?? undefined,
  network:
    movie.site?.network && movie.site.network.id !== movie.site.id
      ? {
          id: movie.site.network.id,
          name: movie.site.network.name,
          stashDbId: links.studios.get(movie.site.network.id),
        }
      : undefined,
  performers: moviePerformers(movie).map((performer) => ({
    id: performer.id,
    stashDbId: performer.hasProfile
      ? links.performers.get(performer._id)
      : undefined,
    name: performer.name,
    imageUrl: performer.image ?? undefined,
  })),
  tags: (movie.tags ?? []).map(({ id, name }) => ({ id, name })),
  directors: (movie.directors ?? []).map((director) => director.name),
  url: movie.url ?? undefined,
  trailerUrl: playableTrailer(movie.trailer),
  tpdbUrl: tpdbUrl('movies', movie.id),
});
