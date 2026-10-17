import FullCrewLink from '@app/components/AdultCrew/FullCrewLink';
import AdultLinkBlock from '@app/components/AdultLinkBlock';
import AdultMediaActions from '@app/components/AdultMediaActions';
import AdultIssueButton from '@app/components/AdultMediaActions/AdultIssueButton';
import AdultManageButton from '@app/components/AdultMediaActions/AdultManageButton';
import type { ProfileLink } from '@app/components/AdultProfileLinks';
import AdultProfileLinks from '@app/components/AdultProfileLinks';
import type { SliderPerformer } from '@app/components/Common/adultRoutes';
import ButtonWithDropdown from '@app/components/Common/ButtonWithDropdown';
import CachedImage from '@app/components/Common/CachedImage';
import PageTitle from '@app/components/Common/PageTitle';
import type { PlayButtonLink } from '@app/components/Common/PlayButton';
import PlayButton from '@app/components/Common/PlayButton';
import Tag from '@app/components/Common/Tag';
import RequestModal from '@app/components/RequestModal';
import AdultTitleSlider from '@app/components/Scenes/AdultTitleSlider';
import PerformerSlider from '@app/components/Scenes/PerformerSlider';
import StatusBadge from '@app/components/StatusBadge';
import StudioBanner from '@app/components/StudioBanner';
import useSettings from '@app/hooks/useSettings';
import { Permission, useUser } from '@app/hooks/useUser';
import globalMessages from '@app/i18n/globalMessages';
import defineMessages from '@app/utils/defineMessages';
import { refreshIntervalHelper } from '@app/utils/refreshIntervalHelper';
import {
  ArrowDownTrayIcon,
  FilmIcon,
  PlayIcon,
} from '@heroicons/react/24/outline';
import { MediaStatus } from '@server/constants/media';
import type Media from '@server/entity/Media';
import { mediaPermissions } from '@server/lib/permissions';
import Link from 'next/link';
import { Fragment, useState } from 'react';
import { useIntl } from 'react-intl';

const messages = defineMessages('components.AdultTitleDetails', {
  overview: 'Overview',
  overviewunavailable: 'Overview unavailable.',
  cast: 'Cast',
  releasedate: 'Release Date',
  productiondate: 'Production Date',
  studio: 'Studio',
  network: 'Network',
  director: 'Director',
  links: 'Links',
  recommendations: 'Recommendations',
  similar: 'Similar Titles',
  minutes: '{minutes} min',
  showalltags: 'Show all {count} tags',
  playonstash: 'Play on Stash',
  watchtrailer: 'Watch Trailer',
});

// StashDB scenes often carry 70+ tags
const TAG_LIMIT = 20;

const DATE_FORMAT = {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  timeZone: 'UTC',
} as const;

// A studio or network; plain text when it has no page
interface CreditLink {
  name: string;
  href: string | null;
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
  studio?: CreditLink & { id: string | number };
  network?: CreditLink;
  directors: string[];
  tags: { id: string | number; name: string }[];
  // The browse tab filtered to the tag
  tagHref: (tag: { id: string | number; name: string }) => string;
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
  // A video file, played in a new tab like a movie's trailer
  trailerUrl?: string;
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
  const [showRequest4kModal, setShowRequest4kModal] = useState(false);
  const { hasPermission } = useUser();
  const settings = useSettings();

  const status = data.mediaInfo?.status ?? MediaStatus.UNKNOWN;
  const status4k = data.mediaInfo?.status4k ?? MediaStatus.UNKNOWN;
  const isRequestable = (value: MediaStatus) =>
    value === MediaStatus.UNKNOWN || value === MediaStatus.DELETED;
  const canRequest =
    hasPermission(mediaPermissions('request', data.mediaType), {
      type: 'or',
    }) && isRequestable(status);
  // Like movies: 4K versions go to the default 4K Whisparr server
  const adult4kEnabled = settings.currentSettings.adult4kEnabled;
  const canRequest4k =
    adult4kEnabled &&
    status !== MediaStatus.BLOCKLISTED &&
    hasPermission(mediaPermissions('request4k', data.mediaType), {
      type: 'or',
    }) &&
    isRequestable(status4k);
  const requestButtons = [
    ...(canRequest
      ? [
          {
            id: 'request',
            text: intl.formatMessage(globalMessages.request),
            action: () => setShowRequestModal(true),
          },
        ]
      : []),
    ...(canRequest4k
      ? [
          {
            id: 'request4k',
            text: intl.formatMessage(globalMessages.request4k),
            action: () => setShowRequest4kModal(true),
          },
        ]
      : []),
  ];
  const [firstButton, ...otherButtons] = requestButtons;
  const year = data.releaseDate?.slice(0, 4);
  const minutes = data.duration ? Math.round(data.duration / 60) : undefined;
  const attributes: React.ReactNode[] = [];

