import CompanyCard from '@app/components/CompanyCard';
import Slider from '@app/components/Slider';
import { stashImageUrl } from '@app/utils/stashImage';
import type { SceneFilterDetails } from '@server/models/Scene';
import useSWR from 'swr';

interface AdultStudioSliderProps {
  // Studios, or the networks above them
  type: 'studios' | 'networks';
  title: string;
}

// Studios behind the currently trending scenes, linking to their pages
const AdultStudioSlider = ({ type, title }: AdultStudioSliderProps) => {
  const { data, error } = useSWR<SceneFilterDetails[]>(
    `/api/v1/scene/trending-studios?type=${type}`
  );

  if (error || data?.length === 0) {
    return null;
  }

  return (
    <>
      <div className="slider-header">
        <div className="slider-title">
          <span>{title}</span>
        </div>
      </div>
      <Slider
        sliderKey={`adult-${type}`}
        isLoading={!data}
        isEmpty={false}
        items={data?.map((studio) => (
          <CompanyCard
            key={`adult-${type}-${studio.id}`}
            name={studio.name}
            image={stashImageUrl(studio.imageUrl, 300)}
            imageType="stashdb"
            url={`/scenes/studio/${studio.id}`}
          />
        ))}
      />
    </>
  );
};

export default AdultStudioSlider;
