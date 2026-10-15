import SettingsLayout from '@app/components/Settings/SettingsLayout';
import SettingsStash from '@app/components/Settings/SettingsStash';
import useRouteGuard from '@app/hooks/useRouteGuard';
import { Permission } from '@app/hooks/useUser';
import type { NextPage } from 'next';

const StashSettingsPage: NextPage = () => {
  useRouteGuard(Permission.ADMIN);
  return (
    <SettingsLayout>
      <SettingsStash />
    </SettingsLayout>
  );
};

export default StashSettingsPage;
