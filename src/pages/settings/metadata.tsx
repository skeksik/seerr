import SettingsLayout from '@app/components/Settings/SettingsLayout';
import SettingsMetadata from '@app/components/Settings/SettingsMetadata';
import SettingsStashDb from '@app/components/Settings/SettingsStashDb';
import SettingsXxxMovies from '@app/components/Settings/SettingsXxxMovies';
import useRouteGuard from '@app/hooks/useRouteGuard';
import { Permission } from '@app/hooks/useUser';
import type { NextPage } from 'next';

const MetadataSettingsPage: NextPage = () => {
  useRouteGuard(Permission.ADMIN);
  return (
    <SettingsLayout>
      <SettingsMetadata />
      <SettingsStashDb />
      <SettingsXxxMovies />
    </SettingsLayout>
  );
};

export default MetadataSettingsPage;
