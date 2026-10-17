import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserAdultPreferences1791999803308 implements MigrationInterface {
  name = 'AddUserAdultPreferences1791999803308';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_settings" ADD "adultSafeMode" boolean NOT NULL DEFAULT false`
    );
    await queryRunner.query(
      `ALTER TABLE "user_settings" ADD "blurAdultImages" boolean NOT NULL DEFAULT false`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_settings" DROP COLUMN "blurAdultImages"`
    );
    await queryRunner.query(
      `ALTER TABLE "user_settings" DROP COLUMN "adultSafeMode"`
    );
  }
}
