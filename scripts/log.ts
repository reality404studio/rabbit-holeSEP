/**
 * 낙방 기록 읽기 — content/log/ 를 사람이 읽는 형태로 편다.
 *
 *   npm run log            이번 달
 *   npm run log -- 2026-09 그 달
 *   npm run log -- all     전부
 *
 * 발행분은 사이트가 보여준다. 이 스크립트가 보여주는 것은 그 반대쪽이다 —
 * 편집자가 무엇을 도록감으로 보지 *않았는가*. 발행률과 낙방 사유가 쌓여야
 * "무슨 기준인지" 가 추측이 아니라 데이터가 된다.
 */

import fs from "node:fs";
import path from "node:path";

type Verdict = { issue: boolean; why: string; closest: string | null };
type Row = {
  id: string;
  askedAt: string;
  question: string;
  routes: { frame: string }[];
  published: boolean;
  verdict: Verdict | null;
  verdictMismatch?: boolean;
  why?: string;
};

const LOG = path.join(process.cwd(), "content", "log");

function monthKST(): string {
  const k = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return `${k.getUTCFullYear()}-${String(k.getUTCMonth() + 1).padStart(2, "0")}`;
}

function read(file: string): Row[] {
  return fs
    .readFileSync(file, "utf8")
    .split("\n")
    .filter(Boolean)
    .flatMap((l) => {
      try {
        return [JSON.parse(l) as Row];
      } catch {
        return []; // 깨진 줄 하나가 나머지를 막지 않는다
      }
    });
}

function main() {
  const which = process.argv[2] ?? monthKST();

  let files: string[];
  try {
    files = fs
      .readdirSync(LOG)
      .filter((f) => f.endsWith(".jsonl"))
      .filter((f) => which === "all" || f === `${which}.jsonl`)
      .sort();
  } catch {
    files = [];
  }

  if (files.length === 0) {
    console.log(
      `기록 없음 (${which}). 아직 아무것도 묻지 않았거나 ingest 를 돌리지 않았습니다.`,
    );
    return;
  }

  const rows = files.flatMap((f) => read(path.join(LOG, f)));
  const issued = rows.filter((r) => r.published);
  const rate = rows.length ? ((issued.length / rows.length) * 100).toFixed(0) : "0";

  console.log(
    `${which}  —  ${rows.length}회 물었고 ${issued.length}회 봉인됐습니다 (발행률 ${rate}%)\n`,
  );

  for (const r of rows) {
    const v = r.verdict;
    console.log(`${r.published ? "●" : "○"} ${r.question}`);
    console.log(`   ${r.id} · route ${r.routes.length}`);
    console.log(`   판정: ${v?.why ?? "(모델이 verdict 를 남기지 않았다)"}`);
    if (v?.closest) console.log(`   근접: ${v.closest}`);
    if (!r.published && r.why && r.why !== "모델이 pamphlet 을 발행하지 않음") {
      console.log(`   검증 탈락: ${r.why}`);
    }
    if (r.verdictMismatch) {
      console.log(`   ⚠ 말과 행동이 갈렸다 — verdict.issue 와 pamphlet 유무 불일치`);
    }
    console.log();
  }

  /* 갈래 이름은 모델이 매번 새로 짓는다. 반복되는 이름이 보이면 그건
     조작이 아니라 라벨로 굳고 있다는 뜻이다 */
  const frames = new Map<string, number>();
  for (const r of rows) {
    for (const f of r.routes) frames.set(f.frame, (frames.get(f.frame) ?? 0) + 1);
  }
  const repeated = [...frames.entries()].filter(([, n]) => n > 1);
  if (repeated.length) {
    console.log("두 번 이상 나온 갈래 이름 (라벨로 굳고 있다는 신호):");
    for (const [f, n] of repeated.sort((a, b) => b[1] - a[1])) {
      console.log(`   ${n}회  ${f}`);
    }
  }
}

main();
