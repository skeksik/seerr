import AdultTitleDetails, {
  refreshWhileDownloading,
} from '@app/components/AdultTitleDetails';
import withAdultGate from '@app/components/Common/AdultGate';
import {
  creditHref,
  toSliderPerformer,
} from '@app/components/Common/adultRoutes';
import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import ErrorPage from '@app/pages/_error';
import { linkLabel } from '@app/utils/linkLabel';
import { stashImageUrl } from '@app/utils/stashImage';
import type { SceneDetails as SceneDetailsType } from '@server/models/Scene';
import { useRouter } from 'next/router';
import useSWR, { useSWRConfig } from 'swr';

interface SceneDetailsProps {
  scene?: SceneDetailsType;
}

const SceneDetails = ({ scene }: SceneDetailsProps) => {
  const router = useRouter();
  const { cache } = useSWRConfig();
  const key = `/api/v1/scene/${router.query.sceneId}`;
  const { data, error, mutate } = useSWR<SceneDetailsType>(key, {
    fallbackData: scene,
    // The server just fetched it, unless an older copy is cached
    revalidateOnMount: !scene || cache.get(key) !== undefined,
    refreshInterval: refreshWhileDownloading(scene),
  });

  if (!data && !error) {
    return <LoadingSpinner />;
  }

  if (!data) {
    return <ErrorPage statusCode={404} />;
  }

  const backdrop = stashImageUrl(data.imageUrl, 1280);

  return (
    <AdultTitleDetails
      title={{
        mediaType: 'scene',
        id: data.id,
        title: data.title,
        overview: data.details,
        releaseDate: data.releaseDate,
        productionDate: data.productionDate,
        duration: data.duration,
        orientations: data.orientations,
        studio: data.studio && {
          id: data.studio.id,
          name: data.studio.name,
          href: creditHref('scene', 'studio', data.studio.id),
        },
        network: data.studio?.parent && {
          name: data.studio.parent.name,
          href: creditHref('scene', 'studio', data.studio.parent.id),
        },
        code: data.code,
        directors: data.director ? [data.director] : [],
        tags: data.tags,
        tagHref: (id) => `/discover/scenes?sort=date&tags=${id}`,
        links: data.urls.map((url) => ({
          url: url.url,
          site: linkLabel(url.url),
          icon: url.icon,
        })),
        imageType: 'stashdb',
        backdrop: backdrop ? { src: backdrop } : undefined,
        poster: { src: stashImageUrl(data.imageUrl, 600), landscape: true },
        performers: data.performers.map((performer) =>
          toSliderPerformer('scene', performer)
        ),
        mediaInfo: data.mediaInfo,
        onUserWatchlist: data.onUserWatchlist,
        playUrl: data.mediaInfo?.mediaUrl,
        stashDbUrl: data.stashDbUrl,
      }}
      manage={{ mediaType: 'scene', data, revalidate: () => mutate() }}
      revalidate={() => mutate()}
    />
  );
};

export default withAdultGate(SceneDetails);
