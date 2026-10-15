import ShowMoreCard from '@app/components/MediaSlider/ShowMoreCard';
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
  // The title the page is about, left out of its own "More from" row
  excludeId?: string;
}

// Renders ThePornDB movies, or adult TMDB movies with the TMDB source
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

  const items = results?.map((movie) =>
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
  );

  // Like MediaSlider, when the row holds less than the list behind it
  if (items && results && linkUrl && (data?.totalPages ?? 1) > 1) {
    const last = results.slice(-4);
    items.push(
      last[0]?.mediaType === 'xxxmovie' ? (
        <ShowMoreCard
          key={`${sliderKey}-more`}
          url={linkUrl}
          imageType="tpdb"
          posters={last.map((movie) =>
            movie.mediaType === 'xxxmovie' ? movie.posterUrl : undefined
          )}
        />
      ) : (
        <ShowMoreCard
          key={`${sliderKey}-more`}
          url={linkUrl}
          posters={last.map((movie) =>
            movie.mediaType === 'xxxmovie' ? undefined : movie.posterPath
          )}
        />
      )
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
