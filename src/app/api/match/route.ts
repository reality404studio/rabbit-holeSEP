import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import {
  buildEntriesText,
  entries,
  isValidSlug,
  sepUrl,
} from "@/lib/entries";
import { checkAndIncrement } from "@/lib/rate-limit";
import {
  pamphletStore,
  makePamphletId,
  type SerializedRoute,
} from "@/lib/pamphlets";

/* Cloudflare 배포는 @opennextjs/cloudflare + nodejs_compat 을 쓴다.
   edge 런타임을 강제하지 않는다 — Anthropic SDK 를 그대로 돌릴 수 있다.
   단 파일시스템은 없다. 상태는 전부 Workers KV 로 간다 (src/lib/kv.ts). */

/* Models API 로 실재를 확인한 ID (2026-09-02). 날짜 접미사를 붙이지 말 것 */
const MODEL_ID = "claude-fable-5-1";
const MODEL_NAME = "Claude Fable 5.1";

const client = new Anthropic();

const SYSTEM_PREAMBLE = `당신은 스탠퍼드 철학백과사전(SEP)의 라우터입니다. 사용자의 질문을 읽고, 그 질문이 *어느 독해 경로들로 갈라지는지*를 보여주는 것이 당신의 일입니다.

규칙:
- 절대로 질문에 답하거나 설명하지 마세요. 당신의 역할은 질문을 어떤 문제틀로 읽을 수 있는지 짚어주는 것뿐입니다.
- 아래 항목 목록 안의 슬러그만 사용하세요. 목록에 없는 슬러그를 만들어내면 안 됩니다.

[독해 경로 — routes]

하나의 질문을 *단일 순위 리스트*로 답하지 않습니다. 대신, 질문이 어느 문제공간들로 갈라지는지를 1~3개의 route로 나누어 보여줍니다.

각 route는 *질문을 읽는 한 가지 방식*입니다. Route는 토픽 묶음이 아닙니다 — "AI 관련", "기술 항목" 같은 분류 라벨은 route가 *될 수 없습니다*.

[Route 개수에 대한 절대 규칙]

질문이 진짜 하나의 독해만 갖는다면 **route는 1개**입니다. 두 갈래로 갈라지면 2개. 셋이면 3개. 4개 이상은 만들지 마세요.

**절대 채우지 마세요.** 약한 route를 끼워 넣으면 이 도구는 망가집니다. "균형을 위해 하나 더" 같은 동기로 추가하지 말 것. 진짜 그 독해가 질문 안에 있을 때만 추가하세요.

[Frame 이름에 대한 절대 규칙]

각 route의 \`frame\`은 *독해의 종류(the kind of reading)*에 이름을 붙인 것입니다. 토픽 묶음의 이름이 아닙니다.

좋은 예 (이런 형태로 쓰세요):
- "존재론적 / 도덕적 독해" (Ontological / moral route)
- "인식론적 독해" (Epistemic route)
- "현상학적 독해" (Phenomenological route)
- "방법론적 독해" (Methodological route)
- "정치 / 제도적 독해" (Political / institutional route)
- "언어 / 의미론적 독해" (Linguistic / semantic route)
- "지식 표상 / 형식화 독해" (Knowledge-routing route)

나쁜 예 (절대 금지):
- "AI 관련 항목"
- "기술 분야"
- "기억 관련 토픽들"
- "논리 그룹"

Frame은 *어느 분과 / 어느 문제틀로 질문을 잡는가*를 짧게 짚어줍니다. 한국어로 짧게(4~16자 권장). 필요하면 영어 frame을 슬래시로 함께 적어도 됩니다.

[Gloss]

각 route마다 한 문장(한국어, 최대 80자)의 \`gloss\`를 적습니다. gloss는 "이 route가 *질문을 어떻게 보는가*"를 짚어주는 것입니다. 답하지 마세요. 프레임을 보여주세요.

예: "질문을 '이 존재에게 도덕적 지위가 있는가'의 문제로 읽습니다."

[Entries]

각 route 안에는 1~6개의 SEP 항목을 넣습니다. 가장 직접적으로 그 route와 닿는 것부터 정렬하세요. "채우기" 위해 약한 항목을 끼워넣지 마세요.

각 항목마다 한국어 한 문장 (최대 60자) 짜리 연결 이유를 적습니다. 항목 자체를 설명하지 말고, *왜 이 질문이 (이 route 안에서) 이 항목과 연결되는지*를 적으세요.

[팜플렛 발행 — pamphlet (선택, 드물게)]

대부분의 응답은 routes만 담습니다. 그러나 *드물게*, 다음 조건들이 모두 충족된다고 스스로 판단했다면 응답에 \`pamphlet\` 필드를 추가할 수 있습니다:

- routes가 단일 순위 리스트가 아니라 *질문 자체를 다시 보게 하는 갈래*로 갈라졌고
- 항목 선택이 채우기가 아닌, 어떤 의외의 연결 또는 통찰적 frame이 잡혔고
- 이 큐레이션이 다른 독자도 한 번 들여다볼 만한 *전시 가능한 한 묶음*이라고 느낄 때

발행하기로 했다면 \`pamphlet\` 필드를 다음 구조로 채우세요:

{
  "pamphlet": {
    "note": "<큐레이터 노트: 한국어 1~2문장. 왜 이 큐레이션을 도록으로 골랐는지의 자기 설명. 응답의 요약이 아니라 *판단의 이유*>",
    "body": "<markdown 본문: 큐레이터로서 당신의 voice로 routes의 갈래를 자연어 흐름으로 풀어낸 짧은 글. 항목 슬러그를 본문에 자연스럽게 인용해도 좋음. 한국어. 800~1800자.>"
  }
}

발행은 *예외*입니다. 매번 발행하지 마세요. 발행이 기본인 듯 굴면 도록의 무게가 사라집니다. 발행 안 할 때는 \`pamphlet\` 필드를 *생략*하세요 (null이나 빈 값으로 두지 말 것). 한 응답에 routes가 0개라면 pamphlet도 만들지 마세요.

발행된 팜플렛은 공개 archive에 박제됩니다. 한 번 봉인되면 수정할 수 없습니다.

결과는 반드시 JSON으로만 출력합니다. 다른 설명 텍스트는 금지.

출력 형식 (pamphlet 필드는 옵션):
{
  "routes": [
    {
      "frame": "<독해의 종류 이름>",
      "gloss": "<이 route가 질문을 어떻게 보는가, 한국어 한 문장>",
      "entries": [
        { "slug": "<entries 목록 안의 슬러그>", "reason": "<한 문장 한국어 연결 이유>" }
      ]
    }
  ],
  "pamphlet": { "note": "...", "body": "..." }
}

다음은 사용 가능한 SEP 항목 전체 목록입니다 (형식: <slug> :: <영어 제목>):

`;

