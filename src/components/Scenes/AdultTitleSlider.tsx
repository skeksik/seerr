import AdultMovieCard from '@app/components/AdultMovieCard';
import SliderHeader from '@app/components/Common/SliderHeader';
import ShowMoreCard from '@app/components/MediaSlider/ShowMoreCard';
import SceneCard from '@app/components/SceneCard';
import Slider from '@app/components/Slider';
import { isTitleShown } from '@app/hooks/useDiscover';
import useSettings from '@app/hooks/useSettings';
import { Permission, useUser } from '@app/hooks/useUser';
import { stashImageUrl } from '@app/utils/stashImage';
import type {
  AdultMovieListResponse,
  AdultMovieResult,
} from '@server/models/AdultMovie';
import type { SceneListResponse, SceneResult } from '@server/models/Scene';
import { useEffect } from 'react';
import useSWRInfinite from 'swr/infinite';

export interface AdultTitleSliderProps {
  mediaType: 'scene' | 'adultmovie';
  sliderKey: string;
  title: string;
  // The list, or its first page when it has a page param; the next pages
  // are read while the row isn't full
  url: string;
  linkUrl?: string;
}

const SLIDER_LIMIT = 20;
// Like MediaSlider, a row reads at most this many pages to fill itself
const MAX_PAGES = 5;

const pageUrl = (url: string, page: number): string => {
  const [path, query = ''] = url.split('?');
  const params = new URLSearchParams(query);
  params.set('page', String(page));
  return `${path}?${params.toString()}`;
};

// MediaSlider for scenes and adult movies, whose lists are not TMDB's. Rows
// without titles are left out, and the full list is only linked past what
// fits in the row
const AdultTitleSlider = ({
  mediaType,
  sliderKey,
  title,
  url,
  linkUrl,
}: AdultTitleSliderProps) => {
  const settings = useSettings();
  const { hasPermission } = useUser();
  const paged = /[?&]page=/.test(url);
  const { data, error, size, setSize, isValidating } = useSWRInfinite<
    SceneListResponse | AdultMovieListResponse
  >(
    (pageIndex, previous: SceneListResponse | AdultMovieListResponse | null) =>
      pageIndex === 0
        ? url
        : !paged || (previous && pageIndex + 1 > previous.totalPages)
          ? null
          : pageUrl(url, pageIndex + 1),
    { initialSize: 1, revalidateFirstPage: false }
  );

  // Like MediaSlider, the hide settings apply to the row
  const results = (data ?? [])
    .flatMap((page) => page.results as (SceneResult | AdultMovieResult)[])
    .filter(
      isTitleShown(settings.currentSettings, {
        hideAvailable: true,
        hideBlocklisted: hasPermission(Permission.MANAGE_BLOCKLIST),
        hideRequested: true,
      })
    );
  const lastPage = data?.[data.length - 1];
  const readAll =
    !!lastPage && (!paged || lastPage.page >= lastPage.totalPages);
  const reading =
    !error && (!data || data.length < size || isValidating) && !readAll;
  // Lists filtered by sexual preference can leave pages nearly empty
  const wantsMore =
    !error &&
    !!data &&
    data.length === size &&
    !readAll &&
    results.length <= SLIDER_LIMIT &&
    size < MAX_PAGES;

  useEffect(() => {
    if (wantsMore) {
      setSize(size + 1);
    }
  }, [wantsMore, setSize, size]);

  if (error || (results.length === 0 && !reading && !wantsMore)) {
    return null;
  }

  const hasMore =
    results.length > SLIDER_LIMIT || (!readAll && size >= MAX_PAGES);
  const fullListUrl = hasMore ? linkUrl : undefined;
  const isScene = mediaType === 'scene';
  const items = results
    .slice(0, SLIDER_LIMIT)
    .map((result) =>
      result.mediaType === 'scene' ? (
        <SceneCard key={`${sliderKey}-${result.id}`} scene={result} />
      ) : (
        <AdultMovieCard key={`${sliderKey}-${result.id}`} movie={result} />
      )
    );

  if (fullListUrl) {
    items.push(
      <ShowMoreCard
        key={`${sliderKey}-more`}
        url={fullListUrl}
        imageType={isScene ? 'stashdb' : 'tpdb'}
        landscape={isScene}
        posters={(results.length > SLIDER_LIMIT
          ? results.slice(SLIDER_LIMIT, SLIDER_LIMIT + 4)
          : results.slice(-4)
        ).map((result) =>
          result.mediaType === 'scene'
            ? stashImageUrl(result.imageUrl, 300)
            : result.posterUrl
        )}
      />
    );
  }

  return (
    <>
      <SliderHeader title={title} linkUrl={fullListUrl} />
      <Slider
        sliderKey={sliderKey}
        isLoading={results.length === 0}
        isEmpty={false}
        placeholder={isScene ? <SceneCard.Placeholder /> : undefined}
        items={items}
      />
    </>
  );
};

export default AdultTitleSlider;
