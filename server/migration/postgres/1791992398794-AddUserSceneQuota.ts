import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserSceneQuota1791992398794 implements MigrationInterface {
  name = 'AddUserSceneQuota1791992398794';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "user" ADD "sceneQuotaLimit" integer`);
    await queryRunner.query(`ALTER TABLE "user" ADD "sceneQuotaDays" integer`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "sceneQuotaDays"`);
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "sceneQuotaLimit"`);
  }
}
