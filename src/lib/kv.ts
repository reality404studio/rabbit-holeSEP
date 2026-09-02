/**
 * Workers KV 접근 계층.
 *
 * Cloudflare 에는 쓰기 가능한 파일시스템이 없다. 이전 구현은 data/*.json 에
 * 직접 썼고 로컬에서만 동작했다 (rate-limit.ts / pamphlets.ts 주석 참조).
 *
 * 바인딩이 없으면(= 로컬 `next dev`, 또는 대시보드에서 KV 를 아직 안 붙인 경우)
 * 프로세스 메모리로 떨어진다. 개발용이며 재시작하면 사라진다.
 * 조용히 실패하지 않고 한 번만 경고한다 — 배포본에서 이 경고가 보이면
 * KV 바인딩이 안 붙은 것이다.
 */

export const KV_BINDING = "RABBITHOLE_KV";

type KVListed = { name: string };
export interface KVLike {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  list(opts: { prefix: string; limit?: number }): Promise<{ keys: KVListed[] }>;
}

/* ─ 개발용 폴백 ─ 모듈 스코프라 프로세스가 살아있는 동안만 유지된다 ─ */
const memory = new Map<string, string>();
let warned = false;

const memoryKV: KVLike = {
  async get(key) {
    return memory.get(key) ?? null;
  },
  async put(key, value) {
    memory.set(key, value);
  },
  async list({ prefix, limit = 1000 }) {
    const keys = [...memory.keys()]
      .filter((k) => k.startsWith(prefix))
      .sort()
      .slice(0, limit)
      .map((name) => ({ name }));
    return { keys };
  },
};

export async function kv(): Promise<KVLike> {
  try {
    const mod = await import("@opennextjs/cloudflare");
    const env = mod.getCloudflareContext().env as unknown as Record<
      string,
      KVLike | undefined
    >;
    const ns = env?.[KV_BINDING];
    if (ns) return ns;
  } catch {
    /* Cloudflare 밖 (로컬 next dev, 빌드 타임) — 폴백으로 간다 */
  }
  if (!warned) {
    warned = true;
    console.warn(
      `[kv] ${KV_BINDING} 바인딩이 없습니다. 메모리 폴백을 씁니다 — 재시작하면 사라집니다.`,
    );
  }
  return memoryKV;
}
