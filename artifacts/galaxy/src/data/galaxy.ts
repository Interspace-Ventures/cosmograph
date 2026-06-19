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
