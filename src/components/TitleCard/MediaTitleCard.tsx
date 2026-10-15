import AdultTitleCard from '@app/components/TitleCard/AdultTitleCard';
import TmdbTitleCard from '@app/components/TitleCard/TmdbTitleCard';

interface MediaTitleCardProps {
  id: number;
  mediaType: 'movie' | 'tv' | 'scene' | 'adultmovie';
  tmdbId?: number | null;
  tvdbId?: number | null;
  // StashDB scene or ThePornDB movie UUID
  externalId?: string | null;
  canExpand?: boolean;
  isAddedToWatchlist?: boolean;
  mutateParent?: () => void;
}

// Card for a media, watchlist or blocklist row of any type
const MediaTitleCard = ({
  id,
  mediaType,
  tmdbId,
  tvdbId,
  externalId,
  ...props
}: MediaTitleCardProps) => {
  if (mediaType === 'scene' || mediaType === 'adultmovie') {
    return externalId ? (
      <AdultTitleCard
        mediaType={mediaType}
        externalId={externalId}
        {...props}
      />
    ) : null;
  }

  return tmdbId ? (
    <TmdbTitleCard
      id={id}
      tmdbId={tmdbId}
      tvdbId={tvdbId ?? undefined}
      type={mediaType}
      {...props}
    />
  ) : null;
};

export default MediaTitleCard;