  if (minutes) {
    attributes.push(intl.formatMessage(messages.minutes, { minutes }));
  }

  // Like a movie's: playing first, the trailer in its dropdown
  const mediaLinks: PlayButtonLink[] = [];

  if (data.playUrl) {
    mediaLinks.push({
      text: intl.formatMessage(messages.playonstash),
      url: data.playUrl,
      svg: <PlayIcon />,
    });
  }

  if (data.trailerUrl) {
    mediaLinks.push({
      text: intl.formatMessage(messages.watchtrailer),
      // Played on a page of ours, as studios' CDNs send them as downloads
      url: `/${data.mediaType}/${data.id}/trailer`,
      svg: <FilmIcon />,
    });
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
            {adult4kEnabled &&
              hasPermission(
                [
                  Permission.MANAGE_REQUESTS,
                  ...mediaPermissions('request4k', data.mediaType),
                ],
                { type: 'or' }
              ) && (
                <StatusBadge
                  status={data.mediaInfo?.status4k}
                  downloadItem={data.mediaInfo?.downloadStatus4k}
                  title={data.title}
                  is4k
                  inProgress={
                    (data.mediaInfo?.downloadStatus4k ?? []).length > 0
                  }
                  mediaType={data.mediaType}
                  externalId={data.id}
                  serviceUrl={data.mediaInfo?.serviceUrl4k}
                />
              )}
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
          {mediaLinks.length > 0 && (
            <div className="z-20">
              <PlayButton links={mediaLinks} />
            </div>
          )}
          {firstButton && (
            <ButtonWithDropdown
              text={
                <>
                  <ArrowDownTrayIcon />
                  <span>{firstButton.text}</span>
                </>
              }
              onClick={firstButton.action}
            >
              {otherButtons.length > 0
                ? otherButtons.map((button) => (
                    <ButtonWithDropdown.Item
                      key={`request-option-${button.id}`}
                      onClick={button.action}
                    >
                      <ArrowDownTrayIcon />
                      <span>{button.text}</span>
                    </ButtonWithDropdown.Item>
                  ))
                : null}
            </ButtonWithDropdown>
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
        <RequestModal
          show={showRequest4kModal}
          type={data.mediaType}
          externalId={data.id}
          is4k
          onCancel={() => setShowRequest4kModal(false)}
          onComplete={() => {
            setShowRequest4kModal(false);
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
            <>
              <ul className="media-crew">
                {data.directors.map((director) => (
                  <li key={`director-${director}`}>
                    <span>{intl.formatMessage(messages.director)}</span>
                    <span className="font-normal text-gray-400">
                      {director}
                    </span>
                  </li>
                ))}
              </ul>
              <FullCrewLink mediaType={data.mediaType} id={data.id} />
            </>
          )}
          {data.tags.length > 0 && (
            <div className="mt-6">
              {(showAllTags ? data.tags : data.tags.slice(0, TAG_LIMIT)).map(
                (tag) => (
                  <Link
                    href={data.tagHref(tag)}
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
          {/* Only studios with a page, which the banner opens */}
          {data.studio?.href && (
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
            {data.studio && (
              <div className="media-fact">
                <span>{intl.formatMessage(messages.studio)}</span>
                <span className="media-fact-value">
                  {data.studio.href ? (
                    <Link href={data.studio.href}>{data.studio.name}</Link>
                  ) : (
                    data.studio.name
                  )}
                </span>
              </div>
            )}
            {data.network && (
              <div className="media-fact">
                <span>{intl.formatMessage(messages.network)}</span>
                <span className="media-fact-value">
                  {data.network.href ? (
                    <Link href={data.network.href}>{data.network.name}</Link>
                  ) : (
                    data.network.name
                  )}
                </span>
              </div>
            )}
            {/* Laid out like a movie's Currently Streaming On */}
            {data.links.length > 0 && (
              <div className="media-fact flex-col gap-1">
                <span>{intl.formatMessage(messages.links)}</span>
                <span className="media-fact-value">
                  <AdultProfileLinks
                    links={data.links}
                    align="start"
                    className="gap-x-5 gap-y-2"
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
      />
      <AdultTitleSlider
        mediaType={data.mediaType}
        sliderKey={`${data.mediaType}-similar`}
        title={intl.formatMessage(messages.similar)}
        url={`/api/v1/${data.mediaType}/${data.id}/similar?page=1`}
        linkUrl={`/${data.mediaType}/${data.id}/similar`}
      />
      <div className="extra-bottom-space relative" />
    </div>
  );
};

export default AdultTitleDetails;
