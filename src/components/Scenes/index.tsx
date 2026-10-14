import Alert from '@app/components/Common/Alert';
import PageTitle from '@app/components/Common/PageTitle';
import SceneSlider from '@app/components/Scenes/SceneSlider';
import useAdult from '@app/hooks/useAdult';
import { Permission, useUser } from '@app/hooks/useUser';
import globalMessages from '@app/i18n/globalMessages';
import ErrorPage from '@app/pages/_error';
import defineMessages from '@app/utils/defineMessages';
import type { SceneListResponse } from '@server/models/Scene';
import type { AxiosError } from 'axios';
import Link from 'next/link';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

export const messages = defineMessages('components.Scenes', {
  trending: 'Trending Scenes',
  newreleases: 'New Releases',
  popular: 'Popular Scenes',
  notconfigured: 'StashDB is not configured',
  notconfiguredDescription:
    'Add a StashDB API key in <SettingsLink>Metadata settings</SettingsLink> to browse scenes.',
  notconfiguredUser: 'Ask an administrator to configure StashDB.',
});

const TRENDING_URL = '/api/v1/scene/discover?sort=trending&page=1';

const Scenes = () => {
  const intl = useIntl();
  const canViewAdult = useAdult();
  const { hasPermission } = useUser();
  // Shares its key with the trending slider, so it costs no extra request
  const { error } = useSWR<SceneListResponse, AxiosError>(
    canViewAdult ? TRENDING_URL : null
  );

  if (!canViewAdult) {
    return <ErrorPage statusCode={404} />;
  }

  if (error?.response?.status === 503) {
    return (
      <>
        <PageTitle title={intl.formatMessage(globalMessages.scenes)} />
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

  return (
    <>
      <PageTitle title={intl.formatMessage(globalMessages.scenes)} />
      <SceneSlider
        sliderKey="scenes-trending"
        title={intl.formatMessage(messages.trending)}
        url={TRENDING_URL}
        linkUrl="/scenes/browse?sort=trending"
      />
      <SceneSlider
        sliderKey="scenes-new"
        title={intl.formatMessage(messages.newreleases)}
        url="/api/v1/scene/discover?sort=date&page=1"
        linkUrl="/scenes/browse?sort=date"
      />
      <SceneSlider
        sliderKey="scenes-popular"
        title={intl.formatMessage(messages.popular)}
        url="/api/v1/scene/discover?sort=popularity&page=1"
        linkUrl="/scenes/browse?sort=popularity"
      />
    </>
  );
};

export default Scenes;
