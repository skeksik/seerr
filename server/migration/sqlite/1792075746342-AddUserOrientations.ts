import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserOrientations1792075746342 implements MigrationInterface {
  name = 'AddUserOrientations1792075746342';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_settings" ADD "disabledOrientations" text`
    );
    await queryRunner.query(
      `ALTER TABLE "user_settings" ADD "uncheckedOrientations" text`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_settings" DROP COLUMN "uncheckedOrientations"`
    );
    await queryRunner.query(
      `ALTER TABLE "user_settings" DROP COLUMN "disabledOrientations"`
    );
  }
}
