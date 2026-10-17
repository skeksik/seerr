import AdultMovieCard from '@app/components/AdultMovieCard';
import ListView from '@app/components/Common/ListView';
import SliderHeader from '@app/components/Common/SliderHeader';
import {
  creditBrowseHref,
  creditTitlesQuery,
} from '@app/components/Common/adultRoutes';
import SceneCard from '@app/components/SceneCard';
import TitleCard from '@app/components/TitleCard';
import useDiscover from '@app/hooks/useDiscover';
import useVerticalScroll from '@app/hooks/useVerticalScroll';
import globalMessages from '@app/i18n/globalMessages';
import defineMessages from '@app/utils/defineMessages';
import { CircleStackIcon } from '@heroicons/react/24/solid';
import type { AdultMovieResult } from '@server/models/AdultMovie';
import type { SceneResult } from '@server/models/Scene';
import { useEffect, useState } from 'react';
import { useIntl } from 'react-intl';

const messages = defineMessages('components.Scenes.AdultCreditView', {
  appearances: 'Appearances',
});

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

// The person page's Appearances, for one kind of title, newest first; the
// title opens the browse tab filtered to them. Nothing found leaves the
// page empty, like a person page without credits
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
        title={intl.formatMessage(messages.appearances)}
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

const releaseOf = (title: Title): string => title.releaseDate ?? '';

interface MixedTitlesProps {
  movies: CreditSource;
  scenes: CreditSource;
}

// Movies and scenes in one Appearances grid, newest first, like the person
// page's movies and series. Each list is read in its own pages, so titles
// show only as far as both lists have been read; wide scene cards take two
// poster columns
const MixedTitles = ({ movies, scenes }: MixedTitlesProps) => {
  const intl = useIntl();
  const lists = [
    useCreditTitles('adultmovie', movies),
    useCreditTitles('scene', scenes),
  ];
  const loading = lists.some((list) => list.isLoadingInitialData);
  const open = lists.filter((list) => !list.isReachingEnd && !list.error);
  // The oldest date every unfinished list has reached
  const reached = open.map((list) => {
    const last = list.titles[list.titles.length - 1];
    return last ? releaseOf(last) : '￿';
  });
  const cutoff = reached.length
    ? reached.reduce((a, b) => (a > b ? a : b))
    : '';
  const titles = lists
    .flatMap((list) => list.titles)
    .filter((title) => releaseOf(title) >= cutoff)
    .sort((a, b) => releaseOf(b).localeCompare(releaseOf(a)));
  const isLoadingMore = lists.some((list) => list.isLoadingMore);
  const fetchMore = () => {
    // The list holding the others back reads on
    const behind = open[reached.indexOf(cutoff)];
    behind?.fetchMore();
  };

  useVerticalScroll(fetchMore, !loading && !isLoadingMore && open.length > 0);

  // With nothing to show yet there is nothing to scroll, so it reads on
  const stalled =
    !loading && !isLoadingMore && open.length > 0 && titles.length < 20;
  useEffect(() => {
    if (stalled) {
      fetchMore();
    }
    // fetchMore changes on every render; the stall is what matters
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stalled, cutoff]);

  if (!loading && titles.length === 0 && open.length === 0) {
    return null;
  }

  return (
    <>
      <SliderHeader title={intl.formatMessage(messages.appearances)} />
      {/* Posters fill the gaps a wide scene card leaves at a row's end */}
      <ul className="cards-vertical" style={{ gridAutoFlow: 'dense' }}>
        {titles.map((title) =>
          title.mediaType === 'scene' ? (
            <li key={`scene-${title.id}`} className="col-span-2">
              <SceneCard scene={title} canExpand />
            </li>
          ) : (
            <li key={`movie-${title.id}`}>
              <AdultMovieCard movie={title} canExpand />
            </li>
          )
        )}
        {(loading || isLoadingMore) &&
          [...Array(10)].map((_item, i) => (
            <li key={`placeholder-${i}`}>
              <TitleCard.Placeholder canExpand />
            </li>
          ))}
      </ul>
    </>
  );
};

interface CreditTitlesProps {
  view: CreditView;
  movies?: CreditSource;
  scenes?: CreditSource;
}

// The titles of the picked view; a kind they have none of leaves it empty
export const CreditTitles = ({ view, movies, scenes }: CreditTitlesProps) => {
  if (view === 'all' && movies && scenes) {
    return <MixedTitles movies={movies} scenes={scenes} />;
  }

  const showMovies = view !== 'scenes' && movies;
  const showScenes = view !== 'adultmovies' && scenes;

  return showMovies ? (
    <SingleTitles key="movies" mediaType="adultmovie" source={showMovies} />
  ) : showScenes ? (
    <SingleTitles key="scenes" mediaType="scene" source={showScenes} />
  ) : null;
};
