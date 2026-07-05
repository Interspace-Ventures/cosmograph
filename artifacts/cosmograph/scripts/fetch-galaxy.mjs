// One-time OpenAlex fetch -> baked static snapshot for the Galaxy app.
//
// Generate the galaxy for ANY scientist — this app ships with no hardcoded
// identity; everything the UI shows comes from the snapshot this script writes.
//
// Usage (writes JSON to stdout — redirect into the data file):
//   node scripts/fetch-galaxy.mjs --name "Ada Lovelace"   > src/data/galaxyData.json
//   node scripts/fetch-galaxy.mjs --id A5111365293         > src/data/galaxyData.json
// You can also use env vars: GALAXY_AUTHOR_NAME or GALAXY_AUTHOR_ID.
// Set a contact email with --mailto you@yourdomain.com (OpenAlex etiquette).
//
// Disambiguation filters — use these when OpenAlex has merged a *different*
// same-named researcher into the profile. Each filter drops matching works
// before the snapshot is built, and the headline author stats (works, citations,
// h-index, i10, counts-by-year, institution) are then RECOMPUTED from only the
// kept works so the numbers reflect the real person, not the merged profile.
//   --exclude-institution <OpenAlexInstId>   drop works affiliated with this institution (repeatable)
//   --exclude-coauthor <OpenAlexAuthorId>    drop works co-authored with this person (repeatable)
//   --min-year <YYYY> / --max-year <YYYY>    drop works outside this publication-year range
// Env equivalents: GALAXY_EXCLUDE_INSTITUTIONS, GALAXY_EXCLUDE_COAUTHORS (comma-separated),
// GALAXY_MIN_YEAR, GALAXY_MAX_YEAR.
const BASE = "https://api.openalex.org";

const stripId = (s) =>
  String(s || "")
    .trim()
    .replace("https://openalex.org/", "")
    .replace(/\/+$/, "");

// Parse a year arg/env into a finite integer, or null. Throws on garbage so a
// typo never silently disables year filtering while stats get recomputed.
function parseYear(v, label) {
  if (v == null || v === "") return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0) {
    throw new Error(`Invalid ${label}: "${v}" — expected a 4-digit year, e.g. 1994.`);
  }
  return n;
}

