#!/usr/bin/env node
/* 지도 동결 — 10배치 출력을 한 파일로 잇고, 런타임이 읽는 기준선을 만든다.

   이 지도는 더 이상 라우팅에 쓰지 않는다 (map/README.md). 남은 용도는 하나 —
   페이블이 프롬프트 없이 어디로 수렴하는지(모델의 평균)를 고정해 두고,
   런타임 큐레이션이 그 평균을 얼마나 가로질렀는지 재는 자(尺)다.

   사용:  node map/freeze.mjs
   출력:  map/fable5.1/assign.jsonl   (배치 10개를 순서대로 이은 원본)
          data/baseline.json          (slug → 분야 id, 분야 id → 한국어 이름)

   재실행해도 결과는 같다. 배치 파일을 손대지 않는 한 동결은 유지된다. */

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const MAP = join(ROOT, "map", "fable5.1");
const FIELDS = join(MAP, "fields.json");
const BATCHES = join(MAP, "batchs");

const fields = JSON.parse(readFileSync(FIELDS, "utf8"));
const entries = JSON.parse(readFileSync(join(ROOT, "data", "entries.json"), "utf8"));
const known = new Set(entries.map((e) => e.slug));
const fieldIds = new Set(fields.fields.map((f) => f.id));

const lines = [];
for (const name of readdirSync(BATCHES).filter((n) => /^\d+\.txt$/.test(n)).sort()) {
  for (const raw of readFileSync(join(BATCHES, name), "utf8").split("\n")) {
    const line = raw.trim();
    if (line.startsWith("{")) lines.push(line);
  }
}
writeFileSync(join(MAP, "assign.jsonl"), lines.join("\n") + "\n");

const fieldOf = {};
let dropped = 0;
for (const line of lines) {
  let r;
  try {
    r = JSON.parse(line);
  } catch {
    dropped++;
    continue;
  }
  if (!known.has(r.slug) || !fieldIds.has(r.f) || fieldOf[r.slug]) {
    dropped++;
    continue;
  }
  fieldOf[r.slug] = r.f;
}

const fieldKo = Object.fromEntries(fields.fields.map((f) => [f.id, f.ko]));
const baseline = {
  frozen: "2026-09-03",
  source: "map/fable5.1 — Claude Fable 5.1 이 PROMPT-1/PROMPT-2 로 한 번 만든 분류. 동결.",
  fields: fieldKo,
  field_of: fieldOf,
};
writeFileSync(
  join(ROOT, "data", "baseline.json"),
  JSON.stringify(baseline, null, 0) + "\n",
);

const missing = entries.filter((e) => !fieldOf[e.slug]).map((e) => e.slug);
console.log(`배정 ${Object.keys(fieldOf).length} / ${entries.length}  (버림 ${dropped})`);
if (missing.length) console.log(`기준선에 없는 항목: ${missing.join(", ")}`);
console.log("→ map/fable5.1/assign.jsonl, data/baseline.json");
