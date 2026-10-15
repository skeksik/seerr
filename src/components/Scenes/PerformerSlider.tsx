import ShowMoreCard from '@app/components/MediaSlider/ShowMoreCard';
import PersonCard from '@app/components/PersonCard';
import Slider from '@app/components/Slider';
import { ArrowRightCircleIcon } from '@heroicons/react/24/outline';
import Link from 'next/link';

export interface SliderPerformer {
  id: string;
  name: string;
  subName?: string;
  href: string;
  imageUrl?: string;
}

interface PerformerSliderProps {
  sliderKey: string;
  title: string;
  imageType: 'stashdb' | 'tpdb';
  performers: SliderPerformer[];
  // Full cast page
  linkUrl?: string;
}

const SLIDER_LIMIT = 20;

// The cast row of movie pages, for StashDB and ThePornDB performers
const PerformerSlider = ({
  sliderKey,
  title,
  imageType,
  performers,
  linkUrl,
}: PerformerSliderProps) => {
  const items = performers
    .slice(0, SLIDER_LIMIT)
    .map((performer) => (
      <PersonCard
        key={`${sliderKey}-${performer.id}`}
        personId={performer.id}
        name={performer.name}
        subName={performer.subName}
        href={performer.href}
        image={
          performer.imageUrl
            ? { src: performer.imageUrl, type: imageType }
            : undefined
        }
      />
    ));

  if (linkUrl && performers.length > SLIDER_LIMIT) {
    items.push(
      <ShowMoreCard
        key={`${sliderKey}-more`}
        url={linkUrl}
        imageType={imageType}
        posters={performers
          .slice(SLIDER_LIMIT, SLIDER_LIMIT + 4)
          .map((performer) => performer.imageUrl)}
      />
    );
  }

  return (
    <>
      <div className="slider-header">
        {linkUrl ? (
          <Link href={linkUrl} className="slider-title">
            <span>{title}</span>
            <ArrowRightCircleIcon />
          </Link>
        ) : (
          <div className="slider-title">
            <span>{title}</span>
          </div>
        )}
      </div>
      <Slider
        sliderKey={sliderKey}
        isLoading={false}
        isEmpty={false}
        items={items}
      />
    </>
  );
};

export default PerformerSlider;
