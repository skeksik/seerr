import withAdultGate from '@app/components/Common/AdultGate';
import Header from '@app/components/Common/Header';
import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import PageTitle from '@app/components/Common/PageTitle';
import { creditHref, isTpdbCreditId } from '@app/components/Common/adultRoutes';
import CompanyCard from '@app/components/CompanyCard';
import globalMessages from '@app/i18n/globalMessages';
import ErrorPage from '@app/pages/_error';
import defineMessages from '@app/utils/defineMessages';
import { stashImageUrl } from '@app/utils/stashImage';
import type { AdultStudioDetails } from '@server/models/AdultCredit';
import type { SceneStudioDetails } from '@server/models/Scene';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect } from 'react';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

const messages = defineMessages('components.Scenes.NetworkStudioList', {
  studios: 'Studios',
  sites: 'Sites',
});

// A StashDB network's studios, or a ThePornDB network's sites, told apart
// by the id like the studio page
const NetworkStudioList = () => {
  const intl = useIntl();
  const router = useRouter();
  const id = router.query.id as string;
  const source = isTpdbCreditId(id) ? 'tpdb' : 'stashdb';
  const { data, error } = useSWR<SceneStudioDetails | AdultStudioDetails>(
    id
      ? source === 'stashdb'
        ? `/api/v1/scene/studio/${id}`
        : `/api/v1/adultmovie/studio/${id}`
      : null
  );
  // A network linked to a StashDB one has that one's page only
  const stashDbId = data && 'sites' in data ? data.stashDbId : undefined;

  useEffect(() => {
    if (stashDbId) {
      router.replace(`${creditHref('studio', stashDbId)}/studios`);
    }
  }, [router, stashDbId]);

  if ((!data && !error) || stashDbId) {
    return <LoadingSpinner />;
  }

  if (!data) {
    return <ErrorPage statusCode={404} />;
  }

  const studios = 'studios' in data ? data.studios : data.sites;
  const title = intl.formatMessage(
    source === 'stashdb' ? messages.studios : messages.sites
  );

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
        {studios.map((studio) => (
          <li key={`network-studio-${studio.id}`}>
            <CompanyCard
              fullWidth
              name={studio.name}
              image={
                source === 'stashdb'
                  ? stashImageUrl(studio.imageUrl, 300)
                  : studio.imageUrl
              }
              imageType={source}
              // Sites linked to a StashDB studio have its page
              url={creditHref(
                'studio',
                ('stashDbId' in studio && studio.stashDbId) || studio.id
              )}
            />
          </li>
        ))}
      </ul>
      {studios.length === 0 && (
        <div className="mt-64 w-full text-center text-2xl text-gray-400">
          {intl.formatMessage(globalMessages.noresults)}
        </div>
      )}
    </>
  );
};

export default withAdultGate(NetworkStudioList);
