import AdultStudioRow from '@app/components/Scenes/AdultStudioRow';
import type { SceneFilterDetails } from '@server/models/Scene';
import useSWR from 'swr';

// A row holds this many of the list's first page
const ROW_SIZE = 20;

interface AdultStudioSliderProps {
  // Studios, or the networks above them
  type: 'studios' | 'networks';
  title: string;
}

// The first of the studios behind the most popular scenes, as the Studios
// and Networks lists start out, linking to their pages
const AdultStudioSlider = ({ type, title }: AdultStudioSliderProps) => {
  const { data, error } = useSWR<{ results: SceneFilterDetails[] }>(
    `/api/v1/scene/studios?type=${type}&sortBy=popularity.desc&page=1`
  );

  if (error || data?.results.length === 0) {
    return null;
  }

  return (
    <AdultStudioRow
      sliderKey={`adult-${type}`}
      title={title}
      // Every studio or network, beyond the first
      linkUrl={`/discover/scenes/${type}`}
      hasMore
      studios={data?.results.slice(0, ROW_SIZE)}
    />
  );
};

export default AdultStudioSlider;
