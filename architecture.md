# architecture

> SEP 토끼굴(Rabbithol.SEP) — 사용자의 한 문장 질문을 SEP(Stanford Encyclopedia of Philosophy) 항목들의 *독해 경로(routes)*로 갈래 짓는 큐레이션 도구. 답을 주지 않고 입구를 짚는다. 모델이 스스로 "이건 도록감"이라 판단한 큐레이션은 공개 archive(`/archive`)에 박제된다.

이 문서는 **다음 세션의 모델 / 협업자**가 코드를 처음 열었을 때 빠르게 파악하기 위한 entry point다. 코드 자체에서 도출 가능한 잡다한 디테일이 아니라, *코드만 봐선 안 보이는* 의도와 결정을 적는다.

---

## 1. 디렉토리 트리 (요약)

```
Rabbithol.SEP/
├─ architecture.md            ← 이 파일
├─ next.config.mjs            externalPackages: @anthropic-ai/sdk (zod v3/v4 충돌 우회)
├─ package.json               Next 14.2, React 18, @anthropic-ai/sdk 0.72, zod 3, react-markdown 9
├─ data/
│  ├─ entries.json            SEP 슬러그+영어 제목 (committed data, 인덱스)
│  └─ baseline.json           동결된 지도 (slug → 분야). map/freeze.mjs 가 만든다. 측정 전용
├─ map/                       동결된 지도 — 모델의 평균이 자리하는 기준선 (map/README.md)
├─ scripts/
│  └─ fetch-entries.ts        SEP 목차에서 entries.json 갱신
└─ src/
   ├─ app/
   │  ├─ layout.tsx           폰트 로딩, html lang="ko"
   │  ├─ globals.css          디자인 토큰 + 모든 페이지의 CSS (Tailwind는 reset만)
   │  ├─ page.tsx             메인 — 질문 입력 + routes 렌더 + 박제 안내 (client)
   │  ├─ api/
   │  │  ├─ match/route.ts    모델 호출. routes + 옵션 pamphlet 응답. rate-limit + 발행 저장.
   │  │  └─ status/route.ts   GET — 일일 한도 조회
   │  └─ archive/
   │     ├─ page.tsx          공개 도록 목록 (server, force-dynamic)
   │     └─ [id]/page.tsx     도록 상세 — markdown 본문 + routes (server, force-dynamic)
   └─ lib/
      ├─ entries.ts           entries.json 로더 + slug 검증 + SEP URL 빌더
      ├─ baseline.ts          baseline.json 로더 + 가로지름(spread) 계산. 모델에게는 안 보여준다
      ├─ rate-limit.ts        KST 일일 카운터 (20회/일, KV)
      └─ pamphlets.ts         PamphletStore 인터페이스 + KVPamphletStore + ID 생성
```

---

## 2. 데이터 흐름 (한 요청의 라이프사이클)

```
사용자 질문
  │
  ▼
POST /api/match  ── rate-limit 검사 (KST 일일 20회)
  │
  ▼
Anthropic.beta.messages.stream(...).finalMessage()
  · model: claude-fable-5-1  (thinking 항상 켜짐, output_config.effort: xhigh — CURATOR_EFFORT 로 조절)
  · system: SYSTEM_PREAMBLE + 전체 SEP 슬러그 목록 (cache_control: ephemeral) — 후보를 미리 줄이지 않는다
  · max_tokens: 64000 (thinking 이 함께 먹는다; 스트리밍으로 받아 타임아웃 회피)
  · fallbacks: "default" — 안전 거절 시 같은 호출 안에서 대체 모델
  · 응답: JSON { routes[{frame, gloss, pattern, entries}], pamphlet? }
  │
  ▼
parseModelJson  ──  JSON 파싱 + 코드펜스 제거
  │
  ▼
검증
  · routes: slug 화이트리스트(`isValidSlug`)로 필터, ≤3 routes, ≤6 entries/route, pattern ≤200자
  · pamphlet: note 8~400자 / body 300~6000자 + routes ≥1 일 때만
  │
  ▼
가로지름(spread) — `spreadOf(routes)`: 고른 항목이 동결 지도의 45개 분야 중 몇 개에 흩어졌는가
  │
  ▼
pamphlet 있고 검증 통과 → pamphletStore.save() → id 발급
                       ↳ 저장 실패해도 routes 응답은 정상 (try/catch)
  │
  ▼
응답 { routes, omitted, spread, spreadLine, pamphletId?, model, effort, remaining, limit, usage }
  │
  ▼
page.tsx → routes 렌더 + (pamphletId 있으면) `.pamphlet-issued` 표식 + /archive/{id} 링크
```

