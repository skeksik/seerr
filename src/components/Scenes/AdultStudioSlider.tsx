import AdultStudioRow from '@app/components/Scenes/AdultStudioRow';
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
    <AdultStudioRow
      sliderKey={`adult-${type}`}
      title={title}
      // Every studio or network, beyond the trending ones
      linkUrl={`/discover/scenes/${type}`}
      hasMore
      studios={data}
    />
  );
};

export default AdultStudioSlider;
