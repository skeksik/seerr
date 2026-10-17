import type { MigrationInterface, QueryRunner } from 'typeorm';

// Permissions past 2^30 do not fit a 32-bit integer
export class UserPermissionsBigint1792170200000 implements MigrationInterface {
  name = 'UserPermissionsBigint1792170200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user" ALTER COLUMN "permissions" TYPE bigint`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drops the permissions that only fit 64 bits
    await queryRunner.query(
      `UPDATE "user" SET "permissions" = "permissions" & 2147483647`
    );
    await queryRunner.query(
      `ALTER TABLE "user" ALTER COLUMN "permissions" TYPE integer`
    );
  }
}
