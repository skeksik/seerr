import Button from '@app/components/Common/Button';
import Tooltip from '@app/components/Common/Tooltip';
import IssueModal from '@app/components/IssueModal';
import { Permission, useUser } from '@app/hooks/useUser';
import defineMessages from '@app/utils/defineMessages';
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { MediaStatus } from '@server/constants/media';
import { useState } from 'react';
import { useIntl } from 'react-intl';

// The movie page's text, under its id
const messages = defineMessages('components.MovieDetails', {
  reportissue: 'Report an Issue',
});

interface AdultIssueButtonProps {
  mediaType: 'scene' | 'adultmovie';
  id: string;
  status?: MediaStatus;
}

// Like movies, issues can be reported once the title is available
const AdultIssueButton = ({ mediaType, id, status }: AdultIssueButtonProps) => {
  const intl = useIntl();
  const { hasPermission } = useUser();
  const [showIssueModal, setShowIssueModal] = useState(false);

  if (
    (status !== MediaStatus.AVAILABLE &&
      status !== MediaStatus.PARTIALLY_AVAILABLE) ||
    !hasPermission([Permission.CREATE_ISSUES, Permission.MANAGE_ISSUES], {
      type: 'or',
    })
  ) {
    return null;
  }

  return (
    <>
      <IssueModal
        onCancel={() => setShowIssueModal(false)}
        show={showIssueModal}
        mediaType={mediaType}
        externalId={id}
      />
      <Tooltip content={intl.formatMessage(messages.reportissue)}>
        <Button buttonType="warning" onClick={() => setShowIssueModal(true)}>
          <ExclamationTriangleIcon />
        </Button>
      </Tooltip>
    </>
  );
};

export default AdultIssueButton;
