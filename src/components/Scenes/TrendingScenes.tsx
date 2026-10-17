import withAdultGate from '@app/components/Common/AdultGate';
import Alert from '@app/components/Common/Alert';
import Header from '@app/components/Common/Header';
import ListView from '@app/components/Common/ListView';
import PageTitle from '@app/components/Common/PageTitle';
import useDiscover from '@app/hooks/useDiscover';
import { Permission, useUser } from '@app/hooks/useUser';
import ErrorPage from '@app/pages/_error';
import defineMessages from '@app/utils/defineMessages';
import type { SceneResult } from '@server/models/Scene';
import type { AxiosError } from 'axios';
import Link from 'next/link';
import { useIntl } from 'react-intl';

const messages = defineMessages('components.Scenes.TrendingScenes', {
  trendingScenes: 'Trending Scenes',
  notconfigured: 'StashDB is not configured',
  notconfiguredDescription:
    'Add a StashDB API key in <SettingsLink>Metadata settings</SettingsLink>.',
  notconfiguredUser: 'Ask an administrator to configure StashDB.',
});

// Like the Trending page, for scenes: StashDB's trending order, which has no
// daily or weekly window, so there is nothing to pick
const TrendingScenes = () => {
  const intl = useIntl();
  const { hasPermission } = useUser();
  const {
    isLoadingInitialData,
    isEmpty,
    isLoadingMore,
    isReachingEnd,
    titles,
    fetchMore,
    error,
  } = useDiscover<SceneResult>('/api/v1/scene/discover', {
    sortBy: 'trending.desc',
  });
  const title = intl.formatMessage(messages.trendingScenes);

  // The API answers 503 until StashDB has an API key
  if ((error as AxiosError | undefined)?.response?.status === 503) {
    return (
      <>
        <PageTitle title={title} />
        <div className="mt-4">
          <Alert title={intl.formatMessage(messages.notconfigured)}>
            {hasPermission(Permission.ADMIN)
              ? intl.formatMessage(messages.notconfiguredDescription, {
                  SettingsLink: (msg: React.ReactNode) => (
                    <Link href="/settings/metadata" className="underline">
                      {msg}
                    </Link>
                  ),
                })
              : intl.formatMessage(messages.notconfiguredUser)}
          </Alert>
        </div>
      </>
    );
  }

  if (error) {
    return <ErrorPage statusCode={500} />;
  }

  return (
    <>
      <PageTitle title={title} />
      <div className="mb-5 mt-1 flex flex-col justify-between lg:flex-row lg:items-end">
        <Header>{title}</Header>
      </div>
      <ListView
        items={titles}
        landscape
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

export default withAdultGate(TrendingScenes);
