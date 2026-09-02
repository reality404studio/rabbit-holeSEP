#!/usr/bin/env node
/* 지도 검사기 — 손으로 붙여넣은 10배치는 반드시 어딘가 빠진다.
   사람이 "다 됐다"고 판단하기 전에 기계가 먼저 반증을 시도한다.
   (design/detection-failures.md 의 교훈: 검사기가 조용하면 그건 무결점이 아니라 미검출이다)

   사용:  node map/validate.mjs map/fields.json map/assign.jsonl  */

import { readFileSync } from "node:fs";

const [, , fieldsPath, assignPath] = process.argv;
if (!fieldsPath || !assignPath) {
  console.error("사용: node map/validate.mjs map/fields.json map/assign.jsonl");
  process.exit(2);
}

const entries = JSON.parse(readFileSync("data/entries.json", "utf8"));
const map = JSON.parse(readFileSync(fieldsPath, "utf8"));
const lines = readFileSync(assignPath, "utf8").split("\n").filter((l) => l.trim());

const fieldIds = new Set(map.fields.map((f) => f.id));
const axisIds = new Set(map.axes.map((a) => a.id));
const allSlugs = new Set(entries.map((e) => e.slug));

const problems = [];
const seen = new Map();
const fieldCount = new Map();
const axisCount = new Map();
let lowConf = 0;

lines.forEach((line, i) => {
  const at = `${assignPath}:${i + 1}`;
  let r;
  try {
    r = JSON.parse(line);
  } catch {
    problems.push([at, "JSON 파싱 실패"]);
    return;
  }
  if (!allSlugs.has(r.slug)) problems.push([at, `SEP 목록에 없는 slug: ${r.slug}`]);
  if (seen.has(r.slug)) problems.push([at, `중복 배정 (앞서 ${seen.get(r.slug)})`]);
  else seen.set(r.slug, at);

  if (!fieldIds.has(r.f)) problems.push([at, `분류 체계에 없는 분야: ${r.f}`]);
  else fieldCount.set(r.f, (fieldCount.get(r.f) ?? 0) + 1);

  for (const f of r.f2 ?? [])
    if (!fieldIds.has(f)) problems.push([at, `없는 부 분야: ${f}`]);
  for (const a of r.ax ?? []) {
    if (!axisIds.has(a)) problems.push([at, `없는 문제축: ${a}`]);
    else axisCount.set(a, (axisCount.get(a) ?? 0) + 1);
  }
  if (r.c === "l") lowConf++;
});

const missing = [...allSlugs].filter((s) => !seen.has(s));

/* ── 보고 ── */
console.log(`항목       ${seen.size} / ${allSlugs.size} 배정됨`);
console.log(`분야       ${fieldIds.size}개 · 문제축 ${axisIds.size}개`);
console.log(`확신도 낮음 ${lowConf}개 (${((lowConf / lines.length) * 100).toFixed(1)}%)`);

if (missing.length) {
  console.log(`\n★ 배정 안 된 항목 ${missing.length}개 — 배치 출력이 잘린 것이다`);
  console.log("  " + missing.slice(0, 20).join(", ") + (missing.length > 20 ? " …" : ""));
}

const empty = [...fieldIds].filter((f) => !fieldCount.has(f));
if (empty.length) console.log(`\n★ 항목이 하나도 없는 분야: ${empty.join(", ")}`);

const fat = [...fieldCount.entries()].filter(([, n]) => n > 120).sort((a, b) => b[1] - a[1]);
if (fat.length) {
  console.log(`\n★ 120개를 넘는 분야 — 후보 추출에 쓰기엔 너무 크다`);
  fat.forEach(([f, n]) => console.log(`  ${f}: ${n}개`));
}

/* 문제축이 실제로 분야를 가로지르는지 — 한 분야 안에만 있으면 축이 아니다 */
const axisFields = new Map();
lines.forEach((line) => {
  try {
    const r = JSON.parse(line);
    for (const a of r.ax ?? []) {
      if (!axisFields.has(a)) axisFields.set(a, new Set());
      axisFields.get(a).add(r.f);
    }
  } catch {}
});
const narrow = [...axisIds].filter((a) => (axisFields.get(a)?.size ?? 0) < 3);
if (narrow.length) {
  console.log(`\n★ 3개 분야에 못 걸친 문제축 — 축이 아니라 하위 주제다`);
  narrow.forEach((a) => console.log(`  ${a}: ${axisFields.get(a)?.size ?? 0}개 분야`));
}

if (problems.length) {
  console.log(`\n★ 오류 ${problems.length}건`);
  problems.slice(0, 30).forEach(([at, m]) => console.log(`  ${at}  ${m}`));
  if (problems.length > 30) console.log(`  … 외 ${problems.length - 30}건`);
}

const ok = !problems.length && !missing.length && !empty.length;
console.log(`\n${ok ? "통과" : "★ 미통과 — 위 항목을 고치고 다시 돌릴 것"}`);
process.exit(ok ? 0 : 1);
