import { stashImageUrl } from '@app/utils/stashImage';
import type Media from '@server/entity/Media';
import type { AdultMovieDetails } from '@server/models/AdultMovie';
import type { SceneDetails } from '@server/models/Scene';
import useSWR from 'swr';

export interface AdultRequestItemDetails {
  loading: boolean;
  title?: string;
  releaseDate?: string;
  // Studio and year
  subtitle: string;
  href: string;
  imageUrl?: string;
  // Wide artwork for row and card backgrounds
  backdropUrl?: string;
  imageType: 'stashdb' | 'tpdb';
  // Adult movie covers are portrait, scene stills landscape
  portrait: boolean;
}

// Loads the scene or adult movie behind a request for rows and cards
const useAdultRequestItem = (
  media: Pick<Media, 'mediaType' | 'stashId' | 'tpdbId'>,
  load: boolean,
  imageSize: 300 | 600 = 300
): AdultRequestItemDetails => {
  const isScene = media.mediaType === 'scene';
  const id = isScene ? media.stashId : media.tpdbId;
  const { data, error } = useSWR<SceneDetails | AdultMovieDetails>(
    load && id ? `/api/v1/${isScene ? 'scene' : 'adultmovie'}/${id}` : null
  );

  const imageUrl = !data
    ? undefined
    : 'posterUrl' in data
      ? data.posterUrl
      : stashImageUrl((data as SceneDetails).imageUrl, imageSize);

  return {
    loading: load && !!id && !data && !error,
    title: data?.title,
    releaseDate: data?.releaseDate,
    subtitle: [data?.studio?.name, data?.releaseDate?.slice(0, 4)]
      .filter(Boolean)
      .join(' · '),
    href: `/${isScene ? 'scene' : 'adultmovie'}/${id}`,
    imageUrl,
    backdropUrl: !data
      ? undefined
      : 'posterUrl' in data
        ? (data.backdropUrl ?? data.posterUrl)
        : stashImageUrl((data as SceneDetails).imageUrl, 1280),
    imageType: isScene ? 'stashdb' : 'tpdb',
    portrait: !isScene,
  };
};

export default useAdultRequestItem;
