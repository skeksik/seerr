import SceneCard from '@app/components/SceneCard';
import Slider from '@app/components/Slider';
import { ArrowRightCircleIcon } from '@heroicons/react/24/outline';
import type { SceneListResponse } from '@server/models/Scene';
import Link from 'next/link';
import useSWR from 'swr';

interface SceneSliderProps {
  sliderKey: string;
  title: string;
  url: string;
  linkUrl?: string;
  hideWhenEmpty?: boolean;
  // The title the page is about, left out of its own "More from" row
  excludeId?: string;
}

const SceneSlider = ({
  sliderKey,
  title,
  url,
  linkUrl,
  hideWhenEmpty = false,
  excludeId,
}: SceneSliderProps) => {
  const { data, error } = useSWR<SceneListResponse>(url);
  const results = data?.results.filter(
    (result) => String(result.id) !== excludeId
  );

  if (hideWhenEmpty && (error || results?.length === 0)) {
    return null;
  }

  return (
    <>
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
      <Slider
        sliderKey={sliderKey}
        isLoading={!data && !error}
        isEmpty={!!results && results.length === 0}
        placeholder={<SceneCard.Placeholder />}
        items={results?.map((scene) => (
          <SceneCard key={`${sliderKey}-${scene.id}`} scene={scene} />
        ))}
      />
    </>
  );
};

export default SceneSlider;
