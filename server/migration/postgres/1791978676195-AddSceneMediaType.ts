import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSceneMediaType1791978676195 implements MigrationInterface {
  name = 'AddSceneMediaType1791978676195';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "media" ADD "stashId" character varying`
    );
    await queryRunner.query(
      `ALTER TABLE "media" ADD CONSTRAINT "UQ_557ea46ae507261785e4bdcbdfc" UNIQUE ("stashId")`
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_f8233358694d1677a67899b90a"`
    );
    await queryRunner.query(
      `ALTER TABLE "media" ALTER COLUMN "tmdbId" DROP NOT NULL`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_f8233358694d1677a67899b90a" ON "media" ("tmdbId", "mediaType") `
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_f8233358694d1677a67899b90a"`
    );
    await queryRunner.query(
      `ALTER TABLE "media" ALTER COLUMN "tmdbId" SET NOT NULL`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_f8233358694d1677a67899b90a" ON "media" ("mediaType", "tmdbId") `
    );
    await queryRunner.query(
      `ALTER TABLE "media" DROP CONSTRAINT "UQ_557ea46ae507261785e4bdcbdfc"`
    );
    await queryRunner.query(`ALTER TABLE "media" DROP COLUMN "stashId"`);
  }
}
