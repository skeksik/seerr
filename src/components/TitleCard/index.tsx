import Spinner from '@app/assets/spinner.svg';
import BlocklistModal from '@app/components/BlocklistModal';
import Button from '@app/components/Common/Button';
import CachedImage from '@app/components/Common/CachedImage';
import StatusBadgeMini from '@app/components/Common/StatusBadgeMini';
import Tooltip from '@app/components/Common/Tooltip';
import { orientationMessages } from '@app/components/OrientationSelector';
import RequestModal from '@app/components/RequestModal';
import { LANDSCAPE_CARD_WIDTH } from '@app/components/TitleCard/constants';
import ErrorCard from '@app/components/TitleCard/ErrorCard';
import Placeholder from '@app/components/TitleCard/Placeholder';
import useBlocklistToggle from '@app/hooks/useBlocklistToggle';
import { useIsTouch } from '@app/hooks/useIsTouch';
import { Permission, UserType, useUser } from '@app/hooks/useUser';
import useWatchlistToggle from '@app/hooks/useWatchlistToggle';
import globalMessages from '@app/i18n/globalMessages';
import type { AdultMediaType } from '@app/utils/adultMedia';
import { isAdultMediaType } from '@app/utils/adultMedia';
import defineMessages from '@app/utils/defineMessages';
import { withProperties } from '@app/utils/typeHelpers';
import { Transition } from '@headlessui/react';
import {
  ArrowDownTrayIcon,
  EyeIcon,
  EyeSlashIcon,
  MinusCircleIcon,
  StarIcon,
} from '@heroicons/react/24/outline';
import { MediaStatus } from '@server/constants/media';
import type { Orientation } from '@server/lib/orientation';
import type { MediaType } from '@server/models/Search';
import Link from 'next/link';
import { Fragment, useCallback, useEffect, useState } from 'react';
import { useIntl } from 'react-intl';

interface TitleCardProps {
  id: number | string;
  // TMDB poster path, or the full image URL of a scene or adult movie
  image?: string;
  summary?: string;
  year?: string;
  // Line under the year, e.g. studio and year of adult titles
  subtitle?: string;
  title: string;
  userScore?: number;
  mediaType: MediaType | AdultMediaType;
  status?: MediaStatus;
  canExpand?: boolean;
  inProgress?: boolean;
  isAddedToWatchlist?: number | boolean;
  mutateParent?: () => void;
  // Scenes and adult movies
  orientations?: Orientation[];
}

const messages = defineMessages('components.TitleCard', {
  addToWatchList: 'Add to watchlist',
  watchlistSuccess:
    '<strong>{title}</strong> added to watchlist  successfully!',
  watchlistDeleted:
    '<strong>{title}</strong> Removed from watchlist  successfully!',
  watchlistCancel: 'watchlist for <strong>{title}</strong> canceled.',
  watchlistError: 'Something went wrong. Please try again.',
});

// Lines of title and summary; summaryCompact applies without a request
// button. Wide scene cards are short, adult movie cards leave room for the
// studio line
const lineClamps = {
  scene: { title: 1, summary: 1, summaryCompact: 2 },
  adultmovie: { title: 2, summary: 2, summaryCompact: 2 },
  default: { title: 3, summary: 3, summaryCompact: 5 },
};

