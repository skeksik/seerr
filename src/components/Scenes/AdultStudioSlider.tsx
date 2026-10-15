import CompanyCard from '@app/components/CompanyCard';
import Slider from '@app/components/Slider';
import defineMessages from '@app/utils/defineMessages';
import { stashImageUrl } from '@app/utils/stashImage';
import { ArrowRightCircleIcon } from '@heroicons/react/24/outline';
import type { SceneFilterDetails } from '@server/models/Scene';
import Link from 'next/link';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

const messages = defineMessages('components.Scenes.AdultStudioSlider', {
  seeAll: 'See All',
});

interface AdultStudioSliderProps {
  // Studios, or the networks above them
  type: 'studios' | 'networks';
  title: string;
}

// Studios behind the currently trending scenes, linking to their pages
const AdultStudioSlider = ({ type, title }: AdultStudioSliderProps) => {
  const intl = useIntl();
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
          <Link
            key={`adult-${type}-all`}
            href={`/scenes/${type}`}
            className="flex h-32 w-56 transform-gpu flex-col items-center justify-center rounded-xl bg-gray-800 text-white shadow ring-1 ring-gray-700 transition duration-300 hover:scale-105 hover:bg-gray-700 hover:ring-gray-500 sm:h-36 sm:w-72"
          >
            <ArrowRightCircleIcon className="w-12" />
            <span className="mt-2 font-extrabold">
              {intl.formatMessage(messages.seeAll)}
            </span>
          </Link>,
        ]}
      />
    </>
  );
};

export default AdultStudioSlider;
