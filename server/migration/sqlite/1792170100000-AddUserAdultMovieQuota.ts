import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserAdultMovieQuota1792170100000 implements MigrationInterface {
  name = 'AddUserAdultMovieQuota1792170100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user" ADD "adultMovieQuotaLimit" integer`
    );
    await queryRunner.query(
      `ALTER TABLE "user" ADD "adultMovieQuotaDays" integer`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user" DROP COLUMN "adultMovieQuotaDays"`
    );
    await queryRunner.query(
      `ALTER TABLE "user" DROP COLUMN "adultMovieQuotaLimit"`
    );
  }
}
