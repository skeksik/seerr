import type { TmdbTitleCardProps } from '@app/components/TitleCard/TmdbTitleCard';
import TmdbTitleCard from '@app/components/TitleCard/TmdbTitleCard';

// The old props, kept until ListView uses TmdbTitleCard, which takes the
// media type as type
type MediaTitleCardProps = Omit<TmdbTitleCardProps, 'type'> & {
  mediaType: TmdbTitleCardProps['type'];
};

const MediaTitleCard = ({ mediaType, ...props }: MediaTitleCardProps) => (
  <TmdbTitleCard type={mediaType} {...props} />
);

export default MediaTitleCard;
