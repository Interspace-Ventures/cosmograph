// One-time OpenAlex fetch -> baked static snapshot for the Galaxy app.
// Author: Mahendra S. Rao (A5111365293)
const AUTHOR_ID = "A5111365293";
const MAILTO = "galaxy-gift@example.com";
const BASE = "https://api.openalex.org";

async function getJSON(url) {
  const res = await fetch(url, { headers: { "User-Agent": `galaxy-app (mailto:${MAILTO})` } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

async function main() {
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

  const domains = kept.map((g, i) => {
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
  kept.forEach((g, i) => {
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
