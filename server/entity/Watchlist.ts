import TheMovieDb from '@server/api/themoviedb';
import {
  MediaType,
  type AdultMediaType,
  type TmdbMediaType,
} from '@server/constants/media';
import dataSource, { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import { User } from '@server/entity/User';
import type { WatchlistItem } from '@server/interfaces/api/discoverInterfaces';
import {
  findOrCreateAdultMedia,
  lookupAdultTitle,
} from '@server/lib/adultMedia';
import logger from '@server/logger';
import { DbAwareColumn, resolveDbType } from '@server/utils/DbColumnHelper';
import {
  Column,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import type { ZodNumber, ZodOptional, ZodString } from 'zod';

export class DuplicateWatchlistRequestError extends Error {}
export class NotFoundError extends Error {
  constructor(message = 'Not found') {
    super(message);
    this.name = 'NotFoundError';
  }
}

@Entity()
@Unique('UNIQUE_USER_DB', ['tmdbId', 'mediaType', 'requestedBy'])
@Unique('UNIQUE_USER_EXTERNAL', ['externalId', 'mediaType', 'requestedBy'])
export class Watchlist implements WatchlistItem {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar' })
  public ratingKey = '';

  @Column({ type: 'varchar' })
  public mediaType: MediaType;

  @Column({ type: 'varchar' })
  title = '';

  // Null for scenes and adult movies, which are keyed by externalId
  @Column({ type: 'int', nullable: true })
  @Index()
  public tmdbId: number | null;

  // StashDB scene or ThePornDB movie UUID
  @Column({ type: 'varchar', nullable: true })
  @Index()
  public externalId: string | null;

  @ManyToOne(() => User, (user) => user.watchlists, {
    eager: true,
    onDelete: 'CASCADE',
  })
  @Index()
  public requestedBy: User;

  @ManyToOne(() => Media, (media) => media.watchlists, {
    eager: true,
    onDelete: 'CASCADE',
  })
  @Index()
  public media: Media;

  @DbAwareColumn({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  public createdAt: Date;

  @UpdateDateColumn({
    type: resolveDbType('datetime'),
    default: () => 'CURRENT_TIMESTAMP',
  })
  public updatedAt: Date;

  constructor(init?: Partial<Watchlist>) {
    Object.assign(this, init);
  }

  public static async createWatchlist({
    watchlistRequest,
    user,
  }: {
    watchlistRequest: {
      mediaType: TmdbMediaType;
      ratingKey?: ZodOptional<ZodString>['_output'];
      title?: ZodOptional<ZodString>['_output'];
      tmdbId: ZodNumber['_output'];
    };
    user: User;
  }): Promise<Watchlist> {
    const watchlistRepository = getRepository(this);
    const mediaRepository = getRepository(Media);
    const tmdb = new TheMovieDb();

    const tmdbMedia =
      watchlistRequest.mediaType === MediaType.MOVIE
        ? await tmdb.getMovie({ movieId: watchlistRequest.tmdbId })
        : await tmdb.getTvShow({ tvId: watchlistRequest.tmdbId });

    const existing = await watchlistRepository
      .createQueryBuilder('watchlist')
      .leftJoinAndSelect('watchlist.requestedBy', 'user')
      .where('user.id = :userId', { userId: user.id })
      .andWhere('watchlist.tmdbId = :tmdbId', {
        tmdbId: watchlistRequest.tmdbId,
      })
      .andWhere('watchlist.mediaType = :mediaType', {
        mediaType: watchlistRequest.mediaType,
      })
      .getMany();

    if (existing && existing.length > 0) {
      logger.warn('Duplicate request for watchlist blocked', {
        tmdbId: watchlistRequest.tmdbId,
        mediaType: watchlistRequest.mediaType,
        label: 'Watchlist',
      });

      throw new DuplicateWatchlistRequestError();
    }

    let media = await mediaRepository.findOne({
      where: {
        tmdbId: watchlistRequest.tmdbId,
        mediaType: watchlistRequest.mediaType,
      },
    });

    if (!media) {
      media = new Media({
        tmdbId: tmdbMedia.id,
        tvdbId: tmdbMedia.external_ids.tvdb_id,
        mediaType: watchlistRequest.mediaType,
      });
    }

    const watchlist = new this({
      ...watchlistRequest,
      requestedBy: user,
      media,
    });

    await mediaRepository.save(media);
    await watchlistRepository.save(watchlist);
    return watchlist;
  }

  public static async createAdultWatchlist({
    mediaType,
    externalId,
    user,
  }: {
    mediaType: AdultMediaType;
    externalId: string;
    user: User;
  }): Promise<Watchlist> {
    const found = await lookupAdultTitle(mediaType, externalId);

    if (!found) {
      throw new NotFoundError(`Unknown ${mediaType} ${externalId}`);
    }

    return dataSource.transaction(async (em) => {
      const watchlistRepository = em.getRepository(Watchlist);
      const existing = await watchlistRepository.findOneBy({
        externalId: found.id,
        mediaType,
        requestedBy: { id: user.id },
      });

      if (existing) {
        throw new DuplicateWatchlistRequestError();
      }

      const media = await findOrCreateAdultMedia(em, mediaType, found.id);
      await em.getRepository(Media).save(media);

      return watchlistRepository.save(
        new Watchlist({
          mediaType,
          externalId: found.id,
          tmdbId: null,
          title: found.title,
          requestedBy: user,
          media,
        })
      );
    });
  }

  public static async deleteWatchlist(
    id: number | string,
    mediaType: MediaType,
    user: User
  ): Promise<Watchlist | null> {
    const watchlistRepository = getRepository(this);
    const watchlist = await watchlistRepository.findOneBy({
      ...(typeof id === 'string' ? { externalId: id } : { tmdbId: id }),
      mediaType,
      requestedBy: { id: user.id },
    });
    if (!watchlist) {
      throw new NotFoundError('not Found');
    }

    if (watchlist) {
      await watchlistRepository.delete(watchlist.id);
    }

    return watchlist;
  }
}
