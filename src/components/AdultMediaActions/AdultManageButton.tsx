import Button from '@app/components/Common/Button';
import Tooltip from '@app/components/Common/Tooltip';
import ManageSlideOver from '@app/components/ManageSlideOver';
import { Permission, useUser } from '@app/hooks/useUser';
import defineMessages from '@app/utils/defineMessages';
import { CogIcon } from '@heroicons/react/24/outline';
import { MediaStatus } from '@server/constants/media';
import type { AdultMovieDetails } from '@server/models/AdultMovie';
import type { SceneDetails } from '@server/models/Scene';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { useIntl } from 'react-intl';

const messages = defineMessages('components.AdultMediaActions', {
  managescene: 'Manage Scene',
  manageadultmovie: 'Manage Adult Movie',
});

type AdultManageButtonProps =
  | { mediaType: 'scene'; data: SceneDetails; revalidate: () => void }
  | {
      mediaType: 'adultmovie';
      data: AdultMovieDetails;
      revalidate: () => void;
    };

// The movie page's cog: requests, Whisparr links and media data
const AdultManageButton = (props: AdultManageButtonProps) => {
  const intl = useIntl();
  const { hasPermission } = useUser();
  const router = useRouter();
  const [showManager, setShowManager] = useState(false);
  const media = props.data.mediaInfo;

  // Status badges link here with ?manage=1, as they do for movies
  useEffect(() => {
    if (router.query.manage === '1') {
      setShowManager(true);
      const query = { ...router.query };
      delete query.manage;
      router.replace({ pathname: router.pathname, query }, undefined, {
        shallow: true,
      });
    }
  }, [router]);

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
            : messages.manageadultmovie
        )}
      >
        <Button
          buttonType="ghost"
          onClick={() => setShowManager(true)}
          className="relative"
        >
          <CogIcon className="!mr-0" />
        </Button>
      </Tooltip>
    </>
  );
};

export default AdultManageButton;
