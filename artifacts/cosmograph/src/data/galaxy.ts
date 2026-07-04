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

// The OpenAlex id baked into the shipped snapshot. The default scientist is
// always free to explore fully; only OTHER scientists searched live require the
// one-time unlock. Read from `raw` (never reassigned) so a live dataset swap
// can be compared against the original default.
export const DEFAULT_AUTHOR_ID: string | null =
  (raw as GalaxyData).author.openAlexId ?? null;

// True when the active dataset is still the baked default scientist. Read live
// (galaxyData is a mutable module binding swapped by applyDataset).
export function isDefaultAuthor(): boolean {
  const current = galaxyData.author.openAlexId ?? null;
  return DEFAULT_AUTHOR_ID != null && current === DEFAULT_AUTHOR_ID;
}

// Draw calls scale 1:1 with planet count — every paper is a unique textured
// mesh. For a pathologically prolific corpus (a ~150K-citation scientist can
// have 2,000+ works) that many individual planets can overwhelm a weaker GPU on
// the wide overview even with frustum culling + adaptive resolution. So beyond
// this many papers we render only the MOST-CITED ones as planets. The long tail
// still counts everywhere it matters — every headline stat, each domain's paper
// count (sun size), and Ask/filter results — it just doesn't get its own
// orbiting world. Any realistic scientist sits well under the cap, so for them
// nothing changes: every paper is a planet. Single tunable knob.
export const MAX_RENDERED_PLANETS = 1200;

// The papers that actually become planets, grouped by domain. When the corpus
// exceeds MAX_RENDERED_PLANETS we keep the globally most-cited papers (ties
// broken by id for a stable, deterministic layout across reloads); the rest
// still exist in galaxyData for stats/domains/Ask, they just get no planet.
function computePapersByDomain(d: GalaxyData): Record<string, Paper[]> {
  let papers = d.papers;
  if (papers.length > MAX_RENDERED_PLANETS) {
    papers = [...papers]
      .sort((a, b) => b.citations - a.citations || (a.id < b.id ? -1 : 1))
      .slice(0, MAX_RENDERED_PLANETS);
  }
  return d.domains.reduce(
    (acc, dom) => {
      acc[dom.id] = papers.filter((p) => p.domainId === dom.id);
      return acc;
    },
    {} as Record<string, Paper[]>,
  );
}

