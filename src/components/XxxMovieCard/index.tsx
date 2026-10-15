import TitleCard from '@app/components/TitleCard';
import { withProperties } from '@app/utils/typeHelpers';
import type { XxxMovieResult } from '@server/models/XxxMovie';

interface XxxMovieCardProps {
  movie: XxxMovieResult;
  canExpand?: boolean;
  isAddedToWatchlist?: boolean;
  mutateParent?: () => void;
}

export const adultSubtitle = (
  studio?: { name: string },
  releaseDate?: string
): string =>
  [studio?.name, releaseDate?.slice(0, 4)].filter(Boolean).join(' · ');

// ThePornDB movies have portrait covers, so they share TitleCard's shape
const XxxMovieCard = ({
  movie,
  canExpand = false,
  isAddedToWatchlist,
  mutateParent,
}: XxxMovieCardProps) => (
  <TitleCard
    id={movie.id}
    mediaType="xxxmovie"
    image={movie.posterUrl}
    title={movie.title}
    year={movie.releaseDate}
    subtitle={movie.studio?.name}
    summary={movie.overview}
    status={movie.mediaInfo?.status}
    inProgress={(movie.mediaInfo?.downloadStatus ?? []).length > 0}
    isAddedToWatchlist={
      isAddedToWatchlist || (movie.mediaInfo?.watchlists?.length ?? 0)
    }
    canExpand={canExpand}
    mutateParent={mutateParent}
    orientations={movie.orientations}
  />
);

const Placeholder = ({ canExpand = false }: { canExpand?: boolean }) => (
  <div
    className={`relative animate-pulse rounded-xl bg-gray-700 ${
      canExpand ? 'w-full' : 'w-36 sm:w-36 md:w-44'
    }`}
  >
    <div className="w-full" style={{ paddingBottom: '150%' }} />
  </div>
);

export default withProperties(XxxMovieCard, { Placeholder });
