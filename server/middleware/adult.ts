import type { User } from '@server/entity/User';
import { Permission } from '@server/lib/permissions';
import { getSettings } from '@server/lib/settings';

// Adult content needs both the global switch and the user's permission
export const canViewAdult = (user?: User | null): boolean =>
  getSettings().main.enableAdult && !!user?.hasPermission(Permission.ADULT);

export const isAdultAllowed: Middleware = (req, res, next) => {
  if (!canViewAdult(req.user)) {
    res.status(403).json({
      status: 403,
      error: 'Adult content is not enabled for this user',
    });
  } else {
    next();
  }
};
