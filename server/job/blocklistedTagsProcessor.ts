import StashDbAPI from '@server/api/stashdb';
import type { StashDbSceneSort } from '@server/api/stashdb/interfaces';
import {
  MovieSortOptionsIterable,
  TvSortOptionsIterable,
} from '@server/api/themoviedb';
import type {
  TmdbSearchMovieResponse,
  TmdbSearchTvResponse,
} from '@server/api/themoviedb/interfaces';
import TpdbAPI from '@server/api/tpdb';
import type { TpdbMovieSort } from '@server/api/tpdb/interfaces';
import {
  MediaType,
  adultIdField,
  type AdultMediaType,
  type TmdbMediaType,
} from '@server/constants/media';
import dataSource from '@server/datasource';
import { Blocklist } from '@server/entity/Blocklist';
import Media from '@server/entity/Media';
import { adultBlocklistedTags } from '@server/lib/adultBlocklistedTags';
import type {
  RunnableScanner,
  StatusBase,
} from '@server/lib/scanners/baseScanner';
import { getSettings } from '@server/lib/settings';
import logger from '@server/logger';
import { createTmdbWithBlocklistSettings } from '@server/routes/discover';
import type { EntityManager } from 'typeorm';

const TMDB_API_DELAY_MS = 250;
class AbortTransaction extends Error {}

// Scenes and adult movies are read like TMDB discover pages: this many to a
// page, the limit's pages into each of these sorts. The first takes in every
// title, as tags with few titles are paged through in it alone; StashDB's
// trending sort only has the titles watched lately
const ADULT_PAGE_SIZE = 20;
const SCENE_SORTS: readonly StashDbSceneSort[] = [
  'DATE',
  'TRENDING',
  'POPULARITY',
  'CREATED_AT',
];
const ADULT_MOVIE_SORTS: readonly TpdbMovieSort[] = [
  'recently_released',
  'former_released',
  'recently_created',
  'former_created',
];

interface TagPage {
  total_pages: number;
}

interface AdultTagPage extends TagPage {
  results: { id: string; title: string }[];
}

class BlocklistedTagProcessor implements RunnableScanner<StatusBase> {
  private running = false;
  private progress = 0;
  private total = 0;

  public async run() {
    this.running = true;

    try {
      await dataSource.transaction(async (em) => {
        await this.cleanBlocklist(em);
        await this.cleanAdultBlocklist(em);
        await this.createBlocklistEntries(em);
        await this.createAdultBlocklistEntries(em);
      });
    } catch (err) {
      if (err instanceof AbortTransaction) {
        logger.info('Aborting job: Process Blocklisted Tags', {
          label: 'Jobs',
        });
      } else {
        throw err;
      }
    } finally {
      this.reset();
    }
  }

  public status(): StatusBase {
    return {
      running: this.running,
      progress: this.progress,
      total: this.total,
    };
  }

  public cancel() {
    this.running = false;
    this.progress = 0;
    this.total = 0;
  }

  private reset() {
    this.cancel();
  }

  private async createBlocklistEntries(em: EntityManager) {
    const tmdb = createTmdbWithBlocklistSettings();

    const settings = getSettings();
    const blocklistedTags = settings.main.blocklistedTags;
    const blocklistedTagsArr = blocklistedTags.split(',');

    const pageLimit = settings.main.blocklistedTagsLimit;
    const invalidKeywords = new Set<string>();

    if (blocklistedTags.length === 0) {
      return;
    }

    // The maximum number of queries we're expected to execute
    this.total +=
      blocklistedTagsArr.length *
      pageLimit *
      (MovieSortOptionsIterable.length + TvSortOptionsIterable.length);

    for (const tag of blocklistedTagsArr) {
      const keywordDetails = await tmdb.getKeywordDetails({
        keywordId: Number(tag),
      });

      if (keywordDetails === null) {
        logger.warn('Skipping invalid keyword in blocklisted tags', {
          label: 'Blocklisted Tags Processor',
          keywordId: tag,
        });
        invalidKeywords.add(tag);
        continue;
      }

      await this.processTagForType(
        MediaType.MOVIE,
        tag,
        em,
        tmdb.getDiscoverMovies,
        MovieSortOptionsIterable,
        pageLimit
      );
      await this.processTagForType(
        MediaType.TV,
        tag,
        em,
        tmdb.getDiscoverTv,
        TvSortOptionsIterable,
        pageLimit
      );
    }

    if (invalidKeywords.size > 0) {
      const currentTags = blocklistedTagsArr.filter(
        (tag) => !invalidKeywords.has(tag)
      );
      const cleanedTags = currentTags.join(',');

      if (cleanedTags !== blocklistedTags) {
        settings.main.blocklistedTags = cleanedTags;
        await settings.save();

        logger.info('Cleaned up invalid keywords from settings', {
          label: 'Blocklisted Tags Processor',
          removedKeywords: Array.from(invalidKeywords),
          newBlocklistedTags: cleanedTags,
        });
      }
    }
  }