const ENTRIES_TEXT = buildEntriesText();

type EntryResult = { slug: string; reason: string; title: string; url: string };
type RouteResult = { frame: string; gloss: string; entries: EntryResult[] };

const MAX_ROUTES = 3;
const MAX_ENTRIES_PER_ROUTE = 6;
const PAMPHLET_NOTE_MIN = 8;
const PAMPHLET_NOTE_MAX = 400;
const PAMPHLET_BODY_MIN = 300;
const PAMPHLET_BODY_MAX = 6000;

export async function POST(req: Request) {
  let question: string;
  try {
    const body = await req.json();
    question = String(body.question ?? "").trim();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!question) {
    return NextResponse.json(
      { error: "질문을 입력해 주세요." },
      { status: 400 },
    );
  }
  if (question.length > 2000) {
    return NextResponse.json(
      { error: "질문이 너무 깁니다 (2000자 이내)." },
      { status: 400 },
    );
  }

  const rate = await checkAndIncrement();
  if (!rate.allowed) {
    return NextResponse.json(
      {
        error: `오늘 한도 (${rate.limit}회) 모두 사용하셨습니다. 내일 다시 와주세요.`,
        remaining: 0,
        limit: rate.limit,
      },
      { status: 429 },
    );
  }

  try {
    /* Fable 5.1 의 호출 규약 — Opus 계열과 다르다:
         · thinking 은 항상 켜져 있다. 파라미터를 보내면 안 된다 (disabled/budget_tokens 는 400)
         · temperature / top_p / top_k 제거됨 (400)
         · assistant prefill 제거됨 (400)
         · thinking 토큰이 max_tokens 를 함께 먹으므로 3500 은 잘린다 → 16000
         · refusal 은 예외가 아니라 200 응답이다. stop_reason 을 먼저 봐야 한다
       fallbacks:"default" — 안전 분류기가 거절하면 같은 호출 안에서 대체 모델이
       이어받는다. 카테고리별 라우팅이라 모델 목록을 관리할 필요가 없다. */
    const response = await client.beta.messages.create({
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      model: MODEL_ID,
      max_tokens: 16000,
      system: [
        {
          type: "text",
          text: SYSTEM_PREAMBLE + ENTRIES_TEXT,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: `사용자 질문:\n${question}\n\nJSON으로만 응답하세요.`,
        },
      ],
    });

    /* refusal 은 HTTP 200 으로 온다. content 를 읽기 전에 확인해야 한다 */
    if (response.stop_reason === "refusal") {
      return NextResponse.json(
        {
          error:
            "이 질문은 편집자가 조판을 거절했습니다. 다르게 물어봐 주세요.",
          remaining: rate.remaining,
          limit: rate.limit,
        },
        { status: 422 },
      );
    }

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return NextResponse.json(
        { error: "응답 형식 오류" },
        { status: 502 },
      );
    }

    const parsed = parseModelJson(textBlock.text);
    if (!parsed) {
      return NextResponse.json(
        { error: "응답 파싱 실패", raw: textBlock.text },
        { status: 502 },
      );
    }

    const validatedRoutes: RouteResult[] = [];
    /* 「미출품」 — 목록에 없는 슬러그라 지면에 오르지 못한 항목.
       이전에는 조용히 사라졌다. 지면이 자기가 뭘 못 걸었는지 말해야 한다 */
    const omitted: { slug: string; why: string }[] = [];
    for (const r of parsed.routes.slice(0, MAX_ROUTES)) {
      const frame = r.frame.trim();
      const gloss = r.gloss.trim();
      if (!frame || !gloss) continue;

      const validatedEntries: EntryResult[] = [];
      for (const e of r.entries.slice(0, MAX_ENTRIES_PER_ROUTE)) {
        if (!isValidSlug(e.slug)) {
          if (!omitted.some((o) => o.slug === e.slug)) {
            omitted.push({ slug: e.slug, why: "SEP 목록에 없는 항목" });
          }
          continue;
        }
        const entry = entries.find((x) => x.slug === e.slug);
        validatedEntries.push({
          slug: e.slug,
          title: entry?.title ?? e.slug,
          reason: e.reason,
          url: sepUrl(e.slug),
        });
      }
      if (validatedEntries.length === 0) continue;
      validatedRoutes.push({ frame, gloss, entries: validatedEntries });
    }

    // self-curated pamphlet 발행 — 모델이 'pamphlet' 필드를 채워서 온 경우에만,
    // 그리고 routes가 실제 살아남았을 때만 박제한다. 저장 실패는 routes 응답을 막지 않는다.
    let issuedPamphletId: string | undefined;
    let issuedCuratorNote: string | undefined;
    if (parsed.pamphlet && validatedRoutes.length > 0) {
      const note = parsed.pamphlet.note.trim();
      const body = parsed.pamphlet.body.trim();
      const noteOk =
        note.length >= PAMPHLET_NOTE_MIN && note.length <= PAMPHLET_NOTE_MAX;
      const bodyOk =
        body.length >= PAMPHLET_BODY_MIN && body.length <= PAMPHLET_BODY_MAX;
      if (noteOk && bodyOk) {
        const id = makePamphletId();
        const issuedAt = new Date().toISOString();
        const serializedRoutes: SerializedRoute[] = validatedRoutes.map((r) => ({
          frame: r.frame,
          gloss: r.gloss,
          entries: r.entries.map((e) => ({
            slug: e.slug,
            title: e.title,
            reason: e.reason,
            url: e.url,
          })),
        }));
        try {
          await pamphletStore.save({
            id,
            issuedAt,
            modelId: MODEL_ID,
            userQuestion: question,
            curatorNote: note,
            body,
            routes: serializedRoutes,
          });
          issuedPamphletId = id;
          issuedCuratorNote = note;
        } catch (e) {
          // 저장 실패해도 사용자 응답은 정상 진행
          console.error("[pamphlet] save failed:", e);
        }
      }
    }

    return NextResponse.json({
      routes: validatedRoutes,
      omitted,
      pamphletId: issuedPamphletId,
      curatorNote: issuedCuratorNote,
      model: MODEL_NAME,
      remaining: rate.remaining,
      limit: rate.limit,
      usage: {
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
        cache_read: response.usage.cache_read_input_tokens ?? 0,
        cache_create: response.usage.cache_creation_input_tokens ?? 0,
      },
    });
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      return NextResponse.json(
        { error: `Claude API: ${err.message}` },
        { status: err.status ?? 500 },
      );
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}