archive 페이지 (`/archive`, `/archive/[id]`) 는 server component로 `pamphletStore.list()` / `.get()` 을 직접 호출한다. `force-dynamic`이라 파일 시스템 변화가 즉시 반영된다.

---

## 3. 핵심 디자인 결정 (코드만 봐선 안 보이는 의도)

### 3.1 큐레이션의 주체 — 모델 (사용자 X)

이 사이트는 모델이 **큐레이터**다. 사용자는 질문을 던지는 *주제 제안자*이자 *관람객*이지, 큐레이션 주체가 아니다. UI 카피·기능 설계 시 이 위계를 흐리지 말 것:

- 메인 페이지가 답을 주지 않는 것은 "기능 부족"이 아니라 **의도된 손실** (`page.tsx`의 `.colophon .loss` 참조).
- 항목 본문은 SEP에 있고, 이 사이트는 *입구만* 짚는다.

### 3.1b 목적함수 — 사조 대입이 아니라 패턴 연결 (2026-09-03)

이 사이트가 원하는 것은 "기계에 마음이 있나"를 심리철학으로 보내는 일이 아니다. 그건 어느 분류기나 한다. 원하는 것은 **모델만이 할 수 있는 패턴 연결** — 질문과 항목 사이의 구조적 유사성으로 SEP를 새 각도에서 보는 뷰다. 코드의 세 결정이 여기서 나온다:

- **후보를 미리 줄이지 않는다.** `map/` 의 분류로 2단계 라우팅(분야 고르기 → 후보 축소 → 큐레이션)을 하려던 계획은 폐기했다. 연결은 질문이 들어온 뒤에야 생기고, 후보를 줄이면 그 연결부터 잘린다. 목차 전체가 매번 (캐시된 채로) 들어간다. 아낀 비용은 `effort` 로 간다.
- **프롬프트가 평균을 먼저 확인시킨다.** `route.ts` 의 시스템 프롬프트는 "분류기라면 어디로 갈지"를 먼저 확인하고 거기 머물지 말라고 지시한다. frame 예시는 분과 라벨("존재론적 독해")이 아니라 조작 이름("'있다'를 술어가 아니라 관계로 읽기")이고, route 마다 항목들이 공유하는 구조 한 문장(`pattern`)을 요구한다. pattern 을 쓸 수 없는 route 는 토픽 묶음이다.
- **지도는 자(尺)로만 쓴다.** `map/` 은 페이블이 프롬프트 없이 수렴하는 자리를 동결한 기준선이다 (`map/README.md`). `src/lib/baseline.ts` 가 큐레이션이 45개 분야 중 몇 개를 가로질렀는지 세어 크레딧 「가로지름」에 적는다. **모델에게는 이 수를 보여주지 않는다** — 보여주면 자가 목표가 된다.

### 3.2 Pamphlet — 모델 self-curation 박물관

`/archive`는 **공개 큐레이션 박물관**이다. 핵심 결정사항:

- **발행 트리거 = 모델 self-curation** (사용자 발행 버튼 없음). 모델이 시스템 프롬프트의 *팜플렛 발행* 섹션 기준으로 "이건 도록감"이라 자기 판단했을 때만 응답에 `pamphlet` 필드를 채워서 보냄. 시스템 프롬프트는 "발행은 예외"라고 명시.
- **Immutable**. 한 번 저장된 도록은 수정·삭제·fork·편집 없음. `PamphletStore` 인터페이스는 `save / list / get`만 노출 (`delete`/`update` 메서드 자체가 없음).
- **사용자 거부권 없음**. 모델이 발행을 결정하면 사용자는 막지 못한다. 단 사용자에게는 발행 사실이 응답 영역에서 즉시 인지된다 (`.pamphlet-issued` 표식).
- **메타 = 모델 ID + 발행 시점(UTC ISO) + 사용자 질문 + 큐레이터 노트(왜 발행했는지 1-2문장) + markdown 본문 + 박제 당시 routes 스냅샷**. 사용자 신원·식별 정보는 받지 않는다.
- **모델 간 참조 없음 — RAG 인프라 안 만듦**. 새 큐레이션 호출 시 이전 팜플렛을 모델 컨텍스트로 절대 주입하지 않는다. 모델이 매번 "새 전시"를 새로 기획한다 (자기 옛 도록을 뒤지지 않는다).
- **모델 익명화 금지**. 큐레이터 모델 ID/버전은 UI에 그대로 노출 (`.model-id` — 항상 모노스페이스+파랑).

### 3.3 형식 — markdown raw

도록 본문은 markdown 한 덩어리로 저장한다. JSON/YAML로 가지 않는다. 이유 — JSON/YAML로 가는 순간 큐레이터(모델)가 "데이터 입력자"로 격하되고 voice가 필드로 쪼개진다. markdown만이 모델이 자기 흐름으로 글을 쓸 수 있는 형식이다. `routes`는 JSON으로 같이 박제되되 도록 본문의 *부수 데이터*다 (상세 페이지 하단의 "도록 안의 갈래").

