/* 리플렛 구성 요소 — 아트 디렉션 design/v12-하강.html

   판형은 신문이 아니라 프라이빗 전시의 리플렛이다(에디션 1부).
   조판 결정은 전부 데이터에서 유도된다. 하드코딩된 섹션도, 손으로 민 칸도 없다. */

import Link from "next/link";
import type { ReactNode } from "react";

export type Entry = {
  slug: string;
  title: string;
  reason: string;
  url: string;
};

export type Route = {
  frame: string;
  gloss: string;
  /** 이 route 의 항목들이 공유하는 구조 — 갈래를 토픽 묶음이 아니게 하는 한 줄 */
  pattern?: string;
  entries: Entry[];
};

/** route.ts 의 검증에서 탈락해 지면에 오르지 못한 항목 */
export type Omitted = { slug: string; why: string };

export const COLS = 6;

export type Placement = {
  /** 격자 시작 칸 (1-based) */
  c1: number;
  /** 격자 끝 칸 + 1. 지면을 넘으면 COLS+1 에서 잘린다 */
  c2: number;
  /** 지면을 넘긴 칸 수 = 재단면 침범 */
  bleed: number;
  /** 앞 블록과 칸이 안 겹쳐서 세로로 겹칠 수 있는가 */
  overlap: boolean;
  /** 이 route 의 첫 출품 번호 (전관 통합 연속) */
  firstNo: number;
  /** 차지하는 칸 수 */
  span: number;
};

/* ─ 격자 유도 ─ 발명하지 않는다.
     span  = max(2, COLS − route 순번)   깊을수록 좁다. 굴이 좁아진다
     c1    = 출품 번호 % 남는 자리        체크리스트 번호가 곧 좌표
     침범  = c1+span 이 지면을 넘긴 만큼   손으로 민 것이 아니라 규칙의 산물
     겹침  = 앞 블록과 칸이 안 겹치면      지면이 자기 자리를 협상한다

   질문이 바뀌면 route 수와 entry 수가 바뀌므로 지면 기하가 실제로 바뀐다.
   OASE 의 "매 호 다른 시스템" 이 은유가 아니라 기계적으로 성립하는 지점. */
export function planLayout(routes: Route[]): Placement[] {
  const out: Placement[] = [];
  let no = 0;
  let prev: { c1: number; raw: number } | null = null;

  routes.forEach((r, i) => {
    const firstNo = no + 1;
    const span = Math.max(2, COLS - i);
    const room = COLS - span + 2;
    const c1 = ((firstNo - 1) % room) + 1;
    const raw = c1 + span;
    const c2 = Math.min(raw, COLS + 1);
    const intersects = prev ? !(c1 >= prev.raw || raw <= prev.c1) : true;

    out.push({ c1, c2, bleed: raw - c2, overlap: !intersects, firstNo, span });
    prev = { c1, raw };
    no += r.entries.length;
  });

  return out;
}

/** 크레딧의 「판짜기」 항목 — 이 회차에만 유효한 배치임을 지면에 밝힌다 */
export function gridSignature(plan: Placement[]): string {
  return plan.map((p) => `${p.c1}–${p.c1 + p.span - 1}`).join("  ");
}

function bandStyle(p: Placement): React.CSSProperties {
  const s: Record<string, string | number> = { "--c1": p.c1, "--c2": p.c2 };
  if (p.bleed) s.marginRight = `calc(${-p.bleed} * (var(--colw) + var(--gut)))`;
  if (p.overlap) s.marginTop = "var(--overlap)";
  return s as React.CSSProperties;
}

const pad2 = (n: number) => String(n).padStart(2, "0");


/* ═══ 발행 주체 ═══ 제호는 남되 주인공 자리에서 내려온다 ═══════════ */

export function Imprint({ edition }: { edition?: ReactNode }) {
  return (
    <header className="band imprint">
      <span className="name">
        <Link href="/">The Rabbit Hole</Link>
      </span>
      <span className="ed">{edition ?? "Edition 1 / 1"}</span>
    </header>
  );
}


/* ═══ 편집자의 자리 ═══ 하강 레이어 위에 떠서 반전을 통과시키지 않는다.
   z-index 는 globals.css 의 --z-editor 가 쥐고 있다. 낮추면 체계가 깨진다 ═ */

export function CuratorNote({ children }: { children: ReactNode }) {
  return (
    <section className="band note">
      <div className="md">{children}</div>
      <span className="by">Curator&rsquo;s note</span>
    </section>
  );
}


/* ═══ 출품 ═══ 러닝헤드가 비운 자리를 route.frame 이 받는다 ════════ */

