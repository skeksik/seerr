import AdultLinkBlock from '@app/components/AdultLinkBlock';
import AdultMediaActions from '@app/components/AdultMediaActions';
import AdultIssueButton from '@app/components/AdultMediaActions/AdultIssueButton';
import AdultManageButton from '@app/components/AdultMediaActions/AdultManageButton';
import type { ProfileLink } from '@app/components/AdultProfileLinks';
import AdultProfileLinks from '@app/components/AdultProfileLinks';
import type { SliderPerformer } from '@app/components/Common/adultRoutes';
import Button from '@app/components/Common/Button';
import CachedImage from '@app/components/Common/CachedImage';
import PageTitle from '@app/components/Common/PageTitle';
import PlayButton from '@app/components/Common/PlayButton';
import Tag from '@app/components/Common/Tag';
import { orientationMessages } from '@app/components/OrientationSelector';
import RequestModal from '@app/components/RequestModal';
import AdultTitleSlider from '@app/components/Scenes/AdultTitleSlider';
import PerformerSlider from '@app/components/Scenes/PerformerSlider';
import StatusBadge from '@app/components/StatusBadge';
import StudioBanner from '@app/components/StudioBanner';
import { Permission, useUser } from '@app/hooks/useUser';
import globalMessages from '@app/i18n/globalMessages';
import defineMessages from '@app/utils/defineMessages';
import { refreshIntervalHelper } from '@app/utils/refreshIntervalHelper';
import { ArrowDownTrayIcon, PlayIcon } from '@heroicons/react/24/outline';
import { MediaStatus } from '@server/constants/media';
import type Media from '@server/entity/Media';
import type { Orientation } from '@server/lib/orientation';
import Link from 'next/link';
import { Fragment, useState } from 'react';
import { useIntl } from 'react-intl';

const messages = defineMessages('components.AdultTitleDetails', {
  overview: 'Overview',
  overviewunavailable: 'Overview unavailable.',
  cast: 'Cast',
  releasedate: 'Release Date',
  productiondate: 'Production Date',
  duration: 'Duration',
  studio: 'Studio',
  network: 'Network',
  code: 'Studio Code',
  director: 'Director',
  links: 'Links',
  recommendations: 'Recommendations',
  similar: 'Similar Titles',
  minutes: '{minutes} min',
  showalltags: 'Show all {count} tags',
  playonstash: 'Play on Stash',
});

// StashDB scenes often carry 70+ tags
const TAG_LIMIT = 20;

const DATE_FORMAT = {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  timeZone: 'UTC',
} as const;

interface CreditLink {
  name: string;
  href: string;
}

// A scene or adult movie, as the title page shows it
export interface AdultTitle {
  mediaType: 'scene' | 'adultmovie';
  id: string;
  title: string;
  overview?: string;
  releaseDate?: string;
  productionDate?: string;
  // Seconds
  duration?: number;
  orientations?: Orientation[];
  studio?: CreditLink & { id: string | number };
  network?: CreditLink;
  code?: string;
  directors: string[];
  tags: { id: string | number; name: string }[];
  // The browse tab filtered to the tag
  tagHref: (id: string | number) => string;
  // Outside pages, like the studio's
  links: ProfileLink[];
  imageType: 'stashdb' | 'tpdb';
  // Covers are portrait, so they only work as a blurred wash
  backdrop?: { src: string; blur?: boolean };
  // Scene stills are landscape; covers are left as a blank poster
  poster: { src?: string; landscape: boolean };
  performers: SliderPerformer[];
  mediaInfo?: Media;
  onUserWatchlist?: boolean;
  // Scenes play on Stash
  playUrl?: string;
  stashDbUrl?: string;
  tpdbUrl?: string;
}

interface AdultTitleDetailsProps {
  title: AdultTitle;
  manage: React.ComponentProps<typeof AdultManageButton>;
  revalidate: () => void;
  // Rows between the cast and the recommendations
  children?: React.ReactNode;
}

// MovieDetails' polling while something downloads. Called each render, so
// SWR picks the interval up from the latest data
export const refreshWhileDownloading =
  (fallback?: { mediaInfo?: Media }) =>
  (latest?: { mediaInfo?: Media }): number =>
    refreshIntervalHelper(
      {
        downloadStatus: (latest ?? fallback)?.mediaInfo?.downloadStatus,
        downloadStatus4k: (latest ?? fallback)?.mediaInfo?.downloadStatus4k,
      },
      15000
    );

