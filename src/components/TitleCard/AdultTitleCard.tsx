import SceneCard from '@app/components/SceneCard';
import TitleCard from '@app/components/TitleCard';
import XxxMovieCard from '@app/components/XxxMovieCard';
import type { SceneDetails } from '@server/models/Scene';
import type { XxxMovieDetails } from '@server/models/XxxMovie';
import { useInView } from 'react-intersection-observer';
import useSWR from 'swr';

export interface AdultTitleCardProps {
  mediaType: 'scene' | 'xxxmovie';
  // StashDB scene or ThePornDB movie UUID
  externalId: string;
  canExpand?: boolean;
  isAddedToWatchlist?: boolean;
  mutateParent?: () => void;
}

// TmdbTitleCard for scenes and XXX movies: loads the title once in view
const AdultTitleCard = ({
  mediaType,
  externalId,
  canExpand,
  isAddedToWatchlist,
  mutateParent,
}: AdultTitleCardProps) => {
  const { ref, inView } = useInView({ triggerOnce: true });
  const { data, error } = useSWR<SceneDetails | XxxMovieDetails>(
    inView ? `/api/v1/${mediaType}/${externalId}` : null
  );
  const isScene = mediaType === 'scene';

  if (!data && !error) {
    return (
      <div ref={ref}>
        {isScene ? (
          <SceneCard.Placeholder canExpand={canExpand} />
        ) : (
          <TitleCard.Placeholder canExpand={canExpand} />
        )}
      </div>
    );
  }

  // Titles removed from StashDB or ThePornDB have nothing left to show
  if (!data) {
    return null;
  }

  return data.mediaType === 'scene' ? (
    <SceneCard
      scene={data}
      canExpand={canExpand}
      isAddedToWatchlist={isAddedToWatchlist || data.onUserWatchlist}
      mutateParent={mutateParent}
    />
  ) : (
    <XxxMovieCard
      movie={data}
      canExpand={canExpand}
      isAddedToWatchlist={isAddedToWatchlist || data.onUserWatchlist}
      mutateParent={mutateParent}
    />
  );
};

export default AdultTitleCard;
