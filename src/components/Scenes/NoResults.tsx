import globalMessages from '@app/i18n/globalMessages';
import { useIntl } from 'react-intl';

// What an empty Slider says, for pages whose rows all came back empty
const NoResults = () => {
  const intl = useIntl();

  return (
    <div className="mb-16 mt-16 text-center font-medium text-gray-400">
      {intl.formatMessage(globalMessages.noresults)}
    </div>
  );
};

export default NoResults;
