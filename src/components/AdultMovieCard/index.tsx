import TitleCard from '@app/components/TitleCard';
import { adultSubtitle } from '@app/utils/adultMedia';
import type { AdultMovieResult } from '@server/models/AdultMovie';

interface AdultMovieCardProps {
  movie: AdultMovieResult;
  canExpand?: boolean;
  isAddedToWatchlist?: boolean;
  mutateParent?: () => void;
}

// ThePornDB movies have portrait covers, so they share TitleCard's shape
const AdultMovieCard = ({
  movie,
  canExpand = false,
  isAddedToWatchlist,
  mutateParent,
}: AdultMovieCardProps) => (
  <TitleCard
    id={movie.id}
    mediaType="adultmovie"
    image={movie.posterUrl}
    title={movie.title}
    subtitle={adultSubtitle(movie.studio, movie.releaseDate)}
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

export default AdultMovieCard;
