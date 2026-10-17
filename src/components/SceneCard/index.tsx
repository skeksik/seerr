import TitleCard from '@app/components/TitleCard';
import { adultSubtitle } from '@app/utils/adultMedia';
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
  <TitleCard.Placeholder canExpand={canExpand} landscape />
);

export default withProperties(SceneCard, { Placeholder });
