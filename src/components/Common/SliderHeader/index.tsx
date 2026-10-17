import { ArrowRightCircleIcon } from '@heroicons/react/24/outline';
import Link from 'next/link';

interface SliderHeaderProps {
  title: string;
  // The full list, when there is one
  linkUrl?: string;
  // Looks like a link while what it leads to is still unknown
  placeholderLink?: boolean;
}

// MediaSlider's title row, for the adult rows that fetch their own way
const SliderHeader = ({
  title,
  linkUrl,
  placeholderLink = false,
}: SliderHeaderProps) => (
  <div className="slider-header">
    {placeholderLink ? (
      <span className="slider-title min-w-0 cursor-pointer pr-16 transition duration-300 hover:text-white">
        <span className="truncate">{title}</span>
        <ArrowRightCircleIcon className="ml-2 h-6 w-6" />
      </span>
    ) : linkUrl ? (
      <Link href={linkUrl} className="slider-title min-w-0 pr-16">
        <span className="truncate">{title}</span>
        <ArrowRightCircleIcon />
      </Link>
    ) : (
      <div className="slider-title">
        <span>{title}</span>
      </div>
    )}
  </div>
);

export default SliderHeader;
