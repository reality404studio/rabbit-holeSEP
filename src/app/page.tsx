"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
} from "react";
import {
  Colophon,
  Credit,
  CuratorNote,
  Dive,
  Imprint,
  NotOnView,
  RouteSection,
  gridSignature,
  planLayout,
  type Omitted,
  type Route,
} from "@/components/press";

type ApiSuccess = {
  routes: Route[];
  omitted?: Omitted[];
  /** 크레딧 「가로지름」 한 줄. 서버가 동결 지도와 대조해 만든다 (src/lib/baseline.ts) */
  spreadLine?: string;
  pamphletId?: string;
  curatorNote?: string;
  model: string;
  remaining: number;
  limit: number;
};
type ApiError = { error: string; remaining?: number; limit?: number };
type ApiResponse = ApiSuccess | ApiError;
type Status = { count: number; remaining: number; limit: number };

const DEFAULT_MODEL = "Claude Fable 5.1";
const MAX = 60;
const PLACEHOLDER = "궁금한 것을 한 줄로 써보세요.";

/* fit ladder — 글자수가 정하는 기계적 6단. 사용자의 질문만 이 사다리를 쓴다 */
const HS = [64, 54, 46, 40, 34, 28];
function fitSize(len: number): number {
  if (len <= 9) return HS[0];
  if (len <= 15) return HS[1];
  if (len <= 22) return HS[2];
  if (len <= 32) return HS[3];
  if (len <= 44) return HS[4];
  return HS[5];
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const pad2 = (n: number) => String(n).padStart(2, "0");

function kst(d: Date): string {
  try {
    return new Intl.DateTimeFormat("ko-KR", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(d);
  } catch {
    return d.toISOString();
  }
}

export default function Home() {
  const [question, setQuestion] = useState("");
  const [routes, setRoutes] = useState<Route[] | null>(null);
  const [omitted, setOmitted] = useState<Omitted[]>([]);
  const [spread, setSpread] = useState<string | null>(null);
  const [pamphletId, setPamphletId] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [issuedAt, setIssuedAt] = useState<string | null>(null);
  const [shown, setShown] = useState(0);
  const [say, setSay] = useState("");
  const [done, setDone] = useState(false);

  const qRef = useRef<HTMLTextAreaElement>(null);
  const alive = useRef(true);
  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );

  useEffect(() => {
    fetch("/api/status")
      .then((r) => r.json())
      .then((s: Status) => setStatus(s))
      .catch(() => {
        /* 평시에 카운터를 노출하지 않으므로 조회 실패는 UX 영향이 없다 */
      });
  }, []);

  /* ─ 하강 ─ 스크롤 진행이 곧 잠긴 깊이다. 몸이 내려간 만큼 지면이 잠긴다 ─ */
  useEffect(() => {
    let ticking = false;
    const measure = () => {
      const h =
        document.documentElement.scrollHeight - window.innerHeight;
      const d = h > 0 ? Math.min(1, Math.max(0, window.scrollY / h)) : 0;
      document.documentElement.style.setProperty("--depth", d.toFixed(4));
      ticking = false;
    };
    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(measure);
      }
    };
    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [routes, shown, done]);

  const hs = fitSize((question || PLACEHOLDER).length);

  /* 자동 높이. resize:none 이므로 scrollHeight 로 맞춘다 */
  useEffect(() => {
    const el = qRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [question, hs]);

  const limitReached = status?.remaining === 0;
  const canSubmit = !busy && question.trim().length > 0 && !limitReached;

  /* 전시를 건다 — 블록이 하나씩 앉는다 */
  const hang = useCallback(async (rs: Route[]) => {
    for (let i = 0; i < rs.length; i++) {
      if (!alive.current) return;
      setSay(`HANGING  ${pad2(i + 1)} / ${pad2(rs.length)}`);
      setShown(i + 1);
      await wait(380);
    }
    if (!alive.current) return;
    setDone(true);
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const q = question.trim();
    if (!q || busy) return;

    setBusy(true);
    setError(null);
    setRoutes(null);
    setOmitted([]);
    setSpread(null);
    setPamphletId(null);
    setNote(null);
    setShown(0);
    setDone(false);
    setIssuedAt(null);
    setSay("SELECTING  항목 고르는 중");

    try {
      const res = await fetch("/api/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
      });
      const data: ApiResponse = await res.json();

      if (!res.ok || "error" in data) {
        setError("error" in data ? data.error : `HTTP ${res.status}`);
        setSay("");
        if (
          "error" in data &&
          typeof data.remaining === "number" &&
          typeof data.limit === "number"
        ) {
          setStatus({
            count: data.limit - data.remaining,
            remaining: data.remaining,
            limit: data.limit,
          });
        }
        return;
      }

      setModel(data.model ?? DEFAULT_MODEL);
      setStatus({
        count: data.limit - data.remaining,
        remaining: data.remaining,
        limit: data.limit,
      });
      setPamphletId(data.pamphletId ?? null);
      setNote(data.curatorNote ?? null);
      setOmitted(data.omitted ?? []);
      setSpread(data.spreadLine ?? null);
      setIssuedAt(kst(new Date()));

      if (data.routes.length === 0) {
        setError("관련 항목을 찾지 못했습니다. 질문을 조금 더 좁혀 보세요.");
        setSay("");
        return;
      }
      setRoutes(data.routes);
      await hang(data.routes);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSay("");
    } finally {
      if (alive.current) setBusy(false);
    }
  }

  function newEdition() {
    if (busy) return;
    setQuestion("");
    setRoutes(null);
    setOmitted([]);
    setSpread(null);
    setPamphletId(null);
    setNote(null);
    setError(null);
    setShown(0);
    setDone(false);
    setSay("");
    setIssuedAt(null);
    window.scrollTo(0, 0);
    qRef.current?.focus();
  }

  const plan = routes ? planLayout(routes) : [];
  const issued = Boolean(pamphletId);

  return (
    <>
      <Dive />
      <div className="leaf" style={{ "--hs": hs } as CSSProperties}>
        <Imprint
          edition={
            routes && done
              ? issued
                ? "Edition 1 / 1"
                : "Not issued"
              : "Edition 1 / 1"
          }
        />

        {/* ─ 전시 제목 = 사용자의 질문 ─ */}
        <form className="band title" onSubmit={onSubmit} autoComplete="off">
          <span className="role">이 전시의 제목</span>
          <textarea
            className="q"
            ref={qRef}
            rows={1}
            maxLength={MAX}
            value={question}
            onChange={(e) => setQuestion(e.target.value.replace(/\n/g, ""))}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (canSubmit) onSubmit(e as unknown as FormEvent);
              }
            }}
            placeholder={PLACEHOLDER}
            aria-label="당신의 질문"
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="off"
            disabled={busy}
          />
          <span className="run">
            {routes && done && issuedAt
              ? `회기 ${issuedAt} — 관객 1명`
              : "회기 미정 · 아직 걸리지 않았습니다"}
          </span>
          <p className="deck">
            편집자는 답을 대신 쓰지 않습니다.{" "}
            <span className="lat">SEP</span>&nbsp;원문으로 들어갈 읽기 순서를
            소개합니다.
          </p>
          <div className="ctl">
            <button className="go" type="submit" disabled={!canSubmit}>
              {routes ? "다시 건다" : "전시를 건다"}
            </button>
            <span className={`count${question.length >= 45 ? " near" : ""}`}>
              <b>{question.length}</b> / {MAX}
            </span>
            {routes && !busy ? (
              <button className="reset" type="button" onClick={newEdition}>
                새 회차
              </button>
            ) : null}
          </div>
        </form>

        {error ? <div className="band err">{error}</div> : null}

        <div className={`band status${say ? " show" : ""}`}>{say}</div>

        {/* ─ 편집자의 자리 ─ 발행됐을 때만. 하강이 이 블록 밑으로 지나간다 ─ */}
        {note && done ? (
          <CuratorNote>
            <p>{note}</p>
          </CuratorNote>
        ) : null}

        {routes
          ? routes
              .slice(0, Math.max(shown, 1))
              .map((r, i) => (
                <RouteSection key={`${i}-${r.frame}`} route={r} place={plan[i]} />
              ))
          : null}

        {routes && done ? <NotOnView items={omitted} /> : null}

        {/* 발행은 예외다 — 지면이 그렇게 말해야 한다 */}
        {routes && done ? (
          issued ? (
            <p className="band issued">
              이 큐레이션은 편집자 스스로 도록감이라 판단해 봉인했습니다.
              <Link href={`/archive/${pamphletId}`}>도록 펴보기</Link>
            </p>
          ) : (
            <section className="band unissued">
              <p>
                이번 회차는 걸렸지만 <strong>리플렛은 발행되지 않았습니다.</strong>{" "}
                보관소에 남지 않고, 이 화면을 닫으면 사라집니다.
              </p>
              <span className="m">NOT ISSUED · 보관소에 박제되지 않음</span>
            </section>
          )
        ) : null}

        {routes && done ? <Colophon model={model} /> : null}

        <Credit
          model={model}
          issuedAt={done && issuedAt ? issuedAt : undefined}
          editionId={pamphletId ?? undefined}
          grid={routes && done ? gridSignature(plan) : undefined}
          spread={routes && done && spread ? spread : undefined}
          copies={routes && done ? (issued ? "1부" : "0부 (미발행)") : "1부"}
        />
      </div>
    </>
  );
}
