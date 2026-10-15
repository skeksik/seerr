import Header from '@app/components/Common/Header';
import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import PageTitle from '@app/components/Common/PageTitle';
import PersonCard from '@app/components/PersonCard';
import useAdult from '@app/hooks/useAdult';
import ErrorPage from '@app/pages/_error';
import defineMessages from '@app/utils/defineMessages';
import { stashImageUrl } from '@app/utils/stashImage';
import type { SceneDetails } from '@server/models/Scene';
import type { XxxMovieDetails } from '@server/models/XxxMovie';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

const messages = defineMessages('components.AdultCast', {
  fullcast: 'Full Cast',
});

interface AdultCastProps {
  mediaType: 'scene' | 'xxxmovie';
}

const AdultCastContent = ({ mediaType }: AdultCastProps) => {
  const router = useRouter();
  const intl = useIntl();
  const id = router.query[mediaType === 'scene' ? 'sceneId' : 'xxxMovieId'];
  const { data, error } = useSWR<SceneDetails | XxxMovieDetails>(
    id ? `/api/v1/${mediaType}/${id}` : null
  );

  if (!data && !error) {
    return <LoadingSpinner />;
  }

  if (!data) {
    return <ErrorPage statusCode={404} />;
  }

  return (
    <>
      <PageTitle title={[intl.formatMessage(messages.fullcast), data.title]} />
      <div className="mb-5 mt-1">
        <Header
          subtext={
            <Link href={`/${mediaType}/${data.id}`} className="hover:underline">
              {data.title}
            </Link>
          }
        >
          {intl.formatMessage(messages.fullcast)}
        </Header>
      </div>
      <ul className="cards-vertical">
        {data.mediaType === 'scene'
          ? data.performers.map((performer) => (
              <li key={`cast-${performer.id}`}>
                <PersonCard
                  personId={performer.id}
                  name={performer.name}
                  subName={performer.as ?? performer.disambiguation}
                  href={`/scenes/performer/${performer.id}`}
                  image={
                    performer.imageUrl
                      ? {
                          src: stashImageUrl(performer.imageUrl, 300) as string,
                          type: 'stashdb',
                        }
                      : undefined
                  }
                  canExpand
                />
              </li>
            ))
          : data.performers.map((performer) => (
              <li key={`cast-${performer.id}`}>
                <PersonCard
                  personId={performer.id}
                  name={performer.name}
                  href={
                    performer.stashDbId
                      ? `/scenes/performer/${performer.stashDbId}`
                      : `/xxxmovies/performer/${performer.tpdbId}`
                  }
                  image={
                    performer.imageUrl
                      ? { src: performer.imageUrl, type: 'tpdb' }
                      : undefined
                  }
                  canExpand
                />
              </li>
            ))}
      </ul>
    </>
  );
};

// The movie Full Cast page, for scene and XXX movie performers
const AdultCast = ({ mediaType }: AdultCastProps) => {
  const canViewAdult = useAdult();

  if (!canViewAdult) {
    return <ErrorPage statusCode={404} />;
  }

  return <AdultCastContent mediaType={mediaType} />;
};

export default AdultCast;
