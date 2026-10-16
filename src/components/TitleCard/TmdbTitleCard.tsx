import AdultMovieCard from '@app/components/AdultMovieCard';
import SceneCard from '@app/components/SceneCard';
import TitleCard from '@app/components/TitleCard';
import { Permission, useUser } from '@app/hooks/useUser';
import { isAdultMediaType } from '@app/utils/adultMedia';
import type { AdultMovieDetails } from '@server/models/AdultMovie';
import type { MovieDetails } from '@server/models/Movie';
import type { SceneDetails } from '@server/models/Scene';
import type { TvDetails } from '@server/models/Tv';
import { useInView } from 'react-intersection-observer';
import useSWR from 'swr';

export interface TmdbTitleCardProps {
  id: number;
  // Null for scenes and adult movies
  tmdbId?: number | null;
  tvdbId?: number | null;
  // StashDB scene or ThePornDB movie UUID of a scene or adult movie
  externalId?: string | null;
  type: 'movie' | 'tv' | 'scene' | 'adultmovie';
  canExpand?: boolean;
  isAddedToWatchlist?: boolean;
  mutateParent?: () => void;
}

type CardTitle = MovieDetails | TvDetails | SceneDetails | AdultMovieDetails;

const isMovie = (movie: CardTitle): movie is MovieDetails => {
  return (movie as MovieDetails).title !== undefined;
};

const TmdbTitleCard = ({
  id,
  tmdbId,
  tvdbId,
  externalId,
  type,
  canExpand,
  isAddedToWatchlist = false,
  mutateParent,
}: TmdbTitleCardProps) => {
  const { hasPermission } = useUser();

  const { ref, inView } = useInView({
    triggerOnce: true,
  });
  // Scenes and adult movies are keyed by their StashDB or ThePornDB UUID
  const titleId = isAdultMediaType(type) ? externalId : tmdbId;
  const url = `/api/v1/${type}/${titleId}`;
  const { data: title, error } = useSWR<CardTitle>(
    inView && titleId ? `${url}` : null
  );

  if (!titleId) {
    return null;
  }

  if (!title && !error) {
    return (
      <div ref={ref}>
        <TitleCard.Placeholder
          canExpand={canExpand}
          landscape={type === 'scene'}
        />
      </div>
    );
  }

  if (!title) {
    return hasPermission(Permission.ADMIN) ? (
      <TitleCard.ErrorCard
        id={id}
        tmdbId={tmdbId}
        tvdbId={tvdbId ?? undefined}
        externalId={externalId}
        type={type}
      />
    ) : null;
  }

  if ('mediaType' in title && title.mediaType === 'scene') {
    return (
      <SceneCard
        scene={title}
        canExpand={canExpand}
        isAddedToWatchlist={isAddedToWatchlist || title.onUserWatchlist}
        mutateParent={mutateParent}
      />
    );
  }

  if ('mediaType' in title && title.mediaType === 'adultmovie') {
    return (
      <AdultMovieCard
        movie={title}
        canExpand={canExpand}
        isAddedToWatchlist={isAddedToWatchlist || title.onUserWatchlist}
        mutateParent={mutateParent}
      />
    );
  }

  return isMovie(title) ? (
    <TitleCard
      key={title.id}
      id={title.id}
      isAddedToWatchlist={
        title.mediaInfo?.watchlists?.length || isAddedToWatchlist
      }
      image={title.posterPath}
      status={title.mediaInfo?.status}
      summary={title.overview}
      title={title.title}
      userScore={title.voteAverage}
      year={title.releaseDate}
      mediaType={'movie'}
      canExpand={canExpand}
      mutateParent={mutateParent}
    />
  ) : (
    <TitleCard
      key={title.id}
      id={title.id}
      isAddedToWatchlist={
        title.mediaInfo?.watchlists?.length || isAddedToWatchlist
      }
      image={title.posterPath}
      status={title.mediaInfo?.status}
      summary={title.overview}
      title={title.name}
      userScore={title.voteAverage}
      year={title.firstAirDate}
      mediaType={'tv'}
      canExpand={canExpand}
      mutateParent={mutateParent}
    />
  );
};

export default TmdbTitleCard;
