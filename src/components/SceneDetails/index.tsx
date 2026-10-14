import Button from '@app/components/Common/Button';
import CachedImage from '@app/components/Common/CachedImage';
import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import PageTitle from '@app/components/Common/PageTitle';
import PlayButton from '@app/components/Common/PlayButton';
import Tag from '@app/components/Common/Tag';
import SceneRequestModal from '@app/components/RequestModal/SceneRequestModal';
import SceneSlider from '@app/components/Scenes/SceneSlider';
import StatusBadge from '@app/components/StatusBadge';
import useAdult from '@app/hooks/useAdult';
import { Permission, useUser } from '@app/hooks/useUser';
import globalMessages from '@app/i18n/globalMessages';
import ErrorPage from '@app/pages/_error';
import defineMessages from '@app/utils/defineMessages';
import { stashImageUrl } from '@app/utils/stashImage';
import { Transition } from '@headlessui/react';
import {
  ArrowDownTrayIcon,
  ArrowTopRightOnSquareIcon,
  PlayIcon,
  UserIcon,
} from '@heroicons/react/24/outline';
import { MediaStatus } from '@server/constants/media';
import type { SceneDetails as SceneDetailsType } from '@server/models/Scene';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { Fragment, useState } from 'react';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

const messages = defineMessages('components.SceneDetails', {
  overview: 'Overview',
  overviewunavailable: 'Overview unavailable.',
  performers: 'Performers',
  releasedate: 'Release Date',
  productiondate: 'Production Date',
  duration: 'Duration',
  studio: 'Studio',
  network: 'Network',
  code: 'Studio Code',
  director: 'Director',
  links: 'Links',
  viewonstashdb: 'View on StashDB',
  moreFromStudio: 'More from {studio}',
  minutes: '{minutes} min',
  showalltags: 'Show all {count} tags',
  playonstash: 'Play on Stash',
});

// StashDB scenes often carry 70+ tags
const TAG_LIMIT = 20;

const linkLabel = (url: string): string => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
};

interface SceneDetailsProps {
  scene?: SceneDetailsType;
}

