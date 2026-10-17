import { canViewAdult } from '@server/lib/adult';

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
