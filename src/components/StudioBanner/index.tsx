import { creditTitlesUrl } from '@app/components/Common/adultRoutes';
import MediaBanner from '@app/components/Common/MediaBanner';
import defineMessages from '@app/utils/defineMessages';
import { stashImageUrl } from '@app/utils/stashImage';
import type { AdultMovieListResponse } from '@server/models/AdultMovie';
import type { SceneListResponse } from '@server/models/Scene';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

const messages = defineMessages('components.StudioBanner', {
  moreFrom: 'More from {studio}',
});

interface StudioBannerProps {
  href: string;
  studio: string;
  // StashDB studio or ThePornDB site whose latest release is the backdrop
  studioId: string | number;
  mediaType: 'scene' | 'adultmovie';
  // The title the page is about, so the banner shows a different one
  currentId: string;
  // Until that loads, or when the studio has nothing else
  fallbackImageUrl?: string;
}

// Tomorrow, so scenes released today count as released
const releasedBy = () => {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return date.toISOString().slice(0, 10);
};

// The movie page's collection banner, for a studio's other titles
const StudioBanner = ({
  href,
  studio,
  studioId,
  mediaType,
  currentId,
  fallbackImageUrl,
}: StudioBannerProps) => {
  const intl = useIntl();
  // The studio page's own list, so opening it costs no request
  const { data } = useSWR<SceneListResponse | AdultMovieListResponse>(
    creditTitlesUrl(mediaType, 'studio', studioId)
  );
  const today = releasedBy();
  // Upcoming titles have no artwork yet, more often than not
  const latest = data?.results.find(
    (result) =>
      result.id !== currentId &&
      (!result.releaseDate || result.releaseDate < today)
  );
  const latestImage = !latest
    ? undefined
    : latest.mediaType === 'scene'
      ? stashImageUrl(latest.imageUrl, 1280)
      : (latest.backdropUrl ?? latest.posterUrl);
  const imageUrl = latestImage ?? fallbackImageUrl;

  return (
    <MediaBanner
      href={href}
      title={intl.formatMessage(messages.moreFrom, { studio })}
      image={
        imageUrl
          ? { src: imageUrl, type: mediaType === 'scene' ? 'stashdb' : 'tpdb' }
          : undefined
      }
    />
  );
};

export default StudioBanner;