  private async processTagForType<S extends string>(
    type: TmdbMediaType,
    tag: string,
    em: EntityManager,
    getDiscover: (options: {
      page: number;
      sortBy?: S;
      keywords: string;
    }) => Promise<TmdbSearchMovieResponse | TmdbSearchTvResponse>,
    sortOptions: readonly S[],
    pageLimit: number
  ): Promise<void> {
    await this.pageThroughTag(
      tag,
      (options) => getDiscover({ ...options, keywords: tag }),
      (response) => this.processResults(response, tag, type, em),
      sortOptions,
      pageLimit
    );
  }

  // The limit's pages into each sort, or every page in the first sort when
  // there are fewer; scenes and adult movies page the same way
  private async pageThroughTag<S extends string, R extends TagPage>(
    tag: string,
    getPage: (options: { page: number; sortBy?: S }) => Promise<R>,
    processPage: (response: R) => Promise<void>,
    sortOptions: readonly S[],
    pageLimit: number
  ): Promise<void> {
    let queryMax = pageLimit * sortOptions.length;
    let fixedSortMode = false;

    for (let query = 0; query < queryMax; query++) {
      const page: number = fixedSortMode
        ? query + 1
        : Math.floor(query / sortOptions.length) + 1;
      const sortBy: S | undefined = fixedSortMode
        ? undefined
        : sortOptions[query % sortOptions.length];

      if (!this.running) {
        throw new AbortTransaction();
      }

      try {
        const response = await getPage({ page, sortBy });

        await processPage(response);
        await new Promise((res) => setTimeout(res, TMDB_API_DELAY_MS));

        this.progress++;
        if (page === 1 && response.total_pages <= queryMax) {
          this.progress += queryMax - response.total_pages;
          fixedSortMode = true;
          queryMax = response.total_pages;
          // restart the counter so sequential paging resumes at page 2 even if earlier queries failed
          query = 0;
        }
      } catch (error) {
        logger.error('Error processing keyword in blocklisted tags', {
          label: 'Blocklisted Tags Processor',
          keywordId: tag,
          errorMessage: error.message,
        });
      }
    }
  }

  private async processResults(
    response: TmdbSearchMovieResponse | TmdbSearchTvResponse,
    keywordId: string,
    mediaType: TmdbMediaType,
    em: EntityManager
  ) {
    const blocklistRepository = em.getRepository(Blocklist);

    for (const entry of response.results) {
      const blocklistEntry = await blocklistRepository.findOne({
        where: { tmdbId: entry.id, mediaType },
      });

      if (blocklistEntry) {
        // Don't mark manual blocklists with tags
        // If media wasn't previously blocklisted for this tag, add the tag to the media's blocklist
        if (
          blocklistEntry.blocklistedTags &&
          !blocklistEntry.blocklistedTags.includes(`,${keywordId},`)
        ) {
          await blocklistRepository.update(blocklistEntry.id, {
            blocklistedTags: `${blocklistEntry.blocklistedTags}${keywordId},`,
          });
        }
      } else {
        // Media wasn't previously blocklisted, add it to the blocklist
        await Blocklist.addToBlocklist(
          {
            blocklistRequest: {
              mediaType,
              title: 'title' in entry ? entry.title : entry.name,
              tmdbId: entry.id,
              blocklistedTags: `,${keywordId},`,
            },
          },
          em
        );
      }
    }
  }

