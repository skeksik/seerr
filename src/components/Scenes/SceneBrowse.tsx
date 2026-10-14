import Header from '@app/components/Common/Header';
import PageTitle from '@app/components/Common/PageTitle';
import SceneList from '@app/components/Scenes/SceneList';
import useAdult from '@app/hooks/useAdult';
import useDiscover from '@app/hooks/useDiscover';
import { useUpdateQueryParams } from '@app/hooks/useUpdateQueryParams';
import globalMessages from '@app/i18n/globalMessages';
import ErrorPage from '@app/pages/_error';
import defineMessages from '@app/utils/defineMessages';
import { BarsArrowDownIcon } from '@heroicons/react/24/solid';
import type { SceneFilterDetails, SceneResult } from '@server/models/Scene';
import { useRouter } from 'next/router';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

const messages = defineMessages('components.Scenes.SceneBrowse', {
  sortTrending: 'Trending',
  sortPopularity: 'Popularity',
  sortDate: 'Release Date',
  sortTitle: 'Title',
  sortDuration: 'Duration',
  sortCreated: 'Recently Added to StashDB',
  studioScenes: '{name} Scenes',
  performerScenes: 'Scenes with {name}',
  tagScenes: '{name} Scenes',
});

const sortOptions = [
  ['trending', messages.sortTrending],
  ['popularity', messages.sortPopularity],
  ['date', messages.sortDate],
  ['title', messages.sortTitle],
  ['duration', messages.sortDuration],
  ['created_at', messages.sortCreated],
] as const;

const filterTypes = ['studio', 'performer', 'tag'] as const;

const SceneBrowseContent = () => {
  const intl = useIntl();
  const router = useRouter();
  const updateQueryParams = useUpdateQueryParams(router.query);

  const sort =
    typeof router.query.sort === 'string' ? router.query.sort : 'trending';
  const filterType = filterTypes.find(
    (type) => typeof router.query[type] === 'string'
  );
  const filterId = filterType
    ? (router.query[filterType] as string)
    : undefined;

  const { data: filter } = useSWR<SceneFilterDetails>(
    filterType ? `/api/v1/scene/${filterType}/${filterId}` : null
  );

  const {
    isLoadingInitialData,
    isEmpty,
    isLoadingMore,
    isReachingEnd,
    titles,
    fetchMore,
    error,
  } = useDiscover<SceneResult>('/api/v1/scene/discover', {
    sort,
    ...(filterType ? { [filterType]: filterId } : {}),
  });

  if (error) {
    return <ErrorPage statusCode={500} />;
  }

  const title = !filterType
    ? intl.formatMessage(globalMessages.scenes)
    : filter
      ? intl.formatMessage(
          filterType === 'studio'
            ? messages.studioScenes
            : filterType === 'performer'
              ? messages.performerScenes
              : messages.tagScenes,
          { name: filter.name }
        )
      : '';

  return (
    <>
      <PageTitle title={title || intl.formatMessage(globalMessages.scenes)} />
      <div className="mb-4 flex flex-col justify-between lg:flex-row lg:items-end">
        <Header>{title}</Header>
        <div className="mt-2 flex flex-grow sm:mr-2 lg:flex-grow-0">
          <span className="inline-flex cursor-default items-center rounded-l-md border border-r-0 border-gray-500 bg-gray-800 px-3 text-gray-100 sm:text-sm">
            <BarsArrowDownIcon className="h-6 w-6" />
          </span>
          <select
            id="sortBy"
            name="sortBy"
            className="rounded-r-only"
            value={sort}
            onChange={(e) => updateQueryParams('sort', e.target.value)}
          >
            {sortOptions.map(([value, message]) => (
              <option key={value} value={value}>
                {intl.formatMessage(message)}
              </option>
            ))}
          </select>
        </div>
      </div>
      <SceneList
        scenes={titles}
        isEmpty={isEmpty}
        isLoading={
          isLoadingInitialData || (isLoadingMore && (titles?.length ?? 0) > 0)
        }
        isReachingEnd={isReachingEnd}
        onScrollBottom={fetchMore}
      />
    </>
  );
};

// Hooks above fetch unconditionally, so gate before mounting them
const SceneBrowse = () => {
  const canViewAdult = useAdult();

  if (!canViewAdult) {
    return <ErrorPage statusCode={404} />;
  }

  return <SceneBrowseContent />;
};

export default SceneBrowse;
