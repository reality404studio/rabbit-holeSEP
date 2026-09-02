import { EmptyLeaf, IssueLeaf } from "@/components/leaf";
import { latestIssue, MODEL_NAME } from "@/lib/issues";

/* 발행은 커밋이다. 빌드 때 content/issues 를 읽어 굳는다 —
   런타임에 바뀔 것이 없으므로 force-dynamic 이 사라졌다. */

export default function Home() {
  const issue = latestIssue();
  return issue ? (
    <IssueLeaf issue={issue} home />
  ) : (
    <EmptyLeaf model={MODEL_NAME} />
  );
}
