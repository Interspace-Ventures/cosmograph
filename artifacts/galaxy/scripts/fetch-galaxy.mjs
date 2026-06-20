// One-time OpenAlex fetch -> baked static snapshot for the Galaxy app.
//
// Generate the galaxy for ANY scientist — this app ships with no hardcoded
// identity; everything the UI shows comes from the snapshot this script writes.
//
// Usage (writes JSON to stdout — redirect into the data file):
//   node scripts/fetch-galaxy.mjs --name "Ada Lovelace"   > src/data/galaxyData.json
//   node scripts/fetch-galaxy.mjs --id A5111365293         > src/data/galaxyData.json
// You can also use env vars: GALAXY_AUTHOR_NAME or GALAXY_AUTHOR_ID.
// Set a contact email with --mailto you@example.com (OpenAlex etiquette).
const BASE = "https://api.openalex.org";

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--name") out.name = argv[++i];
    else if (a === "--id" || a === "--author") out.id = argv[++i];
    else if (a === "--mailto") out.mailto = argv[++i];
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const MAILTO = args.mailto || process.env.GALAXY_MAILTO || "galaxy-gift@example.com";

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
  const works = [];
  while (cursor) {
    const url = `${BASE}/works?filter=author.id:${AUTHOR_ID}&select=${select}&per-page=200&cursor=${encodeURIComponent(
      cursor
    )}&mailto=${MAILTO}`;
    const page = await getJSON(url);
    works.push(...page.results);
    cursor = page.meta.next_cursor;
    process.stderr.write(`fetched ${works.length}/${page.meta.count}\n`);
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
      subfield: pt?.subfield?.display_name || null,
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

  const data = {
    author: {
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
    },
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
