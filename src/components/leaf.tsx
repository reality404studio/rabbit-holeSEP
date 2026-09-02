/* 한 회차의 지면 — 홈과 보관소 상세가 같은 조판을 쓴다.

   이전에는 홈이 폼(입력 → 조판)이고 상세가 정적이라 두 벌이었다. 발행이
   커밋이 된 뒤로 홈도 "최신 회차를 편 지면" 이므로 한 벌이면 된다.
   다른 것은 제호의 판차 표기와 크레딧의 행선지뿐이다. */

import ReactMarkdown from "react-markdown";
import { Dive } from "./dive";
import {
  Colophon,
  Credit,
  CuratorNote,
  Imprint,
  NotOnView,
  RouteSection,
  gridSignature,
  planLayout,
} from "./press";
import type { Issue } from "@/lib/issues";

/* fit ladder — 글자수가 정하는 기계적 6단. 질문만 이 사다리를 쓴다 */
function fitSize(len: number): number {
  if (len <= 9) return 64;
  if (len <= 15) return 54;
  if (len <= 22) return 46;
  if (len <= 32) return 40;
  if (len <= 44) return 34;
  return 28;
}

export function issued(iso: string, withTime = false): string {
  try {
    return new Intl.DateTimeFormat("ko-KR", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      ...(withTime
        ? { hour: "2-digit" as const, minute: "2-digit" as const, hour12: false }
        : {}),
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function IssueLeaf({ issue, home }: { issue: Issue; home: boolean }) {
  const plan = planLayout(issue.routes);
  const at = issued(issue.issuedAt, true);

  return (
    <>
      <Dive />
      <div
        className="leaf"
        style={
          { "--hs": fitSize(issue.userQuestion.length) } as React.CSSProperties
        }
      >
        <Imprint edition={home ? "Edition 1 / 1" : "Edition 1 / 1 · sealed"} />

        <section className="band title">
          <span className="role">이 전시의 제목</span>
          <p className="q-static">{issue.userQuestion}</p>
          <span className="run">회기 {at} — 관객 1명 · 봉인됨</span>
          {home ? (
            <p className="deck">
              편집자는 답을 대신 쓰지 않습니다.{" "}
              <span className="lat">SEP</span>&nbsp;원문으로 들어갈 읽기 순서를
              소개합니다.
            </p>
          ) : null}
        </section>

        {/* 편집자의 자리 — 하강이 이 블록 밑으로 지나간다 */}
        <CuratorNote>
          <p>{issue.curatorNote}</p>
          {issue.body ? <ReactMarkdown>{issue.body}</ReactMarkdown> : null}
        </CuratorNote>

        {issue.routes.map((r, i) => (
          <RouteSection key={`${i}-${r.frame}`} route={r} place={plan[i]} />
        ))}

        <NotOnView items={issue.omitted} />

        {home ? <Colophon model={issue.modelName} /> : null}

        <Credit
          model={issue.modelName}
          issuedAt={at}
          editionId={issue.id}
          grid={gridSignature(plan)}
          copies="1부 봉인됨"
          archive={home}
          loss={
            <>
              한 번 봉인된 회차는 수정되지 않습니다. 본문 그 자체는 여전히 이
              지면에 없습니다 — 모두 <span className="lat">SEP</span> 안에
              있습니다.
            </>
          }
        />
      </div>
    </>
  );
}

/* ═══ 빈 지면 ═══ 발행이 예외라는 명제를 지면이 직접 증명하는 자리.
   회차가 없는 달이 정상이므로, 이 화면은 오류 상태가 아니라 본편이다 ═══ */

export function EmptyLeaf({ model }: { model: string }) {
  return (
    <>
      <Dive />
      <div className="leaf" style={{ "--hs": 46 } as React.CSSProperties}>
        <Imprint edition="Not issued" />

        <section className="band title">
          <span className="role">이번 회차</span>
          <p className="q-static">아직 봉인된 것이 없습니다</p>
          <span className="run">회기 미정 · 아직 걸리지 않았습니다</span>
        </section>

        <section className="band unissued">
          {/* 지면은 무엇이 있었는지 모른다 — 아무것도 묻지 않았을 수도,
              물었지만 봉인되지 않았을 수도 있다. 단정하지 않는다 */}
          <p>
            <strong>도록으로 봉인된 회차가 아직 없습니다.</strong> 발행은
            예외입니다 — 걸린 전시 전부가 여기 남지는 않습니다.
          </p>
          <span className="m">NOT ISSUED · 보관소에 박제되지 않음</span>
        </section>

        <Colophon model={model} />

        <Credit
          model={model}
          copies="0부 (미발행)"
          loss={
            <>
              이 빈 지면이 손실시키는 것 — 봉인되지 않은 조판 전부. 편집자가
              무엇을 도록감으로 보지 않았는지는 지면에 남지 않습니다.
            </>
          }
        />
      </div>
    </>
  );
}
