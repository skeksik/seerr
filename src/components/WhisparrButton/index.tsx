import Button from '@app/components/Common/Button';
import { Permission, useUser } from '@app/hooks/useUser';
import defineMessages from '@app/utils/defineMessages';
import { ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline';
import { useIntl } from 'react-intl';

const messages = defineMessages('components.WhisparrButton', {
  openinwhisparr: 'Open in Whisparr',
});

interface WhisparrButtonProps {
  // Media serviceUrl; only set once Whisparr has the title
  serviceUrl?: string;
  className?: string;
}

// Detail pages link straight to Whisparr, as the manage panel does
const WhisparrButton = ({
  serviceUrl,
  className = 'ml-2 first:ml-0',
}: WhisparrButtonProps) => {
  const intl = useIntl();
  const { hasPermission } = useUser();

  if (!serviceUrl || !hasPermission(Permission.MANAGE_REQUESTS)) {
    return null;
  }

  return (
    <a href={serviceUrl} target="_blank" rel="noreferrer" className={className}>
      <Button buttonType="ghost">
        <ArrowTopRightOnSquareIcon />
        <span>{intl.formatMessage(messages.openinwhisparr)}</span>
      </Button>
    </a>
  );
};

export default WhisparrButton;
