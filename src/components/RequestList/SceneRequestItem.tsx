import Spinner from '@app/assets/spinner.svg';
import Badge from '@app/components/Common/Badge';
import Button from '@app/components/Common/Button';
import CachedImage from '@app/components/Common/CachedImage';
import ConfirmButton from '@app/components/Common/ConfirmButton';
import StatusBadge from '@app/components/StatusBadge';
import useToasts from '@app/hooks/useToasts';
import { Permission, useUser } from '@app/hooks/useUser';
import globalMessages from '@app/i18n/globalMessages';
import defineMessages from '@app/utils/defineMessages';
import { stashImageUrl } from '@app/utils/stashImage';
import {
  ArrowPathIcon,
  CheckIcon,
  TrashIcon,
  XMarkIcon,
} from '@heroicons/react/24/solid';
import { MediaRequestStatus } from '@server/constants/media';
import type { MediaRequest } from '@server/entity/MediaRequest';
import type { NonFunctionProperties } from '@server/interfaces/api/common';
import type { RequestResultsResponse } from '@server/interfaces/api/requestInterfaces';
import type { SceneDetails } from '@server/models/Scene';
import axios from 'axios';
import Link from 'next/link';
import { useState } from 'react';
import { useInView } from 'react-intersection-observer';
import { FormattedRelativeTime, useIntl } from 'react-intl';
import useSWR, { mutate } from 'swr';

const messages = defineMessages('components.RequestList.SceneRequestItem', {
  requested: 'Requested',
  requestedby: '{date} by {user}',
  profileName: 'Profile',
  deleterequest: 'Delete Request',
  cancelRequest: 'Cancel Request',
  removefromwhisparr: 'Remove from Whisparr',
  failedmodify: 'Something went wrong while modifying the request.',
  failedretry: 'Something went wrong while retrying the request.',
  removemediaerror: 'Something went wrong while removing the media.',
  unknownscene: 'Unknown Scene',
});

interface SceneRequestItemProps {
  request: RequestResultsResponse['results'][number];
  revalidateList: () => void;
}

