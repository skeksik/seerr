import defineMessages from '@app/utils/defineMessages';
import { ArrowRightCircleIcon } from '@heroicons/react/24/outline';
import Link from 'next/link';
import { useIntl } from 'react-intl';

// The text of the other rows' last card, under its id
const messages = defineMessages('components.MediaSlider.ShowMoreCard', {
  seemore: 'See More',
});

// The last card of a studio row, sized like CompanyCard
const SeeAllStudiosCard = ({ url }: { url: string }) => {
  const intl = useIntl();

  return (
    <Link
      href={url}
      className="flex h-32 w-56 transform-gpu flex-col items-center justify-center rounded-xl bg-gray-800 text-white shadow ring-1 ring-gray-700 transition duration-300 hover:scale-105 hover:bg-gray-700 hover:ring-gray-500 sm:h-36 sm:w-72"
    >
      <ArrowRightCircleIcon className="w-12" />
      <span className="mt-2 font-extrabold">
        {intl.formatMessage(messages.seemore)}
      </span>
    </Link>
  );
};

export default SeeAllStudiosCard;
