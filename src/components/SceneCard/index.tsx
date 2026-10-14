import TitleCard from '@app/components/TitleCard';
import { adultSubtitle } from '@app/components/XxxMovieCard';
import { stashImageUrl } from '@app/utils/stashImage';
import { withProperties } from '@app/utils/typeHelpers';
import type { SceneResult } from '@server/models/Scene';

interface SceneCardProps {
  scene: SceneResult;
  canExpand?: boolean;
  isAddedToWatchlist?: boolean;
  mutateParent?: () => void;
}

// Scene covers are 16:9 stills, so TitleCard lays these out landscape
const SceneCard = ({
  scene,
  canExpand = false,
  isAddedToWatchlist,
  mutateParent,
}: SceneCardProps) => (
  <TitleCard
    id={scene.id}
    mediaType="scene"
    image={stashImageUrl(scene.imageUrl, 600)}
    title={scene.title}
    subtitle={adultSubtitle(scene.studio, scene.releaseDate)}
    summary={scene.overview}
    status={scene.mediaInfo?.status}
    inProgress={(scene.mediaInfo?.downloadStatus ?? []).length > 0}
    isAddedToWatchlist={
      isAddedToWatchlist || (scene.mediaInfo?.watchlists?.length ?? 0)
    }
    canExpand={canExpand}
    mutateParent={mutateParent}
  />
);

const Placeholder = ({ canExpand = false }: { canExpand?: boolean }) => (
  <div
    className={`relative animate-pulse rounded-xl bg-gray-700 ${
      canExpand ? 'w-full' : 'w-64 sm:w-72'
    }`}
  >
    <div className="w-full" style={{ paddingBottom: '56.25%' }} />
  </div>
);

export default withProperties(SceneCard, { Placeholder });
