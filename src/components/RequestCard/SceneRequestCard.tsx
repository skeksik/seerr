import Badge from '@app/components/Common/Badge';
import CachedImage from '@app/components/Common/CachedImage';
import StatusBadge from '@app/components/StatusBadge';
import useAdultRequestItem from '@app/hooks/useAdultRequestItem';
import { Permission, useUser } from '@app/hooks/useUser';
import globalMessages from '@app/i18n/globalMessages';
import { MediaRequestStatus } from '@server/constants/media';
import type { MediaRequest } from '@server/entity/MediaRequest';
import type { NonFunctionProperties } from '@server/interfaces/api/common';
import Link from 'next/link';
import { useInView } from 'react-intersection-observer';
import { useIntl } from 'react-intl';

interface SceneRequestCardProps {
  request: NonFunctionProperties<MediaRequest>;
}

// Slider card for scene requests; same footprint as RequestCard, whose
// height comes from its poster (w-20/w-28 at 2:3, plus padding)
const SceneRequestCard = ({ request }: SceneRequestCardProps) => {
  const intl = useIntl();
  const { hasPermission } = useUser();
  const { ref, inView } = useInView({ triggerOnce: true });
  const item = useAdultRequestItem(request.media, inView, 600);
  const href = item.href;

  return (
    <div
      ref={ref}
      className="relative flex h-full min-h-[9.5rem] w-72 overflow-hidden rounded-xl bg-gray-800 bg-cover bg-center p-4 text-gray-400 shadow ring-1 ring-gray-700 sm:min-h-[12.5rem] sm:w-96"
      data-testid="scene-request-card"
    >
      {item.backdropUrl && (
        <div className="absolute inset-0 z-0">
          <CachedImage
            type={item.imageType}
            alt=""
            src={item.backdropUrl}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            fill
          />
          <div
            className="absolute inset-0"
            style={{
              backgroundImage:
                'linear-gradient(135deg, rgba(17, 24, 39, 0.47) 0%, rgba(17, 24, 39, 1) 75%)',
            }}
          />
        </div>
      )}
      <div className="relative z-10 flex min-w-0 flex-1 flex-col pr-4">
        <div className="hidden text-xs font-medium text-white sm:flex">
          {item.subtitle}
        </div>
        <Link
          href={href}
          className="overflow-hidden overflow-ellipsis whitespace-nowrap text-base font-bold text-white hover:underline sm:text-lg"
        >
          {item.title ?? '…'}
        </Link>
        {hasPermission([Permission.MANAGE_REQUESTS, Permission.REQUEST_VIEW], {
          type: 'or',
        }) && (
          <div className="card-field">
            <Link
              href={`/users/${request.requestedBy.id}`}
              className="group flex items-center"
            >
              <span className="avatar-sm">
                <CachedImage
                  type="avatar"
                  src={request.requestedBy.avatar}
                  alt=""
                  className="avatar-sm object-cover"
                  width={20}
                  height={20}
                />
              </span>
              <span className="truncate font-semibold group-hover:underline">
                {request.requestedBy.displayName}
              </span>
            </Link>
          </div>
        )}
        <div className="mt-2 flex items-center text-sm sm:mt-1">
          <span className="mr-2 hidden font-bold sm:block">
            {intl.formatMessage(globalMessages.status)}
          </span>
          {request.status === MediaRequestStatus.DECLINED ||
          request.status === MediaRequestStatus.FAILED ? (
            <Badge badgeType="danger">
              {intl.formatMessage(
                request.status === MediaRequestStatus.DECLINED
                  ? globalMessages.declined
                  : globalMessages.failed
              )}
            </Badge>
          ) : (
            <StatusBadge
              status={request.media.status}
              downloadItem={request.media.downloadStatus}
              title={item.title}
              inProgress={(request.media.downloadStatus ?? []).length > 0}
              mediaType={request.type === 'scene' ? 'scene' : 'adultmovie'}
              externalId={request.media.stashId ?? request.media.tpdbId}
              serviceUrl={request.media.serviceUrl}
              plexUrl={request.media.mediaUrl}
            />
          )}
        </div>
      </div>
      {/* Covers sit like movie posters; scene stills are landscape */}
      <Link
        href={href}
        className={`relative z-10 flex-shrink-0 scale-100 transform-gpu cursor-pointer overflow-hidden rounded-md bg-gray-700 shadow-sm transition duration-300 hover:scale-105 hover:shadow-md ${
          item.portrait ? 'w-20 sm:w-28' : 'w-28 self-center sm:w-40'
        }`}
        style={{ aspectRatio: item.portrait ? '2 / 3' : '16 / 9' }}
      >
        {item.imageUrl ? (
          <CachedImage
            type={item.imageType}
            src={item.imageUrl}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            fill
          />
        ) : (
          item.portrait && (
            <CachedImage
              type="tmdb"
              src="/images/seerr_poster_not_found.png"
              alt=""
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              fill
            />
          )
        )}
      </Link>
    </div>
  );
};

export default SceneRequestCard;
