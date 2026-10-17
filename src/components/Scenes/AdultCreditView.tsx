import ListView from '@app/components/Common/ListView';
import SliderHeader from '@app/components/Common/SliderHeader';
import {
  creditBrowseHref,
  creditTitlesQuery,
  creditTitlesUrl,
} from '@app/components/Common/adultRoutes';
import SceneCard from '@app/components/SceneCard';
import AdultTitleSlider from '@app/components/Scenes/AdultTitleSlider';
import Slider from '@app/components/Slider';
import useDiscover from '@app/hooks/useDiscover';
import globalMessages from '@app/i18n/globalMessages';
import { CircleStackIcon } from '@heroicons/react/24/solid';
import type {
  AdultMovieListResponse,
  AdultMovieResult,
} from '@server/models/AdultMovie';
import type { SceneListResponse, SceneResult } from '@server/models/Scene';
import { useState } from 'react';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

// What a performer or studio page shows: all their titles, or one kind
export type CreditView = 'all' | 'adultmovies' | 'scenes';

// Every view is offered, like the person page's, even where there is
// nothing of a kind
const VIEWS: CreditView[] = ['all', 'adultmovies', 'scenes'];

const viewMessages = {
  all: globalMessages.all,
  adultmovies: globalMessages.adultMovies,
  scenes: globalMessages.scenes,
};

// Like the person page, the pick lasts while the page is open
export const useCreditView = () => useState<CreditView>('all');

interface CreditViewPickerProps {
  view: CreditView;
  onChange: (view: CreditView) => void;
}

// The person page's media type selector
export const CreditViewPicker = ({ view, onChange }: CreditViewPickerProps) => {
  const intl = useIntl();

  return (
    <div className="mb-2 flex flex-grow sm:mb-0 sm:mr-2 lg:flex-grow-0">
      <span className="inline-flex cursor-default items-center rounded-l-md border border-r-0 border-gray-500 bg-gray-800 px-3 text-sm text-gray-100">
        <CircleStackIcon className="h-6 w-6" />
      </span>
      <select
        id="creditView"
        name="creditView"
        onChange={(e) => onChange(e.target.value as CreditView)}
        value={view}
        className="rounded-r-only"
      >
        {VIEWS.map((option) => (
          <option key={option} value={option}>
            {intl.formatMessage(viewMessages[option])}
          </option>
        ))}
      </select>
    </div>
  );
};

// Whose titles of a kind: StashDB's ids for scenes, ThePornDB's for movies
export interface CreditSource {
  type: 'performer' | 'studio';
  id: string | number;
}

type Title = SceneResult | AdultMovieResult;

const useCreditTitles = (
  mediaType: 'scene' | 'adultmovie',
  { type, id }: CreditSource
) => {
  const { endpoint, params } = creditTitlesQuery(mediaType, type, id);

  return useDiscover<Title>(endpoint, params, { filteredPages: true });
};

interface SingleTitlesProps {
  mediaType: 'scene' | 'adultmovie';
  source: CreditSource;
}

// The person page's grid, for one kind of title, newest first, named by
// the kind; the title opens the browse tab filtered to them. Nothing found
// leaves the page empty, like a person page without credits
const SingleTitles = ({ mediaType, source }: SingleTitlesProps) => {
  const intl = useIntl();
  const {
    isLoadingInitialData,
    isEmpty,
    isLoadingMore,
    isReachingEnd,
    titles,
    fetchMore,
    error,
  } = useCreditTitles(mediaType, source);

  if (isEmpty || error) {
    return null;
  }

  return (
    <>
      <SliderHeader
        title={intl.formatMessage(
          mediaType === 'scene'
            ? globalMessages.scenes
            : globalMessages.adultMovies
        )}
        linkUrl={creditBrowseHref(mediaType, source.type, source.id)}
      />
      <ListView
        items={titles}
        landscape={mediaType === 'scene'}
        isEmpty={false}
        isLoading={
          isLoadingInitialData || (isLoadingMore && (titles?.length ?? 0) > 0)
        }
        isReachingEnd={isReachingEnd}
        onScrollBottom={fetchMore}
      />
    </>
  );
};

interface CreditTitlesProps {
  view: CreditView;
  movies?: CreditSource;
  scenes?: CreditSource;
}

// While they are looked up, the rows as Seerr shows them loading, their
// titles not linking yet; real rows or a grid take their place
export const CreditTitlesPlaceholder = ({
  scenes = true,
}: {
  // ThePornDB pages have no scenes
  scenes?: boolean;
}) => {
  const intl = useIntl();

  return (
    <>
      <SliderHeader
        title={intl.formatMessage(globalMessages.adultMovies)}
        linkPending
      />
      <Slider
        sliderKey="credit-movies-loading"
        isLoading
        isEmpty={false}
        items={[]}
      />
      {scenes && (
        <>
          <SliderHeader
            title={intl.formatMessage(globalMessages.scenes)}
            linkPending
          />
          <Slider
            sliderKey="credit-scenes-loading"
            isLoading
            isEmpty={false}
            placeholder={<SceneCard.Placeholder />}
            items={[]}
          />
        </>
      )}
    </>
  );
};

const firstPageUrl = (
  mediaType: 'scene' | 'adultmovie',
  source?: CreditSource
): string | null =>
  source ? creditTitlesUrl(mediaType, source.type, source.id) : null;

// The titles of the picked view. All shows a row of each kind when they have
// both, or the grid of the one they have; a kind they have none of leaves
// the page empty
export const CreditTitles = ({ view, movies, scenes }: CreditTitlesProps) => {
  const intl = useIntl();
  // The first pages of the rows and grids, which tell what there is
  const { data: movieList } = useSWR<AdultMovieListResponse>(
    firstPageUrl('adultmovie', movies)
  );
  const { data: sceneList } = useSWR<SceneListResponse>(
    firstPageUrl('scene', scenes)
  );
  const hasMovies = !!movies && (movieList?.totalResults ?? 0) > 0;
  const hasScenes = !!scenes && (sceneList?.totalResults ?? 0) > 0;
  const known = (!movies || !!movieList) && (!scenes || !!sceneList);

  if (view === 'all') {
    if (!known) {
      return <CreditTitlesPlaceholder scenes={!!scenes} />;
    }

    if (hasMovies && hasScenes && movies && scenes) {
      return (
        <>
          <AdultTitleSlider
            mediaType="adultmovie"
            sliderKey={`adult-${movies.type}-${movies.id}`}
            title={intl.formatMessage(globalMessages.adultMovies)}
            url={firstPageUrl('adultmovie', movies) ?? ''}
            linkUrl={creditBrowseHref('adultmovie', movies.type, movies.id)}
          />
          <AdultTitleSlider
            mediaType="scene"
            sliderKey={`scenes-${scenes.type}-${scenes.id}`}
            title={intl.formatMessage(globalMessages.scenes)}
            url={firstPageUrl('scene', scenes) ?? ''}
            linkUrl={creditBrowseHref('scene', scenes.type, scenes.id)}
          />
        </>
      );
    }
  }

  const showMovies = view !== 'scenes' && (view !== 'all' || hasMovies);
  const showScenes = view !== 'adultmovies' && (view !== 'all' || hasScenes);

  return showMovies && movies ? (
    <SingleTitles key="movies" mediaType="adultmovie" source={movies} />
  ) : showScenes && scenes ? (
    <SingleTitles key="scenes" mediaType="scene" source={scenes} />
  ) : null;
};
