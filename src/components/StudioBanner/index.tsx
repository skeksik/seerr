import Button from '@app/components/Common/Button';
import CachedImage from '@app/components/Common/CachedImage';
import globalMessages from '@app/i18n/globalMessages';
import defineMessages from '@app/utils/defineMessages';
import { stashImageUrl } from '@app/utils/stashImage';
import type { AdultMovieListResponse } from '@server/models/AdultMovie';
import type { SceneListResponse } from '@server/models/Scene';
import Link from 'next/link';
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
  const { data } = useSWR<SceneListResponse | AdultMovieListResponse>(
    mediaType === 'scene'
      ? `/api/v1/scene/discover?sort=date&released=before&releaseDate=${releasedBy()}&studio=${studioId}&page=1`
      : `/api/v1/adultmovie/discover?sort=released&studio=${studioId}&page=1`
  );
  const latest = data?.results.find((result) => result.id !== currentId);
  const latestImage = !latest
    ? undefined
    : latest.mediaType === 'scene'
      ? stashImageUrl(latest.imageUrl, 1280)
      : latest.mediaType === 'adultmovie'
        ? (latest.backdropUrl ?? latest.posterUrl)
        : undefined;
  const imageUrl = latestImage ?? fallbackImageUrl;
  const imageType = mediaType === 'scene' ? 'stashdb' : 'tpdb';
  const intl = useIntl();

  return (
    <div className="mb-6">
      <Link href={href}>
        <div className="group relative z-0 scale-100 transform-gpu cursor-pointer overflow-hidden rounded-lg bg-gray-800 bg-cover bg-center shadow-md ring-1 ring-gray-700 transition duration-300 hover:scale-105 hover:ring-gray-500">
          {imageUrl && (
            <div className="absolute inset-0 z-0">
              <CachedImage
                type={imageType}
                src={imageUrl}
                alt=""
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                fill
              />
              <div
                className="absolute inset-0"
                style={{
                  backgroundImage:
                    'linear-gradient(180deg, rgba(31, 41, 55, 0.47) 0%, rgba(31, 41, 55, 0.80) 100%)',
                }}
              />
            </div>
          )}
          <div className="relative z-10 flex h-full items-center justify-between p-4 text-gray-200 transition duration-300 group-hover:text-white">
            <div>{intl.formatMessage(messages.moreFrom, { studio })}</div>
            <Button buttonSize="sm">
              {intl.formatMessage(globalMessages.view)}
            </Button>
          </div>
        </div>
      </Link>
    </div>
  );
};

export default StudioBanner;
