import useAdultRequestItem from '@app/hooks/useAdultRequestItem';
import { MediaType } from '@server/constants/media';
import type Media from '@server/entity/Media';
import type { MovieDetails } from '@server/models/Movie';
import type { TvDetails } from '@server/models/Tv';
import useSWR from 'swr';

type ImageType = 'tmdb' | 'stashdb' | 'tpdb';

export interface IssueMedia {
  loading: boolean;
  found: boolean;
  title?: string;
  year?: string;
  href: string;
  posterUrl?: string;
  backdropUrl?: string;
  imageType: ImageType;
  // Scene stills are landscape; everything else has a portrait poster
  portrait: boolean;
  mediaInfo?: Media;
  isTv: boolean;
  // Names for the play and service buttons
  mediaServerName?: string;
  arr: 'Radarr' | 'Sonarr' | 'Whisparr';
}

const isTvDetails = (data: MovieDetails | TvDetails): data is TvDetails =>
  (data as TvDetails).name !== undefined;

// The title an issue is about, from TMDB or from StashDB/ThePornDB
const useIssueMedia = (media: Media | undefined, load = true): IssueMedia => {
  const isAdult =
    media?.mediaType === MediaType.SCENE ||
    media?.mediaType === MediaType.ADULT_MOVIE;
  const { data, error } = useSWR<MovieDetails | TvDetails>(
    load && media && !isAdult && media.tmdbId
      ? `/api/v1/${media.mediaType}/${media.tmdbId}`
      : null
  );
  const adult = useAdultRequestItem(
    media ?? { mediaType: MediaType.SCENE, stashId: null, tpdbId: null },
    load && isAdult,
    600
  );

  if (isAdult) {
    return {
      loading: adult.loading,
      found: adult.title !== undefined,
      title: adult.title,
      year: adult.releaseDate?.slice(0, 4),
      href: adult.href,
      posterUrl: adult.imageUrl,
      backdropUrl: adult.backdropUrl,
      imageType: adult.imageType,
      portrait: adult.portrait,
      mediaInfo: media,
      isTv: false,
      mediaServerName: 'Stash',
      arr: 'Whisparr',
    };
  }

  const isTv = !!data && isTvDetails(data);

  return {
    loading: load && !data && !error,
    found: !!data,
    title: data && (isTvDetails(data) ? data.name : data.title),
    year: (
      data && (isTvDetails(data) ? data.firstAirDate : data.releaseDate)
    )?.slice(0, 4),
    href: `/${media?.mediaType === MediaType.TV ? 'tv' : 'movie'}/${media?.tmdbId}`,
    posterUrl: data?.posterPath
      ? `https://image.tmdb.org/t/p/w600_and_h900_bestv2${data.posterPath}`
      : undefined,
    backdropUrl: data?.backdropPath
      ? `https://image.tmdb.org/t/p/w1920_and_h800_multi_faces/${data.backdropPath}`
      : undefined,
    imageType: 'tmdb',
    portrait: true,
    mediaInfo: data?.mediaInfo,
    isTv,
    arr: media?.mediaType === MediaType.TV ? 'Sonarr' : 'Radarr',
  };
};

export default useIssueMedia;
