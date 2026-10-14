import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMediaTpdbId1791997455164 implements MigrationInterface {
  name = 'AddMediaTpdbId1791997455164';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "media" ADD "tpdbId" character varying`
    );
    await queryRunner.query(
      `ALTER TABLE "media" ADD CONSTRAINT "UQ_ccfd2998eafd1783286fb373997" UNIQUE ("tpdbId")`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "media" DROP CONSTRAINT "UQ_ccfd2998eafd1783286fb373997"`
    );
    await queryRunner.query(`ALTER TABLE "media" DROP COLUMN "tpdbId"`);
  }
}
