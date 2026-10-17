import type { MigrationInterface, QueryRunner } from 'typeorm';

export class DropUserOrientations1792219530290 implements MigrationInterface {
  name = 'DropUserOrientations1792219530290';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_settings" DROP COLUMN "disabledOrientations"`
    );
    await queryRunner.query(
      `ALTER TABLE "user_settings" DROP COLUMN "uncheckedOrientations"`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_settings" ADD "uncheckedOrientations" text`
    );
    await queryRunner.query(
      `ALTER TABLE "user_settings" ADD "disabledOrientations" text`
    );
  }
}
