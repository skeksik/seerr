import useSettings from '@app/hooks/useSettings';
import { Permission, useUser } from '@app/hooks/useUser';

// Adult content needs both the global switch and the user's permission
const useAdult = (): boolean => {
  const { currentSettings } = useSettings();
  const { hasPermission } = useUser();

  return currentSettings.enableAdult && hasPermission(Permission.ADULT);
};

export default useAdult;
