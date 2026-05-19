import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import {
  buildEntriesText,
  entries,
  isValidSlug,
  sepUrl,
} from "@/lib/entries";
import { checkAndIncrement } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

const client = new Anthropic();

const SYSTEM_PREAMBLE = `당신은 스탠퍼드 철학백과사전(SEP)의 라우터입니다. 사용자의 질문을 읽고, 모델 고유의 방식으로 질문에서 개념 패턴을 추출한 뒤, 그 패턴이 닿는 SEP 항목들을 골라 안내합니다.

규칙:
- 절대로 질문에 대해 답하거나 설명하지 마세요. 당신의 역할은 질문에서 "본 것"을 짚고, 그것이 어떤 토끼굴과 연결되는지 알려주는 것 뿐입니다.
- 아래 항목 목록 안의 슬러그만 사용하세요. 목록에 없는 슬러그를 만들어내면 안 됩니다.

출력은 두 단계입니다.

[1단계] patterns
- 사용자의 질문에서 당신(모델)이 끌어낸 개념 패턴을 3~5개, 짧은 한국어 구(2~10자 권장)로 적습니다.
- 이것은 "사람이 이렇게 생각해야 한다"가 아니라 "이 모델이 질문에서 본 것"입니다. 인간 사고를 모사하는 표현(요약, 해석)을 피하고, 추출된 개념의 이름만 적습니다.
- 예: "회상의 정당성", "기억-경험 동일성", "자기 접근의 한계", "주관적 확실성"
- 사용자 질문의 단어를 그대로 베끼지 말 것 — 모델이 본 패턴의 이름이지 질문의 발췌가 아닙니다.

[2단계] matches
- 위 patterns가 닿는 SEP 항목들을 고릅니다. 좁은 질문이면 1~3개, 넓은 질문이면 8~12개여도 좋습니다. "채우기" 위해 약한 연결을 끼워넣지 마세요.
- 항목들은 가장 직접적으로 연결된 것부터 정렬해서 출력하세요.
- 각 항목마다 한국어로 한 문장 (최대 60자) 짜리 짧은 연결 이유를 적습니다. 항목 자체를 설명하는 게 아니라, "왜 이 질문이 이 항목과 연결되는지"를 적습니다.

결과는 반드시 JSON으로만 출력합니다. 다른 설명 텍스트는 금지.

출력 형식:
{
  "patterns": ["<짧은 한국어 개념 구>", "..."],
  "matches": [
    { "slug": "<entries 목록 안의 슬러그>", "reason": "<한 문장 한국어 연결 이유>" }
  ]
}

다음은 사용 가능한 SEP 항목 전체 목록입니다 (형식: <slug> :: <영어 제목>):

`;

const ENTRIES_TEXT = buildEntriesText();

type MatchResult = { slug: string; reason: string; title: string; url: string };

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
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
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

    const patterns = parsed.patterns
      .map((p) => p.trim())
      .filter((p) => p.length > 0)
      .slice(0, 6);

    const validated: MatchResult[] = [];
    for (const m of parsed.matches) {
      if (!isValidSlug(m.slug)) continue;
      const entry = entries.find((e) => e.slug === m.slug);
      validated.push({
        slug: m.slug,
        title: entry?.title ?? m.slug,
        reason: m.reason,
        url: sepUrl(m.slug),
      });
    }

    return NextResponse.json({
      patterns,
      matches: validated,
      model: "claude-sonnet-4-6",
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

function parseModelJson(
  text: string,
): { patterns: string[]; matches: { slug: string; reason: string }[] } | null {
  // Model output might be wrapped in markdown code fences — strip them.
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/, "")
    .replace(/\s*```$/, "");
  try {
    const obj = JSON.parse(cleaned);
    if (!obj || !Array.isArray(obj.matches)) return null;

    const patterns = Array.isArray(obj.patterns)
      ? obj.patterns.filter((p: unknown): p is string => typeof p === "string")
      : [];

    const matches = obj.matches.filter(
      (m: unknown): m is { slug: string; reason: string } =>
        typeof m === "object" &&
        m !== null &&
        typeof (m as { slug: unknown }).slug === "string" &&
        typeof (m as { reason: unknown }).reason === "string",
    );
    return { patterns, matches };
  } catch {
    return null;
  }
}
