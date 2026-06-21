// Runtime derivation pipeline: turns raw OpenAlex (author + works) into the same
// GalaxyData shape baked into galaxyData.json. This is a faithful browser port of
// scripts/fetch-galaxy.mjs — keep the two in sync if you change clustering/stats.
//
// Pure (no Node / no DOM deps) so it can run in the browser and be unit-tested.

import type {
  AuthorInfo,
  CountByYear,
  Domain,
  GalaxyData,
  GalaxyStats,
  Paper,
} from "./galaxy";
import { stripId, type RawAuthor, type RawWork } from "@/lib/openalex";

// Optional disambiguation filters — used when OpenAlex has merged a different
// same-named researcher into one profile. Mirrors the offline script's flags.
export interface BuildOptions {
  excludeInstitutions?: string[];
  excludeCoauthors?: string[];
  minYear?: number | null;
  maxYear?: number | null;
}

// Journal "front matter" OpenAlex catalogs as works but which are not real
// papers (tables of contents, indexes, issue info, contributor lists). Universal
// noise: ~0 citations, frequently mis-classified into bogus domains. Always dropped.
const FRONT_MATTER_TYPES = new Set(["paratext"]);
const FRONT_MATTER_TITLE_RE =
  /\b(table of contents|title page|front matter|issue information|masthead|editorial board|content experts|list of contributors|(author|subject)\s*(and\s*(author|subject)\s*)?index)\b/i;

function isFrontMatter(w: RawWork): boolean {
  if (w.type && FRONT_MATTER_TYPES.has(w.type)) return true;
  const title = (w.title || w.display_name || "").trim();
  return title !== "" && FRONT_MATTER_TITLE_RE.test(title);
}

function isExcludedWork(w: RawWork, opts: Required<BuildOptions>): boolean {
  const year = w.publication_year ?? null;
  if (opts.minYear != null && (year == null || year < opts.minYear)) return true;
  if (opts.maxYear != null && (year == null || year > opts.maxYear)) return true;
  const excInst = new Set(opts.excludeInstitutions);
  const excCo = new Set(opts.excludeCoauthors);
  for (const a of w.authorships || []) {
    if (a.author?.id && excCo.has(stripId(a.author.id))) return true;
    for (const inst of a.institutions || []) {
      if (inst?.id && excInst.has(stripId(inst.id))) return true;
    }
  }
  return false;
}

const computeHIndex = (cites: number[]): number => {
  const desc = [...cites].sort((a, b) => b - a);
  let h = 0;
  for (let i = 0; i < desc.length; i++) if (desc[i] >= i + 1) h = i + 1;
  return h;
};

