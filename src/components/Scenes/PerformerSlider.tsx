import type { SliderPerformer } from '@app/components/Common/adultRoutes';
import SliderHeader from '@app/components/Common/SliderHeader';
import ShowMoreCard from '@app/components/MediaSlider/ShowMoreCard';
import PersonCard from '@app/components/PersonCard';
import Slider from '@app/components/Slider';

interface PerformerSliderProps {
  sliderKey: string;
  title: string;
  performers: SliderPerformer[];
  // Full cast page
  linkUrl?: string;
}

const SLIDER_LIMIT = 20;

// The cast row of movie pages, for StashDB and ThePornDB performers
const PerformerSlider = ({
  sliderKey,
  title,
  performers,
  linkUrl,
}: PerformerSliderProps) => {
  const items = performers
    .slice(0, SLIDER_LIMIT)
    .map((performer) => (
      <PersonCard key={`${sliderKey}-${performer.personId}`} {...performer} />
    ));
  const more = performers.slice(SLIDER_LIMIT, SLIDER_LIMIT + 4);
  // Like the other rows, the full cast is only linked past what fits
  const fullCastUrl = more.length > 0 ? linkUrl : undefined;

  if (fullCastUrl) {
    items.push(
      <ShowMoreCard
        key={`${sliderKey}-more`}
        url={fullCastUrl}
        imageType={more.find((performer) => performer.image)?.image?.type}
        posters={more.map((performer) => performer.image?.src)}
      />
    );
  }

  return (
    <>
      <SliderHeader title={title} linkUrl={fullCastUrl} />
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
