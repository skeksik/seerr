import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAdultWatchlistBlocklist1792008699725 implements MigrationInterface {
  name = 'AddAdultWatchlistBlocklist1792008699725';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "watchlist" ADD "externalId" character varying`
    );
    await queryRunner.query(
      `ALTER TABLE "blocklist" ADD "externalId" character varying`
    );
    await queryRunner.query(
      `ALTER TABLE "watchlist" DROP CONSTRAINT "UNIQUE_USER_DB"`
    );
    await queryRunner.query(
      `ALTER TABLE "watchlist" ALTER COLUMN "tmdbId" DROP NOT NULL`
    );
    await queryRunner.query(
      `ALTER TABLE "blocklist" DROP CONSTRAINT "UQ_81504e02db89b4c1e3152729fa6"`
    );
    await queryRunner.query(
      `ALTER TABLE "blocklist" ALTER COLUMN "tmdbId" DROP NOT NULL`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_780d87c64c6f109ee341277bfe" ON "watchlist" ("externalId") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_362619fbf6c16aa30adfc2d486" ON "blocklist" ("externalId") `
    );
    await queryRunner.query(
      `ALTER TABLE "watchlist" ADD CONSTRAINT "UNIQUE_USER_EXTERNAL" UNIQUE ("externalId", "mediaType", "requestedById")`
    );
    await queryRunner.query(
      `ALTER TABLE "watchlist" ADD CONSTRAINT "UNIQUE_USER_DB" UNIQUE ("tmdbId", "mediaType", "requestedById")`
    );
    await queryRunner.query(
      `ALTER TABLE "blocklist" ADD CONSTRAINT "UQ_a9f213f54c2439ea4a2dd940e2d" UNIQUE ("externalId", "mediaType")`
    );
    await queryRunner.query(
      `ALTER TABLE "blocklist" ADD CONSTRAINT "UQ_81504e02db89b4c1e3152729fa6" UNIQUE ("tmdbId", "mediaType")`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "blocklist" DROP CONSTRAINT "UQ_81504e02db89b4c1e3152729fa6"`
    );
    await queryRunner.query(
      `ALTER TABLE "blocklist" DROP CONSTRAINT "UQ_a9f213f54c2439ea4a2dd940e2d"`
    );
    await queryRunner.query(
      `ALTER TABLE "watchlist" DROP CONSTRAINT "UNIQUE_USER_DB"`
    );
    await queryRunner.query(
      `ALTER TABLE "watchlist" DROP CONSTRAINT "UNIQUE_USER_EXTERNAL"`
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_362619fbf6c16aa30adfc2d486"`
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_780d87c64c6f109ee341277bfe"`
    );
    await queryRunner.query(
      `ALTER TABLE "blocklist" ALTER COLUMN "tmdbId" SET NOT NULL`
    );
    await queryRunner.query(
      `ALTER TABLE "blocklist" ADD CONSTRAINT "UQ_81504e02db89b4c1e3152729fa6" UNIQUE ("mediaType", "tmdbId")`
    );
    await queryRunner.query(
      `ALTER TABLE "watchlist" ALTER COLUMN "tmdbId" SET NOT NULL`
    );
    await queryRunner.query(
      `ALTER TABLE "watchlist" ADD CONSTRAINT "UNIQUE_USER_DB" UNIQUE ("mediaType", "tmdbId", "requestedById")`
    );
    await queryRunner.query(`ALTER TABLE "blocklist" DROP COLUMN "externalId"`);
    await queryRunner.query(`ALTER TABLE "watchlist" DROP COLUMN "externalId"`);
  }
}