// Scenes have no TMDB data, seasons or 4K tier, so they get their own row
const SceneRequestItem = ({
  request,
  revalidateList,
}: SceneRequestItemProps) => {
  const { ref, inView } = useInView({ triggerOnce: true });
  const intl = useIntl();
  const { addToast } = useToasts();
  const { user, hasPermission } = useUser();
  const { data: scene } = useSWR<SceneDetails>(
    inView && request.media.stashId
      ? `/api/v1/scene/${request.media.stashId}`
      : null
  );
  const { data: requestData, mutate: revalidate } = useSWR<
    NonFunctionProperties<MediaRequest>
  >(`/api/v1/request/${request.id}`, { fallbackData: request });
  const [updatingType, setUpdatingType] = useState<
    'approve' | 'decline' | 'retry' | null
  >(null);

  const runAction = async (
    type: 'approve' | 'decline' | 'retry',
    failure: string
  ) => {
    setUpdatingType(type);
    try {
      await axios.post(`/api/v1/request/${request.id}/${type}`);
      revalidate();
      revalidateList();
      mutate('/api/v1/request/count');
    } catch {
      addToast(failure, { autoDismiss: true, appearance: 'error' });
    } finally {
      setUpdatingType(null);
    }
  };

  const deleteRequest = async () => {
    await axios.delete(`/api/v1/request/${request.id}`);
    revalidateList();
    mutate('/api/v1/request/count');
  };

  const deleteMediaFile = async () => {
    try {
      await axios.delete(`/api/v1/media/${request.media.id}/file`);
    } catch {
      addToast(intl.formatMessage(messages.removemediaerror), {
        autoDismiss: true,
        appearance: 'error',
      });
    }
    revalidateList();
  };

  const data = requestData ?? request;
  const title = scene?.title ?? intl.formatMessage(messages.unknownscene);
  const href = `/scene/${request.media.stashId}`;
  const relativeDate = (date: Date) => (
    <FormattedRelativeTime
      key="date"
      value={Math.floor((new Date(date).getTime() - Date.now()) / 1000)}
      updateIntervalInSeconds={1}
      numeric="auto"
    />
  );

  return (
    <div
      ref={ref}
      className="relative flex w-full flex-col justify-between overflow-hidden rounded-xl bg-gray-800 py-2 text-gray-400 shadow-md ring-1 ring-gray-700 xl:h-28 xl:flex-row"
    >
      <div className="relative flex w-full flex-col justify-between overflow-hidden sm:flex-row">
        <div className="relative z-10 flex w-full items-center overflow-hidden pl-4 pr-4 sm:pr-0 xl:w-7/12 2xl:w-2/3">
          <Link
            href={href}
            className="relative h-auto w-32 flex-shrink-0 scale-100 transform-gpu overflow-hidden rounded-md bg-gray-700 transition duration-300 hover:scale-105"
            style={{ aspectRatio: '16 / 9' }}
          >
            {scene?.imageUrl && (
              <CachedImage
                type="stashdb"
                src={stashImageUrl(scene.imageUrl, 300) ?? ''}
                alt=""
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                fill
              />
            )}
          </Link>
          <div className="flex flex-col justify-center overflow-hidden pl-2 xl:pl-4">
            <div className="pt-0.5 text-xs font-medium text-white sm:pt-1">
              {[scene?.studio?.name, scene?.releaseDate?.slice(0, 4)]
                .filter(Boolean)
                .join(' · ')}
            </div>
            <Link
              href={href}
              className="mr-2 min-w-0 truncate text-lg font-bold text-white hover:underline xl:text-xl"
            >
              {title}
            </Link>
          </div>
        </div>
        <div className="z-10 ml-4 mt-4 flex w-full flex-col justify-center gap-1 overflow-hidden pr-4 text-sm sm:ml-2 sm:mt-0 xl:flex-1 xl:pr-0">
          <div className="card-field">
            <span className="card-field-name">
              {intl.formatMessage(globalMessages.status)}
            </span>
            {data.status === MediaRequestStatus.DECLINED ? (
              <Badge badgeType="danger">
                {intl.formatMessage(globalMessages.declined)}
              </Badge>
            ) : data.status === MediaRequestStatus.FAILED ? (
              <Badge badgeType="danger">
                {intl.formatMessage(globalMessages.failed)}
              </Badge>
            ) : (
              <StatusBadge
                status={data.media.status}
                downloadItem={data.media.downloadStatus}
                title={title}
                inProgress={(data.media.downloadStatus ?? []).length > 0}
                mediaType="scene"
                serviceUrl={data.media.serviceUrl}
              />
            )}
          </div>
          <div className="card-field">
            <span className="card-field-name">
              {intl.formatMessage(messages.requested)}
            </span>
            <span className="flex truncate text-sm text-gray-300">
              {intl.formatMessage(messages.requestedby, {
                date: relativeDate(data.createdAt),
                user: (
                  <Link
                    key="user"
                    href={`/users/${data.requestedBy.id}`}
                    className="ml-1.5 truncate text-sm font-semibold hover:text-white hover:underline"
                  >
                    {data.requestedBy.displayName}
                  </Link>
                ),
              })}
            </span>
          </div>
          {request.profileName && (
            <div className="card-field">
              <span className="card-field-name">
                {intl.formatMessage(messages.profileName)}
              </span>
              <span className="flex truncate text-sm text-gray-300">
                {request.profileName}
              </span>
            </div>
          )}
        </div>
      </div>
      <div className="z-10 mt-4 flex w-full flex-col justify-center space-y-2 pl-4 pr-4 xl:mt-0 xl:w-96 xl:items-end xl:pl-0">
        {data.status === MediaRequestStatus.FAILED &&
          hasPermission(Permission.MANAGE_REQUESTS) && (
            <Button
              className="w-full"
              buttonType="primary"
              disabled={updatingType !== null}
              onClick={() =>
                runAction('retry', intl.formatMessage(messages.failedretry))
              }
            >
              <ArrowPathIcon
                className={updatingType === 'retry' ? 'animate-spin' : ''}
              />
              <span>{intl.formatMessage(globalMessages.retry)}</span>
            </Button>
          )}
        {data.status !== MediaRequestStatus.PENDING &&
          hasPermission(Permission.MANAGE_REQUESTS) && (
            <>
              <ConfirmButton
                onClick={() => deleteRequest()}
                confirmText={intl.formatMessage(globalMessages.areyousure)}
                className="w-full"
              >
                <TrashIcon />
                <span>{intl.formatMessage(messages.deleterequest)}</span>
              </ConfirmButton>
              {request.canRemove && (
                <ConfirmButton
                  onClick={() => deleteMediaFile()}
                  confirmText={intl.formatMessage(globalMessages.areyousure)}
                  className="w-full"
                >
                  <TrashIcon />
                  <span>{intl.formatMessage(messages.removefromwhisparr)}</span>
                </ConfirmButton>
              )}
            </>
          )}
        {data.status === MediaRequestStatus.PENDING &&
          hasPermission(Permission.MANAGE_REQUESTS) && (
            <div className="flex w-full flex-row space-x-2">
              <span className="w-full">
                <Button
                  className="w-full"
                  buttonType="success"
                  onClick={() =>
                    runAction(
                      'approve',
                      intl.formatMessage(messages.failedmodify)
                    )
                  }
                  disabled={updatingType !== null}
                >
                  {updatingType === 'approve' ? <Spinner /> : <CheckIcon />}
                  <span>{intl.formatMessage(globalMessages.approve)}</span>
                </Button>
              </span>
              <span className="w-full">
                <Button
                  className="w-full"
                  buttonType="danger"
                  onClick={() =>
                    runAction(
                      'decline',
                      intl.formatMessage(messages.failedmodify)
                    )
                  }
                  disabled={updatingType !== null}
                >
                  {updatingType === 'decline' ? <Spinner /> : <XMarkIcon />}
                  <span>{intl.formatMessage(globalMessages.decline)}</span>
                </Button>
              </span>
            </div>
          )}
        {data.status === MediaRequestStatus.PENDING &&
          !hasPermission(Permission.MANAGE_REQUESTS) &&
          data.requestedBy.id === user?.id && (
            <ConfirmButton
              onClick={() => deleteRequest()}
              confirmText={intl.formatMessage(globalMessages.areyousure)}
              className="w-full"
            >
              <XMarkIcon />
              <span>{intl.formatMessage(messages.cancelRequest)}</span>
            </ConfirmButton>
          )}
      </div>
    </div>
  );
};

export default SceneRequestItem;
