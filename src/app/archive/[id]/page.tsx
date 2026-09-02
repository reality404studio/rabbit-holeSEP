import { notFound } from "next/navigation";
import { EmptyLeaf, IssueLeaf } from "@/components/leaf";
import { getIssue, isSafeId, listIssues, MODEL_NAME } from "@/lib/issues";

/* 목록에 없는 id 는 404 다 */
export const dynamicParams = false;

/* 봉인된 회차가 하나도 없을 때 세우는 자리.
   output:export 는 generateStaticParams 가 빈 배열이면 "선언이 없다" 고 보고
   빌드를 멈춘다. 그런데 발행 0건은 이 프로젝트의 정상 상태이고 첫 배포의
   상태다. 그래서 그 상태를 대신 말하는 실제 페이지를 하나 세운다.
   보관소 목록은 여기로 링크하지 않고, 회차가 하나라도 생기면 사라진다. */
const NONE = "none";

export function generateStaticParams() {
  const ids = listIssues().map((i) => ({ id: i.id }));
  return ids.length > 0 ? ids : [{ id: NONE }];
}

type PageProps = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: PageProps) {
  const { id } = await params;
  if (id === NONE) return { title: "봉인된 회차가 없습니다 · The Rabbit Hole" };
  const p = isSafeId(id) ? getIssue(id) : null;
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

export default async function IssueDetailPage({ params }: PageProps) {
  const { id } = await params;
  if (id === NONE) return <EmptyLeaf model={MODEL_NAME} />;
  if (!isSafeId(id)) notFound();
  const issue = getIssue(id);
  if (!issue) notFound();

  return <IssueLeaf issue={issue} home={false} />;
}
