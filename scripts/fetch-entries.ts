/**
 * Fetch Stanford Encyclopedia of Philosophy table of contents,
 * extract { title, slug } for every entry, write to data/entries.json.
 *
 * Run once: `npm run fetch-entries`
 *
 * SEP ToU: "users may crawl each entry for indexing
 * (subject to reasonable network usage constraints)"
 * — we fetch exactly one page (contents.html), no per-entry crawling.
 */

import { load } from "cheerio";
import { writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";

const TOC_URL = "https://plato.stanford.edu/contents.html";
const OUTPUT_PATH = resolve(process.cwd(), "data/entries.json");

type Entry = { title: string; slug: string };

async function main() {
  console.log(`Fetching ${TOC_URL}...`);
  const res = await fetch(TOC_URL, {
    headers: {
      "User-Agent":
        "sep-rabbithole-indexer/0.1 (one-time TOC fetch for entry index; respects 5s crawl-delay and ToU)",
    },
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} fetching ${TOC_URL}`);
  }

  const html = await res.text();
  const $ = load(html);

  const entries: Entry[] = [];
  const seen = new Set<string>();

  // SEP entry links have href like "entries/<slug>/" — anchor inside #content
  $("#content a[href^='entries/']").each((_, el) => {
    const href = $(el).attr("href")!;
    const match = href.match(/^entries\/([^/]+)\/?$/);
    if (!match) return;
    const slug = match[1];
    if (seen.has(slug)) return;

    const title = $(el).text().trim();
    if (!title) return;

    seen.add(slug);
    entries.push({ title, slug });
  });

  entries.sort((a, b) => a.title.localeCompare(b.title));

  await mkdir(dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, JSON.stringify(entries, null, 2) + "\n", "utf8");

  console.log(`Wrote ${entries.length} entries → ${OUTPUT_PATH}`);
  console.log(`First 3:`, entries.slice(0, 3));
  console.log(`Last 3:`, entries.slice(-3));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
