import ShowMoreCard from '@app/components/MediaSlider/ShowMoreCard';
import Slider from '@app/components/Slider';
import XxxMovieCard from '@app/components/XxxMovieCard';
import { ArrowRightCircleIcon } from '@heroicons/react/24/outline';
import type { XxxMovieListResponse } from '@server/models/XxxMovie';
import Link from 'next/link';
import useSWR from 'swr';

interface XxxMovieSliderProps {
  sliderKey: string;
  title: string;
  url: string;
  linkUrl?: string;
  hideWhenEmpty?: boolean;
  // The title the page is about, left out of its own "More from" row
  excludeId?: string;
}

const XxxMovieSlider = ({
  sliderKey,
  title,
  url,
  linkUrl,
  hideWhenEmpty = false,
  excludeId,
}: XxxMovieSliderProps) => {
  const { data, error } = useSWR<XxxMovieListResponse>(url);
  const results = data?.results.filter(
    (result) => String(result.id) !== excludeId
  );

  if (hideWhenEmpty && (error || results?.length === 0)) {
    return null;
  }

  const items = results?.map((movie) => (
    <XxxMovieCard key={`${sliderKey}-${movie.id}`} movie={movie} />
  ));

  // Like MediaSlider, when the row holds less than the list behind it
  if (items && results && linkUrl && (data?.totalPages ?? 1) > 1) {
    items.push(
      <ShowMoreCard
        key={`${sliderKey}-more`}
        url={linkUrl}
        imageType="tpdb"
        posters={results.slice(-4).map((movie) => movie.posterUrl)}
      />
    );
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
        items={items}
      />
    </>
  );
};

export default XxxMovieSlider;
