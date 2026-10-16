import withAdultGate from '@app/components/Common/AdultGate';
import Header from '@app/components/Common/Header';
import ListView from '@app/components/Common/ListView';
import PageTitle from '@app/components/Common/PageTitle';
import useDiscover from '@app/hooks/useDiscover';
import ErrorPage from '@app/pages/_error';
import defineMessages from '@app/utils/defineMessages';
import type {
  AdultMovieDetails,
  AdultMovieResult,
} from '@server/models/AdultMovie';
import type { SceneDetails, SceneResult } from '@server/models/Scene';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

const messages = defineMessages('components.AdultTitleList', {
  recommendations: 'Recommendations',
  similar: 'Similar Titles',
});

interface AdultTitleListProps {
  mediaType: 'scene' | 'adultmovie';
  list: 'recommendations' | 'similar';
}

// The movie Recommendations and Similar pages, for scenes and adult movies
const AdultTitleList = ({ mediaType, list }: AdultTitleListProps) => {
  const router = useRouter();
  const intl = useIntl();
  const id = router.query[mediaType === 'scene' ? 'sceneId' : 'adultMovieId'];
  const { data: title, error: titleError } = useSWR<
    SceneDetails | AdultMovieDetails
  >(id ? `/api/v1/${mediaType}/${id}` : null);
  const {
    isLoadingInitialData,
    isEmpty,
    isLoadingMore,
    isReachingEnd,
    titles,
    fetchMore,
    error,
  } = useDiscover<SceneResult | AdultMovieResult>(
    `/api/v1/${mediaType}/${id}/${list}`,
    undefined,
    { filteredPages: true }
  );

  if (error || titleError) {
    return <ErrorPage statusCode={500} />;
  }

  const heading = intl.formatMessage(messages[list]);

  return (
    <>
      <PageTitle title={[heading, title?.title]} />
      <div className="mb-5 mt-1">
        <Header
          subtext={
            title ? (
              <Link
                href={`/${mediaType}/${title.id}`}
                className="hover:underline"
              >
                {title.title}
              </Link>
            ) : (
              // The list does not wait for the title's name
              <span className="inline-block h-5 w-48 animate-pulse rounded bg-gray-700 align-middle" />
            )
          }
        >
          {heading}
        </Header>
      </div>
      <ListView
        items={titles}
        landscape={mediaType === 'scene'}
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

export default withAdultGate(AdultTitleList);
