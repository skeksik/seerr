import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMediaIsAdult1791986559722 implements MigrationInterface {
  name = 'AddMediaIsAdult1791986559722';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "media" ADD "isAdult" boolean NOT NULL DEFAULT false`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "media" DROP COLUMN "isAdult"`);
  }
}
