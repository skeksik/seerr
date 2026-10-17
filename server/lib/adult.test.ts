import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import { User } from '@server/entity/User';
import { UserSettings } from '@server/entity/UserSettings';
import { canViewAdult } from '@server/lib/adult';
import { Permission } from '@server/lib/permissions';
import { getSettings } from '@server/lib/settings';

const user = (permissions: number, settings?: Partial<UserSettings>) => {
  const u = new User({ email: 'adult@seerr.dev', permissions, avatar: '' });
  u.settings = new UserSettings(settings);
  return u;
};

describe('canViewAdult', () => {
  afterEach(() => {
    getSettings().main.enableAdult = false;
  });

  it('needs the global switch and the permission', () => {
    const adult = user(Permission.ADULT);

    assert.strictEqual(canViewAdult(adult), false);
    getSettings().main.enableAdult = true;
    assert.strictEqual(canViewAdult(adult), true);
    assert.strictEqual(canViewAdult(user(Permission.REQUEST)), false);
  });

  it('hides adult content while safe mode is on, admins included', () => {
    getSettings().main.enableAdult = true;

    assert.strictEqual(
      canViewAdult(user(Permission.ADULT, { adultSafeMode: true })),
      false
    );
    assert.strictEqual(
      canViewAdult(user(Permission.ADMIN, { adultSafeMode: true })),
      false
    );
  });
});
