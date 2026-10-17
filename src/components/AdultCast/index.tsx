import withAdultGate from '@app/components/Common/AdultGate';
import { toSliderPerformer } from '@app/components/Common/adultRoutes';
import Header from '@app/components/Common/Header';
import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import PageTitle from '@app/components/Common/PageTitle';
import PersonCard from '@app/components/PersonCard';
import ErrorPage from '@app/pages/_error';
import defineMessages from '@app/utils/defineMessages';
import type { AdultMovieDetails } from '@server/models/AdultMovie';
import type { SceneDetails } from '@server/models/Scene';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

const messages = defineMessages('components.AdultCast', {
  fullcast: 'Full Cast',
});

interface AdultCastProps {
  mediaType: 'scene' | 'adultmovie';
}

// The movie Full Cast page, for scene and adult movie performers
const AdultCast = ({ mediaType }: AdultCastProps) => {
  const router = useRouter();
  const intl = useIntl();
  const id = router.query[mediaType === 'scene' ? 'sceneId' : 'adultMovieId'];
  const { data, error } = useSWR<SceneDetails | AdultMovieDetails>(
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
        {data.performers.map((performer) => (
          <li key={`cast-${performer.id}`}>
            <PersonCard
              {...toSliderPerformer(data.mediaType, performer)}
              canExpand
            />
          </li>
        ))}
      </ul>
    </>
  );
};

export default withAdultGate(AdultCast);
