import { StashDbNotConfiguredError } from '@server/api/stashdb';
import { TpdbNotConfiguredError } from '@server/api/tpdb';
import logger from '@server/logger';
import { isoDate } from '@server/utils/dateHelpers';
import type { NextFunction } from 'express';
import { z } from 'zod';

// Pieces the scene and adult movie list routes share

export const pageParam = z.coerce.number().int().positive().default(1);

export const pageQuery = z.object({ page: pageParam });

export const searchQuery = z.object({
  query: z.string().trim().min(1),
  page: pageParam,
});

// Filter suggestions: whatever the source finds for the text
export const lookupQuery = z.object({
  query: z.string().trim().min(1),
});

export const dateComparisons = ['eq', 'gt', 'gte', 'lt', 'lte'] as const;
export type DateComparison = (typeof dateComparisons)[number];

// Filters panel fields both sources take; titles need all of the picked
// performers and tags
export const sharedFilters = {
  // How the release date compares; both sources take one date bound
  released: z.enum(dateComparisons).optional(),
  releaseDate: isoDate.optional(),
  upcoming: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
};

// Whether a performer or tag is both picked and excluded: titles need all
// picked ones, so then none is left
export const pickedAndExcluded = <I>({
  performer,
  excludePerformers,
  tags,
  excludeTags,
}: {
  performer?: I[];
  excludePerformers?: I[];
  tags?: I[];
  excludeTags?: I[];
}): boolean =>
  [
    [performer, excludePerformers],
    [tags, excludeTags],
  ].some(([picked, excluded]) =>
    (picked ?? []).some((id) => excluded?.includes(id))
  );

// An unconfigured source is a 503; anything else is logged
export const handleError = (
  e: Error,
  next: NextFunction,
  message: string,
  meta: Record<string, unknown>
) => {
  if (e instanceof TpdbNotConfiguredError) {
    return next({ status: 503, message: 'ThePornDB is not configured.' });
  }

  if (e instanceof StashDbNotConfiguredError) {
    return next({ status: 503, message: 'StashDB is not configured.' });
  }

  logger.debug(message, { label: 'API', errorMessage: e.message, ...meta });
  return next({ status: 500, message });
};

const shiftDay = (date: string, days: number): string => {
  const shifted = new Date(`${date}T00:00:00Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
};

// StashDB compares dates strictly, so "or equal" moves the bound a day
export const stashDbDate = (
  value: string,
  comparison: DateComparison = 'gte'
): { value: string; modifier: 'EQUALS' | 'GREATER_THAN' | 'LESS_THAN' } => {
  switch (comparison) {
    case 'eq':
      return { value, modifier: 'EQUALS' };
    case 'gt':
      return { value, modifier: 'GREATER_THAN' };
    case 'gte':
      return { value: shiftDay(value, -1), modifier: 'GREATER_THAN' };
    case 'lt':
      return { value, modifier: 'LESS_THAN' };
    case 'lte':
      return { value: shiftDay(value, 1), modifier: 'LESS_THAN' };
  }
};

export const tpdbDateOperations: Record<
  DateComparison,
  '=' | '>' | '>=' | '<' | '<='
> = { eq: '=', gt: '>', gte: '>=', lt: '<', lte: '<=' };
