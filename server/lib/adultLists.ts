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

const filterMode = z.enum(['and', 'or']).optional();

export const dateComparisons = ['eq', 'gt', 'gte', 'lt', 'lte'] as const;
export type DateComparison = (typeof dateComparisons)[number];

// Filters panel fields both sources take
export const sharedFilters = {
  // Whether a title needs all of the performers or tags, or any
  performerMode: filterMode,
  tagMode: filterMode,
  // Comma-separated sexual preferences to show; the user's defaults if unset
  orientation: z.string().optional(),
  // How the release date compares; both sources take one date bound
  released: z.enum(dateComparisons).optional(),
  releaseDate: isoDate.optional(),
  upcoming: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
};

// Whether anything is picked besides how fields combine
export const hasPickedFilters = (filters: object): boolean =>
  Object.entries(filters).some(
    ([key, value]) =>
      !['performerMode', 'tagMode', 'released'].includes(key) &&
      value !== undefined
  );

export type SuggestionType = 'studio' | 'performer' | 'tag';

// The picked filters with a suggestion added to its field: alone where the
// field takes one or any of its values, next to the others where it needs
// all of them. Studios take one, set by the caller's studio fields
export const withSuggestion = <
  I,
  F extends {
    performer?: I[];
    tags?: I[];
    performerMode?: 'and' | 'or';
    tagMode?: 'and' | 'or';
  },
>(
  filters: F,
  type: SuggestionType,
  id: I,
  studio: Partial<F>
): F =>
  type === 'studio'
    ? { ...filters, ...studio }
    : type === 'performer'
      ? {
          ...filters,
          performer:
            filters.performerMode === 'or'
              ? [id]
              : [...(filters.performer ?? []), id],
        }
      : {
          ...filters,
          tags: filters.tagMode === 'or' ? [id] : [...(filters.tags ?? []), id],
        };

// The items of joined that are not in items already
export const withoutSeen = <T extends { id: string }>(
  joined: T[],
  items: { id: string }[]
): T[] => {
  const seen = new Set(items.map(({ id }) => id));
  return joined.filter(({ id }) => !seen.has(id));
};

// Joined lists keep a release date order; other orders just follow on
export const mergeByDate = <T>(
  items: T[],
  joined: T[],
  dateOf: (item: T) => string | null | undefined,
  direction?: 'ASC' | 'DESC'
): T[] => {
  const all = [...items, ...joined];
  if (!direction) {
    return all;
  }
  const sign = direction === 'DESC' ? -1 : 1;
  return all.sort(
    (a, b) => sign * (dateOf(a) ?? '').localeCompare(dateOf(b) ?? '')
  );
};

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
