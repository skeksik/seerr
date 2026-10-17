import useToasts from '@app/hooks/useToasts';
import globalMessages from '@app/i18n/globalMessages';
import { emptyPagesInARow } from '@app/utils/filteredPages';
import { isTitleShown } from '@app/utils/titleShown';
import type { MediaStatus } from '@server/constants/media';
import { useEffect, useRef } from 'react';
import { useIntl } from 'react-intl';
import useSWRInfinite from 'swr/infinite';
import useSettings from './useSettings';
import { Permission, useUser } from './useUser';

export interface BaseSearchResult<T> {
  page: number;
  totalResults: number;
  totalPages: number;
  results: T[];
}

interface BaseMedia {
  // Scenes are keyed by StashDB UUID
  id: number | string;
  mediaType: string;
  mediaInfo?: {
    status: MediaStatus;
    hasActiveRequest?: boolean;
  };
}

interface DiscoverResult<T, S> {
  isLoadingInitialData: boolean;
  isLoadingMore: boolean;
  fetchMore: () => void;
  isEmpty: boolean;
  isReachingEnd: boolean;
  error: unknown;
  titles: T[];
  firstResultData?: BaseSearchResult<T> & S;
  mutate?: () => void;
}

const extraEncodes: [RegExp, string][] = [
  [/\(/g, '%28'],
  [/\)/g, '%29'],
  [/!/g, '%21'],
  [/\*/g, '%2A'],
];

export const encodeURIExtraParams = (string: string): string => {
  let finalString = encodeURIComponent(string);

  extraEncodes.forEach((encode) => {
    finalString = finalString.replace(encode[0], encode[1]);
  });

  return finalString;
};

// Lists start with this many pages
const INITIAL_PAGES = 3;

const useDiscover = <
  T extends BaseMedia,
  S = Record<string, never>,
  O = Record<string, unknown>,
>(
  endpoint: string,
  options?: O,
  {
    hideAvailable = true,
    hideBlocklisted = true,
    hideRequested = true,
    // Pages the server filters can come back short, or empty, before the
    // last one, so only the page count tells the end
    filteredPages = false,
  } = {}
): DiscoverResult<T, S> => {
  const settings = useSettings();
  const { hasPermission } = useUser();
  const { addToast } = useToasts();
  const intl = useIntl();
  const { data, error, size, setSize, isValidating, mutate } = useSWRInfinite<
    BaseSearchResult<T> & S
  >(
    (pageIndex: number, previousPageData) => {
      if (previousPageData && pageIndex + 1 > previousPageData.totalPages) {
        return null;
      }

      const params: Record<string, unknown> = {
        page: pageIndex + 1,
        ...options,
      };

      const finalQueryString = Object.keys(params)
        .map(
          (paramKey) =>
            `${paramKey}=${encodeURIExtraParams(params[paramKey] as string)}`
        )
        .join('&');

      return `${endpoint}?${finalQueryString}`;
    },
    {
      // The first page of a filtered list shows as soon as it is in, as
      // these take seconds each, rather than once all initial pages are
      initialSize: filteredPages ? 1 : INITIAL_PAGES,
      revalidateFirstPage: false,
      dedupingInterval: 30000,
      revalidateOnFocus: false,
    }
  );

  const resultIds = new Set<number | string>();

  const isLoadingInitialData = !data && !error;
  const isLoadingMore =
    isLoadingInitialData ||
    (size > 0 &&
      !!data &&
      typeof data[size - 1] === 'undefined' &&
      isValidating);

  // One page at a time: lists ask for more on every render while scrolled
  // to the bottom, as an empty one always is, and the initial pages are
  // asked for too, so the size asked for keeps two asks in one render apart
  const askedSize = useRef(size);
  askedSize.current = size;
  const loadedPages = data?.length ?? 0;
  const askForMore = () => {
    if (askedSize.current !== size || (!error && loadedPages < size)) {
      return;
    }
    askedSize.current = size + 1;
    setSize(size + 1);
  };
  const fetchMore = () => {
    if (!isLoadingInitialData) {
      askForMore();
    }
  };

  let titles = (data ?? []).reduce((a, v) => {
    const results: T[] = [];

    for (const result of v.results) {
      if (!resultIds.has(result.id)) {
        resultIds.add(result.id);
        results.push(result);
      }
    }

    return [...a, ...results];
  }, [] as T[]);

  titles = titles.filter(
    isTitleShown(settings.currentSettings, {
      hideAvailable,
      hideBlocklisted:
        hideBlocklisted && hasPermission(Permission.MANAGE_BLOCKLIST),
      hideRequested,
    })
  );

  const lastPage = data?.[data.length - 1];
  const pagesDone =
    (!!lastPage && lastPage.page >= lastPage.totalPages) ||
    (filteredPages && emptyPagesInARow(data));
  const isEmpty =
    !isLoadingInitialData &&
    titles?.length === 0 &&
    (!filteredPages || pagesDone);
  const isReachingEnd = filteredPages
    ? isEmpty || pagesDone
    : isEmpty ||
      (!!data && (data[data?.length - 1]?.results.length ?? 0) < 20) ||
      (!!data && (data[data?.length - 1]?.totalResults ?? 0) <= size * 20) ||
      (!!data && (data[data?.length - 1]?.totalResults ?? 0) < 41);

  // Then the rest of the initial pages follow, one at a time
  useEffect(() => {
    if (
      filteredPages &&
      !error &&
      loadedPages === size &&
      size < INITIAL_PAGES &&
      !isReachingEnd
    ) {
      askForMore();
    }
  });

  useEffect(() => {
    if (error && titles.length) {
      addToast(intl.formatMessage(globalMessages.error), {
        appearance: 'error',
        autoDismiss: true,
      });
      console.error('Error while fetching discover titles:', error);
    }
  }, [data, error, addToast, intl, titles.length]);

  return {
    isLoadingInitialData,
    isLoadingMore,
    fetchMore,
    isEmpty,
    isReachingEnd,
    error: error && titles.length ? null : error,
    titles,
    firstResultData: data?.[0],
    mutate,
  };
};

export default useDiscover;
