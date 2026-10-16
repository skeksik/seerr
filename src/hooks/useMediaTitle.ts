import {
  adultMediaId,
  adultSubtitle,
  arrName,
  isAdultMediaType,
} from '@app/utils/adultMedia';
import type { StashImageSize } from '@app/utils/stashImage';
import { adultArtwork } from '@app/utils/stashImage';
import type Media from '@server/entity/Media';
import type { AdultMovieDetails } from '@server/models/AdultMovie';
import type { MovieDetails } from '@server/models/Movie';
import type { SceneDetails } from '@server/models/Scene';
import type { TvDetails } from '@server/models/Tv';
import useSWR from 'swr';

export type MediaTitleDetails =
  | MovieDetails
  | TvDetails
  | SceneDetails
  | AdultMovieDetails;

// What names a title: a media item, request media or blocklist entry
interface MediaTitleRef {
  mediaType: string;
  tmdbId?: number | null;
  stashId?: string | null;
  tpdbId?: string | null;
  isAdult?: boolean;
}

export interface MediaTitle {
  loading: boolean;
  found: boolean;
  details?: MediaTitleDetails;
  // TMDB id, or the StashDB or ThePornDB UUID of a scene or adult movie
  id?: number | string;
  title?: string;
  year?: string;
  // Studio and year of scenes and adult movies, the year of the others
  subtitle?: string;
  href: string;
  posterUrl?: string;
  backdropUrl?: string;
  imageType: 'tmdb' | 'stashdb' | 'tpdb';
  // Scene stills are landscape; everything else has a portrait poster
  portrait: boolean;
  mediaInfo?: Media;
  isTv: boolean;
  // Names for the play and service buttons
  mediaServerName?: string;
  arr: 'Radarr' | 'Sonarr' | 'Whisparr';
}

const isTvDetails = (data: MediaTitleDetails): data is TvDetails =>
  (data as TvDetails).name !== undefined;

// The id a title is fetched and linked by
const mediaTitleId = (media: MediaTitleRef): number | string | undefined =>
  isAdultMediaType(media.mediaType)
    ? adultMediaId(media)
    : (media.tmdbId ?? undefined);

// Title, year, link and artwork of a TMDB title, scene or adult movie
const useMediaTitle = (
  media: MediaTitleRef | undefined,
  load = true,
  posterSize: StashImageSize = 600
): MediaTitle => {
  const isAdult = isAdultMediaType(media?.mediaType);
  const type = isAdult
    ? media?.mediaType
    : media?.mediaType === 'tv'
      ? 'tv'
      : 'movie';
  const id = media && mediaTitleId(media);
  const { data, error } = useSWR<MediaTitleDetails>(
    load && id ? `/api/v1/${type}/${id}` : null
  );
  const year = (
    data && (isTvDetails(data) ? data.firstAirDate : data.releaseDate)
  )?.slice(0, 4);

  const common = {
    loading: load && !!id && !data && !error,
    found: !!data,
    details: data,
    id,
    title: data && (isTvDetails(data) ? data.name : data.title),
    year,
    href: `/${type}/${id}`,
    mediaInfo: data?.mediaInfo,
    arr: arrName({ mediaType: media?.mediaType, isAdult: media?.isAdult }),
  };

  if (isAdult) {
    const adult = data as SceneDetails | AdultMovieDetails | undefined;
    const artwork = adult && adultArtwork(adult, posterSize);

    return {
      ...common,
      subtitle: adult && adultSubtitle(adult.studio, adult.releaseDate),
      posterUrl: artwork?.poster,
      backdropUrl: artwork?.backdrop,
      imageType: media?.mediaType === 'scene' ? 'stashdb' : 'tpdb',
      portrait: media?.mediaType !== 'scene',
      isTv: false,
      mediaServerName: 'Stash',
    };
  }

  const tmdb = data as MovieDetails | TvDetails | undefined;

  return {
    ...common,
    subtitle: year,
    posterUrl: tmdb?.posterPath
      ? `https://image.tmdb.org/t/p/w600_and_h900_bestv2${tmdb.posterPath}`
      : undefined,
    backdropUrl: tmdb?.backdropPath
      ? `https://image.tmdb.org/t/p/w1920_and_h800_multi_faces/${tmdb.backdropPath}`
      : undefined,
    imageType: 'tmdb',
    portrait: true,
    isTv: !!data && isTvDetails(data),
  };
};

export default useMediaTitle;
