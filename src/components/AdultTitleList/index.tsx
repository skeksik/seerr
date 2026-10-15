import Header from '@app/components/Common/Header';
import ListView from '@app/components/Common/ListView';
import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import PageTitle from '@app/components/Common/PageTitle';
import SceneList from '@app/components/Scenes/SceneList';
import useAdult from '@app/hooks/useAdult';
import useDiscover from '@app/hooks/useDiscover';
import ErrorPage from '@app/pages/_error';
import defineMessages from '@app/utils/defineMessages';
import type { SceneDetails, SceneResult } from '@server/models/Scene';
import type { XxxMovieDetails, XxxMovieResult } from '@server/models/XxxMovie';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

const messages = defineMessages('components.AdultTitleList', {
  recommendations: 'Recommendations',
  similar: 'Similar',
});

interface AdultTitleListProps {
  mediaType: 'scene' | 'xxxmovie';
  list: 'recommendations' | 'similar';
}

const AdultTitleListContent = ({ mediaType, list }: AdultTitleListProps) => {
  const router = useRouter();
  const intl = useIntl();
  const id = router.query[mediaType === 'scene' ? 'sceneId' : 'xxxMovieId'];
  const { data: title, error: titleError } = useSWR<
    SceneDetails | XxxMovieDetails
  >(id ? `/api/v1/${mediaType}/${id}` : null);
  const {
    isLoadingInitialData,
    isEmpty,
    isLoadingMore,
    isReachingEnd,
    titles,
    fetchMore,
    error,
  } = useDiscover<SceneResult | XxxMovieResult>(
    `/api/v1/${mediaType}/${id}/${list}`
  );

  if (error || titleError) {
    return <ErrorPage statusCode={500} />;
  }

  if (!title) {
    return <LoadingSpinner />;
  }

  const heading = intl.formatMessage(messages[list]);
  const isLoading =
    isLoadingInitialData || (isLoadingMore && (titles?.length ?? 0) > 0);

  return (
    <>
      <PageTitle title={[heading, title.title]} />
      <div className="mb-5 mt-1">
        <Header
          subtext={
            <Link
              href={`/${mediaType}/${title.id}`}
              className="hover:underline"
            >
              {title.title}
            </Link>
          }
        >
          {heading}
        </Header>
      </div>
      {mediaType === 'scene' ? (
        <SceneList
          scenes={(titles ?? []) as SceneResult[]}
          isEmpty={isEmpty}
          isLoading={isLoading}
          isReachingEnd={isReachingEnd}
          onScrollBottom={fetchMore}
        />
      ) : (
        <ListView
          items={titles as XxxMovieResult[]}
          isEmpty={isEmpty}
          isLoading={isLoading}
          isReachingEnd={isReachingEnd}
          onScrollBottom={fetchMore}
        />
      )}
    </>
  );
};

// The movie Recommendations and Similar pages, for scenes and XXX movies
const AdultTitleList = (props: AdultTitleListProps) => {
  const canViewAdult = useAdult();

  if (!canViewAdult) {
    return <ErrorPage statusCode={404} />;
  }

  return <AdultTitleListContent {...props} />;
};

export default AdultTitleList;
