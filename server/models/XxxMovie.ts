import type { TpdbMovie } from '@server/api/tpdb/interfaces';
import type Media from '@server/entity/Media';
import type { MovieResult } from '@server/models/Search';

export interface XxxMovieResult {
  // ThePornDB movie UUID
  id: string;
  mediaType: 'xxxmovie';
  title: string;
  releaseDate?: string;
  // Seconds
  duration?: number;
  // Portrait front cover
  posterUrl?: string;
  studio?: { id: number; name: string };
  mediaInfo?: Media;
}

export interface XxxMovieDetails extends XxxMovieResult {
  overview?: string;
  backCoverUrl?: string;
  network?: { id: number; name: string };
  performers: {
    id: string;
    // Numeric id ThePornDB filters take
    tpdbId: number;
    name: string;
    imageUrl?: string;
  }[];
  tags: { id: number; name: string }[];
  directors: string[];
  // Movie page on the studio's own site
  url?: string;
  tpdbUrl: string;
}

// XXX movie lists hold ThePornDB movies or, with the TMDB source, adult
// TMDB movies that link to the regular movie page
export interface XxxMovieListResponse {
  page: number;
  totalPages: number;
  totalResults: number;
  results: (XxxMovieResult | MovieResult)[];
}

// The CDN copies are the most reliable; studio-site images often vanish
const pickPoster = (movie: TpdbMovie): string | undefined =>
  movie.posters?.large ??
  movie.posters?.full ??
  movie.posters?.medium ??
  movie.image ??
  undefined;

export const mapXxxMovieResult = (
  movie: TpdbMovie,
  media?: Media
): XxxMovieResult => ({
  id: movie.id,
  mediaType: 'xxxmovie',
  title: movie.title,
  releaseDate: movie.date ?? undefined,
  duration: movie.duration ?? undefined,
  posterUrl: pickPoster(movie),
  studio: movie.site ? { id: movie.site.id, name: movie.site.name } : undefined,
  mediaInfo: media,
});

export const mapXxxMovieDetails = (
  movie: TpdbMovie,
  media?: Media
): XxxMovieDetails => ({
  ...mapXxxMovieResult(movie, media),
  overview: movie.description || undefined,
  backCoverUrl: movie.back_image ?? undefined,
  network:
    movie.site?.network && movie.site.network.id !== movie.site.id
      ? { id: movie.site.network.id, name: movie.site.network.name }
      : undefined,
  // Site performers point to the performer across all sites
  performers: (movie.performers ?? []).map((performer) => ({
    id: performer.parent?.id ?? performer.id,
    tpdbId: performer.parent?._id ?? performer._id,
    name: performer.parent?.name ?? performer.name,
    imageUrl: performer.parent?.image ?? performer.image ?? undefined,
  })),
  tags: (movie.tags ?? []).map(({ id, name }) => ({ id, name })),
  directors: (movie.directors ?? []).map((director) => director.name),
  url: movie.url ?? undefined,
  tpdbUrl: `https://theporndb.net/movies/${movie.id}`,
});
