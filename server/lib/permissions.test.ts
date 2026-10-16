import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  addPermissions,
  hasPermission,
  includesPermission,
  mediaPermissions,
  Permission,
  removePermissions,
} from '@server/lib/permissions';

describe('permissions past 32 bits', () => {
  it('are told apart from the bits 32-bit operators would leave', () => {
    // 2^32 truncates to 0 and 2^33 to 0 with JavaScript's & operator
    const value = addPermissions(0, Permission.REQUEST_ADULT_MOVIE);

    assert.strictEqual(value, 2 ** 32);
    assert.ok(hasPermission(Permission.REQUEST_ADULT_MOVIE, value));
    assert.ok(!hasPermission(Permission.AUTO_APPROVE_SCENE, value));
    assert.ok(!hasPermission(Permission.REQUEST, value));
    assert.ok(!includesPermission(value, Permission.REQUEST_SCENE));
  });

  it('keep the 32-bit permissions next to them', () => {
    const value = addPermissions(
      Permission.REQUEST | Permission.ADULT,
      Permission.AUTO_APPROVE_4K_ADULT_MOVIE,
      Permission.REQUEST_SCENE
    );

    assert.ok(
      hasPermission([Permission.REQUEST, Permission.ADULT], value, {
        type: 'and',
      })
    );
    assert.ok(hasPermission(Permission.AUTO_APPROVE_4K_ADULT_MOVIE, value));
    assert.ok(hasPermission(Permission.REQUEST_SCENE, value));

    const removed = removePermissions(value, Permission.REQUEST_SCENE);

    assert.ok(!hasPermission(Permission.REQUEST_SCENE, removed));
    assert.ok(hasPermission(Permission.AUTO_APPROVE_4K_ADULT_MOVIE, removed));
    assert.ok(hasPermission(Permission.ADULT, removed));
    assert.strictEqual(
      removePermissions(removed, Permission.REQUEST_SCENE),
      removed
    );
  });

  it('are all granted by Admin', () => {
    assert.ok(
      hasPermission(Permission.AUTO_APPROVE_4K_SCENE, Permission.ADMIN)
    );
  });

  it('pairs each media type with its parent permission', () => {
    assert.deepStrictEqual(mediaPermissions('request', 'scene'), [
      Permission.REQUEST,
      Permission.REQUEST_SCENE,
    ]);
    assert.deepStrictEqual(mediaPermissions('autoApprove4k', 'adultmovie'), [
      Permission.AUTO_APPROVE_4K,
      Permission.AUTO_APPROVE_4K_ADULT_MOVIE,
    ]);
    assert.ok(
      hasPermission(mediaPermissions('request', 'scene'), Permission.REQUEST, {
        type: 'or',
      })
    );
    assert.ok(
      !hasPermission(
        mediaPermissions('request', 'adultmovie'),
        Permission.REQUEST_SCENE,
        { type: 'or' }
      )
    );
  });
});
