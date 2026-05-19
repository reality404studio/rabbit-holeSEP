/**
 * File-based daily request counter.
 *
 * Local-only — does NOT work on Vercel (read-only filesystem).
 * When deploying, replace with Vercel KV / Upstash Redis.
 *
 * Note: not atomic. Two concurrent requests can both read count=N
 * and both write N+1 (off-by-one under heavy concurrent load).
 * For a single-user MVP this is acceptable.
 */

import { promises as fs } from "node:fs";
import path from "node:path";

export const DAILY_LIMIT = 20;
const STATE_PATH = path.join(process.cwd(), "data", "rate-limit.json");

type State = { date: string; count: number };

/** Today in KST (Asia/Seoul, UTC+9). Resets at Korean midnight. */
function todayKST(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
}

async function readState(): Promise<State> {
  try {
    const raw = await fs.readFile(STATE_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed.date === "string" &&
      typeof parsed.count === "number"
    ) {
      return parsed;
    }
  } catch {
    /* file missing or unreadable — start fresh */
  }
  return { date: todayKST(), count: 0 };
}

async function writeState(state: State): Promise<void> {
  await fs.writeFile(STATE_PATH, JSON.stringify(state, null, 2) + "\n", "utf8");
}

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  limit: number;
};

export async function checkAndIncrement(): Promise<RateLimitResult> {
  const t = todayKST();
  let state = await readState();
  if (state.date !== t) {
    state = { date: t, count: 0 };
  }
  if (state.count >= DAILY_LIMIT) {
    return { allowed: false, remaining: 0, limit: DAILY_LIMIT };
  }
  state.count += 1;
  await writeState(state);
  return {
    allowed: true,
    remaining: DAILY_LIMIT - state.count,
    limit: DAILY_LIMIT,
  };
}

export async function getStatus(): Promise<{
  count: number;
  remaining: number;
  limit: number;
}> {
  const t = todayKST();
  const state = await readState();
  const count = state.date === t ? state.count : 0;
  return { count, remaining: DAILY_LIMIT - count, limit: DAILY_LIMIT };
}
