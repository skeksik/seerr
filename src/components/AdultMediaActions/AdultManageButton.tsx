import Button from '@app/components/Common/Button';
import Tooltip from '@app/components/Common/Tooltip';
import ManageSlideOver from '@app/components/ManageSlideOver';
import { Permission, useUser } from '@app/hooks/useUser';
import defineMessages from '@app/utils/defineMessages';
import { CogIcon } from '@heroicons/react/24/outline';
import { MediaStatus } from '@server/constants/media';
import type { SceneDetails } from '@server/models/Scene';
import type { XxxMovieDetails } from '@server/models/XxxMovie';
import { useState } from 'react';
import { useIntl } from 'react-intl';

const messages = defineMessages('components.AdultMediaActions', {
  managescene: 'Manage Scene',
  managexxxmovie: 'Manage XXX Movie',
});

type AdultManageButtonProps =
  | { mediaType: 'scene'; data: SceneDetails; revalidate: () => void }
  | { mediaType: 'xxxmovie'; data: XxxMovieDetails; revalidate: () => void };

// The movie page's cog: requests, Whisparr links and media data
const AdultManageButton = (props: AdultManageButtonProps) => {
  const intl = useIntl();
  const { hasPermission } = useUser();
  const [showManager, setShowManager] = useState(false);
  const media = props.data.mediaInfo;

  // Titles Whisparr follows get the cog before anyone requests them
  if (
    !hasPermission(Permission.MANAGE_REQUESTS) ||
    !media ||
    (media.status === MediaStatus.UNKNOWN &&
      media.status4k === MediaStatus.UNKNOWN &&
      media.serviceId == null &&
      media.serviceId4k == null &&
      !media.stashMediaId)
  ) {
    return null;
  }

  return (
    <>
      <ManageSlideOver
        {...props}
        show={showManager}
        onClose={() => setShowManager(false)}
      />
      <Tooltip
        content={intl.formatMessage(
          props.mediaType === 'scene'
            ? messages.managescene
            : messages.managexxxmovie
        )}
      >
        <Button
          buttonType="ghost"
          onClick={() => setShowManager(true)}
          className="relative ml-2 first:ml-0"
        >
          <CogIcon className="!mr-0" />
        </Button>
      </Tooltip>
    </>
  );
};

export default AdultManageButton;
