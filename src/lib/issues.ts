/**
 * 회차 보관소 — 커밋된 JSON 파일. (이전: Workers KV)
 *
 * 발행은 런타임 사건이 아니라 커밋이다. `content/issues/<id>.json` 하나가
 * 한 회차이고, 빌드 때 읽혀 정적 페이지로 굳는다. 저장 경로(save)가 없는
 * 이유가 여기 있다 — 쓰는 쪽은 사이트가 아니라 scripts/ingest.ts 다.
 *
 * 한 번 봉인된 회차는 수정하지 않는다는 원래 규약은 그대로다. 이제 그걸
 * 코드가 아니라 git 이 지킨다.
 */

import fs from "node:fs";
import path from "node:path";

export type SerializedEntry = {
  slug: string;
  title: string;
  reason: string;
  url: string;
};

export type SerializedRoute = {
  frame: string;
  gloss: string;
  entries: SerializedEntry[];
};

/** 검증에서 탈락해 지면에 오르지 못한 항목 — 「Not on view」 */
export type Omitted = { slug: string; why: string };

/** 기본 편집자. 회차가 하나도 없을 때 빈 지면이 쓴다 */
export const MODEL_ID = "claude-fable-5-1";
export const MODEL_NAME = "Claude Fable 5.1";

export type Issue = {
  id: string;
  issuedAt: string; // ISO UTC
  /** API 모델 id — 크레딧의 감사 기록 */
  modelId: string;
  /** 지면에 인쇄되는 이름. id 를 그대로 조판하면 "claude-fable-5-1이 합니다" 가 된다 */
  modelName: string;
  userQuestion: string;
  curatorNote: string;
  body: string; // markdown raw
  routes: SerializedRoute[];
  omitted: Omitted[];
};

export type IssueSummary = Pick<
  Issue,
  "id" | "issuedAt" | "modelId" | "modelName" | "userQuestion" | "curatorNote"
>;

const DIR = path.join(process.cwd(), "content", "issues");

export function isSafeId(id: string): boolean {
  return /^[A-Za-z0-9_-]{1,64}$/.test(id);
}

/* id 가 YYYYMMDD-HHmmss-xxxx 라 사전순 = 시간순이다. 최신이 앞에 오게 뒤집는다 */
export function listIssues(): Issue[] {
  let names: string[];
  try {
    names = fs.readdirSync(DIR);
  } catch {
    return []; // 아직 한 회차도 발행되지 않았다 — 정상 상태다
  }

  return names
    .filter((n) => n.endsWith(".json") && isSafeId(n.slice(0, -5)))
    .sort()
    .reverse()
    .map((n) => read(path.join(DIR, n)))
    .filter((x): x is Issue => x !== null);
}

export function listSummaries(): IssueSummary[] {
  return listIssues().map(
    ({ id, issuedAt, modelId, modelName, userQuestion, curatorNote }) => ({
      id,
      issuedAt,
      modelId,
      modelName,
      userQuestion,
      curatorNote,
    }),
  );
}

export function getIssue(id: string): Issue | null {
  if (!isSafeId(id)) return null;
  return read(path.join(DIR, `${id}.json`));
}

/** 최신 회차. 없으면 null — 지면이 그 빈 상태를 말해야 한다 */
export function latestIssue(): Issue | null {
  return listIssues()[0] ?? null;
}

function read(file: string): Issue | null {
  try {
    const obj = JSON.parse(fs.readFileSync(file, "utf8")) as Issue;
    if (!obj?.id || !Array.isArray(obj.routes)) return null;
    return {
      ...obj,
      omitted: obj.omitted ?? [],
      modelName: obj.modelName ?? MODEL_NAME,
    };
  } catch {
    return null; // 깨진 파일 하나가 목록 전체를 막지 않는다
  }
}