// The movie page, for scenes and adult movies
const AdultTitleDetails = ({
  title: data,
  manage,
  revalidate,
  children,
}: AdultTitleDetailsProps) => {
  const intl = useIntl();
  const [showAllTags, setShowAllTags] = useState(false);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const { hasPermission } = useUser();

  const status = data.mediaInfo?.status ?? MediaStatus.UNKNOWN;
  const canRequest =
    hasPermission(Permission.REQUEST) &&
    (status === MediaStatus.UNKNOWN || status === MediaStatus.DELETED);
  const year = data.releaseDate?.slice(0, 4);
  const minutes = data.duration ? Math.round(data.duration / 60) : undefined;
  const attributes: React.ReactNode[] = [];

  // Sexual preferences, which the Filters panel goes by, boxed like a
  // movie's certification
  if (data.orientations?.length) {
    attributes.push(
      <span className="flex gap-1">
        {data.orientations.map((orientation) => (
          <span key={orientation} className="rounded-md border p-0.5 py-0">
            {intl.formatMessage(orientationMessages[orientation])}
          </span>
        ))}
      </span>
    );
  }

  if (minutes) {
    attributes.push(intl.formatMessage(messages.minutes, { minutes }));
  }

  return (
    <div className="media-page" style={{ height: 493 }}>
      {data.backdrop && (
        <div className="media-page-bg-image">
          <CachedImage
            type={data.imageType}
            alt=""
            src={data.backdrop.src}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              filter: data.backdrop.blur ? 'blur(16px)' : undefined,
            }}
            fill
            priority
          />
          <div
            className="absolute inset-0"
            style={{
              backgroundImage:
                'linear-gradient(180deg, rgba(17, 24, 39, 0.47) 0%, rgba(17, 24, 39, 1) 100%)',
            }}
          />
        </div>
      )}
      <PageTitle title={data.title} />
      <div className="media-header">
        {data.poster.landscape ? (
          data.poster.src && (
            <div className="w-64 overflow-hidden rounded shadow md:w-80 md:rounded-lg md:shadow-2xl xl:mr-4 xl:w-96">
              <CachedImage
                type={data.imageType}
                src={data.poster.src}
                alt=""
                sizes="100vw"
                style={{ width: '100%', height: 'auto' }}
                width={600}
                height={338}
                priority
              />
            </div>
          )
        ) : (
          <div className="media-poster">
            {data.poster.src ? (
              <CachedImage
                type={data.imageType}
                src={data.poster.src}
                alt=""
                sizes="100vw"
                style={{ width: '100%', height: 'auto' }}
                width={600}
                height={900}
                priority
              />
            ) : (
              <div className="aspect-[2/3] w-full bg-gray-800" />
            )}
          </div>
        )}
        <div className="media-title">
          <div className="media-status">
            <StatusBadge
              status={data.mediaInfo?.status}
              downloadItem={data.mediaInfo?.downloadStatus}
              title={data.title}
              inProgress={(data.mediaInfo?.downloadStatus ?? []).length > 0}
              mediaType={data.mediaType}
              externalId={data.id}
              plexUrl={data.playUrl}
              serviceUrl={data.mediaInfo?.serviceUrl}
            />
          </div>
          <h1 data-testid="media-title">
            {data.title} {year && <span className="media-year">({year})</span>}
          </h1>
          <span className="media-attributes">
            {attributes.map((attribute, k) => (
              <Fragment key={k}>
                {k > 0 && <span>|</span>}
                <span>{attribute}</span>
              </Fragment>
            ))}
          </span>
        </div>
        <div className="media-actions gap-2">
          <AdultMediaActions
            mediaType={data.mediaType}
            id={data.id}
            title={data.title}
            status={data.mediaInfo?.status}
            onUserWatchlist={data.onUserWatchlist}
            onChange={revalidate}
          />
          {data.playUrl && (
            <div className="z-20">
              <PlayButton
                links={[
                  {
                    text: intl.formatMessage(messages.playonstash),
                    url: data.playUrl,
                    svg: <PlayIcon />,
                  },
                ]}
              />
            </div>
          )}
          {canRequest && (
            <Button
              buttonType="primary"
              onClick={() => setShowRequestModal(true)}
            >
              <ArrowDownTrayIcon />
              <span>{intl.formatMessage(globalMessages.request)}</span>
            </Button>
          )}
          <AdultIssueButton
            mediaType={data.mediaType}
            id={data.id}
            status={data.mediaInfo?.status}
          />
          <AdultManageButton {...manage} />
        </div>
        <RequestModal
          show={showRequestModal}
          type={data.mediaType}
          externalId={data.id}
          onCancel={() => setShowRequestModal(false)}
          onComplete={() => {
            setShowRequestModal(false);
            revalidate();
          }}
        />
      </div>
      <div className="media-overview">
        <div className="media-overview-left">
          <h2>{intl.formatMessage(messages.overview)}</h2>
          <p className="whitespace-pre-line">
            {data.overview || intl.formatMessage(messages.overviewunavailable)}
          </p>
          {data.directors.length > 0 && (
            <ul className="media-crew">
              {data.directors.map((director) => (
                <li key={`director-${director}`}>
                  <span>{intl.formatMessage(messages.director)}</span>
                  <span className="font-normal text-gray-400">{director}</span>
                </li>
              ))}
            </ul>
          )}
          {data.tags.length > 0 && (
            <div className="mt-6">
              {(showAllTags ? data.tags : data.tags.slice(0, TAG_LIMIT)).map(
                (tag) => (
                  <Link
                    href={data.tagHref(tag.id)}
                    key={`tag-${tag.id}`}
                    className="mb-2 mr-2 inline-flex last:mr-0"
                  >
                    <Tag>{tag.name}</Tag>
                  </Link>
                )
              )}
              {!showAllTags && data.tags.length > TAG_LIMIT && (
                <button
                  type="button"
                  className="mb-2 inline-flex text-sm text-gray-400 transition duration-300 hover:text-gray-100 hover:underline"
                  onClick={() => setShowAllTags(true)}
                >
                  {intl.formatMessage(messages.showalltags, {
                    count: data.tags.length,
                  })}
                </button>
              )}
            </div>
          )}
        </div>
        <div className="media-overview-right">
          {data.studio && (
            <StudioBanner
              href={data.studio.href}
              studio={data.studio.name}
              studioId={data.studio.id}
              mediaType={data.mediaType}
              currentId={data.id}
              fallbackImageUrl={data.backdrop?.src}
            />
          )}
          <div className="media-facts">
            {data.releaseDate && (
              <div className="media-fact">
                <span>{intl.formatMessage(messages.releasedate)}</span>
                <span className="media-fact-value">
                  {intl.formatDate(data.releaseDate, DATE_FORMAT)}
                </span>
              </div>
            )}
            {data.productionDate &&
              data.productionDate !== data.releaseDate && (
                <div className="media-fact">
                  <span>{intl.formatMessage(messages.productiondate)}</span>
                  <span className="media-fact-value">
                    {intl.formatDate(data.productionDate, DATE_FORMAT)}
                  </span>
                </div>
              )}
            {minutes && (
              <div className="media-fact">
                <span>{intl.formatMessage(messages.duration)}</span>
                <span className="media-fact-value">
                  {intl.formatMessage(messages.minutes, { minutes })}
                </span>
              </div>
            )}
            {data.studio && (
              <div className="media-fact">
                <span>{intl.formatMessage(messages.studio)}</span>
                <span className="media-fact-value">
                  <Link href={data.studio.href}>{data.studio.name}</Link>
                </span>
              </div>
            )}
            {data.network && (
              <div className="media-fact">
                <span>{intl.formatMessage(messages.network)}</span>
                <span className="media-fact-value">
                  <Link href={data.network.href}>{data.network.name}</Link>
                </span>
              </div>
            )}
            {data.code && (
              <div className="media-fact">
                <span>{intl.formatMessage(messages.code)}</span>
                <span className="media-fact-value">{data.code}</span>
              </div>
            )}
            {data.links.length > 0 && (
              <div className="media-fact">
                <span>{intl.formatMessage(messages.links)}</span>
                <span className="media-fact-value">
                  <AdultProfileLinks
                    links={data.links}
                    align="end"
                    className="gap-2"
                  />
                </span>
              </div>
            )}
            <div className="media-fact">
              <AdultLinkBlock
                stashUrl={data.playUrl}
                stashDbUrl={data.stashDbUrl}
                tpdbUrl={data.tpdbUrl}
              />
            </div>
          </div>
        </div>
      </div>
      {data.performers.length > 0 && (
        <PerformerSlider
          sliderKey={`${data.mediaType}-performers`}
          title={intl.formatMessage(messages.cast)}
          linkUrl={`/${data.mediaType}/${data.id}/cast`}
          performers={data.performers}
        />
      )}
      {children}
      <AdultTitleSlider
        mediaType={data.mediaType}
        sliderKey={`${data.mediaType}-recommendations`}
        title={intl.formatMessage(messages.recommendations)}
        url={`/api/v1/${data.mediaType}/${data.id}/recommendations?page=1`}
        linkUrl={`/${data.mediaType}/${data.id}/recommendations`}
        hideWhenEmpty
      />
      <AdultTitleSlider
        mediaType={data.mediaType}
        sliderKey={`${data.mediaType}-similar`}
        title={intl.formatMessage(messages.similar)}
        url={`/api/v1/${data.mediaType}/${data.id}/similar?page=1`}
        linkUrl={`/${data.mediaType}/${data.id}/similar`}
        hideWhenEmpty
      />
      <div className="extra-bottom-space relative" />
    </div>
  );
};

export default AdultTitleDetails;
