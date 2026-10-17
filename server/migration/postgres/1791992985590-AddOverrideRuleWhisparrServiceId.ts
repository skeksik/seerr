import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOverrideRuleWhisparrServiceId1791992985590 implements MigrationInterface {
  name = 'AddOverrideRuleWhisparrServiceId1791992985590';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "override_rule" ADD "whisparrServiceId" integer`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "override_rule" DROP COLUMN "whisparrServiceId"`
    );
  }
}