const SceneDetailsContent = ({ scene }: SceneDetailsProps) => {
  const intl = useIntl();
  const router = useRouter();
  const [showAllTags, setShowAllTags] = useState(false);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const { hasPermission } = useUser();
  const { data, error, mutate } = useSWR<SceneDetailsType>(
    `/api/v1/scene/${router.query.sceneId}`,
    { fallbackData: scene }
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
      <Link href={`/scenes/studio/${data.studio.id}`}>{data.studio.name}</Link>
    );
  }

  if (minutes) {
    attributes.push(intl.formatMessage(messages.minutes, { minutes }));
  }

  return (
    <div className="media-page" style={{ height: 493 }}>
      {data.imageUrl && (
        <div className="media-page-bg-image">
          <CachedImage
            type="stashdb"
            alt=""
            src={stashImageUrl(data.imageUrl, 1280) ?? ''}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
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
        {data.imageUrl && (
          <div className="w-64 overflow-hidden rounded shadow md:w-80 md:rounded-lg md:shadow-2xl xl:mr-4 xl:w-96">
            <CachedImage
              type="stashdb"
              src={stashImageUrl(data.imageUrl, 600) ?? ''}
              alt=""
              sizes="100vw"
              style={{ width: '100%', height: 'auto' }}
              width={600}
              height={338}
              priority
            />
          </div>
        )}
        <div className="media-title">
          <div className="media-status">
            <StatusBadge
              status={data.mediaInfo?.status}
              downloadItem={data.mediaInfo?.downloadStatus}
              title={data.title}
              inProgress={(data.mediaInfo?.downloadStatus ?? []).length > 0}
              mediaType="scene"
              plexUrl={data.mediaInfo?.mediaUrl}
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
          {data.mediaInfo?.mediaUrl && (
            <div className="z-20 mr-2">
              <PlayButton
                links={[
                  {
                    text: intl.formatMessage(messages.playonstash),
                    url: data.mediaInfo.mediaUrl,
                    svg: <PlayIcon />,
                  },
                ]}
              />
            </div>
          )}
          <a href={data.stashDbUrl} target="_blank" rel="noreferrer">
            <Button buttonType="ghost">
              <ArrowTopRightOnSquareIcon />
              <span>{intl.formatMessage(messages.viewonstashdb)}</span>
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
              mediaType: 'scene',
              id: data.id,
              title: data.title,
              backdrop: stashImageUrl(data.imageUrl, 1280),
              backdropType: 'stashdb',
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
            {data.details || intl.formatMessage(messages.overviewunavailable)}
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
                      href={`/scenes/performer/${performer.id}`}
                      className="group flex items-center space-x-3 rounded-lg p-1 transition duration-300 hover:bg-gray-800"
                    >
                      <div className="relative h-12 w-12 flex-shrink-0 overflow-hidden rounded-full bg-gray-700 ring-1 ring-gray-600">
                        {performer.imageUrl ? (
                          <CachedImage
                            type="stashdb"
                            src={stashImageUrl(performer.imageUrl, 300) ?? ''}
                            alt=""
                            style={{
                              width: '100%',
                              height: '100%',
                              objectFit: 'cover',
                            }}
                            fill
                          />
                        ) : (
                          <UserIcon className="m-3 text-gray-400" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate font-semibold text-gray-200 group-hover:text-white">
                          {performer.name}
                        </div>
                        {(performer.as || performer.disambiguation) && (
                          <div className="truncate text-xs text-gray-400">
                            {performer.as ?? performer.disambiguation}
                          </div>
                        )}
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
                    href={`/scenes/browse?tag=${tag.id}`}
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
            {data.productionDate &&
              data.productionDate !== data.releaseDate && (
                <div className="media-fact">
                  <span>{intl.formatMessage(messages.productiondate)}</span>
                  <span className="media-fact-value">
                    {intl.formatDate(data.productionDate, {
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
                  <Link href={`/scenes/studio/${data.studio.id}`}>
                    {data.studio.name}
                  </Link>
                </span>
              </div>
            )}
            {data.studio?.parent && (
              <div className="media-fact">
                <span>{intl.formatMessage(messages.network)}</span>
                <span className="media-fact-value">
                  <Link href={`/scenes/studio/${data.studio.parent.id}`}>
                    {data.studio.parent.name}
                  </Link>
                </span>
              </div>
            )}
            {data.code && (
              <div className="media-fact">
                <span>{intl.formatMessage(messages.code)}</span>
                <span className="media-fact-value">{data.code}</span>
              </div>
            )}
            {data.director && (
              <div className="media-fact">
                <span>{intl.formatMessage(messages.director)}</span>
                <span className="media-fact-value">{data.director}</span>
              </div>
            )}
            {data.urls.length > 0 && (
              <div className="media-fact">
                <span>{intl.formatMessage(messages.links)}</span>
                <span className="media-fact-value flex flex-col items-end">
                  {data.urls.map((url) => (
                    <a
                      key={url.url}
                      href={url.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {linkLabel(url.url)}
                    </a>
                  ))}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
      {data.studio && (
        <SceneSlider
          sliderKey={`scene-studio-${data.studio.id}`}
          title={intl.formatMessage(messages.moreFromStudio, {
            studio: data.studio.name,
          })}
          url={`/api/v1/scene/discover?sort=date&page=1&studio=${data.studio.id}`}
          linkUrl={`/scenes/studio/${data.studio.id}`}
          hideWhenEmpty
        />
      )}
      <div className="extra-bottom-space relative" />
    </div>
  );
};

const SceneDetails = ({ scene }: SceneDetailsProps) => {
  const canViewAdult = useAdult();

  if (!canViewAdult) {
    return <ErrorPage statusCode={404} />;
  }

  return <SceneDetailsContent scene={scene} />;
};

export default SceneDetails;
