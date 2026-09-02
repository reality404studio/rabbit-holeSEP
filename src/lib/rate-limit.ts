/**
 * 일일 요청 카운터 — Workers KV.
 *
 * 원자적이지 않다. 동시 요청 둘이 같은 N 을 읽고 둘 다 N+1 을 쓸 수 있다
 * (최대 한 번 더 통과). 파일 기반이던 이전 구현도 같은 성질이었고,
 * 1인용 공개 사이트에서는 허용 가능한 오차다.
 * 정확한 카운터가 필요해지면 Durable Object 로 옮길 것.
 */

import { kv } from "./kv";

export const DAILY_LIMIT = 20;

/** 오늘(KST). 한국 자정에 리셋된다 */
function todayKST(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
}

const keyFor = (day: string) => `rl:${day}`;

async function read(): Promise<{ date: string; count: number }> {
  const day = todayKST();
  const store = await kv();
  const raw = await store.get(keyFor(day));
  const count = raw ? Number.parseInt(raw, 10) : 0;
  return { date: day, count: Number.isFinite(count) && count > 0 ? count : 0 };
}

export async function getStatus(): Promise<{
  count: number;
  remaining: number;
  limit: number;
}> {
  const { count } = await read();
  return {
    count,
    remaining: Math.max(0, DAILY_LIMIT - count),
    limit: DAILY_LIMIT,
  };
}

export async function checkAndIncrement(): Promise<{
  allowed: boolean;
  remaining: number;
  limit: number;
}> {
  const { date, count } = await read();
  if (count >= DAILY_LIMIT) {
    return { allowed: false, remaining: 0, limit: DAILY_LIMIT };
  }
  const next = count + 1;
  const store = await kv();
  await store.put(keyFor(date), String(next));
  return {
    allowed: true,
    remaining: Math.max(0, DAILY_LIMIT - next),
    limit: DAILY_LIMIT,
  };
}
