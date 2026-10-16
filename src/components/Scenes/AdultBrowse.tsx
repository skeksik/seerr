import type { AdultFilterKind } from '@app/components/AdultFilterSlideover';
import AdultFilterSlideover, {
  activeFiltersMessage,
  adultFilterParams,
  countAdultFilters,
} from '@app/components/AdultFilterSlideover';
import withAdultGate from '@app/components/Common/AdultGate';
import Alert from '@app/components/Common/Alert';
import Button from '@app/components/Common/Button';
import Header from '@app/components/Common/Header';
import ListView from '@app/components/Common/ListView';
import PageTitle from '@app/components/Common/PageTitle';
import useDiscover from '@app/hooks/useDiscover';
import { useUpdateQueryParams } from '@app/hooks/useUpdateQueryParams';
import { Permission, useUser } from '@app/hooks/useUser';
import globalMessages from '@app/i18n/globalMessages';
import ErrorPage from '@app/pages/_error';
import defineMessages from '@app/utils/defineMessages';
import { BarsArrowDownIcon, FunnelIcon } from '@heroicons/react/24/solid';
import type { AdultMovieResult } from '@server/models/AdultMovie';
import type { SceneResult } from '@server/models/Scene';
import type { AxiosError } from 'axios';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useState } from 'react';
import type { MessageDescriptor } from 'react-intl';
import { useIntl } from 'react-intl';

const messages = defineMessages('components.Scenes.AdultBrowse', {
  sortPopularityDesc: 'Popularity Descending',
  sortPopularityAsc: 'Popularity Ascending',
  sortTrending: 'Trending',
  sortDateDesc: 'Release Date Descending',
  sortDateAsc: 'Release Date Ascending',
  sortAddedDesc: 'Date Added Descending',
  sortAddedAsc: 'Date Added Ascending',
  sortDurationDesc: 'Duration Descending',
  sortDurationAsc: 'Duration Ascending',
  sortTitleAsc: 'Title (A-Z) Ascending',
  sortTitleDesc: 'Title (Z-A) Descending',
  notconfigured: '{provider} is not configured',
  notconfiguredDescription:
    'Add a {provider} API key in <SettingsLink>Metadata settings</SettingsLink>.',
  notconfiguredUser: 'Ask an administrator to configure {provider}.',
});

interface BrowseConfig {
  endpoint: string;
  // The first is the default
  sortOptions: readonly (readonly [string, MessageDescriptor])[];
  title: MessageDescriptor;
  provider: string;
}

const browseConfigs: Record<AdultFilterKind, BrowseConfig> = {
  // Like the Movies and Series tabs, with StashDB's trending order besides
  scene: {
    endpoint: '/api/v1/scene/discover',
    sortOptions: [
      ['popularity', messages.sortPopularityDesc],
      ['popularity_asc', messages.sortPopularityAsc],
      ['trending', messages.sortTrending],
      ['date', messages.sortDateDesc],
      ['oldest', messages.sortDateAsc],
      ['created_at', messages.sortAddedDesc],
      ['created_at_asc', messages.sortAddedAsc],
      ['duration', messages.sortDurationDesc],
      ['duration_asc', messages.sortDurationAsc],
      ['title', messages.sortTitleAsc],
      ['title_desc', messages.sortTitleDesc],
    ],
    title: globalMessages.scenes,
    provider: 'StashDB',
  },
  // ThePornDB has no popularity or title order
  adultmovie: {
    endpoint: '/api/v1/adultmovie/discover',
    sortOptions: [
      ['released', messages.sortDateDesc],
      ['oldest', messages.sortDateAsc],
      ['added', messages.sortAddedDesc],
      ['added_asc', messages.sortAddedAsc],
      ['duration', messages.sortDurationDesc],
      ['duration_asc', messages.sortDurationAsc],
    ],
    title: globalMessages.adultMovies,
    provider: 'ThePornDB',
  },
};

interface AdultBrowseProps {
  kind: AdultFilterKind;
}

// The Scenes and Adult Movies tabs, sorted and filtered through the URL
const AdultBrowse = ({ kind }: AdultBrowseProps) => {
  const intl = useIntl();
  const router = useRouter();
  const { hasPermission } = useUser();
  const updateQueryParams = useUpdateQueryParams(router.query);
  const [showFilters, setShowFilters] = useState(false);
  const {
    endpoint,
    sortOptions,
    title: titleMessage,
    provider,
  } = browseConfigs[kind];

  const sort =
    typeof router.query.sort === 'string' &&
    sortOptions.some(([value]) => value === router.query.sort)
      ? router.query.sort
      : sortOptions[0][0];
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
  } = useDiscover<SceneResult | AdultMovieResult>(
    endpoint,
    { ...filters, sort },
    { filteredPages: true }
  );
  const title = intl.formatMessage(titleMessage);

  // The API answers 503 until the provider has an API key
  if ((error as AxiosError | undefined)?.response?.status === 503) {
    return (
      <>
        <PageTitle title={title} />
        <div className="mt-4">
          <Alert
            title={intl.formatMessage(messages.notconfigured, { provider })}
          >
            {hasPermission(Permission.ADMIN)
              ? intl.formatMessage(messages.notconfiguredDescription, {
                  provider,
                  SettingsLink: (msg: React.ReactNode) => (
                    <Link href="/settings/metadata" className="underline">
                      {msg}
                    </Link>
                  ),
                })
              : intl.formatMessage(messages.notconfiguredUser, { provider })}
          </Alert>
        </div>
      </>
    );
  }

  if (error) {
    return <ErrorPage statusCode={500} />;
  }

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
            kind={kind}
            show={showFilters}
            onClose={() => setShowFilters(false)}
          />
          <div className="mb-2 flex flex-grow sm:mb-0 lg:flex-grow-0">
            <Button onClick={() => setShowFilters(true)} className="w-full">
              <FunnelIcon />
              <span>
                {intl.formatMessage(activeFiltersMessage, {
                  count: countAdultFilters(router.query),
                })}
              </span>
            </Button>
          </div>
        </div>
      </div>
      <ListView
        items={titles}
        landscape={kind === 'scene'}
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

export default withAdultGate(AdultBrowse);
