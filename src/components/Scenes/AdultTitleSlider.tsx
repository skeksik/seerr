import AdultMovieCard from '@app/components/AdultMovieCard';
import SliderHeader from '@app/components/Common/SliderHeader';
import ShowMoreCard from '@app/components/MediaSlider/ShowMoreCard';
import SceneCard from '@app/components/SceneCard';
import Slider from '@app/components/Slider';
import TitleCard from '@app/components/TitleCard';
import { isTitleShown } from '@app/hooks/useDiscover';
import useSettings from '@app/hooks/useSettings';
import { Permission, useUser } from '@app/hooks/useUser';
import { stashImageUrl } from '@app/utils/stashImage';
import { MediaStatus } from '@server/constants/media';
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
  // Off for search results, which show everything like the movie ones
  applyHideSettings?: boolean;
}

// Landscape scene cards are wider, so fewer make a row as long as the
// poster rows
const POSTER_LIMIT = 20;
const SCENE_LIMIT = 13;
// Like MediaSlider, a row reads at most this many pages to fill itself
const MAX_PAGES = 5;

const pageUrl = (url: string, page: number): string => {
  const [path, query = ''] = url.split('?');
  const params = new URLSearchParams(query);
  params.set('page', String(page));
  return `${path}?${params.toString()}`;
};

// MediaSlider for scenes and adult movies, whose lists are not TMDB's. Rows
// without titles are left out, and like MediaSlider the See More card only
// shows when there is more than fits
const AdultTitleSlider = ({
  mediaType,
  sliderKey,
  title,
  url,
  linkUrl,
  applyHideSettings = true,
}: AdultTitleSliderProps) => {
  const settings = useSettings();
  const { hasPermission } = useUser();
  const paged = /[?&]page=/.test(url);
  const limit = mediaType === 'scene' ? SCENE_LIMIT : POSTER_LIMIT;
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

  // Like MediaSlider, the hide settings apply to the row, and only users
  // who can see the blocklist see blocklisted titles
  const canSeeBlocklist = hasPermission(
    [Permission.MANAGE_BLOCKLIST, Permission.VIEW_BLOCKLIST],
    { type: 'or' }
  );
  const results = (data ?? [])
    .flatMap((page) => page.results as (SceneResult | AdultMovieResult)[])
    .filter(
      isTitleShown(settings.currentSettings, {
        hideAvailable: applyHideSettings,
        hideBlocklisted: applyHideSettings,
        hideRequested: applyHideSettings,
      })
    )
    .filter(
      (result) =>
        canSeeBlocklist || result.mediaInfo?.status !== MediaStatus.BLOCKLISTED
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
    results.length <= limit &&
    size < MAX_PAGES;

  useEffect(() => {
    if (wantsMore) {
      setSize(size + 1);
    }
  }, [wantsMore, setSize, size]);

  const settled = !!error || (!reading && !wantsMore);
  const isEmpty = !!error || results.length === 0;

  if (settled && isEmpty) {
    return null;
  }

  const hasMore = results.length > limit || (!readAll && size >= MAX_PAGES);
  const moreUrl = hasMore ? linkUrl : undefined;
  const isScene = mediaType === 'scene';
  const items = results
    .slice(0, limit)
    .map((result) =>
      result.mediaType === 'scene' ? (
        <SceneCard key={`${sliderKey}-${result.id}`} scene={result} />
      ) : (
        <AdultMovieCard key={`${sliderKey}-${result.id}`} movie={result} />
      )
    );

  if (moreUrl) {
    items.push(
      <ShowMoreCard
        key={`${sliderKey}-more`}
        url={moreUrl}
        imageType={isScene ? 'stashdb' : 'tpdb'}
        landscape={isScene}
        posters={(results.length > limit
          ? results.slice(limit, limit + 4)
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
      <SliderHeader title={title} linkUrl={linkUrl} />
      <Slider
        sliderKey={sliderKey}
        isLoading={results.length === 0}
        isEmpty={false}
        placeholder={<TitleCard.Placeholder landscape={isScene} hoverable />}
        items={items}
      />
    </>
  );
};

export default AdultTitleSlider;
