export enum Permission {
  NONE = 0,
  ADMIN = 2,
  MANAGE_SETTINGS = 4,
  MANAGE_USERS = 8,
  MANAGE_REQUESTS = 16,
  REQUEST = 32,
  VOTE = 64,
  AUTO_APPROVE = 128,
  AUTO_APPROVE_MOVIE = 256,
  AUTO_APPROVE_TV = 512,
  REQUEST_4K = 1024,
  REQUEST_4K_MOVIE = 2048,
  REQUEST_4K_TV = 4096,
  REQUEST_ADVANCED = 8192,
  REQUEST_VIEW = 16384,
  AUTO_APPROVE_4K = 32768,
  AUTO_APPROVE_4K_MOVIE = 65536,
  AUTO_APPROVE_4K_TV = 131072,
  REQUEST_MOVIE = 262144,
  REQUEST_TV = 524288,
  MANAGE_ISSUES = 1048576,
  VIEW_ISSUES = 2097152,
  CREATE_ISSUES = 4194304,
  AUTO_REQUEST = 8388608,
  AUTO_REQUEST_MOVIE = 16777216,
  AUTO_REQUEST_TV = 33554432,
  RECENT_VIEW = 67108864,
  WATCHLIST_VIEW = 134217728,
  MANAGE_BLOCKLIST = 268435456,
  // View and request adult content; only applies while enableAdult is on
  ADULT = 536870912,
  VIEW_BLOCKLIST = 1073741824,
  // Past 2^30, beyond the 32 bits JavaScript's bitwise operators handle;
  // test and combine them with the helpers below
  REQUEST_SCENE = 2147483648,
  REQUEST_ADULT_MOVIE = 4294967296,
  AUTO_APPROVE_SCENE = 8589934592,
  AUTO_APPROVE_ADULT_MOVIE = 17179869184,
  AUTO_REQUEST_SCENE = 34359738368,
  AUTO_REQUEST_ADULT_MOVIE = 68719476736,
  REQUEST_4K_SCENE = 137438953472,
  REQUEST_4K_ADULT_MOVIE = 274877906944,
  AUTO_APPROVE_4K_SCENE = 549755813888,
  AUTO_APPROVE_4K_ADULT_MOVIE = 1099511627776,
}

export interface PermissionCheckOptions {
  type: 'and' | 'or';
}

const NO_BITS = BigInt(0);

// Permission values go past 32 bits, which JavaScript's bitwise operators
// truncate to, so bits are combined as BigInts
const toBits = (value: number): bigint =>
  Number.isSafeInteger(value) && value > 0 ? BigInt(value) : NO_BITS;

// Whether a permission value has any bit of the permission, without the
// Admin bypass of hasPermission
export const includesPermission = (
  value: number,
  permission: Permission
): boolean => (toBits(value) & toBits(permission)) !== NO_BITS;

export const addPermissions = (
  value: number,
  ...permissions: Permission[]
): number =>
  Number(
    permissions.reduce(
      (bits, permission) => bits | toBits(permission),
      toBits(value)
    )
  );

export const removePermissions = (
  value: number,
  ...permissions: Permission[]
): number =>
  Number(
    permissions.reduce(
      (bits, permission) => bits & ~toBits(permission),
      toBits(value)
    )
  );

export type PermissionKind =
  | 'request'
  | 'request4k'
  | 'autoApprove'
  | 'autoApprove4k'
  | 'autoRequest';

type PermissionMediaType = 'movie' | 'tv' | 'scene' | 'adultmovie';

// Each kind's parent permission, which grants it for every media type, and
// its permission per media type
const typedPermissions: Record<
  PermissionKind,
  [Permission, Record<PermissionMediaType, Permission>]
> = {
  request: [
    Permission.REQUEST,
    {
      movie: Permission.REQUEST_MOVIE,
      tv: Permission.REQUEST_TV,
      scene: Permission.REQUEST_SCENE,
      adultmovie: Permission.REQUEST_ADULT_MOVIE,
    },
  ],
  request4k: [
    Permission.REQUEST_4K,
    {
      movie: Permission.REQUEST_4K_MOVIE,
      tv: Permission.REQUEST_4K_TV,
      scene: Permission.REQUEST_4K_SCENE,
      adultmovie: Permission.REQUEST_4K_ADULT_MOVIE,
    },
  ],
  autoApprove: [
    Permission.AUTO_APPROVE,
    {
      movie: Permission.AUTO_APPROVE_MOVIE,
      tv: Permission.AUTO_APPROVE_TV,
      scene: Permission.AUTO_APPROVE_SCENE,
      adultmovie: Permission.AUTO_APPROVE_ADULT_MOVIE,
    },
  ],
  autoApprove4k: [
    Permission.AUTO_APPROVE_4K,
    {
      movie: Permission.AUTO_APPROVE_4K_MOVIE,
      tv: Permission.AUTO_APPROVE_4K_TV,
      scene: Permission.AUTO_APPROVE_4K_SCENE,
      adultmovie: Permission.AUTO_APPROVE_4K_ADULT_MOVIE,
    },
  ],
  autoRequest: [
    Permission.AUTO_REQUEST,
    {
      movie: Permission.AUTO_REQUEST_MOVIE,
      tv: Permission.AUTO_REQUEST_TV,
      scene: Permission.AUTO_REQUEST_SCENE,
      adultmovie: Permission.AUTO_REQUEST_ADULT_MOVIE,
    },
  ],
};

// The permissions that each allow a kind of request for a media type, to
// check with { type: 'or' }: the parent, e.g. Request, or the media type's
// own, e.g. Request Scenes
export const mediaPermissions = (
  kind: PermissionKind,
  mediaType: PermissionMediaType
): Permission[] => {
  const [parent, children] = typedPermissions[kind];
  return [parent, children[mediaType]];
};

/**
 * Takes a Permission and the users permission value and determines
 * if the user has access to the permission provided. If the user has
 * the admin permission, true will always be returned from this check!
 *
 * @param permissions Single permission or array of permissions
 * @param value users current permission value
 * @param options Extra options to control permission check behavior (mainly for arrays)
 */
export const hasPermission = (
  permissions: Permission | Permission[],
  value: number,
  options: PermissionCheckOptions = { type: 'and' }
): boolean => {
  let total = 0;

  // If we are not checking any permissions, bail out and return true
  if (permissions === 0) {
    return true;
  }

  if (Array.isArray(permissions)) {
    if (includesPermission(value, Permission.ADMIN)) {
      return true;
    }
    switch (options.type) {
      case 'and':
        return permissions.every((permission) =>
          includesPermission(value, permission)
        );
      case 'or':
        return permissions.some((permission) =>
          includesPermission(value, permission)
        );
    }
  } else {
    total = permissions;
  }

  return (
    includesPermission(value, Permission.ADMIN) ||
    includesPermission(value, total)
  );
};
