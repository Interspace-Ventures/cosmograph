// Browser-side OpenAlex client. OpenAlex is free, needs no API key, and serves
// permissive CORS headers, so we can fetch directly from the browser. The
// `mailto` param is OpenAlex etiquette (the "polite pool"); replace with a real
// contact address before a public launch.
//
// This is the runtime counterpart to scripts/fetch-galaxy.mjs: it pulls the raw
// author + works, which buildGalaxy.ts then derives into a GalaxyData snapshot —
// the same shape baked into galaxyData.json.

const BASE = "https://api.openalex.org";
const MAILTO = "galaxy-gift@example.com";

export const stripId = (s: string | null | undefined): string =>
  String(s || "")
    .trim()
    .replace("https://openalex.org/", "")
    .replace(/\/+$/, "");

// ----- Raw OpenAlex shapes (only the fields we read) ----------------------

export interface RawTopic {
  display_name?: string;
  score?: number;
  subfield?: { display_name?: string };
  field?: { display_name?: string };
  domain?: { display_name?: string };
}

export interface RawAuthorship {
  author?: { id?: string; display_name?: string };
  institutions?: Array<{ id?: string; display_name?: string }>;
}

export interface RawWork {
  id: string;
  title?: string | null;
  display_name?: string | null;
  publication_year?: number | null;
  cited_by_count?: number | null;
  doi?: string | null;
  primary_location?: {
    source?: { display_name?: string | null } | null;
    landing_page_url?: string | null;
  } | null;
  primary_topic?: RawTopic | null;
  authorships?: RawAuthorship[];
  type?: string | null;
}

export interface RawAuthor {
  id: string;
  display_name: string;
  works_count?: number;
  cited_by_count?: number;
  orcid?: string | null;
  last_known_institutions?: Array<{ display_name?: string | null }>;
  affiliations?: Array<{ institution?: { display_name?: string | null } }>;
  summary_stats?: { h_index?: number | null; i10_index?: number | null };
  counts_by_year?: Array<{ year: number; works_count: number; cited_by_count: number }>;
}

// A trimmed candidate for the search picker.
export interface AuthorCandidate {
  id: string;
  name: string;
  worksCount: number;
  citedByCount: number;
  institution: string | null;
  orcid: string | null;
}

async function getJSON<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, {
    signal,
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`OpenAlex HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

const withMailto = (url: string) =>
  url + (url.includes("?") ? "&" : "?") + `mailto=${encodeURIComponent(MAILTO)}`;

// Search authors by name; returns the top candidates so the user can pick the
// right person when a name is ambiguous.
export async function searchAuthors(
  name: string,
  limit = 6,
  signal?: AbortSignal,
): Promise<AuthorCandidate[]> {
  const q = name.trim();
  if (!q) return [];
  const url = withMailto(
    `${BASE}/authors?search=${encodeURIComponent(q)}&per-page=${limit}`,
  );
  const data = await getJSON<{ results?: RawAuthor[] }>(url, signal);
  return (data.results || []).map((a) => ({
    id: stripId(a.id),
    name: a.display_name,
    worksCount: a.works_count ?? 0,
    citedByCount: a.cited_by_count ?? 0,
    institution:
      a.last_known_institutions?.[0]?.display_name ||
      a.affiliations?.[0]?.institution?.display_name ||
      null,
    orcid: a.orcid || null,
  }));
}

export async function fetchAuthor(
  id: string,
  signal?: AbortSignal,
): Promise<RawAuthor> {
  const url = withMailto(`${BASE}/authors/${stripId(id)}`);
  return getJSON<RawAuthor>(url, signal);
}

const WORK_SELECT = [
  "id",
  "title",
  "display_name",
  "publication_year",
  "cited_by_count",
  "doi",
  "primary_location",
  "primary_topic",
  "authorships",
  "type",
].join(",");

// Fetch every work for an author via cursor pagination. onProgress reports
// (fetched, total) so the UI can show a determinate loading bar.
export async function fetchAuthorWorks(
  id: string,
  onProgress?: (fetched: number, total: number) => void,
  signal?: AbortSignal,
): Promise<RawWork[]> {
  const authorId = stripId(id);
  let cursor: string | null = "*";
  const works: RawWork[] = [];
  while (cursor) {
    const url = withMailto(
      `${BASE}/works?filter=author.id:${authorId}&select=${WORK_SELECT}` +
        `&per-page=200&cursor=${encodeURIComponent(cursor)}`,
    );
    const page = await getJSON<{
      results: RawWork[];
      meta: { next_cursor: string | null; count: number };
    }>(url, signal);
    works.push(...page.results);
    onProgress?.(works.length, page.meta.count);
    cursor = page.meta.next_cursor;
  }
  return works;
}
