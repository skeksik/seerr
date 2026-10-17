import withAdultGate from '@app/components/Common/AdultGate';
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

const messages = defineMessages('components.AdultCrew', {
  fullcrew: 'Full Crew',
  director: 'Director',
});

interface AdultCrewProps {
  mediaType: 'scene' | 'adultmovie';
}

// The movie Full Crew page, for scene and adult movie directors. Neither
// StashDB nor ThePornDB has crew profiles, so the cards link nowhere
const AdultCrew = ({ mediaType }: AdultCrewProps) => {
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

  const directors =
    'directors' in data ? data.directors : data.director ? [data.director] : [];

  return (
    <>
      <PageTitle title={[intl.formatMessage(messages.fullcrew), data.title]} />
      <div className="mb-5 mt-1">
        <Header
          subtext={
            <Link href={`/${mediaType}/${data.id}`} className="hover:underline">
              {data.title}
            </Link>
          }
        >
          {intl.formatMessage(messages.fullcrew)}
        </Header>
      </div>
      <ul className="cards-vertical">
        {directors.map((director, index) => (
          <li key={`crew-${director}-${index}`}>
            <PersonCard
              personId={director}
              name={director}
              subName={intl.formatMessage(messages.director)}
              href={null}
              canExpand
            />
          </li>
        ))}
      </ul>
    </>
  );
};

export default withAdultGate(AdultCrew);
