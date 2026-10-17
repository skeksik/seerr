import defineMessages from '@app/utils/defineMessages';
import { ArrowRightCircleIcon } from '@heroicons/react/24/outline';
import Link from 'next/link';
import { useIntl } from 'react-intl';

const messages = defineMessages('components.AdultCrew.FullCrewLink', {
  viewfullcrew: 'View Full Crew',
});

interface FullCrewLinkProps {
  mediaType: 'scene' | 'adultmovie';
  id: string;
}

// The movie page's View Full Crew link, under the crew
const FullCrewLink = ({ mediaType, id }: FullCrewLinkProps) => {
  const intl = useIntl();

  return (
    <div className="mt-4 flex justify-end">
      <Link
        href={`/${mediaType}/${id}/crew`}
        className="flex items-center text-gray-400 transition duration-300 hover:text-gray-100"
      >
        <span>{intl.formatMessage(messages.viewfullcrew)}</span>
        <ArrowRightCircleIcon className="ml-1.5 inline-block h-5 w-5" />
      </Link>
    </div>
  );
};

export default FullCrewLink;
