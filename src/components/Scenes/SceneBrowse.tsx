import AdultFilterSlideover, {
  adultFilterParams,
  countAdultFilters,
} from '@app/components/AdultFilterSlideover';
import Button from '@app/components/Common/Button';
import Header from '@app/components/Common/Header';
import PageTitle from '@app/components/Common/PageTitle';
import SceneList from '@app/components/Scenes/SceneList';
import useAdult from '@app/hooks/useAdult';
import useDiscover from '@app/hooks/useDiscover';
import { useUpdateQueryParams } from '@app/hooks/useUpdateQueryParams';
import globalMessages from '@app/i18n/globalMessages';
import ErrorPage from '@app/pages/_error';
import defineMessages from '@app/utils/defineMessages';
import { BarsArrowDownIcon, FunnelIcon } from '@heroicons/react/24/solid';
import type { SceneResult } from '@server/models/Scene';
import { useRouter } from 'next/router';
import { useState } from 'react';
import { useIntl } from 'react-intl';

const messages = defineMessages('components.Scenes.SceneBrowse', {
  sortTrending: 'Trending',
  sortPopularity: 'Popularity',
  sortDate: 'Release Date Descending',
  sortOldest: 'Release Date Ascending',
  sortTitle: 'Title (A-Z)',
  sortDuration: 'Duration',
  sortCreated: 'Recently Added to StashDB',
  activefilters:
    '{count, plural, one {# Active Filter} other {# Active Filters}}',
});

const sortOptions = [
  ['trending', messages.sortTrending],
  ['popularity', messages.sortPopularity],
  ['date', messages.sortDate],
  ['oldest', messages.sortOldest],
  ['title', messages.sortTitle],
  ['duration', messages.sortDuration],
  ['created_at', messages.sortCreated],
] as const;

const SceneBrowseContent = () => {
  const intl = useIntl();
  const router = useRouter();
  const updateQueryParams = useUpdateQueryParams(router.query);
  const [showFilters, setShowFilters] = useState(false);

  // StashDB's trending order only holds recently active scenes, so a
  // filtered list would show just a handful; filters default to newest first
  const sort =
    typeof router.query.sort === 'string'
      ? router.query.sort
      : countAdultFilters(router.query) > 0
        ? 'date'
        : 'trending';
  const filters = Object.fromEntries(
    adultFilterParams
      .map((key) => [key, router.query[key]] as const)
      .filter(([, value]) => typeof value === 'string' && value !== '')
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
    ...filters,
    sort,
  });

  if (error) {
    return <ErrorPage statusCode={500} />;
  }

  const title = intl.formatMessage(globalMessages.scenes);

  return (
    <>
      <PageTitle title={title} />
      <div className="mb-4 flex flex-col justify-between lg:flex-row lg:items-end">
        <Header>{title}</Header>
        <div className="mt-2 flex flex-grow flex-col sm:flex-row lg:flex-grow-0">
          <div className="mb-2 flex flex-grow sm:mb-0 sm:mr-2 lg:flex-grow-0">
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
          <AdultFilterSlideover
            kind="scene"
            show={showFilters}
            onClose={() => setShowFilters(false)}
          />
          <div className="mb-2 flex flex-grow sm:mb-0 lg:flex-grow-0">
            <Button onClick={() => setShowFilters(true)} className="w-full">
              <FunnelIcon />
              <span>
                {intl.formatMessage(messages.activefilters, {
                  count: countAdultFilters(router.query),
                })}
              </span>
            </Button>
          </div>
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
