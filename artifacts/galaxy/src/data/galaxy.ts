import raw from "./galaxyData.json";

export interface Paper {
  id: string;
  title: string;
  year: number | null;
  type: string | null;
  venue: string | null;
  url: string;
  citations: number;
  topic: string | null;
  subfield: string | null;
  field: string | null;
  domainName: string | null;
  relevance: number;
  coAuthors: string[];
  coAuthorCount: number;
  domainId: string;
}

export interface Domain {
  id: string;
  name: string;
  field: string;
  paperCount: number;
  totalCitations: number;
}

export interface CountByYear {
  year: number;
  works_count: number;
  cited_by_count: number;
}

export interface AuthorInfo {
  name: string;
  openAlexId?: string | null;
  institution: string | null;
  hIndex: number | null;
  i10Index: number | null;
  worksCount: number;
  citedByCount: number;
  countsByYear: CountByYear[];
  orcid: string | null;
}

export interface GalaxyStats {
  totalPapers: number;
  totalCitations: number;
  uniqueCoAuthors: number;
  firstYear: number;
  lastYear: number;
  yearsActive: number;
  domainCount: number;
  estimatedWords: number;
  avgCitations: number;
  mostCited: { title: string; citations: number; year: number };
}

export interface GalaxyData {
  author: AuthorInfo;
  stats: GalaxyStats;
  domains: Domain[];
  papers: Paper[];
}

// The active dataset and its derived structures are mutable so the whole app can
// switch to any scientist at runtime (see applyDataset). They start from the
// baked snapshot so the galaxy renders instantly and never depends on the network.
// Consumers import these as ES-module live bindings; after a switch the data tree
// is remounted (key={datasetVersion}) so every component re-reads fresh values.
export let galaxyData: GalaxyData = raw as GalaxyData;

function computePapersByDomain(d: GalaxyData): Record<string, Paper[]> {
  return d.domains.reduce(
    (acc, dom) => {
      acc[dom.id] = d.papers.filter((p) => p.domainId === dom.id);
      return acc;
    },
    {} as Record<string, Paper[]>,
  );
}

function computeYearRange(d: GalaxyData): { min: number; max: number } {
  const years = d.papers.map((p) => p.year).filter((y): y is number => y != null);
  return {
    min: years.length ? Math.min(...years) : 0,
    max: years.length ? Math.max(...years) : 0,
  };
}

function computeMaxCitations(d: GalaxyData): number {
  return d.papers.reduce((m, p) => Math.max(m, p.citations), 0);
}

export let papersByDomain: Record<string, Paper[]> = computePapersByDomain(galaxyData);
export let yearRange = computeYearRange(galaxyData);
export let maxCitations = computeMaxCitations(galaxyData);

// Swap in a new dataset (e.g. a different scientist fetched live from OpenAlex)
// and recompute every derived structure. Callers must also rebuild the 3D layout
// (GalaxySystem.rebuildLayout) and bump datasetVersion to remount the scene.
export function applyDataset(data: GalaxyData): void {
  galaxyData = data;
  papersByDomain = computePapersByDomain(data);
  yearRange = computeYearRange(data);
  maxCitations = computeMaxCitations(data);
}

export function getDomain(id: string): Domain | undefined {
  return galaxyData.domains.find((d) => d.id === id);
}

export interface Filters {
  minYear: number | null;
  maxYear: number | null;
  domainIds: string[];
  minCitations: number;
}

export const defaultFilters: Filters = {
  minYear: null,
  maxYear: null,
  domainIds: [],
  minCitations: 0,
};

export function isFiltersActive(f: Filters): boolean {
  return (
    f.minYear != null ||
    f.maxYear != null ||
    f.domainIds.length > 0 ||
    f.minCitations > 0
  );
}

export function paperMatchesFilters(p: Paper, f: Filters): boolean {
  if (f.domainIds.length > 0 && !f.domainIds.includes(p.domainId)) return false;
  if (f.minCitations > 0 && p.citations < f.minCitations) return false;
  if (f.minYear != null && (p.year == null || p.year < f.minYear)) return false;
  if (f.maxYear != null && (p.year == null || p.year > f.maxYear)) return false;
  return true;
}

export interface SearchResult {
  type: "domain" | "paper";
  id: string;
  title: string;
  subtitle: string;
}

export function searchGalaxy(query: string, limit = 8): SearchResult[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const domainHits: SearchResult[] = galaxyData.domains
    .filter(
      (d) =>
        d.name.toLowerCase().includes(q) || d.field.toLowerCase().includes(q),
    )
    .map((d) => ({
      type: "domain" as const,
      id: d.id,
      title: d.name,
      subtitle: `Domain · ${d.paperCount} papers`,
    }));

  const paperHits: SearchResult[] = galaxyData.papers
    .filter((p) => {
      if (p.title.toLowerCase().includes(q)) return true;
      if (p.year != null && String(p.year).includes(q)) return true;
      if (p.domainName && p.domainName.toLowerCase().includes(q)) return true;
      if (p.coAuthors.some((a) => a.toLowerCase().includes(q))) return true;
      return false;
    })
    .sort((a, b) => b.citations - a.citations)
    .map((p) => ({
      type: "paper" as const,
      id: p.id,
      title: p.title,
      subtitle: [p.year, `${p.citations} citations`, p.domainName]
        .filter(Boolean)
        .join(" · "),
    }));

  return [...domainHits, ...paperHits].slice(0, limit);
}

export function countMatchingPapers(f: Filters): number {
  return galaxyData.papers.filter((p) => paperMatchesFilters(p, f)).length;
}

export function getMatchingPapers(f: Filters): Paper[] {
  return galaxyData.papers
    .filter((p) => paperMatchesFilters(p, f))
    .sort((a, b) => b.citations - a.citations);
}
