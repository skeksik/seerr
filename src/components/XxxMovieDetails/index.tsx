import AdultLinkBlock from '@app/components/AdultLinkBlock';
import AdultMediaActions from '@app/components/AdultMediaActions';
import AdultIssueButton from '@app/components/AdultMediaActions/AdultIssueButton';
import AdultManageButton from '@app/components/AdultMediaActions/AdultManageButton';
import Button from '@app/components/Common/Button';
import CachedImage from '@app/components/Common/CachedImage';
import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import PageTitle from '@app/components/Common/PageTitle';
import Tag from '@app/components/Common/Tag';
import SceneRequestModal from '@app/components/RequestModal/SceneRequestModal';
import PerformerSlider from '@app/components/Scenes/PerformerSlider';
import StatusBadge from '@app/components/StatusBadge';
import StudioBanner from '@app/components/StudioBanner';
import XxxMovieSlider from '@app/components/XxxMovies/XxxMovieSlider';
import useAdult from '@app/hooks/useAdult';
import { Permission, useUser } from '@app/hooks/useUser';
import globalMessages from '@app/i18n/globalMessages';
import ErrorPage from '@app/pages/_error';
import defineMessages from '@app/utils/defineMessages';
import { linkLabel } from '@app/utils/linkLabel';
import { Transition } from '@headlessui/react';
import { ArrowDownTrayIcon } from '@heroicons/react/24/solid';
import { MediaStatus } from '@server/constants/media';
import type {
  XxxMovieDetails as XxxMovieDetailsType,
  XxxMovieStudio,
} from '@server/models/XxxMovie';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { Fragment, useState } from 'react';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

const messages = defineMessages('components.XxxMovieDetails', {
  overview: 'Overview',
  overviewunavailable: 'Overview unavailable.',
  cast: 'Cast',
  releasedate: 'Release Date',
  duration: 'Duration',
  studio: 'Studio',
  network: 'Network',
  director: 'Director',
  links: 'Links',
  recommendations: 'Recommendations',
  similar: 'Similar',
  minutes: '{minutes} min',
  showalltags: 'Show all {count} tags',
});

const TAG_LIMIT = 20;

// The StashDB studio page when StashDB has the studio, else its XXX movies
const studioHref = (studio: XxxMovieStudio): string =>
  studio.stashDbId
    ? `/scenes/studio/${studio.stashDbId}`
    : `/xxxmovies?studio=${studio.id}`;

