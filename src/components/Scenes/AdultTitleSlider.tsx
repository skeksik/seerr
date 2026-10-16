import AdultMovieCard from '@app/components/AdultMovieCard';
import SliderHeader from '@app/components/Common/SliderHeader';
import ShowMoreCard from '@app/components/MediaSlider/ShowMoreCard';
import SceneCard from '@app/components/SceneCard';
import Slider from '@app/components/Slider';
import { stashImageUrl } from '@app/utils/stashImage';
import type { AdultMovieListResponse } from '@server/models/AdultMovie';
import type { SceneListResponse } from '@server/models/Scene';
import useSWR from 'swr';

export interface AdultTitleSliderProps {
  mediaType: 'scene' | 'adultmovie';
  sliderKey: string;
  title: string;
  url: string;
  linkUrl?: string;
  hideWhenEmpty?: boolean;
}

// MediaSlider for scenes and adult movies, whose lists are not TMDB's
const AdultTitleSlider = ({
  mediaType,
  sliderKey,
  title,
  url,
  linkUrl,
  hideWhenEmpty = false,
}: AdultTitleSliderProps) => {
  const { data, error } = useSWR<SceneListResponse | AdultMovieListResponse>(
    url
  );
  const results = data?.results;

  if (hideWhenEmpty && (error || results?.length === 0)) {
    return null;
  }

  const isScene = mediaType === 'scene';
  const items = results?.map((result) =>
    result.mediaType === 'scene' ? (
      <SceneCard key={`${sliderKey}-${result.id}`} scene={result} />
    ) : (
      <AdultMovieCard key={`${sliderKey}-${result.id}`} movie={result} />
    )
  );

  // Like MediaSlider, when the row holds less than the list behind it
  if (items && results && linkUrl && (data?.totalPages ?? 1) > 1) {
    items.push(
      <ShowMoreCard
        key={`${sliderKey}-more`}
        url={linkUrl}
        imageType={isScene ? 'stashdb' : 'tpdb'}
        landscape={isScene}
        posters={results
          .slice(-4)
          .map((result) =>
            result.mediaType === 'scene'
              ? stashImageUrl(result.imageUrl, 300)
              : result.posterUrl
          )}
      />
    );
  }

  return (
    <>
      <SliderHeader title={title} linkUrl={linkUrl} />
      <Slider
        sliderKey={sliderKey}
        isLoading={!data && !error}
        isEmpty={!!results && results.length === 0}
        placeholder={isScene ? <SceneCard.Placeholder /> : undefined}
        items={items}
      />
    </>
  );
};

export default AdultTitleSlider;
