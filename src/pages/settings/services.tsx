import SettingsLayout from '@app/components/Settings/SettingsLayout';
import SettingsServices from '@app/components/Settings/SettingsServices';
import SettingsWhisparr from '@app/components/Settings/SettingsWhisparr';
import useRouteGuard from '@app/hooks/useRouteGuard';
import { Permission } from '@app/hooks/useUser';
import type { NextPage } from 'next';

const ServicesSettingsPage: NextPage = () => {
  useRouteGuard(Permission.ADMIN);
  return (
    <SettingsLayout>
      <SettingsServices />
      <SettingsWhisparr />
    </SettingsLayout>
  );
};

export default ServicesSettingsPage;
