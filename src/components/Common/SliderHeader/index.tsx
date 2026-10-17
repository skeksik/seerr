import { ArrowRightCircleIcon } from '@heroicons/react/24/outline';
import Link from 'next/link';

interface SliderHeaderProps {
  title: string;
  // The full list, when there is one
  linkUrl?: string;
  // A row still loading: the same link, leading nowhere yet
  linkPending?: boolean;
}

// MediaSlider's title row, for the adult rows that fetch their own way
const SliderHeader = ({ title, linkUrl, linkPending }: SliderHeaderProps) => (
  <div className="slider-header">
    {linkPending ? (
      <a className="slider-title min-w-0 cursor-pointer pr-16" aria-disabled>
        <span className="truncate">{title}</span>
        <ArrowRightCircleIcon />
      </a>
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
