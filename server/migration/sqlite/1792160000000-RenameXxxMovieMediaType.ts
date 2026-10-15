import type { MigrationInterface, QueryRunner } from 'typeorm';

// XXX movies are adult movies now
export class RenameXxxMovieMediaType1792160000000 implements MigrationInterface {
  name = 'RenameXxxMovieMediaType1792160000000';

  private async rename(
    queryRunner: QueryRunner,
    from: string,
    to: string
  ): Promise<void> {
    await queryRunner.query(
      `UPDATE "media" SET "mediaType" = '${to}' WHERE "mediaType" = '${from}'`
    );
    await queryRunner.query(
      `UPDATE "media_request" SET "type" = '${to}' WHERE "type" = '${from}'`
    );
    await queryRunner.query(
      `UPDATE "watchlist" SET "mediaType" = '${to}' WHERE "mediaType" = '${from}'`
    );
    await queryRunner.query(
      `UPDATE "blocklist" SET "mediaType" = '${to}' WHERE "mediaType" = '${from}'`
    );
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.rename(queryRunner, 'xxxmovie', 'adultmovie');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await this.rename(queryRunner, 'adultmovie', 'xxxmovie');
  }
}