  // Scenes with the blocklisted StashDB tags and adult movies with the
  // ThePornDB ones, like TMDB titles with the blocklisted keywords
  private async createAdultBlocklistEntries(em: EntityManager) {
    const settings = getSettings();
    const pageLimit = settings.main.blocklistedTagsLimit;
    const sceneTags = adultBlocklistedTags(MediaType.SCENE, settings.main);
    const movieTags = adultBlocklistedTags(
      MediaType.ADULT_MOVIE,
      settings.main
    );

    if (!settings.main.enableAdult) {
      return;
    }

    this.total +=
      sceneTags.length * pageLimit * SCENE_SORTS.length +
      movieTags.length * pageLimit * ADULT_MOVIE_SORTS.length;

    if (sceneTags.length > 0) {
      await this.processSceneTags(
        em,
        sceneTags.map((tag) => tag.id),
        pageLimit
      );
    }

    if (movieTags.length > 0) {
      await this.processAdultMovieTags(
        em,
        movieTags.map((tag) => tag.id),
        pageLimit
      );
    }
  }

  private async processSceneTags(
    em: EntityManager,
    tags: string[],
    pageLimit: number
  ) {
    let stashDb: StashDbAPI;

    try {
      stashDb = StashDbAPI.fromSettings();
    } catch {
      logger.warn('StashDB is not configured; skipping blocklisted tags', {
        label: 'Blocklisted Tags Processor',
      });
      return;
    }

    const invalidTags = new Set<string>();

    for (const tag of tags) {
      try {
        if ((await stashDb.getTag(tag)) === null) {
          logger.warn('Skipping invalid StashDB tag in blocklisted tags', {
            label: 'Blocklisted Tags Processor',
            tagId: tag,
          });
          invalidTags.add(tag);
          continue;
        }
      } catch (error) {
        logger.error('Error processing tag in blocklisted tags', {
          label: 'Blocklisted Tags Processor',
          tagId: tag,
          errorMessage: error.message,
        });
        continue;
      }

      await this.pageThroughTag(
        tag,
        async ({ page, sortBy }): Promise<AdultTagPage> => {
          const list = await stashDb.queryScenes({
            tagIds: [tag],
            page,
            perPage: ADULT_PAGE_SIZE,
            sort: sortBy ?? SCENE_SORTS[0],
            direction: 'DESC',
            // Popularity takes several seconds a page
            timeout: 60000,
          });
          return {
            total_pages: Math.ceil(list.count / ADULT_PAGE_SIZE),
            results: list.scenes.map((scene) => ({
              id: scene.id,
              title: scene.title ?? '',
            })),
          };
        },
        (response) =>
          this.processAdultResults(response, tag, MediaType.SCENE, em),
        SCENE_SORTS,
        pageLimit
      );
    }

    if (invalidTags.size > 0) {
      // Their names go with them
      const settings = getSettings();
      const kept = adultBlocklistedTags(MediaType.SCENE, settings.main).filter(
        (tag) => !invalidTags.has(tag.id)
      );
      settings.main.blocklistedSceneTags = kept.map((tag) => tag.id).join(',');
      settings.main.blocklistedSceneTagNames = kept
        .map((tag) => tag.name)
        .join('|');
      await settings.save();

      logger.info('Cleaned up invalid StashDB tags from settings', {
        label: 'Blocklisted Tags Processor',
        removedTags: Array.from(invalidTags),
      });
    }
  }