export function RouteSection({
  route,
  place,
}: {
  route: Route;
  place: Placement;
}) {
  return (
    <section className="band route" style={bandStyle(place)}>
      <h2 className="frame">{route.frame}</h2>
      {route.gloss?.trim() ? <p className="gloss">{route.gloss}</p> : null}
      {route.pattern?.trim() ? (
        <p className="pattern">
          <span className="k">공유 구조</span>
          {route.pattern}
        </p>
      ) : null}
      <ul className="works">
        {route.entries.map((e, i) => (
          <li className="work" key={e.slug}>
            {/* 번호는 전관 통합 연속이다. 섹션마다 리셋하면 신문으로 돌아간다 */}
            <span className="no">{pad2(place.firstNo + i)}</span>
            <a className="t" href={e.url} target="_blank" rel="noopener noreferrer">
              {e.title}
            </a>
            <a className="u" href={e.url} target="_blank" rel="noopener noreferrer">
              plato.stanford.edu/entries/{e.slug}/
            </a>
            <p className="why">{e.reason}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}


/* ═══ 미출품 ═══ route.ts 검증에서 탈락한 항목.
   "예약과 실제의 차이" 를 공장의 숫자가 아니라 전시의 언어로 적는 자리 ═══ */

export function NotOnView({ items }: { items: Omitted[] }) {
  return (
    <section className="band omit">
      <span className="hd">Not on view</span>
      {items.length === 0 ? (
        <span className="none">이번 회차에서 빠진 항목은 없습니다.</span>
      ) : (
        <ul>
          {items.map((o) => (
            <li key={o.slug}>
              — {o.slug} · {o.why}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}


/* ═══ 일러두기 ═══════════════════════════════════════════════════════ */

export function Colophon({ model }: { model: string }) {
  const items: [string, ReactNode][] = [
    [
      "Engine",
      <>
        이 지면의 조판은 <span className="lat">{model}</span>이 합니다. 목차
        1,865항목 전체를 한 번에 보고, 질문과 구조를 공유하는 항목을 고릅니다.
        미리 추린 후보는 없습니다.
      </>,
    ],
    [
      "Structure",
      <>
        질문 → 독해의 갈래 → 공유 구조 → 항목. 갈래는 분과나 사조의 이름이
        아니라 질문을 비틀어 읽는 한 가지 조작이고, 공유 구조는 그 갈래의
        항목들을 한 줄에 세우는 이유입니다.
      </>,
    ],
    [
      "Baseline",
      <>
        크레딧의 「가로지름」은 동결된 지도와의 대조입니다. 편집자가 프롬프트
        없이 만든 45개 분야 중 이 회차가 몇 개에 흩어졌는가. 편집자는 이 수를
        보지 못합니다.
      </>,
    ],
    [
      "Vocabulary",
      <>
        쓰지 않는 말 — 프롬프트·AI 추천·검색·관련도. 대신 질문, 연결, 조판,
        순서.
      </>,
    ],
    [
      "Loss",
      <>
        연결 이유는 한 문장입니다. 본문을 대체하지 않습니다. 이 짧음은 결함이
        아니라 편집자의 정직함입니다.
      </>,
    ],
  ];

  return (
    <section className="band colophon">
      <span className="hd">Notes</span>
      <ol>
        {items.map(([k, v], i) => (
          <li key={k}>
            <span className="no">{pad2(i + 1)}</span>
            <span>
              <span className="k">{k}</span>
              <span className="v">{v}</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}


/* ═══ 에디션 크레딧 ═══ 신문 판권에서 성격만 바뀐 자리 ═════════════ */

export function Credit({
  model,
  issuedAt,
  editionId,
  grid,
  spread,
  copies = "1부",
  archive = true,
  loss,
}: {
  model: string;
  issuedAt?: string;
  editionId?: string;
  grid?: string;
  /** 동결된 지도와의 대조 — 이 회차가 몇 개 분야를 가로질렀는가 (src/lib/baseline.ts) */
  spread?: string;
  copies?: string;
  archive?: boolean;
  loss?: ReactNode;
}) {
  return (
    <section className="band credit">
      <dl>
        <dt>발행</dt>
        <dd className="s">{model}</dd>
        <dt>발행 부수</dt>
        <dd>{copies}</dd>
        <dt>수신</dt>
        <dd className="u">이 질문을 한 사람</dd>
        {issuedAt ? (
          <>
            <dt>발행 시각</dt>
            <dd>{issuedAt}</dd>
          </>
        ) : null}
        {editionId ? (
          <>
            <dt>회차</dt>
            <dd>{editionId}</dd>
          </>
        ) : null}
        {grid ? (
          <>
            <dt>판짜기</dt>
            <dd>{grid}</dd>
          </>
        ) : null}
        {spread ? (
          <>
            <dt>가로지름</dt>
            <dd>{spread}</dd>
          </>
        ) : null}
        <dt>출처</dt>
        <dd>
          <a
            href="https://plato.stanford.edu/contents.html"
            target="_blank"
            rel="noopener noreferrer"
          >
            Stanford Encyclopedia of Philosophy
          </a>
        </dd>
      </dl>
      <p className="loss">
        {loss ?? (
          <>
            이 리플렛이 손실시키는 것 — 본문 그 자체, 항목 사이의 상호 참조, 각
            항목의 역사적 맥락. 모두 <span className="lat">SEP</span> 안에
            있습니다.
          </>
        )}
      </p>
      <div className="nav">
        {archive ? (
          <Link href="/archive">Archive</Link>
        ) : (
          <Link href="/">New question</Link>
        )}
      </div>
    </section>
  );
}

