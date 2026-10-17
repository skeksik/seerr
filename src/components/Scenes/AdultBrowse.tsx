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
  // Like the Movies and Series tabs; StashDB's trending order has a page of
  // its own, as TMDB's does
  scene: {
    endpoint: '/api/v1/scene/discover',
    sortOptions: [
      ['popularity.desc', messages.sortPopularityDesc],
      ['popularity.asc', messages.sortPopularityAsc],
      ['release_date.desc', messages.sortDateDesc],
      ['release_date.asc', messages.sortDateAsc],
      ['created_at.desc', messages.sortAddedDesc],
      ['created_at.asc', messages.sortAddedAsc],
      ['duration.desc', messages.sortDurationDesc],
      ['duration.asc', messages.sortDurationAsc],
      ['original_title.asc', messages.sortTitleAsc],
      ['original_title.desc', messages.sortTitleDesc],
    ],
    title: globalMessages.scenes,
    provider: 'StashDB',
  },
  // ThePornDB has no popularity or title order
  adultmovie: {
    endpoint: '/api/v1/adultmovie/discover',
    sortOptions: [
      ['release_date.desc', messages.sortDateDesc],
      ['release_date.asc', messages.sortDateAsc],
      ['created_at.desc', messages.sortAddedDesc],
      ['created_at.asc', messages.sortAddedAsc],
      ['duration.desc', messages.sortDurationDesc],
      ['duration.asc', messages.sortDurationAsc],
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

  const sortBy =
    typeof router.query.sortBy === 'string' &&
    sortOptions.some(([value]) => value === router.query.sortBy)
      ? router.query.sortBy
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
    { ...filters, sortBy },
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
              value={sortBy}
              onChange={(e) => updateQueryParams('sortBy', e.target.value)}
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
        // Filtered pages can come back empty, so placeholders show while
        // more are read, with or without titles
        isLoading={isLoadingInitialData || isLoadingMore}
        isReachingEnd={isReachingEnd}
        onScrollBottom={fetchMore}
      />
    </>
  );
};

export default withAdultGate(AdultBrowse);
