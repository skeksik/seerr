import CompanyCard from '@app/components/CompanyCard';
import SeeAllStudiosCard from '@app/components/Scenes/SeeAllStudiosCard';
import Slider from '@app/components/Slider';
import { stashImageUrl } from '@app/utils/stashImage';
import { ArrowRightCircleIcon } from '@heroicons/react/24/outline';
import type { SceneFilterDetails } from '@server/models/Scene';
import Link from 'next/link';
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
        {/* Every studio or network, beyond the trending ones */}
        <Link href={`/scenes/${type}`} className="slider-title min-w-0 pr-16">
          <span className="truncate">{title}</span>
          <ArrowRightCircleIcon />
        </Link>
      </div>
      <Slider
        sliderKey={`adult-${type}`}
        isLoading={!data}
        isEmpty={false}
        items={[
          ...(data ?? []).map((studio) => (
            <CompanyCard
              key={`adult-${type}-${studio.id}`}
              name={studio.name}
              image={stashImageUrl(studio.imageUrl, 300)}
              imageType="stashdb"
              url={`/scenes/studio/${studio.id}`}
            />
          )),
          <SeeAllStudiosCard
            key={`adult-${type}-all`}
            url={`/scenes/${type}`}
          />,
        ]}
      />
    </>
  );
};

export default AdultStudioSlider;
