import ListView from '@app/components/Common/ListView';
import SliderHeader from '@app/components/Common/SliderHeader';
import {
  creditBrowseHref,
  creditTitlesQuery,
} from '@app/components/Common/adultRoutes';
import useDiscover from '@app/hooks/useDiscover';
import globalMessages from '@app/i18n/globalMessages';
import defineMessages from '@app/utils/defineMessages';
import { CircleStackIcon } from '@heroicons/react/24/solid';
import type { AdultMovieResult } from '@server/models/AdultMovie';
import type { SceneResult } from '@server/models/Scene';
import { useRouter } from 'next/router';
import { useIntl } from 'react-intl';

const messages = defineMessages('components.Scenes.AdultCreditView', {
  appearances: 'Appearances',
});

// What a performer or studio page shows: every row, or one kind of title
export type CreditView = 'all' | 'scenes' | 'adultmovies';

const viewMessages = {
  all: globalMessages.all,
  scenes: globalMessages.scenes,
  adultmovies: globalMessages.adultMovies,
};

// The view in the URL's type param, so back and forward bring it back.
// Views that may still turn up, like the movies of a ThePornDB match not
// known yet, are waited for rather than dropped
export const useCreditView = (
  views: CreditView[],
  pending: CreditView[] = []
) => {
  const router = useRouter();
  const wanted = router.query.type as CreditView | undefined;
  const view: CreditView = wanted && views.includes(wanted) ? wanted : 'all';
  const setView = (next: CreditView) => {
    const query = { ...router.query };
    delete query.type;
    router.push(
      {
        pathname: router.pathname,
        query: next === 'all' ? query : { ...query, type: next },
      },
      undefined,
      { shallow: true, scroll: false }
    );
  };

  return {
    view,
    setView,
    waiting: !!wanted && view === 'all' && pending.includes(wanted),
  };
};

interface CreditViewPickerProps {
  views: CreditView[];
  view: CreditView;
  onChange: (view: CreditView) => void;
}

// The person page's media type selector
export const CreditViewPicker = ({
  views,
  view,
  onChange,
}: CreditViewPickerProps) => {
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
        {views.map((option) => (
          <option key={option} value={option}>
            {intl.formatMessage(viewMessages[option])}
          </option>
        ))}
      </select>
    </div>
  );
};

interface CreditTitlesProps {
  mediaType: 'scene' | 'adultmovie';
  type: 'performer' | 'studio';
  // StashDB's for scenes, ThePornDB's for movies
  id: string | number;
}

// The person page's Appearances, for one kind of title, newest first; the
// title opens the browse tab filtered to them, like their row's. Studios
// make their titles rather than appear in them, so theirs go by the kind
export const CreditTitles = ({ mediaType, type, id }: CreditTitlesProps) => {
  const intl = useIntl();
  const { endpoint, params } = creditTitlesQuery(mediaType, type, id);
  const {
    isLoadingInitialData,
    isEmpty,
    isLoadingMore,
    isReachingEnd,
    titles,
    fetchMore,
    error,
  } = useDiscover<SceneResult | AdultMovieResult>(endpoint, params, {
    filteredPages: true,
  });

  return (
    <>
      <SliderHeader
        title={intl.formatMessage(messages.appearances)}
        linkUrl={creditBrowseHref(mediaType, type, id)}
      />
      <ListView
        items={titles}
        landscape={mediaType === 'scene'}
        isEmpty={isEmpty || !!error}
        isLoading={
          !error &&
          (isLoadingInitialData || (isLoadingMore && (titles?.length ?? 0) > 0))
        }
        isReachingEnd={isReachingEnd || !!error}
        onScrollBottom={fetchMore}
      />
    </>
  );
};
