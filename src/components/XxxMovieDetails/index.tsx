import Button from '@app/components/Common/Button';
import CachedImage from '@app/components/Common/CachedImage';
import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import PageTitle from '@app/components/Common/PageTitle';
import Tag from '@app/components/Common/Tag';
import SceneRequestModal from '@app/components/RequestModal/SceneRequestModal';
import StatusBadge from '@app/components/StatusBadge';
import XxxMovieSlider from '@app/components/XxxMovies/XxxMovieSlider';
import useAdult from '@app/hooks/useAdult';
import { Permission, useUser } from '@app/hooks/useUser';
import globalMessages from '@app/i18n/globalMessages';
import ErrorPage from '@app/pages/_error';
import defineMessages from '@app/utils/defineMessages';
import { Transition } from '@headlessui/react';
import {
  ArrowDownTrayIcon,
  ArrowTopRightOnSquareIcon,
  UserIcon,
} from '@heroicons/react/24/solid';
import { MediaStatus } from '@server/constants/media';
import type { XxxMovieDetails as XxxMovieDetailsType } from '@server/models/XxxMovie';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { Fragment, useState } from 'react';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

const messages = defineMessages('components.XxxMovieDetails', {
  overview: 'Overview',
  overviewunavailable: 'Overview unavailable.',
  performers: 'Performers',
  releasedate: 'Release Date',
  duration: 'Duration',
  studio: 'Studio',
  network: 'Network',
  directors: 'Directed By',
  links: 'Links',
  studioSite: 'Studio Site',
  viewontpdb: 'View on ThePornDB',
  moreFromStudio: 'More from {studio}',
  minutes: '{minutes} min',
  showalltags: 'Show all {count} tags',
});

const TAG_LIMIT = 20;

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
  const attributes: React.ReactNode[] = [];

  if (data.studio) {
    attributes.push(
      <Link href={`/xxxmovies?studio=${data.studio.id}`}>
        {data.studio.name}
      </Link>
    );
  }

  if (minutes) {
    attributes.push(intl.formatMessage(messages.minutes, { minutes }));
  }

  return (
    <div className="media-page" style={{ height: 493 }}>
      {data.posterUrl && (
        <div className="media-page-bg-image">
          <CachedImage
            type="tpdb"
            alt=""
            src={data.posterUrl}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              filter: 'blur(16px)',
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
          <a href={data.tpdbUrl} target="_blank" rel="noreferrer">
            <Button buttonType="ghost">
              <ArrowTopRightOnSquareIcon />
              <span>{intl.formatMessage(messages.viewontpdb)}</span>
            </Button>
          </a>
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
          {data.performers.length > 0 && (
            <>
              <h2 className="mt-6">
                {intl.formatMessage(messages.performers)}
              </h2>
              <ul className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
                {data.performers.map((performer) => (
                  <li key={performer.id}>
                    <Link
                      href={`/xxxmovies?performer=${performer.tpdbId}`}
                      className="group flex items-center space-x-3 rounded-lg p-1 transition duration-300 hover:bg-gray-800"
                    >
                      <div className="relative h-12 w-12 flex-shrink-0 overflow-hidden rounded-full bg-gray-700 ring-1 ring-gray-600">
                        {performer.imageUrl ? (
                          <CachedImage
                            type="tpdb"
                            src={performer.imageUrl}
                            alt=""
                            style={{
                              width: '100%',
                              height: '100%',
                              objectFit: 'cover',
                              objectPosition: 'top',
                            }}
                            fill
                          />
                        ) : (
                          <UserIcon className="m-3 text-gray-400" />
                        )}
                      </div>
                      <div className="min-w-0 truncate font-semibold text-gray-200 group-hover:text-white">
                        {performer.name}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
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
                  <Link href={`/xxxmovies?studio=${data.studio.id}`}>
                    {data.studio.name}
                  </Link>
                </span>
              </div>
            )}
            {data.network && (
              <div className="media-fact">
                <span>{intl.formatMessage(messages.network)}</span>
                <span className="media-fact-value">
                  <Link href={`/xxxmovies?studio=${data.network.id}`}>
                    {data.network.name}
                  </Link>
                </span>
              </div>
            )}
            {data.directors.length > 0 && (
              <div className="media-fact">
                <span>{intl.formatMessage(messages.directors)}</span>
                <span className="media-fact-value">
                  {data.directors.join(', ')}
                </span>
              </div>
            )}
            {data.url && (
              <div className="media-fact">
                <span>{intl.formatMessage(messages.links)}</span>
                <span className="media-fact-value">
                  <a href={data.url} target="_blank" rel="noreferrer">
                    {intl.formatMessage(messages.studioSite)}
                  </a>
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
      {data.studio && (
        <XxxMovieSlider
          sliderKey={`xxx-studio-${data.studio.id}`}
          title={intl.formatMessage(messages.moreFromStudio, {
            studio: data.studio.name,
          })}
          url={`/api/v1/xxxmovie/discover?page=1&studio=${data.studio.id}`}
          linkUrl={`/xxxmovies?studio=${data.studio.id}`}
          hideWhenEmpty
        />
      )}
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
