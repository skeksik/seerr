import SettingsLayout from '@app/components/Settings/SettingsLayout';
import SettingsMetadata from '@app/components/Settings/SettingsMetadata';
import SettingsStashDb from '@app/components/Settings/SettingsStashDb';
import useRouteGuard from '@app/hooks/useRouteGuard';
import { Permission } from '@app/hooks/useUser';
import type { NextPage } from 'next';

const MetadataSettingsPage: NextPage = () => {
  useRouteGuard(Permission.ADMIN);
  return (
    <SettingsLayout>
      <SettingsMetadata />
      <SettingsStashDb />
    </SettingsLayout>
  );
};

export default MetadataSettingsPage;