### 3.4 타이포그래피 — 서체 역할 체계 (2026-06 리디자인)

서체가 장식이 아니라 **발화 주체의 표시**다. 비평판(critical edition)의 조판 문법을 따른다:

| 발화 주체 | 서체 | 규칙 |
| --- | --- | --- |
| 사람의 질문 | Noto Serif KR (명조) | 페이지에서 **가장 큰 글자** (`.echo`, 입력 textarea) |
| SEP 원문 제목 | Literata (라틴 북페이스) | 손대지 않은 원문, 두 번째 위계 (`.entry-title`) |
| 안내자(모델)의 말 | Pretendard (산세리프) | 사이트의 모든 설명 카피 포함 — 사이트가 곧 안내자의 목소리 |
| 기계 문자열 | JetBrains Mono | 모델 ID와 URL, **이 둘뿐** (`.model-id`, `.entry-slug`) |

- **파랑(`--hand`)은 오직 모델의 손이 닿은 곳에만**: hand-mark, 갈래 kicker, 연결 이유 줄표, 발행 태그, submit 버튼(모델을 부르는 행위). 색의 존재 = 큐레이터의 존재 증명.
- **`.hand` / `.hand-mark`**: 모델이 말하는 모든 블록에 「안내 — 모델 ID」 필체 귀속이 붙는다. ≥1080px에선 왼쪽 여백에 매달림(고서 필사본의 hand attribution), 그 이하에선 블록 위에 인라인.
- **한글에 `font-style: italic` 금지**. Noto Serif KR엔 이탤릭이 없어 브라우저가 가짜 기울임을 합성한다 — 이전 디자인의 균형 붕괴 원인 중 하나였다.
- 이전 marginalia 사이드바는 본문 하단의 **일러두기**(번호 주석) 섹션으로 흡수됐다.

### 3.5 카피 register — 절제된 어휘

메인 페이지 **일러두기**의 "어휘. 쓰지 않는 말" 항목이 어휘 정책의 정본이다. 새 기능 카피 추가 시 다음 어휘를 *피한다*:

| ❌ 쓰지 않는 말 | ✅ 대체어 |
| --- | --- |
| 프롬프트 | 질문 |
| AI 추천 | 연결 |
| 검색 | 펼치기 |
| 관련도 | 순서 |
| Export / Share / Snapshot | 발행 / 박제 / 도록 |

발행 액션은 "Issue Pamphlet" / "팜플렛 발행"이고 보관소 콘텐츠 어휘는 "박제된 도록"이다. **"박제"는 도록 자체를 가리키는 명사**로만 쓰고, *발행 액션의 동사*로는 쓰지 않는다 (액션 동사로 쓰면 톤이 다크해진다).

---

## 4. 인프라 노트 — 배포 시 반드시 짚을 것

- `src/lib/rate-limit.ts`와 `src/lib/pamphlets.ts` 둘 다 **로컬 파일 시스템 기반**이라 Vercel(또는 모든 serverless ephemeral fs)에 배포하면 작동하지 않거나 데이터가 휘발한다.
- 마이그레이션 시 **인터페이스는 보존**한다:
  - `RateLimitResult` / `checkAndIncrement` / `getStatus` 그대로 — 내부만 KV로 교체
  - `PamphletStore` 인터페이스 (`save / list / get`) 그대로 — `FilePamphletStore`를 `KVPamphletStore` 또는 `PostgresPamphletStore`로 갈아끼움
- `@anthropic-ai/sdk`는 `next.config.mjs`의 `serverComponentsExternalPackages`에 등록되어 있다 — SDK가 의존하는 zod 헬퍼와 프로젝트 zod 버전이 충돌해서. 함부로 풀지 말 것.

---

## 5. 의도적으로 안 만든 것 (Non-goals)

다음은 *생각 안 해서 빠진 게 아니라 의도적으로 안 만든 것들*. 추가 요청이 오면 위 §3 디자인 결정과 충돌하지 않는지 먼저 점검:

- 사용자 계정·로그인·세션
- 사용자 발행 버튼 ("내가 마음에 든 응답 저장")
- 도록 편집·삭제·fork
- 도록 댓글·좋아요·공유 카운터
- 도록 검색·태그·카테고리 (모델 간 참조 없음 결정과 연결됨)
- 모델이 이전 도록을 참고하는 RAG
- 사용자별 보관소·책장
- `map/` 분류로 후보를 미리 줄이는 2단계 라우팅 (§3.1b — 시도했고 접었다)
- 모델에게 「가로지름」 수치를 보여주는 것 (자가 목표가 된다)
