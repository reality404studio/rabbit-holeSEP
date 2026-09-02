/**
 * Pamphlet store — immutable 큐레이션 박제 보관소. (Workers KV)
 *
 * 모델이 self-curation으로 "이건 도록감"이라 판단한 응답을 markdown 본문 +
 * 메타데이터(질문, 모델 ID, 큐레이터 노트, 시점)와 함께 박제한다. 한 번 저장된
 * pamphlet은 수정·삭제하지 않는다 (편집 권한 없음 — `save`만 노출).
 *
 * 이전 구현은 data/pamphlets/*.json 에 직접 썼고 로컬에서만 동작했다.
 * Cloudflare 에는 쓰기 가능한 파일시스템이 없어 KV 로 옮겼다.
 * PamphletStore 인터페이스는 그대로다 — 원래 주석이 예고한 교체다.
 */

import { kv } from "./kv";

const PREFIX = "pamphlet:";
/** 목록에서 한 번에 펴 보는 최대 회차 수 */
const LIST_MAX = 50;

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

export type Pamphlet = {
  id: string;
  issuedAt: string; // ISO UTC
  modelId: string;
  userQuestion: string;
  curatorNote: string;
  body: string; // markdown raw
  routes: SerializedRoute[];
};

export type PamphletSummary = {
  id: string;
  issuedAt: string;
  modelId: string;
  userQuestion: string;
  curatorNote: string;
};

export interface PamphletStore {
  save(p: Pamphlet): Promise<void>;
  list(): Promise<PamphletSummary[]>;
  get(id: string): Promise<Pamphlet | null>;
}

class KVPamphletStore implements PamphletStore {
  async save(p: Pamphlet): Promise<void> {
    const store = await kv();
    await store.put(PREFIX + p.id, JSON.stringify(p));
  }

  async list(): Promise<PamphletSummary[]> {
    const store = await kv();
    const { keys } = await store.list({ prefix: PREFIX, limit: 1000 });
    /* id 가 YYYYMMDD-HHmmss-xxxx 라 사전순 = 시간순이다. 최신이 앞에 오게 뒤집는다 */
    const newest = keys
      .map((k) => k.name)
      .sort()
      .reverse()
      .slice(0, LIST_MAX);

    const out: PamphletSummary[] = [];
    for (const name of newest) {
      const raw = await store.get(name);
      if (!raw) continue;
      try {
        const obj = JSON.parse(raw) as Pamphlet;
        out.push({
          id: obj.id,
          issuedAt: obj.issuedAt,
          modelId: obj.modelId,
          userQuestion: obj.userQuestion,
          curatorNote: obj.curatorNote,
        });
      } catch {
        // 깨진 레코드 — 목록 전체를 막지 않는다
      }
    }
    return out;
  }

  async get(id: string): Promise<Pamphlet | null> {
    if (!isSafeId(id)) return null;
    const store = await kv();
    const raw = await store.get(PREFIX + id);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as Pamphlet;
    } catch {
      return null;
    }
  }
}

export const pamphletStore: PamphletStore = new KVPamphletStore();

export function isSafeId(id: string): boolean {
  return /^[A-Za-z0-9_-]{1,64}$/.test(id);
}

/**
 * Sortable ID — KST 기반 'YYYYMMDD-HHmmss-xxxx'.
 * 시간순 정렬을 키 이름만으로 가능하게 + 같은 초 안의 충돌 방지용 랜덤 4자.
 */
export function makePamphletId(): string {
  const d = new Date();
  const kstShifted = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const yyyy = kstShifted.getUTCFullYear();
  const mm = String(kstShifted.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(kstShifted.getUTCDate()).padStart(2, "0");
  const hh = String(kstShifted.getUTCHours()).padStart(2, "0");
  const mi = String(kstShifted.getUTCMinutes()).padStart(2, "0");
  const ss = String(kstShifted.getUTCSeconds()).padStart(2, "0");
  const rand = Math.random().toString(36).slice(2, 6);
  return `${yyyy}${mm}${dd}-${hh}${mi}${ss}-${rand}`;
}
