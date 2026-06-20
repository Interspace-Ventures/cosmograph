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

export const galaxyData = raw as GalaxyData;

export const papersByDomain: Record<string, Paper[]> = galaxyData.domains.reduce(
  (acc, d) => {
    acc[d.id] = galaxyData.papers.filter((p) => p.domainId === d.id);
    return acc;
  },
  {} as Record<string, Paper[]>,
);

export function getDomain(id: string): Domain | undefined {
  return galaxyData.domains.find((d) => d.id === id);
}

const _years = galaxyData.papers
  .map((p) => p.year)
  .filter((y): y is number => y != null);

export const yearRange = {
  min: _years.length ? Math.min(..._years) : 0,
  max: _years.length ? Math.max(..._years) : 0,
};

export const maxCitations = galaxyData.papers.reduce(
  (m, p) => Math.max(m, p.citations),
  0,
);

export interface Filters {
  minYear: number | null;
  maxYear: number | null;
  domainId: string | null;
  minCitations: number;
}

export const defaultFilters: Filters = {
  minYear: null,
  maxYear: null,
  domainId: null,
  minCitations: 0,
};

export function isFiltersActive(f: Filters): boolean {
  return (
    f.minYear != null ||
    f.maxYear != null ||
    f.domainId != null ||
    f.minCitations > 0
  );
}

export function paperMatchesFilters(p: Paper, f: Filters): boolean {
  if (f.domainId && p.domainId !== f.domainId) return false;
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
