import type { MigrationInterface, QueryRunner } from 'typeorm';

// Only scenes and adult movies are adult content, which their media type tells
export class DropMediaIsAdult1792170000000 implements MigrationInterface {
  name = 'DropMediaIsAdult1792170000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "media" DROP COLUMN "isAdult"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "media" ADD "isAdult" boolean NOT NULL DEFAULT false`
    );
    await queryRunner.query(
      `UPDATE "media" SET "isAdult" = true WHERE "mediaType" = 'adultmovie'`
    );
  }
}
