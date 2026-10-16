import Alert from '@app/components/Common/Alert';
import Modal from '@app/components/Common/Modal';
import type { RequestOverrides } from '@app/components/RequestModal/AdvancedRequester';
import AdvancedRequester from '@app/components/RequestModal/AdvancedRequester';
import { messages as movieMessages } from '@app/components/RequestModal/MovieRequestModal';
import QuotaDisplay from '@app/components/RequestModal/QuotaDisplay';
import useToasts from '@app/hooks/useToasts';
import { Permission, useUser } from '@app/hooks/useUser';
import globalMessages from '@app/i18n/globalMessages';
import type { AdultMediaType } from '@app/utils/adultMedia';
import defineMessages from '@app/utils/defineMessages';
import { adultArtwork } from '@app/utils/stashImage';
import { MediaStatus } from '@server/constants/media';
import type { MediaRequest } from '@server/entity/MediaRequest';
import type { QuotaResponse } from '@server/interfaces/api/userInterfaces';
import { mediaPermissions } from '@server/lib/permissions';
import type { AdultMovieDetails } from '@server/models/AdultMovie';
import type { SceneDetails } from '@server/models/Scene';
import axios from 'axios';
import { useEffect, useState } from 'react';
import { useIntl } from 'react-intl';
import useSWR, { mutate } from 'swr';

const messages = defineMessages('components.RequestModal.AdultRequestModal', {
  requestscenetitle: 'Request Scene',
  requestadultmovietitle: 'Request Adult Movie',
});

interface AdultRequestModalProps {
  type: AdultMediaType;
  // StashDB scene or ThePornDB movie UUID
  id: string;
  onCancel?: () => void;
  onComplete?: (newStatus: MediaStatus) => void;
  onUpdating?: (isUpdating: boolean) => void;
}

// Scenes and adult movies share this modal; both go to Whisparr
const AdultRequestModal = ({
  type,
  id,
  onCancel,
  onComplete,
  onUpdating,
}: AdultRequestModalProps) => {
  const intl = useIntl();
  const { addToast } = useToasts();
  const { user, hasPermission } = useUser();
  const [isUpdating, setIsUpdating] = useState(false);
  const [overrides, setOverrides] = useState<RequestOverrides | null>(null);
  const { data, error } = useSWR<SceneDetails | AdultMovieDetails>(
    `/api/v1/${type}/${id}`
  );
  const { data: quota } = useSWR<QuotaResponse>(
    user && (!overrides?.user?.id || hasPermission(Permission.MANAGE_USERS))
      ? `/api/v1/user/${overrides?.user?.id ?? user.id}/quota`
      : null
  );
  const itemQuota = type === 'scene' ? quota?.scene : quota?.adultMovie;
  const artwork = data && adultArtwork(data);

  const hasAutoApprove = hasPermission(
    [...mediaPermissions('autoApprove', type), Permission.MANAGE_REQUESTS],
    { type: 'or' }
  );

  useEffect(() => {
    if (onUpdating) {
      onUpdating(isUpdating);
    }
  }, [isUpdating, onUpdating]);

  const sendRequest = async () => {
    setIsUpdating(true);

    try {
      await axios.post<MediaRequest>('/api/v1/request', {
        mediaType: type,
        [type === 'scene' ? 'stashId' : 'tpdbId']: id,
        serverId: overrides?.server,
        profileId: overrides?.profile,
        rootFolder: overrides?.folder,
        userId: overrides?.user?.id,
        tags: overrides?.tags,
        ignoreQuota: overrides?.ignoreQuota,
      });
      mutate('/api/v1/request?filter=all&take=10&sort=modified&skip=0');
      mutate('/api/v1/request/count');

      if (onComplete) {
        onComplete(
          hasAutoApprove ? MediaStatus.PROCESSING : MediaStatus.PENDING
        );
      }
      addToast(
        <span>
          {intl.formatMessage(movieMessages.requestSuccess, {
            title: data?.title,
            strong: (msg: React.ReactNode) => <strong>{msg}</strong>,
          })}
        </span>,
        { appearance: 'success', autoDismiss: true }
      );
    } catch {
      addToast(intl.formatMessage(movieMessages.requesterror), {
        appearance: 'error',
        autoDismiss: true,
      });
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <Modal
      loading={(!data && !error) || !quota}
      backgroundClickable
      onCancel={onCancel}
      onOk={sendRequest}
      okDisabled={
        isUpdating || (itemQuota?.restricted && !overrides?.ignoreQuota)
      }
      title={intl.formatMessage(
        type === 'scene'
          ? messages.requestscenetitle
          : messages.requestadultmovietitle
      )}
      subTitle={data?.title}
      okText={
        isUpdating
          ? intl.formatMessage(globalMessages.requesting)
          : intl.formatMessage(globalMessages.request)
      }
      okButtonType="primary"
      backdrop={artwork?.backdrop}
      backdropType={artwork?.imageType}
    >
      {hasAutoApprove && !itemQuota?.restricted && (
        <div className="mt-6">
          <Alert
            title={intl.formatMessage(movieMessages.requestadmin)}
            type="info"
          />
        </div>
      )}
      {(itemQuota?.limit ?? 0) > 0 && (
        <QuotaDisplay
          mediaType={type}
          quota={itemQuota}
          userOverride={
            overrides?.user && overrides.user.id !== user?.id
              ? overrides.user.id
              : undefined
          }
        />
      )}
      {hasPermission(
        [Permission.REQUEST_ADVANCED, Permission.MANAGE_REQUESTS],
        { type: 'or' }
      ) && (
        <AdvancedRequester
          type="movie"
          adultType={type}
          is4k={false}
          // Adult media goes through the movie form with its own quota
          quota={itemQuota && quota && { movie: itemQuota, tv: quota.tv }}
          onChange={setOverrides}
        />
      )}
    </Modal>
  );
};

export default AdultRequestModal;
