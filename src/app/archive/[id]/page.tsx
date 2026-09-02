import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import { pamphletStore, isSafeId } from "@/lib/pamphlets";
import {
  Credit,
  CuratorNote,
  Dive,
  Imprint,
  RouteSection,
  gridSignature,
  planLayout,
} from "@/components/press";

export const dynamic = "force-dynamic";

/* Next 15 — 동적 라우트의 params 는 Promise 다 */
type PageProps = { params: Promise<{ id: string }> };

function issued(iso: string): string {
  try {
    return new Intl.DateTimeFormat("ko-KR", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

/* fit ladder — 봉인된 질문도 같은 사다리에서 크기를 고른다 */
function fitSize(len: number): number {
  if (len <= 9) return 64;
  if (len <= 15) return 54;
  if (len <= 22) return 46;
  if (len <= 32) return 40;
  if (len <= 44) return 34;
  return 28;
}

export async function generateMetadata({ params }: PageProps) {
  const { id } = await params;
  if (!isSafeId(id)) return { title: "회차를 찾을 수 없습니다" };
  const p = await pamphletStore.get(id);
  if (!p) return { title: "회차를 찾을 수 없습니다" };
  const q =
    p.userQuestion.length > 40
      ? p.userQuestion.slice(0, 40) + "…"
      : p.userQuestion;
  return {
    title: `${q} · 봉인된 회차 · The Rabbit Hole`,
    description: p.curatorNote,
  };
}

export default async function PamphletDetailPage({ params }: PageProps) {
  const { id } = await params;
  if (!isSafeId(id)) notFound();
  const p = await pamphletStore.get(id);
  if (!p) notFound();

  const plan = planLayout(p.routes);

  return (
    <>
      <Dive />
      <div
        className="leaf"
        style={
          { "--hs": fitSize(p.userQuestion.length) } as React.CSSProperties
        }
      >
        <Imprint edition="Edition 1 / 1 · sealed" />

        <section className="band title">
          <span className="role">이 전시의 제목</span>
          <p className="q-static">{p.userQuestion}</p>
          <span className="run">
            회기 {issued(p.issuedAt)} — 관객 1명 · 봉인됨
          </span>
        </section>

        {/* 편집자의 자리 — 큐레이터 노트와 본문. 하강이 이 블록 밑으로 지나간다 */}
        <CuratorNote>
          <p>{p.curatorNote}</p>
          {p.body ? <ReactMarkdown>{p.body}</ReactMarkdown> : null}
        </CuratorNote>

        {p.routes.map((r, i) => (
          <RouteSection key={`${i}-${r.frame}`} route={r} place={plan[i]} />
        ))}

        <Credit
          model={p.modelId}
          issuedAt={issued(p.issuedAt)}
          editionId={p.id}
          grid={gridSignature(plan)}
          archive={false}
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
