import Slider from '@app/components/Slider';
import TitleCard from '@app/components/TitleCard';
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
}

// Renders ThePornDB movies, or adult TMDB movies with the TMDB source
const XxxMovieSlider = ({
  sliderKey,
  title,
  url,
  linkUrl,
  hideWhenEmpty = false,
}: XxxMovieSliderProps) => {
  const { data, error } = useSWR<XxxMovieListResponse>(url);

  if (hideWhenEmpty && (error || data?.results.length === 0)) {
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
        isEmpty={!!data && data.results.length === 0}
        items={data?.results.map((movie) =>
          movie.mediaType === 'xxxmovie' ? (
            <XxxMovieCard key={`${sliderKey}-${movie.id}`} movie={movie} />
          ) : (
            <TitleCard
              key={`${sliderKey}-${movie.id}`}
              id={movie.id}
              image={movie.posterPath}
              status={movie.mediaInfo?.status}
              summary={movie.overview}
              title={movie.title}
              userScore={movie.voteAverage}
              year={movie.releaseDate}
              mediaType="movie"
              isAdult
              inProgress={(movie.mediaInfo?.downloadStatus ?? []).length > 0}
            />
          )
        )}
      />
    </>
  );
};

export default XxxMovieSlider;