// The flat set of paper ids that have a planet (i.e. survived the cap). Used to
// keep search from surfacing a paper the user can't actually fly to. When the
// corpus is under the cap this contains every paper, so nothing is hidden.
function computeRenderedPaperIds(
  byDomain: Record<string, Paper[]>,
): Set<string> {
  const ids = new Set<string>();
  for (const list of Object.values(byDomain))
    for (const p of list) ids.add(p.id);
  return ids;
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
export let renderedPaperIds: Set<string> = computeRenderedPaperIds(papersByDomain);
export let yearRange = computeYearRange(galaxyData);
export let maxCitations = computeMaxCitations(galaxyData);

// Swap in a new dataset (e.g. a different scientist fetched live from OpenAlex)
// and recompute every derived structure. Callers must also rebuild the 3D layout
// (GalaxySystem.rebuildLayout) and bump datasetVersion to remount the scene.
export function applyDataset(data: GalaxyData): void {
  galaxyData = data;
  papersByDomain = computePapersByDomain(data);
  renderedPaperIds = computeRenderedPaperIds(papersByDomain);
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
  // "Ask" extensions — all optional so existing callers stay unaffected. They let
  // a natural-language query express richer predicates over the same data.
  maxCitations?: number | null;
  minCoAuthors?: number | null;
  maxCoAuthors?: number | null;
  // Free-text keyword matched across a paper's title/topic/subfield/field/domain/venue.
  text?: string | null;
  // Co-author name substring.
  coAuthor?: string | null;
}

// Default = every domain selected (explicit "all on"). Computed from the live
// galaxyData so a dataset swap yields the new scientist's domain ids, not stale ones.
export function makeDefaultFilters(): Filters {
  return {
    minYear: null,
    maxYear: null,
    domainIds: galaxyData.domains.map((d) => d.id),
    minCitations: 0,
    maxCitations: null,
    minCoAuthors: null,
    maxCoAuthors: null,
    text: null,
    coAuthor: null,
  };
}

export function isFiltersActive(f: Filters): boolean {
  // Domains count as filtered unless every current domain is selected. Using
  // set-containment (not length) keeps this correct even if domainIds ever holds
  // a stale/duplicate id that coincidentally matches the domain count.
  const allDomainsSelected = galaxyData.domains.every((d) =>
    f.domainIds.includes(d.id),
  );
  return (
    f.minYear != null ||
    f.maxYear != null ||
    !allDomainsSelected ||
    f.minCitations > 0 ||
    f.maxCitations != null ||
    f.minCoAuthors != null ||
    f.maxCoAuthors != null ||
    !!f.text ||
    !!f.coAuthor
  );
}

// The text fields a free-text keyword is matched against.
function paperText(p: Paper): string {
  return [p.title, p.topic, p.subfield, p.field, p.domainName, p.venue]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function paperMatchesFilters(p: Paper, f: Filters): boolean {
  if (!f.domainIds.includes(p.domainId)) return false;
  if (f.minCitations > 0 && p.citations < f.minCitations) return false;
  if (f.maxCitations != null && p.citations > f.maxCitations) return false;
  if (f.minYear != null && (p.year == null || p.year < f.minYear)) return false;
  if (f.maxYear != null && (p.year == null || p.year > f.maxYear)) return false;
  if (f.minCoAuthors != null && p.coAuthorCount < f.minCoAuthors) return false;
  if (f.maxCoAuthors != null && p.coAuthorCount > f.maxCoAuthors) return false;
  if (f.text && !paperText(p).includes(f.text.toLowerCase())) return false;
  if (
    f.coAuthor &&
    !p.coAuthors.some((a) => a.toLowerCase().includes(f.coAuthor!.toLowerCase()))
  )
    return false;
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
      // Only papers with an actual planet are selectable (capped corpora hide
      // the long tail); no-op when every paper is rendered.
      if (!renderedPaperIds.has(p.id)) return false;
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

// A structured query the "Ask Cosmos" assistant fills for a "data" turn. Mirrors
// the server's AskQuery (lib/ask.ts) but stays a local type so the data layer has
// no dependency on generated server code. The model only fills these slots; the
// real counts and lists are computed here by runAskQuery, never by the model.
export interface AskQuery {
  intent: "count" | "list";
  text?: string | null;
  coAuthor?: string | null;
  minYear?: number | null;
  maxYear?: number | null;
  minCitations?: number | null;
  maxCitations?: number | null;
  minCoAuthors?: number | null;
  maxCoAuthors?: number | null;
  sortBy?: "citations" | "year" | "coAuthors" | null;
  sortDir?: "asc" | "desc" | null;
  limit?: number | null;
}

// Convert an AskQuery into the Filters predicate. Domains always start "all on";
// the query narrows via the optional predicate fields.
export function askQueryToFilters(q: AskQuery): Filters {
  return {
    ...makeDefaultFilters(),
    minYear: q.minYear ?? null,
    maxYear: q.maxYear ?? null,
    minCitations: q.minCitations ?? 0,
    maxCitations: q.maxCitations ?? null,
    minCoAuthors: q.minCoAuthors ?? null,
    maxCoAuthors: q.maxCoAuthors ?? null,
    text: q.text ?? null,
    coAuthor: q.coAuthor ?? null,
  };
}

export interface AskResult {
  matched: Paper[];
  count: number;
  total: number;
  filters: Filters;
}

// Run a translated query deterministically over the local corpus. ALL numbers
// and lists come from here — the model never returns counts or papers.
export function runAskQuery(q: AskQuery): AskResult {
  const filters = askQueryToFilters(q);
  const matched = galaxyData.papers.filter((p) => paperMatchesFilters(p, filters));

  const dir = q.sortDir === "asc" ? 1 : -1;
  const sortBy = q.sortBy ?? "citations";
  matched.sort((a, b) => {
    let av: number;
    let bv: number;
    if (sortBy === "year") {
      av = a.year ?? -Infinity;
      bv = b.year ?? -Infinity;
    } else if (sortBy === "coAuthors") {
      av = a.coAuthorCount;
      bv = b.coAuthorCount;
    } else {
      av = a.citations;
      bv = b.citations;
    }
    if (av === bv) return b.citations - a.citations;
    return (av - bv) * dir;
  });

  const limited =
    q.intent === "list" && q.limit != null ? matched.slice(0, q.limit) : matched;

  return {
    matched: limited,
    count: matched.length,
    total: galaxyData.papers.length,
    filters,
  };
}

// The headline, public corpus summary sent to the assistant as grounding. These
// are the ONLY numbers the model is allowed to state verbatim; anything filtered
// or derived must route through a "data" action and runAskQuery. Computed from
// the live galaxyData so it stays correct after a dataset swap.
export interface CorpusSummary {
  authorName: string;
  institution: string | null;
  totalPapers: number;
  totalCitations: number;
  hIndex: number | null;
  i10Index: number | null;
  uniqueCoAuthors: number;
  firstYear: number;
  lastYear: number;
  avgCitations: number;
  topDomains: string[];
  mostCitedTitle: string | null;
  mostCitedCount: number | null;
}

export function getCorpusSummary(): CorpusSummary {
  const { author, stats, domains } = galaxyData;
  const topDomains = [...domains]
    .sort((a, b) => b.paperCount - a.paperCount)
    .slice(0, 8)
    .map((d) => d.name);
  return {
    authorName: author.name,
    institution: author.institution,
    totalPapers: stats.totalPapers,
    totalCitations: stats.totalCitations,
    hIndex: author.hIndex,
    i10Index: author.i10Index,
    uniqueCoAuthors: stats.uniqueCoAuthors,
    firstYear: stats.firstYear,
    lastYear: stats.lastYear,
    avgCitations: stats.avgCitations,
    topDomains,
    mostCitedTitle: stats.mostCited?.title ?? null,
    mostCitedCount: stats.mostCited?.citations ?? null,
  };
}

// The paper-record shape (field names + types only) sent to the assistant so it
// can build accurate queries — never any actual paper data; everything stays in
// the browser.
export interface AskFieldDescriptor {
  name: string;
  type: string;
  description?: string;
}

export function getAskFields(): AskFieldDescriptor[] {
  return [
    { name: "title", type: "string" },
    { name: "year", type: "number", description: "Publication year." },
    { name: "citations", type: "number", description: "Total citation count." },
    { name: "topic", type: "string", description: "Fine-grained OpenAlex topic." },
    { name: "subfield", type: "string" },
    { name: "field", type: "string" },
    {
      name: "domainName",
      type: "string",
      description: "The research domain (sun) this paper orbits.",
    },
    { name: "venue", type: "string", description: "Journal or conference." },
    { name: "coAuthors", type: "string[]", description: "Names of collaborators." },
    {
      name: "coAuthorCount",
      type: "number",
      description: "Number of collaborators.",
    },
  ];
}
