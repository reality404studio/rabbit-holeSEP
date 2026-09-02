/**
 * 회차 기록 — 모델 응답 JSON → 검증 → content/ 에 커밋 가능한 파일로.
 *
 * 이전에는 이 검증이 src/app/api/match/route.ts 안에서 요청마다 돌았다.
 * 발행이 커밋이 된 뒤로 호출자는 브라우저가 아니라 사람이므로, 같은 규칙이
 * 빌드 이전 단계로 내려왔다. 이 스크립트는 모델을 부르지 않는다 —
 * 부르는 방법(로컬 세션 / API)과 기록하는 방법을 일부러 갈라놨다.
 *
 *   npx tsx scripts/ingest.ts --question "<질문>" --response <응답.json>
 *
 * 두 가지를 쓴다:
 *   content/issues/<id>.json    pamphlet 이 있고 유효할 때만. 사이트가 읽는다
 *   content/log/<YYYY-MM>.jsonl 언제나. 발행 안 된 회차도 여기 남는다
 *
 * 낙방 기록이 이 프로젝트의 자산이다. 발행분 12개보다 낙방 100개가
 * "편집자가 무엇을 도록감으로 보는가" 를 훨씬 많이 말한다.
 */

import fs from "node:fs";
import path from "node:path";
import { entries, isValidSlug, sepUrl } from "../src/lib/entries";
import { spreadLine, spreadOf } from "../src/lib/baseline";
import {
  MODEL_ID,
  MODEL_NAME,
  type Issue,
  type Omitted,
  type SerializedRoute,
} from "../src/lib/issues";

const MAX_ROUTES = 3;
const MAX_ENTRIES_PER_ROUTE = 6;
const NOTE_MIN = 8;
const NOTE_MAX = 400;
const BODY_MIN = 300;
const BODY_MAX = 6000;
const PATTERN_MAX = 200;

/* tsx 가 CJS 로 컴파일하면 import.meta.dirname 이 undefined 다.
   `npm run ingest` 는 언제나 리포 루트에서 돌므로 cwd 를 쓴다. */
const ROOT = process.cwd();
const ISSUES = path.join(ROOT, "content", "issues");
const LOG = path.join(ROOT, "content", "log");

