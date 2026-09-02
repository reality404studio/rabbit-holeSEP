/**
 * 기준선(baseline) — 동결된 지도와의 대조.
 *
 * `data/baseline.json` 은 페이블이 프롬프트 없이 SEP 1,859항목을 분류했을 때
 * 나온 좌표계다 (map/README.md). 이 사이트는 그것으로 후보를 줄이지 **않는다**.
 * 후보를 줄이면 모델만이 볼 수 있는 연결부터 잘려 나가기 때문이다.
 *
 * 남은 용도는 측정이다. 큐레이션이 고른 항목들이 기준선의 몇 개 분야에
 * 흩어져 있는지 세면, 이 회차가 "사조 대입"에 머물렀는지 실제로 가로질렀는지가
 * 숫자로 남는다. 모델에게는 이 숫자를 보여주지 않는다 — 보여주면 숫자를
 * 맞추려 들고, 그러면 자(尺)가 목표가 된다.
 */

import baselineJson from "../../data/baseline.json";

type Baseline = {
  frozen: string;
  fields: Record<string, string>;
  field_of: Record<string, string>;
};

const baseline = baselineJson as Baseline;

export const BASELINE_FROZEN = baseline.frozen;
export const BASELINE_FIELD_COUNT = Object.keys(baseline.fields).length;

export type SpreadField = { id: string; ko: string; n: number };
export type Spread = {
  /** 이 회차가 닿은 분야 (많이 닿은 순) */
  fields: SpreadField[];
  /** 서로 다른 분야 수 */
  distinct: number;
  /** 기준선의 분야 수 (분모) */
  total: number;
  /** 기준선에 없는 슬러그 — 동결 시점에 배정이 잘린 2개 등 */
  unmapped: string[];
};

export function fieldOf(slug: string): string | undefined {
  return baseline.field_of[slug];
}

export function spreadOf(routes: { entries: { slug: string }[] }[]): Spread {
  const count = new Map<string, number>();
  const unmapped: string[] = [];
  const seen = new Set<string>();
  for (const r of routes) {
    for (const e of r.entries) {
      if (seen.has(e.slug)) continue;
      seen.add(e.slug);
      const f = baseline.field_of[e.slug];
      if (!f) {
        unmapped.push(e.slug);
        continue;
      }
      count.set(f, (count.get(f) ?? 0) + 1);
    }
  }
  const fields = [...count.entries()]
    .map(([id, n]) => ({ id, ko: baseline.fields[id] ?? id, n }))
    .sort((a, b) => b.n - a.n || a.id.localeCompare(b.id));
  return {
    fields,
    distinct: fields.length,
    total: BASELINE_FIELD_COUNT,
    unmapped,
  };
}

/** 크레딧 한 줄 — "분야 4 / 45 · 의식과 심신 문제 2, 중세 논리·의미론 이론 1, …" */
export function spreadLine(s: Spread): string {
  const head = `분야 ${s.distinct} / ${s.total}`;
  if (s.fields.length === 0) return head;
  const tail = s.fields.map((f) => `${f.ko} ${f.n}`).join(", ");
  return `${head} · ${tail}`;
}
