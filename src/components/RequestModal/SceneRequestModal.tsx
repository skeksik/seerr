import Alert from '@app/components/Common/Alert';
import Modal from '@app/components/Common/Modal';
import type { RequestOverrides } from '@app/components/RequestModal/AdvancedRequester';
import AdvancedRequester from '@app/components/RequestModal/AdvancedRequester';
import QuotaDisplay from '@app/components/RequestModal/QuotaDisplay';
import useToasts from '@app/hooks/useToasts';
import { Permission, useUser } from '@app/hooks/useUser';
import globalMessages from '@app/i18n/globalMessages';
import defineMessages from '@app/utils/defineMessages';
import { stashImageUrl } from '@app/utils/stashImage';
import { MediaStatus } from '@server/constants/media';
import type { MediaRequest } from '@server/entity/MediaRequest';
import type { QuotaResponse } from '@server/interfaces/api/userInterfaces';
import type { SceneDetails } from '@server/models/Scene';
import axios from 'axios';
import { useState } from 'react';
import { useIntl } from 'react-intl';
import useSWR, { mutate } from 'swr';

const messages = defineMessages('components.RequestModal.SceneRequestModal', {
  requestscenetitle: 'Request Scene',
  requestadmin: 'This request will be approved automatically.',
  requestSuccess: '<strong>{title}</strong> requested successfully!',
  requesterror: 'Something went wrong while submitting the request.',
});

interface SceneRequestModalProps {
  scene: SceneDetails;
  onCancel: () => void;
  onComplete: (newStatus: MediaStatus) => void;
}

const SceneRequestModal = ({
  scene,
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

  const hasAutoApprove = hasPermission(
    [Permission.AUTO_APPROVE, Permission.MANAGE_REQUESTS],
    { type: 'or' }
  );

  const sendRequest = async () => {
    setIsUpdating(true);

    try {
      await axios.post<MediaRequest>('/api/v1/request', {
        mediaType: 'scene',
        stashId: scene.id,
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
            title: scene.title,
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
        isUpdating || (quota?.scene.restricted && !overrides?.ignoreQuota)
      }
      title={intl.formatMessage(messages.requestscenetitle)}
      subTitle={scene.title}
      okText={
        isUpdating
          ? intl.formatMessage(globalMessages.requesting)
          : intl.formatMessage(globalMessages.request)
      }
      okButtonType="primary"
      backdrop={stashImageUrl(scene.imageUrl, 1280)}
      backdropType="stashdb"
    >
      {hasAutoApprove && !quota?.scene.restricted && (
        <div className="mt-6">
          <Alert
            title={intl.formatMessage(messages.requestadmin)}
            type="info"
          />
        </div>
      )}
      {(quota?.scene.limit ?? 0) > 0 && (
        <QuotaDisplay
          mediaType="scene"
          quota={quota?.scene}
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
          // Scenes go through the movie form, so hand it the scene quota
          quota={quota && { movie: quota.scene, tv: quota.tv }}
          onChange={setOverrides}
        />
      )}
    </Modal>
  );
};

export default SceneRequestModal;
