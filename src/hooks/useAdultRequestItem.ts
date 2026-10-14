import { stashImageUrl } from '@app/utils/stashImage';
import type Media from '@server/entity/Media';
import type { SceneDetails } from '@server/models/Scene';
import type { XxxMovieDetails } from '@server/models/XxxMovie';
import useSWR from 'swr';

export interface AdultRequestItemDetails {
  title?: string;
  // Studio and year
  subtitle: string;
  href: string;
  imageUrl?: string;
  imageType: 'stashdb' | 'tpdb';
  // XXX movie covers are portrait, scene stills landscape
  portrait: boolean;
}

// Loads the scene or XXX movie behind a request for rows and cards
const useAdultRequestItem = (
  media: Pick<Media, 'mediaType' | 'stashId' | 'tpdbId'>,
  load: boolean,
  imageSize: 300 | 600 = 300
): AdultRequestItemDetails => {
  const isScene = media.mediaType === 'scene';
  const id = isScene ? media.stashId : media.tpdbId;
  const { data } = useSWR<SceneDetails | XxxMovieDetails>(
    load && id ? `/api/v1/${isScene ? 'scene' : 'xxxmovie'}/${id}` : null
  );

  const imageUrl = !data
    ? undefined
    : 'posterUrl' in data
      ? data.posterUrl
      : stashImageUrl((data as SceneDetails).imageUrl, imageSize);

  return {
    title: data?.title,
    subtitle: [data?.studio?.name, data?.releaseDate?.slice(0, 4)]
      .filter(Boolean)
      .join(' · '),
    href: `/${isScene ? 'scene' : 'xxxmovie'}/${id}`,
    imageUrl,
    imageType: isScene ? 'stashdb' : 'tpdb',
    portrait: !isScene,
  };
};

export default useAdultRequestItem;