type ParsedEntry = { slug: string; reason: string };
type ParsedRoute = {
  frame: string;
  gloss: string;
  pattern?: string;
  entries: ParsedEntry[];
};
type ParsedPamphlet = { note: string; body: string };

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/** 모델 출력이 markdown 코드펜스로 감싸여 오는 경우가 있다 */
function parseModelJson(
  text: string,
): { routes: ParsedRoute[]; pamphlet?: ParsedPamphlet } | null {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/, "")
    .replace(/\s*```$/, "");
  try {
    const obj = JSON.parse(cleaned);
    if (!obj || !Array.isArray(obj.routes)) return null;

    const routes: ParsedRoute[] = [];
    for (const r of obj.routes) {
      if (
        typeof r !== "object" ||
        r === null ||
        typeof r.frame !== "string" ||
        typeof r.gloss !== "string" ||
        !Array.isArray(r.entries)
      ) {
        continue;
      }
      routes.push({
        frame: r.frame,
        gloss: r.gloss,
        pattern: typeof r.pattern === "string" ? r.pattern : undefined,
        entries: r.entries.filter(
          (e: unknown): e is ParsedEntry =>
            typeof e === "object" &&
            e !== null &&
            typeof (e as { slug: unknown }).slug === "string" &&
            typeof (e as { reason: unknown }).reason === "string",
        ),
      });
    }

    let pamphlet: ParsedPamphlet | undefined;
    if (
      obj.pamphlet &&
      typeof obj.pamphlet === "object" &&
      typeof obj.pamphlet.note === "string" &&
      typeof obj.pamphlet.body === "string"
    ) {
      pamphlet = { note: obj.pamphlet.note, body: obj.pamphlet.body };
    }
    return { routes, pamphlet };
  } catch {
    return null;
  }
}

/** Sortable ID — KST 기반 'YYYYMMDD-HHmmss-xxxx'. 사전순 = 시간순 */
function makeId(d: Date): string {
  const k = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  const rand = Math.random().toString(36).slice(2, 6);
  return (
    `${k.getUTCFullYear()}${p(k.getUTCMonth() + 1)}${p(k.getUTCDate())}` +
    `-${p(k.getUTCHours())}${p(k.getUTCMinutes())}${p(k.getUTCSeconds())}-${rand}`
  );
}

function main() {
  const question = (arg("question") ?? "").trim();
  const responsePath = arg("response");

  if (!question || !responsePath) {
    console.error(
      '사용법: npx tsx scripts/ingest.ts --question "<질문>" --response <응답.json>',
    );
    process.exit(1);
  }

  const parsed = parseModelJson(fs.readFileSync(responsePath, "utf8"));
  if (!parsed) {
    console.error("응답 파싱 실패 — routes 배열이 있는 JSON 이 아닙니다.");
    process.exit(1);
  }

  /* ── 검증 ── 목록에 없는 슬러그는 조용히 사라지지 않고 「미출품」이 된다 ── */
  const routes: SerializedRoute[] = [];
  const omitted: Omitted[] = [];

  for (const r of parsed.routes.slice(0, MAX_ROUTES)) {
    const frame = r.frame.trim();
    const gloss = r.gloss.trim();
    if (!frame || !gloss) continue;
    /* 「공유 구조」— 갈래를 토픽 묶음이 아니게 하는 한 줄. 길이만 자르고
       있고 없고는 막지 않는다. 이전 발행분에는 없다 */
    const pattern = r.pattern?.trim().slice(0, PATTERN_MAX) || undefined;

    const kept = [];
    for (const e of r.entries.slice(0, MAX_ENTRIES_PER_ROUTE)) {
      if (!isValidSlug(e.slug)) {
        if (!omitted.some((o) => o.slug === e.slug)) {
          omitted.push({ slug: e.slug, why: "SEP 목록에 없는 항목" });
        }
        continue;
      }
      kept.push({
        slug: e.slug,
        title: entries.find((x) => x.slug === e.slug)?.title ?? e.slug,
        reason: e.reason,
        url: sepUrl(e.slug),
      });
    }
    if (kept.length) routes.push({ frame, gloss, pattern, entries: kept });
  }

  const now = new Date();
  const id = makeId(now);
  const issuedAt = now.toISOString();

  /* ── 발행 판정 ── 모델이 pamphlet 을 채웠고, 길이가 규약 안이고,
        route 가 실제로 살아남았을 때만 봉인한다 ── */
  let published = false;
  let why = "";

  if (!parsed.pamphlet) {
    why = "모델이 pamphlet 을 발행하지 않음";
  } else if (routes.length === 0) {
    why = "검증 후 살아남은 route 가 없음";
  } else {
    const note = parsed.pamphlet.note.trim();
    const body = parsed.pamphlet.body.trim();
    if (note.length < NOTE_MIN || note.length > NOTE_MAX) {
      why = `큐레이터 노트 길이 위반 (${note.length}자, 허용 ${NOTE_MIN}–${NOTE_MAX})`;
    } else if (body.length < BODY_MIN || body.length > BODY_MAX) {
      why = `본문 길이 위반 (${body.length}자, 허용 ${BODY_MIN}–${BODY_MAX})`;
    } else {
      const issue: Issue = {
        id,
        issuedAt,
        modelId: MODEL_ID,
        modelName: MODEL_NAME,
        userQuestion: question,
        curatorNote: note,
        body,
        routes,
        omitted,
      };
      fs.mkdirSync(ISSUES, { recursive: true });
      fs.writeFileSync(
        path.join(ISSUES, `${id}.json`),
        JSON.stringify(issue, null, 2) + "\n",
      );
      published = true;
    }
  }

  /* ── 로그 ── 발행 여부와 무관하게 언제나 남는다 ── */
  fs.mkdirSync(LOG, { recursive: true });
  const month = issuedAt.slice(0, 7);
  fs.appendFileSync(
    path.join(LOG, `${month}.jsonl`),
    JSON.stringify({
      id,
      askedAt: issuedAt,
      modelId: MODEL_ID,
      question,
      routes,
      omitted,
      published,
      ...(published ? {} : { why }),
    }) + "\n",
  );

  const n = routes.reduce((s, r) => s + r.entries.length, 0);
  /* 동결 지도와의 대조. 저장하지 않는다 — routes 에서 언제든 다시 나오고,
     지면도 빌드 때 계산한다 (src/lib/baseline.ts) */
  console.log(
    `${published ? "봉인됨" : "미발행"}  ${id}\n` +
      `  route ${routes.length} · 항목 ${n} · 미출품 ${omitted.length}\n` +
      `  ${spreadLine(spreadOf(routes))}\n` +
      (published ? `  → content/issues/${id}.json` : `  → 이유: ${why}`) +
      `\n  → content/log/${month}.jsonl`,
  );
}

main();