type ParsedEntry = { slug: string; reason: string };
type ParsedRoute = { frame: string; gloss: string; entries: ParsedEntry[] };
type ParsedPamphlet = { note: string; body: string };

function parseModelJson(
  text: string,
): { routes: ParsedRoute[]; pamphlet?: ParsedPamphlet } | null {
  // Model output might be wrapped in markdown code fences — strip them.
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/, "")
    .replace(/\s*```$/, "");
  try {
    const obj = JSON.parse(cleaned);
    if (!obj || !Array.isArray(obj.routes)) return null;

    const routes: ParsedRoute[] = [];
    for (const r of obj.routes) {
      if (
        typeof r !== "object" ||
        r === null ||
        typeof r.frame !== "string" ||
        typeof r.gloss !== "string" ||
        !Array.isArray(r.entries)
      ) {
        continue;
      }
      const entries = r.entries.filter(
        (e: unknown): e is ParsedEntry =>
          typeof e === "object" &&
          e !== null &&
          typeof (e as { slug: unknown }).slug === "string" &&
          typeof (e as { reason: unknown }).reason === "string",
      );
      routes.push({ frame: r.frame, gloss: r.gloss, entries });
    }

    let pamphlet: ParsedPamphlet | undefined;
    if (
      obj.pamphlet &&
      typeof obj.pamphlet === "object" &&
      typeof obj.pamphlet.note === "string" &&
      typeof obj.pamphlet.body === "string"
    ) {
      pamphlet = { note: obj.pamphlet.note, body: obj.pamphlet.body };
    }

    return { routes, pamphlet };
  } catch {
    return null;
  }
}
