import withAdultGate from '@app/components/Common/AdultGate';
import Header from '@app/components/Common/Header';
import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import PageTitle from '@app/components/Common/PageTitle';
import { creditHref } from '@app/components/Common/adultRoutes';
import CompanyCard from '@app/components/CompanyCard';
import useDebouncedState from '@app/hooks/useDebouncedState';
import { useBatchUpdateQueryParams } from '@app/hooks/useUpdateQueryParams';
import useVerticalScroll from '@app/hooks/useVerticalScroll';
import globalMessages from '@app/i18n/globalMessages';
import ErrorPage from '@app/pages/_error';
import defineMessages from '@app/utils/defineMessages';
import { stashImageUrl } from '@app/utils/stashImage';
import {
  BarsArrowDownIcon,
  MagnifyingGlassIcon,
} from '@heroicons/react/24/solid';
import type { MergedStudio } from '@server/lib/mergedStudios';
import { useRouter } from 'next/router';
import { useEffect } from 'react';
import { useIntl } from 'react-intl';
import useSWRInfinite from 'swr/infinite';

const messages = defineMessages('components.Scenes.AdultStudioList', {
  studios: 'Studios',
  networks: 'Networks',
  search: 'Search by name',
  sortName: 'Name (A-Z)',
  sortNewest: 'Newest on StashDB',
  sortTrending: 'Trending',
  sortPopular: 'Popularity',
});

interface StudioPage {
  page: number;
  totalPages: number;
  results: MergedStudio[];
}

interface AdultStudioListProps {
  type: 'studios' | 'networks';
}

const sortOptions = [
  ['trending', messages.sortTrending],
  ['popular', messages.sortPopular],
  ['name', messages.sortName],
  ['newest', messages.sortNewest],
] as const;

type StudioSort = (typeof sortOptions)[number][0];

// Every StashDB studio or network, behind the rows of the same name, which
// start out like the rows. Trending and popularity rank those of the most
// trending or popular scenes. By name, studios take in ThePornDB's sites
// StashDB has no studio for
const AdultStudioList = ({ type }: AdultStudioListProps) => {
  const intl = useIntl();
  const router = useRouter();
  const batchUpdate = useBatchUpdateQueryParams(router.query);
  // Search and sort live in the URL, so going back keeps them
  const query =
    typeof router.query.query === 'string' ? router.query.query : '';
  const sort: StudioSort =
    sortOptions.find(([value]) => value === router.query.sort)?.[0] ??
    'trending';
  const [search, debouncedSearch, setSearch] = useDebouncedState(query);
  // The URL keeps its values as given, so both go in encoded
  const setParams = (params: { query: string; sort: StudioSort }) =>
    batchUpdate({
      query: params.query ? encodeURIComponent(params.query) : undefined,
      sort: params.sort === 'trending' ? undefined : params.sort,
    });

  useEffect(() => {
    if (debouncedSearch !== query) {
      setParams({ query: debouncedSearch, sort });
    }
    // Only once typing settles
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);
  const { data, error, size, setSize, isValidating } =
    useSWRInfinite<StudioPage>(
      (index: number, previous: StudioPage | null) =>
        previous && index + 1 > previous.totalPages
          ? null
          : `/api/v1/scene/studios?type=${type}&sort=${sort}&page=${index + 1}${
              query ? `&query=${encodeURIComponent(query)}` : ''
            }`,
      { revalidateFirstPage: false }
    );

  const studios = (data ?? []).flatMap((page) => page.results);
  const isReachingEnd =
    !!data && data[data.length - 1]?.page >= data[data.length - 1]?.totalPages;
  const isLoading =
    (!data && !error) || (isValidating && size > (data?.length ?? 0));

  useVerticalScroll(() => setSize(size + 1), !isLoading && !isReachingEnd);

  const title = intl.formatMessage(messages[type]);

  return (
    <>
      <PageTitle title={title} />
      <div className="mb-4 flex flex-col justify-between lg:flex-row lg:items-end">
        <Header>{title}</Header>
        <div className="mt-2 flex flex-grow flex-col gap-2 sm:flex-row lg:flex-grow-0">
          <div className="flex flex-grow">
            <span className="inline-flex cursor-default items-center rounded-l-md border border-r-0 border-gray-500 bg-gray-800 px-3 text-gray-100 sm:text-sm">
              <MagnifyingGlassIcon className="h-6 w-6" />
            </span>
            <input
              type="search"
              className="rounded-r-only"
              placeholder={intl.formatMessage(messages.search)}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex flex-grow lg:flex-grow-0">
            <span className="inline-flex cursor-default items-center rounded-l-md border border-r-0 border-gray-500 bg-gray-800 px-3 text-gray-100 sm:text-sm">
              <BarsArrowDownIcon className="h-6 w-6" />
            </span>
            <select
              id="sortBy"
              name="sortBy"
              className="rounded-r-only"
              value={sort}
              onChange={(e) =>
                setParams({ query, sort: e.target.value as StudioSort })
              }
            >
              {sortOptions.map(([value, message]) => (
                <option key={value} value={value}>
                  {intl.formatMessage(message)}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
      {error ? (
        <ErrorPage statusCode={500} />
      ) : (
        <>
          {/* Cards stretch so each row fills the page */}
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(12rem,1fr))] gap-4 sm:grid-cols-[repeat(auto-fill,minmax(16rem,1fr))]">
            {studios.map((studio) => (
              <li key={`${type}-${studio.id}`}>
                {/* ThePornDB sites StashDB has no studio for open their page */}
                <CompanyCard
                  fullWidth
                  name={studio.name}
                  image={
                    studio.source === 'tpdb'
                      ? studio.imageUrl
                      : stashImageUrl(studio.imageUrl, 300)
                  }
                  imageType={studio.source === 'tpdb' ? 'tpdb' : 'stashdb'}
                  url={creditHref('studio', studio.id)}
                />
              </li>
            ))}
          </ul>
          {isLoading && <LoadingSpinner />}
          {!isLoading && studios.length === 0 && (
            <div className="mt-64 w-full text-center text-2xl text-gray-400">
              {intl.formatMessage(globalMessages.noresults)}
            </div>
          )}
        </>
      )}
    </>
  );
};

export default withAdultGate(AdultStudioList);
