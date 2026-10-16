import { ArrowRightCircleIcon } from '@heroicons/react/24/outline';
import Link from 'next/link';

interface SliderHeaderProps {
  title: string;
  // The full list, when there is one
  linkUrl?: string;
}

// MediaSlider's title row, for the adult rows that fetch their own way
const SliderHeader = ({ title, linkUrl }: SliderHeaderProps) => (
  <div className="slider-header">
    {linkUrl ? (
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
