import SettingsLayout from '@app/components/Settings/SettingsLayout';
import SettingsServices from '@app/components/Settings/SettingsServices';
import SettingsWhisparr from '@app/components/Settings/SettingsWhisparr';
import { useSafeMode } from '@app/hooks/useAdult';
import useRouteGuard from '@app/hooks/useRouteGuard';
import { Permission } from '@app/hooks/useUser';
import type { NextPage } from 'next';

const ServicesSettingsPage: NextPage = () => {
  useRouteGuard(Permission.ADMIN);
  // Safe mode hides adult settings too
  const safeMode = useSafeMode();
  return (
    <SettingsLayout>
      <SettingsServices
        extraServices={safeMode ? undefined : <SettingsWhisparr />}
      />
    </SettingsLayout>
  );
};

export default ServicesSettingsPage;
