import Badge from '@app/components/Common/Badge';
import CachedImage from '@app/components/Common/CachedImage';
import StatusBadge from '@app/components/StatusBadge';
import { Permission, useUser } from '@app/hooks/useUser';
import globalMessages from '@app/i18n/globalMessages';
import { stashImageUrl } from '@app/utils/stashImage';
import { MediaRequestStatus } from '@server/constants/media';
import type { MediaRequest } from '@server/entity/MediaRequest';
import type { NonFunctionProperties } from '@server/interfaces/api/common';
import type { SceneDetails } from '@server/models/Scene';
import Link from 'next/link';
import { useInView } from 'react-intersection-observer';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

interface SceneRequestCardProps {
  request: NonFunctionProperties<MediaRequest>;
}

// Slider card for scene requests; same footprint as RequestCard
const SceneRequestCard = ({ request }: SceneRequestCardProps) => {
  const intl = useIntl();
  const { hasPermission } = useUser();
  const { ref, inView } = useInView({ triggerOnce: true });
  const { data: scene } = useSWR<SceneDetails>(
    inView && request.media.stashId
      ? `/api/v1/scene/${request.media.stashId}`
      : null
  );
  const href = `/scene/${request.media.stashId}`;

  return (
    <div
      ref={ref}
      className="relative flex h-full w-72 overflow-hidden rounded-xl bg-gray-800 bg-cover bg-center p-4 text-gray-400 shadow ring-1 ring-gray-700 sm:w-96"
      data-testid="scene-request-card"
    >
      {scene?.imageUrl && (
        <div className="absolute inset-0 z-0">
          <CachedImage
            type="stashdb"
            alt=""
            src={stashImageUrl(scene.imageUrl, 600) ?? ''}
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
      <div className="relative z-10 flex min-w-0 flex-1 flex-col">
        <div className="hidden text-xs font-medium text-white sm:flex">
          {[scene?.studio?.name, scene?.releaseDate?.slice(0, 4)]
            .filter(Boolean)
            .join(' · ')}
        </div>
        <Link
          href={href}
          className="overflow-hidden overflow-ellipsis whitespace-nowrap text-base font-bold text-white hover:underline sm:text-lg"
        >
          {scene?.title ?? '…'}
        </Link>
        {hasPermission([Permission.MANAGE_REQUESTS, Permission.REQUEST_VIEW], {
          type: 'or',
        }) && (
          <div className="card-field truncate font-semibold">
            {request.requestedBy.displayName}
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
              title={scene?.title}
              inProgress={(request.media.downloadStatus ?? []).length > 0}
              mediaType="scene"
              serviceUrl={request.media.serviceUrl}
              plexUrl={request.media.mediaUrl}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default SceneRequestCard;
