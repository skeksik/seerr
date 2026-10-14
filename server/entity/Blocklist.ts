import {
  MediaStatus,
  type AdultMediaType,
  type MediaType,
  type TmdbMediaType,
} from '@server/constants/media';
import dataSource from '@server/datasource';
import Media from '@server/entity/Media';
import { User } from '@server/entity/User';
import type { BlocklistItem } from '@server/interfaces/api/blocklistInterfaces';
import { findOrCreateAdultMedia } from '@server/lib/adultMedia';
import { DbAwareColumn } from '@server/utils/DbColumnHelper';
import type { EntityManager } from 'typeorm';
import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import type { ZodNumber, ZodOptional, ZodString } from 'zod';

@Entity()
@Unique(['tmdbId', 'mediaType'])
@Unique(['externalId', 'mediaType'])
export class Blocklist implements BlocklistItem {
  @PrimaryGeneratedColumn()
  public id: number;

  @Column({ type: 'varchar' })
  public mediaType: MediaType;

  @Column({ nullable: true, type: 'varchar' })
  title?: string;

  // Null for scenes and XXX movies, which are keyed by externalId
  @Column({ type: 'int', nullable: true })
  @Index()
  public tmdbId: number | null;

  // StashDB scene or ThePornDB movie UUID
  @Column({ type: 'varchar', nullable: true })
  @Index()
  public externalId: string | null;

  @ManyToOne(() => User, (user) => user.id, {
    eager: true,
  })
  @Index()
  user?: User;

  @OneToOne(() => Media, (media) => media.blocklist, {
    onDelete: 'CASCADE',
  })
  @JoinColumn()
  public media: Media;

  @Column({ nullable: true, type: 'varchar' })
  public blocklistedTags?: string;

  @DbAwareColumn({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  public createdAt: Date;

  constructor(init?: Partial<Blocklist>) {
    Object.assign(this, init);
  }

  // Scenes and XXX movies: their media row is keyed by the external id
  public static async addAdultToBlocklist(
    {
      mediaType,
      externalId,
      title,
      user,
    }: {
      mediaType: AdultMediaType;
      externalId: string;
      title?: string;
      user?: User;
    },
    entityManager?: EntityManager
  ): Promise<void> {
    const em = entityManager ?? dataSource.manager;
    const blocklist = await em
      .getRepository(this)
      .save(new this({ mediaType, externalId, tmdbId: null, title, user }));
    const media = await findOrCreateAdultMedia(em, mediaType, externalId);

    media.blocklist = Promise.resolve(blocklist);
    media.status = MediaStatus.BLOCKLISTED;
    media.status4k = MediaStatus.BLOCKLISTED;

    await em.getRepository(Media).save(media);
  }

  public static async addToBlocklist(
    {
      blocklistRequest,
    }: {
      blocklistRequest: {
        mediaType: TmdbMediaType;
        title?: ZodOptional<ZodString>['_output'];
        tmdbId: ZodNumber['_output'];
        blocklistedTags?: string;
      };
    },
    entityManager?: EntityManager
  ): Promise<void> {
    const em = entityManager ?? dataSource;
    const blocklist = new this({
      ...blocklistRequest,
    });

    const mediaRepository = em.getRepository(Media);
    let media = await mediaRepository.findOne({
      where: {
        tmdbId: blocklistRequest.tmdbId,
        mediaType: blocklistRequest.mediaType,
      },
    });

    const blocklistRepository = em.getRepository(this);

    await blocklistRepository.save(blocklist);

    if (!media) {
      media = new Media({
        tmdbId: blocklistRequest.tmdbId,
        status: MediaStatus.BLOCKLISTED,
        status4k: MediaStatus.BLOCKLISTED,
        mediaType: blocklistRequest.mediaType,
        blocklist: Promise.resolve(blocklist),
      });

      await mediaRepository.save(media);
    } else {
      media.blocklist = Promise.resolve(blocklist);
      media.status = MediaStatus.BLOCKLISTED;
      media.status4k = MediaStatus.BLOCKLISTED;

      await mediaRepository.save(media);
    }
  }
}
