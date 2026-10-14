import {
  DuplicateWatchlistRequestError,
  NotFoundError,
  Watchlist,
} from '@server/entity/Watchlist';
import logger from '@server/logger';
import { Router } from 'express';
import { QueryFailedError } from 'typeorm';
import { ZodError } from 'zod';

import { isAdultMediaType, MediaType } from '@server/constants/media';
import {
  adultWatchlistCreate,
  watchlistCreate,
} from '@server/interfaces/api/watchlistCreate';
import { canViewAdult } from '@server/lib/adult';

const watchlistRoutes = Router();

watchlistRoutes.post<never, Watchlist, Watchlist>(
  '/',
  async (req, res, next) => {
    try {
      if (!req.user) {
        return next({
          status: 401,
          message: 'You must be logged in to add watchlist.',
        });
      }
      if (isAdultMediaType(req.body?.mediaType)) {
        if (!canViewAdult(req.user)) {
          return next({ status: 403, message: 'Adult content is disabled.' });
        }

        const values = adultWatchlistCreate.parse(req.body);

        return res.status(201).json(
          await Watchlist.createAdultWatchlist({
            ...values,
            user: req.user,
          })
        );
      }

      const values = watchlistCreate.parse(req.body);

      const request = await Watchlist.createWatchlist({
        watchlistRequest: values,
        user: req.user,
      });
      return res.status(201).json(request);
    } catch (error) {
      if (!(error instanceof Error)) {
        return;
      }
      switch (error.constructor) {
        case QueryFailedError:
          logger.warn('Something wrong with data watchlist', {
            tmdbId: req.body.tmdbId,
            mediaType: req.body.mediaType,
            label: 'Watchlist',
          });
          return next({ status: 409, message: 'Something wrong' });
        case DuplicateWatchlistRequestError:
          return next({ status: 409, message: error.message });
        case NotFoundError:
          return next({ status: 404, message: error.message });
        case ZodError:
          return next({ status: 400, message: 'Invalid watchlist item.' });
        default:
          return next({ status: 500, message: error.message });
      }
    }
  }
);

watchlistRoutes.delete('/:tmdbId', async (req, res, next) => {
  if (!req.user) {
    return next({
      status: 401,
      message: 'You must be logged in to delete watchlist data.',
    });
  }
  try {
    const mediaType = req.query.mediaType as MediaType;
    if (!Object.values(MediaType).includes(mediaType)) {
      return next({
        status: 400,
        message: 'Invalid mediaType query parameter.',
      });
    }

    // Scenes and XXX movies are keyed by their external UUID
    await Watchlist.deleteWatchlist(
      isAdultMediaType(mediaType)
        ? req.params.tmdbId
        : Number(req.params.tmdbId),
      mediaType,
      req.user
    );
    return res.status(204).send();
  } catch (e) {
    if (e instanceof NotFoundError) {
      return next({
        status: 404,
        message: e.message,
      });
    }
    return next({ status: 500, message: e.message });
  }
});

export default watchlistRoutes;
