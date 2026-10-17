import withAdultGate from '@app/components/Common/AdultGate';
import Header from '@app/components/Common/Header';
import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import PageTitle from '@app/components/Common/PageTitle';
import { creditHref } from '@app/components/Common/adultRoutes';
import CompanyCard from '@app/components/CompanyCard';
import globalMessages from '@app/i18n/globalMessages';
import ErrorPage from '@app/pages/_error';
import defineMessages from '@app/utils/defineMessages';
import { stashImageUrl } from '@app/utils/stashImage';
import type { SceneStudioDetails } from '@server/models/Scene';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

const messages = defineMessages('components.Scenes.NetworkStudioList', {
  studios: 'Studios',
});

// A StashDB network's studios
const NetworkStudioList = () => {
  const intl = useIntl();
  const router = useRouter();
  const id = router.query.id as string;
  const { data, error } = useSWR<SceneStudioDetails>(
    id ? `/api/v1/scene/studio/${id}` : null
  );

  if (!data && !error) {
    return <LoadingSpinner />;
  }

  if (!data) {
    return <ErrorPage statusCode={404} />;
  }

  const title = intl.formatMessage(messages.studios);

  return (
    <>
      <PageTitle title={[title, data.name]} />
      <div className="mb-4">
        <Header
          subtext={
            <Link
              href={creditHref('studio', data.id)}
              className="hover:underline"
            >
              {data.name}
            </Link>
          }
        >
          {title}
        </Header>
      </div>
      {/* Cards stretch so each row fills the page */}
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(12rem,1fr))] gap-4 sm:grid-cols-[repeat(auto-fill,minmax(16rem,1fr))]">
        {data.studios.map((studio) => (
          <li key={`network-studio-${studio.id}`}>
            <CompanyCard
              fullWidth
              name={studio.name}
              image={stashImageUrl(studio.imageUrl, 300)}
              imageType="stashdb"
              url={creditHref('studio', studio.id)}
            />
          </li>
        ))}
      </ul>
      {data.studios.length === 0 && (
        <div className="mt-64 w-full text-center text-2xl text-gray-400">
          {intl.formatMessage(globalMessages.noresults)}
        </div>
      )}
    </>
  );
};

export default withAdultGate(NetworkStudioList);