const TitleCard = ({
  id,
  image,
  summary,
  year,
  subtitle,
  title,
  status,
  mediaType,
  isAddedToWatchlist = false,
  inProgress = false,
  canExpand = false,
  mutateParent,
  orientations,
}: TitleCardProps) => {
  const isTouch = useIsTouch();
  const intl = useIntl();
  const { user, hasPermission } = useUser();
  const [isUpdating, setIsUpdating] = useState(false);
  const [currentStatus, setCurrentStatus] = useState(status);
  const [showDetail, setShowDetail] = useState(false);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [showBlocklistModal, setShowBlocklistModal] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const adultType = isAdultMediaType(mediaType) ? mediaType : undefined;
  // Scene stills are landscape; everything else has portrait posters
  const isScene = mediaType === 'scene';
  const hasImage = !!image && !imageFailed;
  const clamps = lineClamps[adultType ?? 'default'];
  const watchlist = useWatchlistToggle({
    id,
    mediaType,
    title,
    onWatchlist: !!isAddedToWatchlist,
    messages: {
      added: messages.watchlistSuccess,
      removed: messages.watchlistDeleted,
      error: messages.watchlistError,
    },
    onRemoved: mutateParent,
  });
  const blocklist = useBlocklistToggle({
    id,
    mediaType,
    title,
    onChange: (newStatus) => {
      setCurrentStatus(newStatus);
      if (mutateParent) {
        mutateParent();
      }
    },
  });
  const showUpdating =
    isUpdating || watchlist.isUpdating || blocklist.isUpdating;

  // Just to get the year from the date
  if (year) {
    year = year.slice(0, 4);
  }

  useEffect(() => {
    setCurrentStatus(status);
  }, [status]);

  const requestComplete = useCallback((newStatus: MediaStatus) => {
    setCurrentStatus(newStatus);
    setShowRequestModal(false);
  }, []);

  const requestUpdating = useCallback(
    (status: boolean) => setIsUpdating(status),
    []
  );

  const closeBlocklistModal = useCallback(
    () => setShowBlocklistModal(false),
    []
  );

  const onClickHideItemBtn = async (): Promise<void> => {
    await blocklist.blocklist();
    closeBlocklistModal();
  };

  const closeModal = useCallback(() => setShowRequestModal(false), []);

  // Adult titles have no type-specific request permission
  const showRequestButton = adultType
    ? hasPermission(Permission.REQUEST)
    : hasPermission(
        [
          Permission.REQUEST,
          mediaType === 'movie' || mediaType === 'collection'
            ? Permission.REQUEST_MOVIE
            : Permission.REQUEST_TV,
        ],
        { type: 'or' }
      );
  const href = adultType
    ? `/${adultType}/${id}`
    : mediaType === 'movie'
      ? `/movie/${id}`
      : mediaType === 'collection'
        ? `/collection/${id}`
        : `/tv/${id}`;
  const tmdbType =
    mediaType === 'movie'
      ? 'movie'
      : mediaType === 'collection'
        ? 'collection'
        : 'tv';

  const showHideButton = hasPermission([Permission.MANAGE_BLOCKLIST], {
    type: 'or',
  });

  return (
    <div
      className={
        canExpand
          ? 'w-full'
          : isScene
            ? LANDSCAPE_CARD_WIDTH
            : 'w-36 sm:w-36 md:w-44'
      }
      data-testid="title-card"
    >
      <RequestModal
        {...(adultType
          ? { type: adultType, externalId: String(id) }
          : { type: tmdbType, tmdbId: id as number })}
        show={showRequestModal}
        onComplete={requestComplete}
        onUpdating={requestUpdating}
        onCancel={closeModal}
      />
      <BlocklistModal
        id={id}
        type={adultType ?? tmdbType}
        show={showBlocklistModal}
        onCancel={closeBlocklistModal}
        onComplete={onClickHideItemBtn}
        isUpdating={showUpdating}
      />
      <div
        className={`group relative transform-gpu cursor-default overflow-hidden rounded-xl bg-gray-800 bg-cover outline-none ring-1 transition duration-300 ${
          showDetail
            ? 'scale-105 shadow-lg ring-gray-500'
            : 'scale-100 shadow ring-gray-700'
        }`}
        style={{
          paddingBottom: isScene ? '56.25%' : '150%',
        }}
        onMouseEnter={() => {
          if (!isTouch) {
            setShowDetail(true);
          }
        }}
        // A card that loads under the cursor gets no mouseenter
        onMouseMove={() => {
          if (!isTouch && !showDetail) {
            setShowDetail(true);
          }
        }}
        onMouseLeave={() => setShowDetail(false)}
        onClick={() => setShowDetail(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            setShowDetail(true);
          }
        }}
        role="link"
        tabIndex={0}
      >
        <div className="absolute inset-0 h-full w-full overflow-hidden">
          {adultType ? (
            hasImage ? (
              <CachedImage
                type={isScene ? 'stashdb' : 'tpdb'}
                className="absolute inset-0 h-full w-full"
                alt=""
                src={image}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                fill
                // ThePornDB's CDN fails now and then; the details show instead
                onError={() => setImageFailed(true)}
              />
            ) : (
              !isScene && (
                <CachedImage
                  type="tmdb"
                  className="absolute inset-0 h-full w-full"
                  alt=""
                  src="/images/seerr_poster_not_found_logo_top.png"
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  fill
                />
              )
            )
          ) : (
            <CachedImage
              type="tmdb"
              className="absolute inset-0 h-full w-full"
              alt=""
              src={
                image
                  ? `https://image.tmdb.org/t/p/w300_and_h450_face${image}`
                  : `/images/seerr_poster_not_found_logo_top.png`
              }
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              fill
            />
          )}
          <div className="absolute left-0 right-0 flex items-center justify-between p-2">
            <div className="pointer-events-none z-40 flex flex-col items-start gap-1 self-start">
              <div
                className={`pointer-events-none z-40 self-start rounded-full border shadow-md ${
                  adultType
                    ? 'border-pink-500 bg-pink-600/80'
                    : mediaType === 'movie' || mediaType === 'collection'
                      ? 'border-blue-500 bg-blue-600/80'
                      : 'border-purple-600 bg-purple-600/80'
                }`}
              >
                <div className="flex h-4 items-center px-2 py-2 text-center text-xs font-medium uppercase tracking-wider text-white sm:h-5">
                  {isScene
                    ? intl.formatMessage(globalMessages.scene)
                    : adultType
                      ? intl.formatMessage(globalMessages.adult)
                      : mediaType === 'movie'
                        ? intl.formatMessage(globalMessages.movie)
                        : mediaType === 'collection'
                          ? intl.formatMessage(globalMessages.collection)
                          : intl.formatMessage(globalMessages.tvshow)}
                </div>
              </div>
              {/* Sexual preferences, which the Filters panel goes by, by
                  their first letter */}
              {orientations?.some((value) => value !== 'unidentified') && (
                <div className="flex gap-1">
                  {orientations
                    .filter((orientation) => orientation !== 'unidentified')
                    .map((orientation) => {
                      const name = intl.formatMessage(
                        orientationMessages[orientation]
                      );
                      return (
                        <div
                          key={orientation}
                          aria-label={name}
                          title={name}
                          className="flex h-5 w-5 items-center justify-center rounded-full bg-gray-900/80 text-[0.65rem] font-semibold text-gray-200 shadow-md"
                        >
                          {name.charAt(0)}
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
            {showDetail && currentStatus !== MediaStatus.BLOCKLISTED && (
              <div
                // Wide scene cards keep them right, as far from the status
                // as the middle of a poster card is
                className={`flex gap-1 ${
                  isScene
                    ? `ml-auto flex-row ${
                        currentStatus && currentStatus !== MediaStatus.UNKNOWN
                          ? 'mr-5'
                          : ''
                      }`
                    : 'flex-col'
                }`}
              >
                {user?.userType !== UserType.PLEX &&
                  (!watchlist.onWatchlist ? (
                    <Button
                      buttonType={'ghost'}
                      className="z-40"
                      buttonSize={'sm'}
                      onClick={watchlist.add}
                    >
                      <StarIcon className={'h-3 text-amber-300'} />
                    </Button>
                  ) : (
                    <Button
                      className="z-40"
                      buttonSize={'sm'}
                      onClick={watchlist.remove}
                    >
                      <MinusCircleIcon className={'h-3'} />
                    </Button>
                  ))}
                {showHideButton &&
                  currentStatus !== MediaStatus.PROCESSING &&
                  currentStatus !== MediaStatus.AVAILABLE &&
                  currentStatus !== MediaStatus.PARTIALLY_AVAILABLE &&
                  currentStatus !== MediaStatus.PENDING && (
                    <Button
                      buttonType={'ghost'}
                      className="z-40"
                      buttonSize={'sm'}
                      onClick={() => setShowBlocklistModal(true)}
                    >
                      <EyeSlashIcon className={'h-3'} />
                    </Button>
                  )}
              </div>
            )}
            {showDetail &&
              showHideButton &&
              currentStatus == MediaStatus.BLOCKLISTED && (
                <Tooltip
                  content={intl.formatMessage(
                    globalMessages.removefromBlocklist
                  )}
                >
                  <Button
                    buttonType={'ghost'}
                    className="z-40"
                    buttonSize={'sm'}
                    onClick={() => blocklist.unblocklist()}
                  >
                    <EyeIcon className={'h-3'} />
                  </Button>
                </Tooltip>
              )}
            {currentStatus && currentStatus !== MediaStatus.UNKNOWN && (
              <div className="flex flex-col items-center gap-1">
                <div className="pointer-events-none z-40 flex">
                  <StatusBadgeMini
                    status={currentStatus}
                    inProgress={inProgress}
                    shrink
                  />
                </div>
              </div>
            )}
          </div>
          <Transition
            as={Fragment}
            show={showUpdating}
            enter="transition-opacity ease-in-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="transition-opacity ease-in-out duration-300"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="absolute inset-0 z-40 flex items-center justify-center rounded-xl bg-gray-800/75 text-white">
              <Spinner className="h-10 w-10" />
            </div>
          </Transition>

          <Transition
            as={Fragment}
            show={!hasImage || showDetail || showRequestModal}
            enter="transition-opacity"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="transition-opacity"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="absolute inset-0 overflow-hidden rounded-xl">
              <Link
                href={href}
                className="absolute inset-0 h-full w-full cursor-pointer overflow-hidden text-left"
                style={{
                  background:
                    'linear-gradient(180deg, rgba(45, 55, 72, 0.4) 0%, rgba(45, 55, 72, 0.9) 100%)',
                }}
              >
                <div className="flex h-full w-full items-end">
                  <div
                    className={`px-2 text-white ${
                      !showRequestButton ||
                      (currentStatus &&
                        currentStatus !== MediaStatus.UNKNOWN &&
                        currentStatus !== MediaStatus.DELETED)
                        ? 'pb-2'
                        : 'pb-11'
                    }`}
                  >
                    {[year, subtitle].filter(Boolean).map((line) => (
                      <div
                        key={line}
                        // Long studio names end in an ellipsis; all of it
                        // shows on hover
                        title={line}
                        className="truncate text-sm font-medium"
                      >
                        {line}
                      </div>
                    ))}

                    <h1
                      className={`whitespace-normal font-bold leading-tight ${
                        isScene ? 'text-lg' : 'text-xl'
                      }`}
                      style={{
                        WebkitLineClamp: clamps.title,
                        display: '-webkit-box',
                        overflow: 'hidden',
                        WebkitBoxOrient: 'vertical',
                        wordBreak: 'break-word',
                      }}
                      data-testid="title-card-title"
                    >
                      {title}
                    </h1>
                    <div
                      className="whitespace-normal text-xs"
                      style={{
                        WebkitLineClamp:
                          !showRequestButton ||
                          (currentStatus &&
                            currentStatus !== MediaStatus.UNKNOWN &&
                            currentStatus !== MediaStatus.DELETED)
                            ? clamps.summaryCompact
                            : clamps.summary,
                        display: '-webkit-box',
                        overflow: 'hidden',
                        WebkitBoxOrient: 'vertical',
                        wordBreak: 'break-word',
                      }}
                    >
                      {summary}
                    </div>
                  </div>
                </div>
              </Link>

              <div className="absolute bottom-0 left-0 right-0 flex justify-between px-2 py-2">
                {showRequestButton &&
                  (!currentStatus ||
                    currentStatus === MediaStatus.UNKNOWN ||
                    currentStatus === MediaStatus.DELETED) && (
                    <Button
                      buttonType="primary"
                      buttonSize="sm"
                      onClick={(e) => {
                        e.preventDefault();
                        setShowRequestModal(true);
                      }}
                      className="h-7 w-full"
                    >
                      <ArrowDownTrayIcon />
                      <span>{intl.formatMessage(globalMessages.request)}</span>
                    </Button>
                  )}
              </div>
            </div>
          </Transition>
        </div>
      </div>
    </div>
  );
};

export default withProperties(TitleCard, { Placeholder, ErrorCard });
