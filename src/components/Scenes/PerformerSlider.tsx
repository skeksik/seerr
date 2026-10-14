import PersonCard from '@app/components/PersonCard';
import Slider from '@app/components/Slider';

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
}

// The cast row of movie pages, for StashDB and ThePornDB performers
const PerformerSlider = ({
  sliderKey,
  title,
  imageType,
  performers,
}: PerformerSliderProps) => (
  <>
    <div className="slider-header">
      <div className="slider-title">
        <span>{title}</span>
      </div>
    </div>
    <Slider
      sliderKey={sliderKey}
      isLoading={false}
      isEmpty={false}
      items={performers.map((performer) => (
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
      ))}
    />
  </>
);

export default PerformerSlider;
