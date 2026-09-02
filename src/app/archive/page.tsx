import Link from "next/link";
import { Dive } from "@/components/dive";
import { issued } from "@/components/leaf";
import { Credit, Imprint } from "@/components/press";
import { listSummaries, MODEL_NAME } from "@/lib/issues";

export const metadata = {
  title: "보관소 — 봉인된 회차 · The Rabbit Hole",
  description: "편집자가 스스로 도록감이라 판단해 봉인한 회차들의 공개 보관소.",
};

export default function ArchivePage() {
  const items = listSummaries();

  return (
    <>
      <Dive />
      <div className="leaf">
        <Imprint edition={`Editions ${items.length}`} />

        <section className="band title">
          <span className="role">보관소</span>
          {/* 보관소는 사용자의 질문이 아니라 기관의 목록이므로 SEP 색을 쓰지 않는다 */}
          <p className="q-static" style={{ color: "var(--sep)", ["--hs" as string]: 40 }}>
            봉인된 것만 남는다
          </p>
          <span className="run">
            발행은 예외입니다 · 걸린 전시 전부가 여기 남지는 않습니다
          </span>
        </section>

        <section className="band roll">
          {items.length === 0 ? (
            <p className="none">
              아직 봉인된 회차가 없습니다. 편집자가 어떤 조판을 도록감으로
              판단할지 — 그 자체가 이 보관소를 채울 데이터입니다.
            </p>
          ) : (
            <ol>
              {items.map((p, i) => (
                <li key={p.id}>
                  <span className="no">{String(i + 1).padStart(2, "0")}</span>
                  <Link className="qq" href={`/archive/${p.id}`}>
                    {p.userQuestion}
                  </Link>
                  <p className="why">{p.curatorNote}</p>
                  <span className="at">
                    {issued(p.issuedAt)} · {p.modelId}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>

        <Credit
          model={items[0]?.modelName ?? MODEL_NAME}
          copies={`${items.length}부 봉인됨`}
          archive={false}
          loss={
            <>
              이 보관소가 손실시키는 것 — 대화의 흐름, 이어진 질문들, 봉인되지
              않은 나머지 전부. 한 순간의 조판만 남습니다.
            </>
          }
        />
      </div>
    </>
  );
}
