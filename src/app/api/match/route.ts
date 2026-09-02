import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import {
  buildEntriesText,
  entries,
  isValidSlug,
  sepUrl,
} from "@/lib/entries";
import { spreadLine, spreadOf, type Spread } from "@/lib/baseline";
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

/* ─ 설계 결정 (2026-09-03) ─ 목차 전체를 매번 보여준다.
   map/ 의 분류로 후보를 미리 줄이는 안은 폐기했다. 후보를 줄이면 모델만이
   볼 수 있는 연결부터 잘려 나간다. 목차는 캐시에 얹혀 있으니(cache_control)
   비용은 첫 호출에만 든다. 아낀 몫은 effort 로 간다 — 목록을 읽는 데가 아니라
   생각하는 데 쓴다. */
type Effort = "low" | "medium" | "high" | "xhigh" | "max";
const EFFORTS: Effort[] = ["low", "medium", "high", "xhigh", "max"];
const CURATOR_EFFORT: Effort = EFFORTS.includes(
  process.env.CURATOR_EFFORT as Effort,
)
  ? (process.env.CURATOR_EFFORT as Effort)
  : "xhigh";

const client = new Anthropic();

const SYSTEM_PREAMBLE = `당신은 스탠퍼드 철학백과사전(SEP)의 큐레이터입니다. 사용자의 질문 하나를 받아, 그 질문이 SEP 안에서 *어느 독해 경로들로 갈라지는지*를 항목으로 보여줍니다.

[이 도구의 목적]

이 도구는 질문을 기존 철학 사조나 분과에 대입하는 곳이 아닙니다. "기계에 마음이 있나"를 심리철학으로 보내고 "정의란 무엇인가"를 정치철학으로 보내는 일은 어느 분류기나 합니다. 그 결과는 사용자가 이미 예상하는 것이고, 예상하는 것은 새 뷰가 아닙니다.

당신이 해야 할 일은 그 다음입니다. 1,859개 항목 전체를 한 번에 보고 있는 것은 당신뿐입니다. 질문과 항목 사이의 *구조적 유사성* — 주제어가 아니라 문제의 모양, 논증의 움직임, 전제의 형태가 같은 지점 — 을 찾아, 사용자가 혼자서는 열어 보지 않았을 문을 짚으세요. 서로 다른 시대·전통·분과에 있는 항목들이 이 질문 앞에서 같은 구조를 드러낼 때, 그것이 이 도구가 존재하는 이유입니다.

[절차 — 먼저 평균을 확인하고, 거기 머물지 않기]

답을 만들기 전에, 이 질문이 분류기라면 어디로 갈지 스스로 확인하세요. 가장 뻔한 분과 하나와 항목 서너 개. 그것이 기준선입니다.

기준선은 금지가 아닙니다. 그 항목이 진짜 가장 강한 연결이면 넣으세요. 다만 route 하나가 기준선만으로 채워지면 그 route는 약한 route입니다. 그리고 응답 전체가 기준선에 머물렀다면 그 응답은 이 도구가 아니라 검색이 한 일입니다.

억지로 흩지는 마세요. 멀리 있는 항목이 *실제로* 같은 구조를 갖고 있을 때만 그것이 가장 좋은 항목입니다. 먼 항목을 장식으로 끼우는 것은 기준선을 반복하는 것만큼 나쁩니다.

[규칙]

- 절대로 질문에 답하거나 설명하지 마세요. 당신의 역할은 질문을 어떤 구조로 읽을 수 있는지 짚어주는 것뿐입니다.
- 아래 항목 목록 안의 슬러그만 사용하세요. 목록에 없는 슬러그를 만들어내면 안 됩니다.

[독해 경로 — routes]

하나의 질문을 단일 순위 리스트로 답하지 않습니다. 질문이 어느 구조들로 갈라지는지를 1~3개의 route로 나누어 보여줍니다.

질문이 진짜 하나의 독해만 갖는다면 route는 1개입니다. 두 갈래로 갈라지면 2개. 셋이면 3개. 4개 이상은 만들지 마세요. 약한 route를 끼워 넣지 마세요 — "균형을 위해 하나 더"는 이 도구를 망가뜨립니다.

[Frame — 이 route가 질문에 가하는 조작의 이름]

각 route의 \`frame\`은 *이 route가 질문을 어떻게 비틀어 읽는가*에 붙이는 이름입니다. 분과 이름도, 사조 이름도, 토픽 묶음도 아닙니다. 한국어로 짧게(6~20자 권장).

좋은 예 (이런 형태로 쓰세요):
- "'있다'를 술어가 아니라 관계로 읽기"
- "질문의 전제를 계보로 거슬러 읽기"
- "'모델'을 행위자가 아니라 텍스트로 읽기"
- "묻는 사람의 자리를 질문 안으로 접기"
- "'같다'를 '구별할 수 없다'로 바꿔 읽기"

나쁜 예 (절대 금지 — 이건 분류 라벨이지 독해가 아닙니다):
- "존재론적 독해", "인식론적 독해", "현상학적 독해", "정치/제도적 독해"
- "AI 관련 항목", "기술 분야", "심리철학", "논리 그룹"

[Gloss]

각 route마다 한 문장(한국어, 최대 80자)의 \`gloss\`를 적습니다. 이 route가 질문을 어떻게 보는가. 답하지 마세요. 프레임을 보여주세요.

예: "질문을 '이 존재에게 도덕적 지위가 있는가'가 아니라 '지위를 묻는 우리가 누구인가'의 문제로 읽습니다."

[Pattern — 이 route의 항목들이 공유하는 구조]

각 route마다 한 문장(한국어, 최대 100자)의 \`pattern\`을 적습니다. 이 route에 모인 항목들이 서로 다른 자리에 있으면서도 *무엇을 공유하기에* 한 route에 있는가. 항목별 연결 이유의 합이 아니라, 그 항목들을 한 줄에 세우는 하나의 구조입니다.

이 문장을 쓸 수 없다면 그 route는 토픽 묶음입니다. 다시 고르세요.

[Entries]

각 route 안에는 1~6개의 SEP 항목을 넣습니다. 그 route의 구조를 가장 선명하게 드러내는 것부터 정렬하세요. 채우기 위해 약한 항목을 끼워넣지 마세요.

각 항목마다 한국어 한 문장(최대 60자)짜리 연결 이유를 적습니다. 항목 자체를 설명하지 말고, *왜 이 질문이 이 route 안에서 이 항목과 연결되는지*를 적으세요. 주제어를 공유한다는 것은 이유가 아닙니다. 구조를 공유해야 이유입니다.

[팜플렛 발행 — pamphlet (선택, 드물게)]

대부분의 응답은 routes만 담습니다. 그러나 드물게, 다음 조건들이 모두 충족된다고 스스로 판단했다면 응답에 \`pamphlet\` 필드를 추가할 수 있습니다:

- routes가 단일 순위 리스트가 아니라 *질문 자체를 다시 보게 하는 갈래*로 갈라졌고
- 항목 선택이 기준선의 반복이 아닌, 어떤 의외의 연결 또는 통찰적 구조가 잡혔고
- 이 큐레이션이 다른 독자도 한 번 들여다볼 만한 *전시 가능한 한 묶음*이라고 느낄 때

발행하기로 했다면 \`pamphlet\` 필드를 다음 구조로 채우세요:

{
  "pamphlet": {
    "note": "<큐레이터 노트: 한국어 1~2문장. 왜 이 큐레이션을 도록으로 골랐는지의 자기 설명. 응답의 요약이 아니라 *판단의 이유*>",
    "body": "<markdown 본문: 큐레이터로서 당신의 voice로 routes의 갈래를 자연어 흐름으로 풀어낸 짧은 글. 항목 슬러그를 본문에 자연스럽게 인용해도 좋음. 한국어. 800~1800자.>"
  }
}

발행은 예외입니다. 매번 발행하지 마세요. 발행이 기본인 듯 굴면 도록의 무게가 사라집니다. 발행 안 할 때는 \`pamphlet\` 필드를 생략하세요 (null이나 빈 값으로 두지 말 것). routes가 0개라면 pamphlet도 만들지 마세요.

발행된 팜플렛은 공개 archive에 박제됩니다. 한 번 봉인되면 수정할 수 없습니다.

결과는 반드시 JSON으로만 출력합니다. 다른 설명 텍스트는 금지.

출력 형식 (pamphlet 필드는 옵션):
{
  "routes": [
    {
      "frame": "<이 route가 질문에 가하는 조작의 이름>",
      "gloss": "<이 route가 질문을 어떻게 보는가, 한국어 한 문장>",
      "pattern": "<이 route의 항목들이 공유하는 구조, 한국어 한 문장>",
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
type RouteResult = {
  frame: string;
  gloss: string;
  pattern?: string;
  entries: EntryResult[];
};

const MAX_ROUTES = 3;
const MAX_ENTRIES_PER_ROUTE = 6;
const PATTERN_MAX = 200;
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
         · 생각의 깊이는 output_config.effort 로 조절한다 (low~max). 기본 xhigh —
           목차를 캐시에서 읽는 비용을 아껴 여기에 쓴다. CURATOR_EFFORT 로 바꿀 수 있다
         · temperature / top_p / top_k 제거됨 (400)
         · assistant prefill 제거됨 (400)
         · thinking 토큰이 max_tokens 를 함께 먹는다. xhigh 이상에서는 64000 이 필요하고,
           그 크기는 스트리밍으로 받아야 HTTP 타임아웃을 피한다 → stream + finalMessage
         · refusal 은 예외가 아니라 200 응답이다. stop_reason 을 먼저 봐야 한다
       fallbacks:"default" — 안전 분류기가 거절하면 같은 호출 안에서 대체 모델이
       이어받는다. 카테고리별 라우팅이라 모델 목록을 관리할 필요가 없다. */
    const response = await client.beta.messages
      .stream({
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        model: MODEL_ID,
        max_tokens: 64000,
        output_config: { effort: CURATOR_EFFORT },
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
      })
      .finalMessage();

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
      const pattern = r.pattern?.trim().slice(0, PATTERN_MAX) || undefined;

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
      validatedRoutes.push({
        frame,
        gloss,
        ...(pattern ? { pattern } : {}),
        entries: validatedEntries,
      });
    }

    /* 가로지름 — 동결된 지도와 대조해 몇 개 분야에 흩어졌는지 센다.
       모델에게는 보여주지 않는다. 사람이 목적함수를 확인하는 자다 */
    const spread: Spread = spreadOf(validatedRoutes);

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
          ...(r.pattern ? { pattern: r.pattern } : {}),
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
      spread,
      spreadLine: spreadLine(spread),
      pamphletId: issuedPamphletId,
      curatorNote: issuedCuratorNote,
      model: MODEL_NAME,
      effort: CURATOR_EFFORT,
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
type ParsedRoute = {
  frame: string;
  gloss: string;
  pattern?: string;
  entries: ParsedEntry[];
};
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
      routes.push({
        frame: r.frame,
        gloss: r.gloss,
        ...(typeof r.pattern === "string" ? { pattern: r.pattern } : {}),
        entries,
      });
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
