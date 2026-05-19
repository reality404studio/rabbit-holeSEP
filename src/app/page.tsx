"use client";

import { useEffect, useState, type FormEvent } from "react";

type Match = {
  slug: string;
  title: string;
  reason: string;
  url: string;
};

type ApiSuccess = {
  patterns: string[];
  matches: Match[];
  model: string;
  remaining: number;
  limit: number;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_read: number;
    cache_create: number;
  };
};

type ApiError = { error: string; remaining?: number; limit?: number };
type ApiResponse = ApiSuccess | ApiError;

type Status = { count: number; remaining: number; limit: number };

const DEFAULT_MODEL = "claude-sonnet-4-6";

export default function Home() {
  const [question, setQuestion] = useState("");
  const [echoed, setEchoed] = useState<string | null>(null);
  const [patterns, setPatterns] = useState<string[] | null>(null);
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [model, setModel] = useState<string>(DEFAULT_MODEL);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status | null>(null);

  useEffect(() => {
    fetch("/api/status")
      .then((r) => r.json())
      .then((s: Status) => setStatus(s))
      .catch(() => {
        // 상태 조회 실패는 무시. 평시에는 카운터를 노출하지 않으므로 UX 영향 없음.
      });
  }, []);

  const limitReached = status?.remaining === 0;
  const canSubmit =
    !loading && question.trim().length > 0 && !limitReached;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const q = question.trim();
    if (!q) return;

    setLoading(true);
    setError(null);
    setMatches(null);
    setPatterns(null);
    setEchoed(null);

    try {
      const res = await fetch("/api/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
      });
      const data: ApiResponse = await res.json();

      if (!res.ok || "error" in data) {
        const errMsg = "error" in data ? data.error : `HTTP ${res.status}`;
        setError(errMsg);
        if (
          "remaining" in data &&
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

      setEchoed(q);
      setPatterns(data.patterns ?? []);
      setMatches(data.matches);
      setModel(data.model ?? DEFAULT_MODEL);
      setStatus({
        count: data.limit - data.remaining,
        remaining: data.remaining,
        limit: data.limit,
      });

      if (data.matches.length === 0) {
        setError(
          "관련 항목을 찾지 못했어요. 질문을 좀 더 구체적으로 다듬어 보세요.",
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  const showUnfold = echoed && matches;
  const showPatterns = patterns && patterns.length > 0;

  return (
    <div className="sheet">
      <div className="gutter-l" />

      <main className="body">
        <header className="masthead">
          <span className="mark latin">SEP rabbit-holes</span>
          <span className="sub">— 질문에서 시작하는 항목 라우터</span>
          <span className="pull">
            <a
              href="https://plato.stanford.edu/contents.html"
              target="_blank"
              rel="noopener noreferrer"
            >
              plato.stanford.edu↗
            </a>
          </span>
        </header>

        <h1 className="lede">
          당신의 질문이 어떤 SEP 항목과 <em>연결</em>되는지 안내합니다. 본문은
          SEP에서 직접 읽으실 수 있습니다.
        </h1>
        <p className="lede-note">
          이 페이지는 입구를 짚어두는 일을 합니다. 질문을 해석하거나 요약하지
          않습니다. SEP 항목으로 향하는 길목을 한 문장으로 안내합니다.
        </p>

        <form className="field" onSubmit={onSubmit} autoComplete="off">
          <div className="field-label">
            <span className="num">01</span>당신의 질문
          </div>
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="평소에 쓰는 말 그대로 — 예) 내 기억이 진짜 내 경험인지 어떻게 알 수 있을까?"
            rows={3}
            maxLength={2000}
            disabled={loading || limitReached}
          />
          <div className="row">
            <span>
              {question.length} / 2000
              {limitReached && <span> · 오늘 한도 도달</span>}
            </span>
            <button
              className="submit"
              type="submit"
              disabled={!canSubmit}
              aria-label="필드를 펼치기"
            >
              {loading ? "펼치는 중" : "필드를 펼치기"}
              <span className="arrow">{loading ? "·" : "⤵"}</span>
            </button>
          </div>
        </form>

        {error && <div className="error">{error}</div>}

        {showUnfold && (
          <section className="unfold">
            <p className="echo">{echoed}</p>

            {showPatterns && (
              <div className="engine">
                <div className="engine-label">
                  <span className="model">{model}</span> 이 질문에서 끌어낸
                  패턴
                </div>
                <p className="patterns">
                  {patterns!.map((p, i) => (
                    <span key={`${i}-${p}`}>{p}</span>
                  ))}
                </p>
                <div className="engine-hint">
                  ↓ &nbsp; SEP 본문에서 위 패턴이 닿는 항목
                </div>
              </div>
            )}

            {matches!.length > 0 && (
              <ol className="matches">
                {matches!.map((m, i) => (
                  <li className="match" key={m.slug}>
                    <div className="match-num">
                      {String(i + 1).padStart(2, "0")}
                    </div>
                    <div>
                      <a
                        className="title"
                        href={m.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {m.title}
                        <span className="arrow">↗</span>
                      </a>
                      <p className="reason">{m.reason}</p>
                      <p className="slug">
                        <a
                          href={m.url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          plato.stanford.edu/entries/{m.slug}/
                        </a>
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        )}

        <footer className="colophon">
          <div>
            plato.stanford.edu의 항목 목차를 인덱스로 사용합니다.
            <br />
            본문은 이 페이지에 없습니다. 항목 페이지에서 직접 읽어 주세요.
          </div>
          <div className="loss">
            <b>이 페이지가 손실시키는 것</b> &nbsp;—&nbsp; 본문 자체. 역사적
            맥락. 인접 항목으로의 분기. 한 항목이 다른 항목을 어떻게 다시
            정의하는지의 그물망. 모두 SEP 안에 있습니다.
          </div>
        </footer>
      </main>

      <aside className="gutter-r">
        <div className="marginalia">
          <div className="marg-block">
            <h4>
              <span className="tag">엔진</span>
              <span className="latin">{model}</span>
            </h4>
            <p>
              이 페이지의 라우팅을 수행하는 모델입니다. 인간의 사고를 모사하지
              않고, 모델 고유의 방식으로 질문에서 패턴을 추출해 SEP 본문과
              맞닿는 지점을 짚습니다.
            </p>
          </div>

          <div className="marg-block">
            <h4>
              <span className="tag">구조</span>질문 → 패턴 → 항목
            </h4>
            <p>
              질문은 모델 안에서 몇 개의 개념 패턴으로 분해됩니다. 그 패턴이
              SEP — 인간이 축적한 텍스트 — 의 어느 항목과 가까운지를 모델이
              골라 돌려줍니다.
            </p>
          </div>

          <div className="marg-block">
            <h4>
              <span className="tag">어휘</span>쓰지 않는 말
            </h4>
            <p className="vocab">
              <span className="ko">
                <span className="from">프롬프트</span>
                <span className="to">→ 질문</span>
              </span>
              <br />
              <span className="ko">
                <span className="from">AI 추천</span>
                <span className="to">→ 연결</span>
              </span>
              <br />
              <span className="ko">
                <span className="from">검색</span>
                <span className="to">→ 펼치기</span>
              </span>
              <br />
              <span className="ko">
                <span className="from">관련도</span>
                <span className="to">→ 순서</span>
              </span>
            </p>
          </div>

          <div className="marg-block">
            <h4>
              <span className="tag">손실</span>의도된 압축
            </h4>
            <p>
              각 항목의 연결 이유는 한 문장입니다. 본문을 대체하지 않습니다.
              이 짧음은 결함이 아니라 라우터의 정직함입니다.
            </p>
          </div>
        </div>
      </aside>
    </div>
  );
}
