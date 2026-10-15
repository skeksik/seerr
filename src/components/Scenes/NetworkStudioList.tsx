import Header from '@app/components/Common/Header';
import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import PageTitle from '@app/components/Common/PageTitle';
import CompanyCard from '@app/components/CompanyCard';
import useAdult from '@app/hooks/useAdult';
import ErrorPage from '@app/pages/_error';
import defineMessages from '@app/utils/defineMessages';
import { stashImageUrl } from '@app/utils/stashImage';
import { MagnifyingGlassIcon } from '@heroicons/react/24/solid';
import type { SceneStudioDetails } from '@server/models/Scene';
import type { XxxStudioDetails } from '@server/models/XxxCredit';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useState } from 'react';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

const messages = defineMessages('components.Scenes.NetworkStudioList', {
  studios: 'Studios',
  sites: 'Sites',
  search: 'Search by name',
});

interface NetworkStudioListProps {
  // A StashDB network's studios, or a ThePornDB network's sites
  source: 'stashdb' | 'tpdb';
}

const NetworkStudioListContent = ({ source }: NetworkStudioListProps) => {
  const intl = useIntl();
  const router = useRouter();
  const id = router.query.id as string;
  const [search, setSearch] = useState('');
  const { data, error } = useSWR<SceneStudioDetails | XxxStudioDetails>(
    id
      ? source === 'stashdb'
        ? `/api/v1/scene/studio/${id}`
        : `/api/v1/xxxmovie/studio/${id}`
      : null
  );

  if (!data && !error) {
    return <LoadingSpinner />;
  }

  if (!data) {
    return <ErrorPage statusCode={404} />;
  }

  const base = source === 'stashdb' ? '/scenes/studio' : '/xxxmovies/studio';
  const studios = ('studios' in data ? data.studios : data.sites).filter(
    (studio) => studio.name.toLowerCase().includes(search.trim().toLowerCase())
  );
  const title = intl.formatMessage(
    source === 'stashdb' ? messages.studios : messages.sites
  );

  return (
    <>
      <PageTitle title={[title, data.name]} />
      <div className="mb-4 flex flex-col justify-between lg:flex-row lg:items-end">
        <Header
          subtext={
            <Link href={`${base}/${data.id}`} className="hover:underline">
              {data.name}
            </Link>
          }
        >
          {title}
        </Header>
        <div className="mt-2 flex flex-grow lg:flex-grow-0">
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
              url={`${base}/${studio.id}`}
            />
          </li>
        ))}
      </ul>
    </>
  );
};

// Hooks above fetch unconditionally, so gate before mounting them
const NetworkStudioList = (props: NetworkStudioListProps) => {
  const canViewAdult = useAdult();

  if (!canViewAdult) {
    return <ErrorPage statusCode={404} />;
  }

  return <NetworkStudioListContent {...props} />;
};

export default NetworkStudioList;
