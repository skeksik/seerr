import Alert from '@app/components/Common/Alert';
import Modal from '@app/components/Common/Modal';
import type { RequestOverrides } from '@app/components/RequestModal/AdvancedRequester';
import AdvancedRequester from '@app/components/RequestModal/AdvancedRequester';
import QuotaDisplay from '@app/components/RequestModal/QuotaDisplay';
import useToasts from '@app/hooks/useToasts';
import { Permission, useUser } from '@app/hooks/useUser';
import globalMessages from '@app/i18n/globalMessages';
import defineMessages from '@app/utils/defineMessages';
import { MediaStatus } from '@server/constants/media';
import type { MediaRequest } from '@server/entity/MediaRequest';
import type { QuotaResponse } from '@server/interfaces/api/userInterfaces';
import axios from 'axios';
import { useState } from 'react';
import { useIntl } from 'react-intl';
import useSWR, { mutate } from 'swr';

const messages = defineMessages('components.RequestModal.SceneRequestModal', {
  requestscenetitle: 'Request Scene',
  requestxxxmovietitle: 'Request XXX Movie',
  requestadmin: 'This request will be approved automatically.',
  requestSuccess: '<strong>{title}</strong> requested successfully!',
  requesterror: 'Something went wrong while submitting the request.',
});

// Scenes and XXX movies share this modal; both go to Whisparr
export interface AdultRequestItem {
  mediaType: 'scene' | 'xxxmovie';
  // StashDB scene id or ThePornDB movie id
  id: string;
  title: string;
  backdrop?: string;
  backdropType: 'stashdb' | 'tpdb';
}

interface SceneRequestModalProps {
  item: AdultRequestItem;
  onCancel: () => void;
  onComplete: (newStatus: MediaStatus) => void;
}

const SceneRequestModal = ({
  item,
  onCancel,
  onComplete,
}: SceneRequestModalProps) => {
  const intl = useIntl();
  const { addToast } = useToasts();
  const { user, hasPermission } = useUser();
  const [isUpdating, setIsUpdating] = useState(false);
  const [overrides, setOverrides] = useState<RequestOverrides | null>(null);
  const { data: quota } = useSWR<QuotaResponse>(
    user && (!overrides?.user?.id || hasPermission(Permission.MANAGE_USERS))
      ? `/api/v1/user/${overrides?.user?.id ?? user.id}/quota`
      : null
  );
  // XXX movies share the movie quota
  const itemQuota = item.mediaType === 'scene' ? quota?.scene : quota?.movie;

  const hasAutoApprove = hasPermission(
    [Permission.AUTO_APPROVE, Permission.MANAGE_REQUESTS],
    { type: 'or' }
  );

  const sendRequest = async () => {
    setIsUpdating(true);

    try {
      await axios.post<MediaRequest>('/api/v1/request', {
        mediaType: item.mediaType,
        [item.mediaType === 'scene' ? 'stashId' : 'tpdbId']: item.id,
        serverId: overrides?.server,
        profileId: overrides?.profile,
        rootFolder: overrides?.folder,
        userId: overrides?.user?.id,
        tags: overrides?.tags,
        ignoreQuota: overrides?.ignoreQuota,
      });
      mutate('/api/v1/request/count');

      onComplete(hasAutoApprove ? MediaStatus.PROCESSING : MediaStatus.PENDING);
      addToast(
        <span>
          {intl.formatMessage(messages.requestSuccess, {
            title: item.title,
            strong: (msg: React.ReactNode) => <strong>{msg}</strong>,
          })}
        </span>,
        { appearance: 'success', autoDismiss: true }
      );
    } catch {
      addToast(intl.formatMessage(messages.requesterror), {
        appearance: 'error',
        autoDismiss: true,
      });
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <Modal
      backgroundClickable
      onCancel={onCancel}
      onOk={sendRequest}
      okDisabled={
        isUpdating || (itemQuota?.restricted && !overrides?.ignoreQuota)
      }
      title={intl.formatMessage(
        item.mediaType === 'scene'
          ? messages.requestscenetitle
          : messages.requestxxxmovietitle
      )}
      subTitle={item.title}
      okText={
        isUpdating
          ? intl.formatMessage(globalMessages.requesting)
          : intl.formatMessage(globalMessages.request)
      }
      okButtonType="primary"
      backdrop={item.backdrop}
      backdropType={item.backdropType}
    >
      {hasAutoApprove && !itemQuota?.restricted && (
        <div className="mt-6">
          <Alert
            title={intl.formatMessage(messages.requestadmin)}
            type="info"
          />
        </div>
      )}
      {(itemQuota?.limit ?? 0) > 0 && (
        <QuotaDisplay
          mediaType={item.mediaType === 'scene' ? 'scene' : 'movie'}
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
          service="whisparr"
          is4k={false}
          // Adult media goes through the movie form with its own quota
          quota={itemQuota && quota && { movie: itemQuota, tv: quota.tv }}
          onChange={setOverrides}
        />
      )}
    </Modal>
  );
};

export default SceneRequestModal;