  // ThePornDB cannot look a tag up by id, so an unknown one just finds no
  // movies
  private async processAdultMovieTags(
    em: EntityManager,
    tags: string[],
    pageLimit: number
  ) {
    let tpdb: TpdbAPI;

    try {
      tpdb = TpdbAPI.fromSettings();
    } catch {
      logger.warn('ThePornDB is not configured; skipping blocklisted tags', {
        label: 'Blocklisted Tags Processor',
      });
      return;
    }

    for (const tag of tags) {
      await this.pageThroughTag(
        tag,
        async ({ page, sortBy }): Promise<AdultTagPage> => {
          const list = await tpdb.getMovies({
            tagIds: [Number(tag)],
            page,
            perPage: ADULT_PAGE_SIZE,
            sort: sortBy ?? ADULT_MOVIE_SORTS[0],
          });
          return {
            total_pages: list.meta.last_page,
            results: list.data.map((movie) => ({
              id: movie.id,
              title: movie.title,
            })),
          };
        },
        (response) =>
          this.processAdultResults(response, tag, MediaType.ADULT_MOVIE, em),
        ADULT_MOVIE_SORTS,
        pageLimit
      );
    }
  }

  // processResults for scenes and adult movies, keyed by their UUIDs
  private async processAdultResults(
    response: AdultTagPage,
    tagId: string,
    mediaType: AdultMediaType,
    em: EntityManager
  ) {
    const blocklistRepository = em.getRepository(Blocklist);

    for (const entry of response.results) {
      const blocklistEntry = await blocklistRepository.findOne({
        where: { externalId: entry.id, mediaType },
      });

      if (blocklistEntry) {
        // Manual blocklists keep no tags; ones for other tags get this one
        if (
          blocklistEntry.blocklistedTags &&
          !blocklistEntry.blocklistedTags.includes(`,${tagId},`)
        ) {
          await blocklistRepository.update(blocklistEntry.id, {
            blocklistedTags: `${blocklistEntry.blocklistedTags}${tagId},`,
          });
        }
      } else {
        await Blocklist.addAdultToBlocklist(
          {
            mediaType,
            externalId: entry.id,
            title: entry.title,
            blocklistedTags: `,${tagId},`,
          },
          em
        );
      }
    }
  }

  // Like cleanBlocklist: the media of scenes and adult movies blocklisted by
  // tags go, taking their blocklist entries and requests with them
  private async cleanAdultBlocklist(em: EntityManager) {
    const mediaRepository = em.getRepository(Media);

    for (const mediaType of [MediaType.SCENE, MediaType.ADULT_MOVIE] as const) {
      const mediaToRemove = await mediaRepository
        .createQueryBuilder('media')
        .innerJoin(
          Blocklist,
          'blist',
          `blist.externalId = media.${adultIdField(mediaType)} AND blist.mediaType = media.mediaType`
        )
        .where('media.mediaType = :mediaType', { mediaType })
        .andWhere('blist.blocklistedTags IS NOT NULL')
        .getMany();

      for (let i = 0; i < mediaToRemove.length; i += 500) {
        await mediaRepository.remove(mediaToRemove.slice(i, i + 500));
      }
    }

    // Entries left without media
    await em
      .getRepository(Blocklist)
      .createQueryBuilder()
      .delete()
      .where('blocklistedTags IS NOT NULL')
      .andWhere('mediaType IN (:...mediaTypes)', {
        mediaTypes: [MediaType.SCENE, MediaType.ADULT_MOVIE],
      })
      .execute();
  }

  private async cleanBlocklist(em: EntityManager) {
    // Remove blocklist and media entries blocklisted by tags
    const mediaRepository = em.getRepository(Media);
    const mediaToRemove = await mediaRepository
      .createQueryBuilder('media')
      .innerJoinAndSelect(
        Blocklist,
        'blist',
        'blist.tmdbId = media.tmdbId AND blist.mediaType = media.mediaType'
      )
      .where(`blist.blocklistedTags IS NOT NULL`)
      .getMany();

    // Batch removes so the query doesn't get too large
    for (let i = 0; i < mediaToRemove.length; i += 500) {
      await mediaRepository.remove(mediaToRemove.slice(i, i + 500)); // This also deletes the blocklist entries via cascading
    }
  }
}

const blocklistedTagsProcessor = new BlocklistedTagProcessor();

export default blocklistedTagsProcessor;
