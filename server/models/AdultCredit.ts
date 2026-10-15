import { stashDbPerformerId } from '@server/api/tpdb';
import type {
  TpdbPerformerSummary,
  TpdbSiteSummary,
} from '@server/api/tpdb/interfaces';
import type { SiteLink } from '@server/models/Scene';

// ThePornDB performers and studios, for their pages and filter names

export interface AdultPerformerDetails {
  // Numeric id the adult movie filters take
  id: number;
  name: string;
  imageUrl?: string;
  bio?: string;
  aliases: string[];
  birthDate?: string;
  birthplace?: string;
  careerStart?: number;
  careerEnd?: number;
  links: SiteLink[];
  // StashDB performer ThePornDB links to, which has the scenes page
  stashDbId?: string;
  tpdbUrl: string;
}

export interface AdultStudioDetails {
  id: number;
  name: string;
  imageUrl?: string;
  url?: string;
  network?: { id: number; name: string };
  // A network's sites
  sites: { id: number; name: string; imageUrl?: string }[];
  // StashDB studio of the same name, which has the scenes page
  stashDbId?: string;
  tpdbUrl: string;
}

export const mapAdultPerformerDetails = (
  performer: TpdbPerformerSummary
): AdultPerformerDetails => {
  const extras = performer.extras;

  return {
    id: performer._id,
    name: performer.name,
    imageUrl: performer.image ?? undefined,
    bio: performer.bio?.trim() || undefined,
    aliases: (performer.aliases ?? []).filter(
      (alias) => alias !== performer.name
    ),
    birthDate: extras?.birthday ?? undefined,
    birthplace: extras?.birthplace ?? undefined,
    careerStart: extras?.career_start_year ?? undefined,
    careerEnd: extras?.career_end_year ?? undefined,
    links: Object.entries(extras?.links ?? {}).map(([site, url]) => ({
      url,
      site,
    })),
    stashDbId: stashDbPerformerId(extras),
    tpdbUrl: `https://theporndb.net/performers/${performer.id}`,
  };
};

export const mapAdultStudioDetails = (
  site: TpdbSiteSummary,
  sites: TpdbSiteSummary[]
): AdultStudioDetails => ({
  id: site.id,
  name: site.name,
  imageUrl: site.logo ?? undefined,
  url: site.url ?? undefined,
  network:
    site.network && site.network.id !== site.id
      ? { id: site.network.id, name: site.network.name }
      : undefined,
  sites: sites
    .map((child) => ({
      id: child.id,
      name: child.name,
      imageUrl: child.logo ?? undefined,
    }))
    .sort((a, b) => a.name.localeCompare(b.name)),
  tpdbUrl: `https://theporndb.net/sites/${site.uuid}`,
});