const XxxMovieDetailsContent = () => {
  const intl = useIntl();
  const router = useRouter();
  const [showAllTags, setShowAllTags] = useState(false);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const { hasPermission } = useUser();
  const { data, error, mutate } = useSWR<XxxMovieDetailsType>(
    router.query.xxxMovieId
      ? `/api/v1/xxxmovie/${router.query.xxxMovieId}`
      : null
  );

  if (!data && !error) {
    return <LoadingSpinner />;
  }

  if (!data) {
    return <ErrorPage statusCode={404} />;
  }

  const status = data.mediaInfo?.status ?? MediaStatus.UNKNOWN;
  const canRequest =
    hasPermission(Permission.REQUEST) &&
    (status === MediaStatus.UNKNOWN || status === MediaStatus.DELETED);
  const year = data.releaseDate?.slice(0, 4);
  const minutes = data.duration ? Math.round(data.duration / 60) : undefined;
  const attributes: React.ReactNode[] = [
    <span
      key="badge"
      className="rounded-md border border-pink-500 bg-pink-600/80 p-0.5 py-0 text-white"
    >
      {intl.formatMessage(globalMessages.xxx)}
    </span>,
  ];

  if (data.studio) {
    attributes.push(
      <Link href={studioHref(data.studio)}>{data.studio.name}</Link>
    );
  }

  if (minutes) {
    attributes.push(intl.formatMessage(messages.minutes, { minutes }));
  }

  return (
    <div className="media-page" style={{ height: 493 }}>
      {(data.backdropUrl ?? data.posterUrl) && (
        <div className="media-page-bg-image">
          <CachedImage
            type="tpdb"
            alt=""
            src={data.backdropUrl ?? data.posterUrl ?? ''}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              // Covers are portrait, so they only work as a blurred wash
              filter: data.backdropUrl ? undefined : 'blur(16px)',
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
        <div className="media-poster">
          {data.posterUrl ? (
            <CachedImage
              type="tpdb"
              src={data.posterUrl}
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
        <div className="media-title">
          <div className="media-status">
            <StatusBadge
              status={data.mediaInfo?.status}
              downloadItem={data.mediaInfo?.downloadStatus}
              title={data.title}
              inProgress={(data.mediaInfo?.downloadStatus ?? []).length > 0}
              mediaType="xxxmovie"
              externalId={data.id}
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
        <div className="media-actions">
          <AdultMediaActions
            mediaType="xxxmovie"
            id={data.id}
            title={data.title}
            status={data.mediaInfo?.status}
            onUserWatchlist={data.onUserWatchlist}
            onChange={() => mutate()}
          />
          {canRequest && (
            <Button
              buttonType="primary"
              className="ml-2"
              onClick={() => setShowRequestModal(true)}
            >
              <ArrowDownTrayIcon />
              <span>{intl.formatMessage(globalMessages.request)}</span>
            </Button>
          )}
          <AdultIssueButton
            mediaType="xxxmovie"
            id={data.id}
            status={data.mediaInfo?.status}
          />
          <AdultManageButton
            mediaType="xxxmovie"
            data={data}
            revalidate={() => mutate()}
          />
        </div>
        <Transition
          as="div"
          show={showRequestModal}
          enter="transition-opacity duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="transition-opacity duration-300"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <SceneRequestModal
            item={{
              mediaType: 'xxxmovie',
              id: data.id,
              title: data.title,
              backdrop: data.posterUrl,
              backdropType: 'tpdb',
            }}
            onCancel={() => setShowRequestModal(false)}
            onComplete={() => {
              setShowRequestModal(false);
              mutate();
            }}
          />
        </Transition>
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
                    href={`/xxxmovies?tags=${tag.id}`}
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
              href={studioHref(data.studio)}
              studio={data.studio.name}
              studioId={data.studio.id}
              mediaType="xxxmovie"
              currentId={data.id}
              fallbackImageUrl={data.backdropUrl ?? data.posterUrl}
            />
          )}
          <div className="media-facts">
            {data.releaseDate && (
              <div className="media-fact">
                <span>{intl.formatMessage(messages.releasedate)}</span>
                <span className="media-fact-value">
                  {intl.formatDate(data.releaseDate, {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    timeZone: 'UTC',
                  })}
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
                  <Link href={studioHref(data.studio)}>{data.studio.name}</Link>
                </span>
              </div>
            )}
            {data.network && (
              <div className="media-fact">
                <span>{intl.formatMessage(messages.network)}</span>
                <span className="media-fact-value">
                  <Link href={studioHref(data.network)}>
                    {data.network.name}
                  </Link>
                </span>
              </div>
            )}
            {data.url && (
              <div className="media-fact">
                <span>{intl.formatMessage(messages.links)}</span>
                <span className="media-fact-value">
                  <a href={data.url} target="_blank" rel="noreferrer">
                    {linkLabel(data.url)}
                  </a>
                </span>
              </div>
            )}
            <div className="media-fact">
              <AdultLinkBlock tpdbUrl={data.tpdbUrl} />
            </div>
          </div>
        </div>
      </div>
      {data.performers.length > 0 && (
        <PerformerSlider
          sliderKey="xxx-movie-performers"
          title={intl.formatMessage(messages.cast)}
          linkUrl={`/xxxmovie/${data.id}/cast`}
          imageType="tpdb"
          performers={data.performers.map((performer) => ({
            id: performer.id,
            name: performer.name,
            // Performer pages come from StashDB; the rest get their movies
            href: performer.stashDbId
              ? `/scenes/performer/${performer.stashDbId}`
              : `/xxxmovies?performer=${performer.tpdbId}`,
            imageUrl: performer.imageUrl,
          }))}
        />
      )}
      <XxxMovieSlider
        sliderKey="xxx-recommendations"
        title={intl.formatMessage(messages.recommendations)}
        url={`/api/v1/xxxmovie/${data.id}/recommendations?page=1`}
        linkUrl={`/xxxmovie/${data.id}/recommendations`}
        hideWhenEmpty
      />
      <XxxMovieSlider
        sliderKey="xxx-similar"
        title={intl.formatMessage(messages.similar)}
        url={`/api/v1/xxxmovie/${data.id}/similar`}
        linkUrl={`/xxxmovie/${data.id}/similar`}
        hideWhenEmpty
      />
      <div className="extra-bottom-space relative" />
    </div>
  );
};

// Hooks above fetch unconditionally, so gate before mounting them
const XxxMovieDetails = () => {
  const canViewAdult = useAdult();

  if (!canViewAdult) {
    return <ErrorPage statusCode={404} />;
  }

  return <XxxMovieDetailsContent />;
};

export default XxxMovieDetails;