export function buildGalaxyData(
  rawAuthor: RawAuthor,
  rawWorks: RawWork[],
  options: BuildOptions = {},
): GalaxyData {
  const opts: Required<BuildOptions> = {
    excludeInstitutions: (options.excludeInstitutions || []).map(stripId),
    excludeCoauthors: (options.excludeCoauthors || []).map(stripId),
    minYear: options.minYear ?? null,
    maxYear: options.maxYear ?? null,
  };
  const hasFilters =
    opts.excludeInstitutions.length > 0 ||
    opts.excludeCoauthors.length > 0 ||
    opts.minYear != null ||
    opts.maxYear != null;

  const authorId = stripId(rawAuthor.id);

  // 1. Drop journal front matter (always), then disambiguation filters (if any).
  const afterFrontMatter = rawWorks.filter((w) => !isFrontMatter(w));
  const frontMatterDropped = rawWorks.length - afterFrontMatter.length;
  const works = hasFilters
    ? afterFrontMatter.filter((w) => !isExcludedWork(w, opts))
    : afterFrontMatter;

  if (works.length === 0) {
    throw new Error(
      hasFilters
        ? "No works left after filtering. Loosen the disambiguation filters."
        : "OpenAlex returned no usable works for this author.",
    );
  }

  // 2. Normalize papers.
  const authorNameLower = rawAuthor.display_name.toLowerCase();
  const papers: Omit<Paper, "domainId">[] = works.map((w) => {
    const pt = w.primary_topic || null;
    const coAuthorsAll = (w.authorships || [])
      .map((a) => a.author?.display_name)
      .filter((n): n is string => !!n)
      .filter((n) => n.toLowerCase() !== authorNameLower);
    const seen = new Set<string>();
    const coAuthors: string[] = [];
    for (const n of coAuthorsAll) {
      const k = n.toLowerCase();
      if (!seen.has(k)) {
        seen.add(k);
        coAuthors.push(n);
      }
    }
    return {
      id: stripId(w.id),
      title: w.title || w.display_name || "Untitled",
      year: w.publication_year || null,
      type: w.type || null,
      venue: w.primary_location?.source?.display_name || null,
      url: w.doi || w.primary_location?.landing_page_url || w.id,
      citations: w.cited_by_count || 0,
      topic: pt?.display_name || null,
      subfield: pt?.subfield?.display_name || null,
      field: pt?.field?.display_name || null,
      domainName: pt?.domain?.display_name || null,
      relevance: typeof pt?.score === "number" ? pt.score : 0.5,
      coAuthors: coAuthors.slice(0, 40),
      coAuthorCount: coAuthors.length,
    };
  });

  // 3. Cluster into "suns" by subfield, collapse long-tail into Cross-Disciplinary.
  type Group = { name: string; field: string; papers: Omit<Paper, "domainId">[] };
  const groups = new Map<string, Group>();
  for (const p of papers) {
    const key = p.subfield || p.field || "Other";
    if (!groups.has(key))
      groups.set(key, { name: key, field: p.field || key, papers: [] });
    groups.get(key)!.papers.push(p);
  }
  const sorted = [...groups.values()].sort(
    (a, b) => b.papers.length - a.papers.length,
  );
  const MAX_SUNS = 11;
  const MIN_PAPERS = 4;
  const SPLIT_THRESHOLD = 90;
  const MIN_TOPIC_PAPERS = 12;
  const kept: Group[] = [];
  const overflow: Group[] = [];
  for (const g of sorted) {
    if (kept.length < MAX_SUNS && g.papers.length >= MIN_PAPERS) kept.push(g);
    else overflow.push(g);
  }
  if (overflow.length) {
    const merged: Group = { name: "Cross-Disciplinary", field: "Other", papers: [] };
    for (const g of overflow) merged.papers.push(...g.papers);
    if (merged.papers.length) kept.push(merged);
  }

  // Break any oversized subfield into per-topic suns so domains stay balanced.
  const finalGroups: Group[] = [];
  for (const g of kept) {
    if (g.papers.length <= SPLIT_THRESHOLD || g.name === "Cross-Disciplinary") {
      finalGroups.push(g);
      continue;
    }
    const byTopic = new Map<string, Omit<Paper, "domainId">[]>();
    for (const p of g.papers) {
      const t = p.topic || g.name;
      if (!byTopic.has(t)) byTopic.set(t, []);
      byTopic.get(t)!.push(p);
    }
    const remainder: Omit<Paper, "domainId">[] = [];
    for (const [topic, ps] of [...byTopic.entries()].sort(
      (a, b) => b[1].length - a[1].length,
    )) {
      if (ps.length >= MIN_TOPIC_PAPERS)
        finalGroups.push({ name: topic, field: g.field, papers: ps });
      else remainder.push(...ps);
    }
    if (remainder.length)
      finalGroups.push({ name: g.name, field: g.field, papers: remainder });
  }
  finalGroups.sort((a, b) => b.papers.length - a.papers.length);

  const domains: Domain[] = finalGroups.map((g, i) => ({
    id: `sun-${i}`,
    name: g.name,
    field: g.field,
    paperCount: g.papers.length,
    totalCitations: g.papers.reduce((s, p) => s + p.citations, 0),
  }));

  const outPapers: Paper[] = [];
  finalGroups.forEach((g, i) => {
    for (const p of g.papers) outPapers.push({ ...p, domainId: `sun-${i}` });
  });

  // 4. Whole-corpus stats.
  const totalCitations = papers.reduce((s, p) => s + p.citations, 0);
  const coAuthorSet = new Set<string>();
  for (const p of papers) for (const c of p.coAuthors) coAuthorSet.add(c.toLowerCase());
  const years = papers.map((p) => p.year).filter((y): y is number => !!y);
  const firstYear = years.length ? Math.min(...years) : 0;
  const lastYear = years.length ? Math.max(...years) : 0;
  const mostCited = [...papers].sort((a, b) => b.citations - a.citations)[0];
  const estimatedWords = papers.reduce(
    (s, p) => s + (p.type === "article" ? 5000 : 1500),
    0,
  );

  const stats: GalaxyStats = {
    totalPapers: papers.length,
    totalCitations,
    uniqueCoAuthors: coAuthorSet.size,
    firstYear,
    lastYear,
    yearsActive: lastYear - firstYear,
    domainCount: domains.length,
    estimatedWords,
    avgCitations: Math.round(totalCitations / papers.length),
    mostCited: {
      title: mostCited.title,
      citations: mostCited.citations,
      year: mostCited.year ?? 0,
    },
  };

  // 5. Author headline. When any works were dropped (front matter and/or
  // disambiguation), the OpenAlex author object still reflects the full/merged
  // profile, so recompute headline figures from the kept works only.
  const recompute = hasFilters || frontMatterDropped > 0;
  const citationsList = papers.map((p) => p.citations);

  const computeCountsByYear = (): CountByYear[] => {
    const byYear = new Map<number, CountByYear>();
    for (const w of works) {
      const y = w.publication_year;
      if (!y) continue;
      const e =
        byYear.get(y) || { year: y, works_count: 0, cited_by_count: 0 };
      e.works_count += 1;
      e.cited_by_count += w.cited_by_count || 0;
      byYear.set(y, e);
    }
    return [...byYear.values()].sort((a, b) => a.year - b.year);
  };

  const computeInstitution = (): string | null => {
    const counts = new Map<string, number>();
    for (const w of works) {
      for (const a of w.authorships || []) {
        if (a.author?.id && stripId(a.author.id) !== authorId) continue;
        for (const inst of a.institutions || []) {
          const name = inst?.display_name;
          if (name) counts.set(name, (counts.get(name) || 0) + 1);
        }
      }
    }
    let best: string | null = null;
    let bestN = 0;
    for (const [name, n] of counts) if (n > bestN) ((best = name), (bestN = n));
    return best;
  };

  const author: AuthorInfo = recompute
    ? {
        name: rawAuthor.display_name,
        openAlexId: authorId,
        institution:
          computeInstitution() ||
          rawAuthor.last_known_institutions?.[0]?.display_name ||
          null,
        hIndex: computeHIndex(citationsList),
        i10Index: citationsList.filter((c) => c >= 10).length,
        worksCount: papers.length,
        citedByCount: totalCitations,
        countsByYear: computeCountsByYear(),
        orcid: rawAuthor.orcid || null,
      }
    : {
        name: rawAuthor.display_name,
        openAlexId: authorId,
        institution:
          rawAuthor.last_known_institutions?.[0]?.display_name ||
          rawAuthor.affiliations?.[0]?.institution?.display_name ||
          null,
        hIndex: rawAuthor.summary_stats?.h_index ?? null,
        i10Index: rawAuthor.summary_stats?.i10_index ?? null,
        worksCount: rawAuthor.works_count ?? papers.length,
        citedByCount: rawAuthor.cited_by_count ?? totalCitations,
        countsByYear: (rawAuthor.counts_by_year || [])
          .slice()
          .sort((a, b) => a.year - b.year),
        orcid: rawAuthor.orcid || null,
      };

  return { author, stats, domains, papers: outPapers };
}
