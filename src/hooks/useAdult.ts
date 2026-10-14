import useSettings from '@app/hooks/useSettings';
import { Permission, useUser } from '@app/hooks/useUser';

// Whether the user may see adult content at all, safe mode aside
export const useAdultAllowed = (): boolean => {
  const { currentSettings } = useSettings();
  const { hasPermission } = useUser();

  return currentSettings.enableAdult && hasPermission(Permission.ADULT);
};

// Adult content needs the global switch and the user's permission, and the
// user must not have safe mode on
const useAdult = (): boolean => {
  const { user } = useUser();

  return useAdultAllowed() && !user?.settings?.adultSafeMode;
};

// Adult artwork stays blurred until hovered when the user asks for it
export const useAdultBlur = (): boolean => {
  const { user } = useUser();

  return useAdult() && !!user?.settings?.blurAdultImages;
};

export default useAdult;