function parseArgs(argv) {
  const out = { excludeInstitutions: [], excludeCoauthors: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--name") out.name = argv[++i];
    else if (a === "--id" || a === "--author") out.id = argv[++i];
    else if (a === "--mailto") out.mailto = argv[++i];
    else if (a === "--exclude-institution") out.excludeInstitutions.push(stripId(argv[++i]));
    else if (a === "--exclude-coauthor") out.excludeCoauthors.push(stripId(argv[++i]));
    else if (a === "--min-year") out.minYear = argv[++i];
    else if (a === "--max-year") out.maxYear = argv[++i];
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const MAILTO = args.mailto || process.env.GALAXY_MAILTO || "hello@cosmograph.space";

const splitEnv = (v) => (v ? v.split(",").map((s) => stripId(s.trim())).filter(Boolean) : []);
const EXCLUDE_INSTITUTIONS = new Set([
  ...args.excludeInstitutions,
  ...splitEnv(process.env.GALAXY_EXCLUDE_INSTITUTIONS),
]);
const EXCLUDE_COAUTHORS = new Set([
  ...args.excludeCoauthors,
  ...splitEnv(process.env.GALAXY_EXCLUDE_COAUTHORS),
]);
const MIN_YEAR = parseYear(args.minYear ?? process.env.GALAXY_MIN_YEAR, "--min-year");
const MAX_YEAR = parseYear(args.maxYear ?? process.env.GALAXY_MAX_YEAR, "--max-year");
const HAS_FILTERS =
  EXCLUDE_INSTITUTIONS.size > 0 || EXCLUDE_COAUTHORS.size > 0 || MIN_YEAR != null || MAX_YEAR != null;

// Journal "front matter" that OpenAlex catalogs as works but which are not real
// papers: tables of contents, indexes, issue information, contributor lists, etc.
// These are universal noise for any author (often from journals they edit), carry
// ~0 citations, and frequently get mis-topic-classified into bogus domains. Always
// dropped, independent of the disambiguation filters below.
const FRONT_MATTER_TYPES = new Set(["paratext"]);
const FRONT_MATTER_TITLE_RE =
  /\b(table of contents|title page|front matter|issue information|masthead|editorial board|content experts|list of contributors|(author|subject)\s*(and\s*(author|subject)\s*)?index)\b/i;
function isFrontMatter(w) {
  if (FRONT_MATTER_TYPES.has(w.type)) return true;
  const title = (w.title || w.display_name || "").trim();
  return title !== "" && FRONT_MATTER_TITLE_RE.test(title);
}

// True when a raw OpenAlex work should be dropped by the disambiguation filters.
function isExcludedWork(w) {
  const year = w.publication_year;
  if (MIN_YEAR != null && (year == null || year < MIN_YEAR)) return true;
  if (MAX_YEAR != null && (year == null || year > MAX_YEAR)) return true;
  for (const a of w.authorships || []) {
    if (a.author?.id && EXCLUDE_COAUTHORS.has(stripId(a.author.id))) return true;
    for (const inst of a.institutions || []) {
      if (inst?.id && EXCLUDE_INSTITUTIONS.has(stripId(inst.id))) return true;
    }
  }
  return false;
}

async function getJSON(url) {
  const res = await fetch(url, { headers: { "User-Agent": `galaxy-app (mailto:${MAILTO})` } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

// Resolve an OpenAlex author id from an explicit id or a name search.
async function resolveAuthorId() {
  const id = args.id || process.env.GALAXY_AUTHOR_ID;
  if (id) return id.replace("https://openalex.org/", "");

  const name = args.name || process.env.GALAXY_AUTHOR_NAME;
  if (!name) {
    throw new Error(
      "No scientist specified.\n" +
        '  Pass --name "Full Name" or --id <OpenAlexAuthorId>.\n' +
        "  e.g. node scripts/fetch-galaxy.mjs --name \"Mahendra S. Rao\" > src/data/galaxyData.json"
    );
  }

  const search = await getJSON(
    `${BASE}/authors?search=${encodeURIComponent(name)}&per-page=5&mailto=${MAILTO}`
  );
  const hit = search.results?.[0];
  if (!hit) throw new Error(`No OpenAlex author found for "${name}".`);
  const rid = hit.id.replace("https://openalex.org/", "");
  process.stderr.write(
    `Matched "${name}" -> ${hit.display_name} (${rid}), ${hit.works_count} works` +
      (hit.last_known_institutions?.[0]?.display_name
        ? `, ${hit.last_known_institutions[0].display_name}`
        : "") +
      "\n"
  );
  if (search.results.length > 1) {
    process.stderr.write(
      "  Other matches: " +
        search.results
          .slice(1)
          .map((r) => `${r.display_name} (${r.id.replace("https://openalex.org/", "")})`)
          .join(", ") +
        "\n  If this isn't the right person, re-run with --id <correct OpenAlex id>.\n"
    );
  }
  return rid;
}

async function main() {
  const AUTHOR_ID = await resolveAuthorId();

  // 1. Author summary
  const author = await getJSON(`${BASE}/authors/${AUTHOR_ID}?mailto=${MAILTO}`);

  // 2. All works (paginated via cursor)
  const select = [
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

  let cursor = "*";
  const rawWorks = [];
  while (cursor) {
    const url = `${BASE}/works?filter=author.id:${AUTHOR_ID}&select=${select}&per-page=200&cursor=${encodeURIComponent(
      cursor
    )}&mailto=${MAILTO}`;
    const page = await getJSON(url);
    rawWorks.push(...page.results);
    cursor = page.meta.next_cursor;
    process.stderr.write(`fetched ${rawWorks.length}/${page.meta.count}\n`);
  }

  // 2b. Drop journal front matter (always) and any merged same-named researcher's
  // works (when disambiguation filters are set) before anything else is computed.
  const afterFrontMatter = rawWorks.filter((w) => !isFrontMatter(w));
  const frontMatterDropped = rawWorks.length - afterFrontMatter.length;
  if (frontMatterDropped > 0) {
    process.stderr.write(
      `dropped ${frontMatterDropped} front-matter entr${frontMatterDropped === 1 ? "y" : "ies"} ` +
        `(tables of contents, indexes, issue info)\n`
    );
  }
  const works = HAS_FILTERS ? afterFrontMatter.filter((w) => !isExcludedWork(w)) : afterFrontMatter;
  if (HAS_FILTERS) {
    process.stderr.write(
      `filters active (institutions: [${[...EXCLUDE_INSTITUTIONS].join(", ") || "—"}], ` +
        `co-authors: [${[...EXCLUDE_COAUTHORS].join(", ") || "—"}], ` +
        `years: ${MIN_YEAR ?? "*"}–${MAX_YEAR ?? "*"}) → kept ${works.length}/${afterFrontMatter.length} works ` +
        `(dropped ${afterFrontMatter.length - works.length})\n`
    );
  }

  if (works.length === 0) {
    throw new Error(
      HAS_FILTERS
        ? `No works left after filtering (started with ${rawWorks.length}). ` +
          "Loosen the --exclude-*/--min-year/--max-year filters."
        : `OpenAlex returned no works for author ${AUTHOR_ID}.`
    );
  }

  // 3. Normalize papers
  const authorNameLower = author.display_name.toLowerCase();
  const papers = works.map((w) => {
    const pt = w.primary_topic || null;
    const coAuthorsAll = (w.authorships || [])
      .map((a) => a.author?.display_name)
      .filter(Boolean)
      .filter((n) => n.toLowerCase() !== authorNameLower);
    // de-dupe while preserving order
    const seen = new Set();
    const coAuthors = [];
    for (const n of coAuthorsAll) {
      const k = n.toLowerCase();
      if (!seen.has(k)) {
        seen.add(k);
        coAuthors.push(n);
      }
    }
    return {
      id: w.id.replace("https://openalex.org/", ""),
      title: w.title || w.display_name || "Untitled",
      year: w.publication_year || null,
      type: w.type || null,
      venue: w.primary_location?.source?.display_name || null,
      url: w.doi || w.primary_location?.landing_page_url || w.id,
      citations: w.cited_by_count || 0,
      topic: pt?.display_name || null,
      subfield: pt?.subfield?.display_name?.replace(/\s+Research$/i, "") || null,
      field: pt?.field?.display_name || null,
      domainName: pt?.domain?.display_name || null,
      relevance: typeof pt?.score === "number" ? pt.score : 0.5,
      coAuthors: coAuthors.slice(0, 40),
      coAuthorCount: coAuthors.length,
    };
  });

  // 4. Cluster into "suns" by subfield, collapse long-tail.
  const groups = new Map();
  for (const p of papers) {
    const key = p.subfield || p.field || "Other";
    if (!groups.has(key)) groups.set(key, { name: key, field: p.field || key, papers: [] });
    groups.get(key).papers.push(p);
  }
  const sorted = [...groups.values()].sort((a, b) => b.papers.length - a.papers.length);
  const MAX_SUNS = 11;
  const MIN_PAPERS = 4;
  const SPLIT_THRESHOLD = 90;
  const MIN_TOPIC_PAPERS = 12;
  const kept = [];
  const overflow = [];
  for (const g of sorted) {
    if (kept.length < MAX_SUNS && g.papers.length >= MIN_PAPERS) kept.push(g);
    else overflow.push(g);
  }
  if (overflow.length) {
    const merged = { name: "Cross-Disciplinary", field: "Other", papers: [] };
    for (const g of overflow) merged.papers.push(...g.papers);
    if (merged.papers.length) kept.push(merged);
  }

  // A single subfield (e.g. "Molecular Biology") can dwarf the whole galaxy.
  // Break any oversized subfield into per-topic suns so the domains stay balanced.
  const finalGroups = [];
  for (const g of kept) {
    if (g.papers.length <= SPLIT_THRESHOLD || g.name === "Cross-Disciplinary") {
      finalGroups.push(g);
      continue;
    }
    const byTopic = new Map();
    for (const p of g.papers) {
      const t = p.topic || g.name;
      if (!byTopic.has(t)) byTopic.set(t, []);
      byTopic.get(t).push(p);
    }
    const remainder = [];
    for (const [topic, ps] of [...byTopic.entries()].sort((a, b) => b[1].length - a[1].length)) {
      if (ps.length >= MIN_TOPIC_PAPERS) finalGroups.push({ name: topic, field: g.field, papers: ps });
      else remainder.push(...ps);
    }
    if (remainder.length) finalGroups.push({ name: g.name, field: g.field, papers: remainder });
  }
  finalGroups.sort((a, b) => b.papers.length - a.papers.length);

  const domains = finalGroups.map((g, i) => {
    const totalCitations = g.papers.reduce((s, p) => s + p.citations, 0);
    return {
      id: `sun-${i}`,
      name: g.name,
      field: g.field,
      paperCount: g.papers.length,
      totalCitations,
    };
  });

  // assign domainId back to papers
  const out = [];
  finalGroups.forEach((g, i) => {
    for (const p of g.papers) {
      out.push({ ...p, domainId: `sun-${i}` });
    }
  });

  // 5. Whole-corpus stats
  const totalCitations = papers.reduce((s, p) => s + p.citations, 0);
  const coAuthorSet = new Set();
  for (const p of papers) for (const c of p.coAuthors) coAuthorSet.add(c.toLowerCase());
  const years = papers.map((p) => p.year).filter(Boolean);
  const firstYear = Math.min(...years);
  const lastYear = Math.max(...years);
  const mostCited = [...papers].sort((a, b) => b.citations - a.citations)[0];
  // rough words: assume ~5000 words per article-type work, ~1500 otherwise
  const estimatedWords = papers.reduce(
    (s, p) => s + (p.type === "article" ? 5000 : 1500),
    0
  );

  // 5b. Author headline stats. Whenever any works were dropped — disambiguation
  // filters and/or front-matter removal — the OpenAlex author object still
  // reflects the *full/merged* profile, so recompute every headline figure from
  // the kept works only to keep `author.*` consistent with `stats`/`papers`.
  const RECOMPUTE_STATS = HAS_FILTERS || frontMatterDropped > 0;
  const computeHIndex = (cites) => {
    const desc = [...cites].sort((a, b) => b - a);
    let h = 0;
    for (let i = 0; i < desc.length; i++) if (desc[i] >= i + 1) h = i + 1;
    return h;
  };
  const computeCountsByYear = () => {
    const byYear = new Map();
    for (const w of works) {
      const y = w.publication_year;
      if (!y) continue;
      const e = byYear.get(y) || { year: y, works_count: 0, cited_by_count: 0 };
      e.works_count += 1;
      e.cited_by_count += w.cited_by_count || 0;
      byYear.set(y, e);
    }
    return [...byYear.values()].sort((a, b) => a.year - b.year);
  };
  // Most frequent institution across the author's own authorships in kept works.
  const computeInstitution = () => {
    const counts = new Map();
    for (const w of works) {
      for (const a of w.authorships || []) {
        if (a.author?.id && stripId(a.author.id) !== AUTHOR_ID) continue;
        for (const inst of a.institutions || []) {
          const name = inst?.display_name;
          if (name) counts.set(name, (counts.get(name) || 0) + 1);
        }
      }
    }
    let best = null;
    let bestN = 0;
    for (const [name, n] of counts) if (n > bestN) ((best = name), (bestN = n));
    return best;
  };

  const citationsList = papers.map((p) => p.citations);
  const authorBlock = RECOMPUTE_STATS
    ? {
        name: author.display_name,
        openAlexId: AUTHOR_ID,
        institution:
          computeInstitution() ||
          (author.last_known_institutions || [])[0]?.display_name ||
          null,
        hIndex: computeHIndex(citationsList),
        i10Index: citationsList.filter((c) => c >= 10).length,
        worksCount: papers.length,
        citedByCount: totalCitations,
        countsByYear: computeCountsByYear(),
        orcid: author.orcid || null,
      }
    : {
        name: author.display_name,
        openAlexId: AUTHOR_ID,
        institution:
          (author.last_known_institutions || [])[0]?.display_name ||
          author.affiliations?.[0]?.institution?.display_name ||
          null,
        hIndex: author.summary_stats?.h_index ?? null,
        i10Index: author.summary_stats?.i10_index ?? null,
        worksCount: author.works_count,
        citedByCount: author.cited_by_count,
        countsByYear: (author.counts_by_year || []).sort((a, b) => a.year - b.year),
        orcid: author.orcid || null,
      };

  const data = {
    author: authorBlock,
    stats: {
      totalPapers: papers.length,
      totalCitations,
      uniqueCoAuthors: coAuthorSet.size,
      firstYear,
      lastYear,
      yearsActive: lastYear - firstYear,
      domainCount: domains.length,
      estimatedWords,
      avgCitations: Math.round(totalCitations / papers.length),
      mostCited: { title: mostCited.title, citations: mostCited.citations, year: mostCited.year },
    },
    domains,
    papers: out,
  };

  process.stdout.write(JSON.stringify(data));
  process.stderr.write(
    `\nDONE: ${papers.length} papers, ${domains.length} suns, ${coAuthorSet.size} co-authors, ${totalCitations} citations\n`
  );
  process.stderr.write(`Suns:\n`);
  for (const d of domains) process.stderr.write(`  ${d.name} (${d.field}) — ${d.paperCount} papers, ${d.totalCitations} cites\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
