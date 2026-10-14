import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMediaStashMediaId1791990637244 implements MigrationInterface {
  name = 'AddMediaStashMediaId1791990637244';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "media" ADD "stashMediaId" character varying`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "media" DROP COLUMN "stashMediaId"`);
  }
}
