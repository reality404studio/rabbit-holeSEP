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
/* cheerio 1.0 은 노드 타입을 domhandler 에서 재수출한다 (전이 의존성) */
import type { Element } from "domhandler";
import { writeFile, mkdir, readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";

const TOC_URL = "https://plato.stanford.edu/contents.html";
const OUTPUT_PATH = resolve(process.cwd(), "data/entries.json");

type Entry = { title: string; slug: string };

/* --html <file> 로 받아둔 목차를 다시 쓸 수 있다. 스크레이퍼를 고칠 때
   SEP 를 반복해서 때리지 않기 위한 것이다 */
async function fetchToc(): Promise<string> {
  const i = process.argv.indexOf("--html");
  if (i >= 0 && process.argv[i + 1]) {
    console.log(`Reading ${process.argv[i + 1]} (offline)...`);
    return readFile(process.argv[i + 1], "utf8");
  }

  console.log(`Fetching ${TOC_URL}...`);
  const res = await fetch(TOC_URL, {
    headers: {
      "User-Agent":
        "sep-rabbithole-indexer/0.1 (one-time TOC fetch for entry index; respects 5s crawl-delay and ToU)",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${TOC_URL}`);
  return res.text();
}

async function main() {
  const $ = load(await fetchToc());

  const entries: Entry[] = [];
  const seen = new Set<string>();

  /* SEP 목차는 하위 항목을 부모 <li> 안의 <ul> 로 중첩시키고, 앵커에는
     *접미사만* 넣는다:

       <li> <a href="entries/identity/"><strong>identity</strong></a>
         <ul><li> <a href="entries/identity-time/"><strong>over time</strong></a>

     앵커 텍스트만 읽으면 "over time" 이 되어 부모를 잃는다. 조상 <li> 를
     거슬러 올라가 "identity: over time" 으로 복원한다 — 목차가 상호참조를
     적을 때 쓰는 형식("reasoning: defeasible")이 그대로 정답 형식이다.

     정의(definition)와 상호참조("… — see …")를 가르는 것은 <strong> 이다.
     정의 앵커만 <strong> 을 갖고, 상호참조 앵커는 이미 완전한 제목을 갖는다. */
  /* 묶음 <li> 의 이름. 두 형태가 있다:
       <li> <a href="entries/identity/"><strong>identity</strong></a> <ul>…   ← 항목이면서 부모
       <li> aesthetics <ul>…                                                  ← 항목이 아닌 순수 묶음
     후자는 앵커가 없다 ("aesthetics" 라는 SEP 항목이 없으므로). 그래서 앵커의
     <strong> 이 없으면 <li> 의 직계 텍스트로 떨어진다 — 중첩 목록은 걷어내고. */
  const labelOf = (li: Element): string => {
    const strong = $(li).children("a").first().children("strong").first().text().trim();
    if (strong) return strong;
    const clone = $(li).clone();
    clone.children("ul, ol").remove();
    return clone.text().replace(/\s+/g, " ").trim();
  };

  const titleOf = (el: Element): string => {
    const $a = $(el);
    const parts = [$a.text().trim()];
    /* parents() 는 가까운 것부터 준다. 첫 번째는 이 앵커 자신의 <li> 이므로
       빼야 한다 — 안 빼면 "zombies: zombies" 가 된다 */
    $a.parents("li").slice(1).each((_, li) => {
      const t = labelOf(li);
      if (t) parts.unshift(t);
    });
    return parts.join(": ");
  };

  const slugOf = (href: string): string | null =>
    href.match(/^entries\/([^/]+)\/?$/)?.[1] ?? null;

  // 1차 — 정의 앵커. 조상 체인으로 제목을 복원한다
  $("#content a[href^='entries/']").each((_, el) => {
    if ($(el).children("strong").length === 0) return;
    const slug = slugOf($(el).attr("href")!);
    if (!slug || seen.has(slug)) return;
    const title = titleOf(el);
    if (!title) return;
    seen.add(slug);
    entries.push({ title, slug });
  });

  // 2차 — 상호참조 앵커. 정의가 없는 슬러그만 주워담는다 (제목이 이미 완전하다)
  $("#content a[href^='entries/']").each((_, el) => {
    if ($(el).children("strong").length > 0) return;
    const slug = slugOf($(el).attr("href")!);
    if (!slug || seen.has(slug)) return;
    const title = $(el).text().trim();
    if (!title) return;
    seen.add(slug);
    entries.push({ title, slug });
  });

  entries.sort((a, b) => a.title.localeCompare(b.title));

  const o = process.argv.indexOf("--out");
  const outPath = o >= 0 && process.argv[o + 1]
    ? resolve(process.cwd(), process.argv[o + 1])
    : OUTPUT_PATH;

  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify(entries, null, 2) + "\n", "utf8");

  console.log(`Wrote ${entries.length} entries → ${outPath}`);
  console.log(`First 3:`, entries.slice(0, 3));
  console.log(`Last 3:`, entries.slice(-3));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
