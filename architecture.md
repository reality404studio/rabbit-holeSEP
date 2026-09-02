# architecture

> SEP 토끼굴(Rabbithol.SEP) — 사용자의 한 문장 질문을 SEP(Stanford Encyclopedia of Philosophy) 항목들의 *독해 경로(routes)*로 갈래 짓는 큐레이션 도구. 답을 주지 않고 입구를 짚는다. 모델이 스스로 "이건 도록감"이라 판단한 큐레이션은 공개 archive(`/archive`)에 박제된다.

이 문서는 **다음 세션의 모델 / 협업자**가 코드를 처음 열었을 때 빠르게 파악하기 위한 entry point다. 코드 자체에서 도출 가능한 잡다한 디테일이 아니라, *코드만 봐선 안 보이는* 의도와 결정을 적는다.

---

## 1. 디렉토리 트리 (요약)

```
Rabbithol.SEP/
├─ architecture.md            ← 이 파일
├─ DEPLOY.md                  Cloudflare Pages 설정 + 매달 발행 절차
├─ next.config.mjs            output: "export" — 정적 내보내기. trailingSlash
├─ package.json               Next 15, React 19, react-markdown. Anthropic SDK 없음
├─ prompt/
│  └─ router.md               큐레이터 시스템 프롬프트 (정본). 호출 시 목차가 뒤에 붙는다
├─ content/                   ★ 발행물. 이 디렉터리가 사이트의 내용이다
│  ├─ issues/<id>.json        봉인된 회차. 빌드 때 읽혀 정적 페이지로 굳는다
│  └─ log/<YYYY-MM>.jsonl     던진 질문 전부 + 발행 여부 + 낙방 이유
├─ data/
│  ├─ entries.json            SEP 슬러그+제목 1,865항목 (committed data, 인덱스)
│  └─ baseline.json           동결된 지도 (slug → 분야). map/freeze.mjs 가 만든다. 측정 전용
├─ map/                       동결된 지도 — 모델의 평균이 자리하는 기준선 (map/README.md)
├─ scripts/
│  ├─ fetch-entries.ts        SEP 목차 → entries.json. 조상 체인으로 제목 복원
│  └─ ingest.ts               모델 응답 → 검증 → content/ 에 기록. 모델을 부르지 않는다
└─ src/
   ├─ app/
   │  ├─ layout.tsx           폰트 로딩, html lang="ko"
   │  ├─ globals.css          디자인 토큰 + 모든 페이지의 CSS (Tailwind는 reset만)
   │  ├─ page.tsx             홈 — 최신 회차, 없으면 빈 지면
   │  └─ archive/
   │     ├─ page.tsx          봉인된 회차 목록
   │     └─ [id]/page.tsx     회차 상세. generateStaticParams
   ├─ components/
   │  ├─ press.tsx            리플렛 구성 요소 + 격자 유도 (순수 렌더)
   │  ├─ leaf.tsx             한 회차의 지면 (IssueLeaf) + 빈 지면 (EmptyLeaf)
   │  └─ dive.tsx             하강 레이어 — 스크롤 진행을 --depth 로 (client)
   └─ lib/
      ├─ entries.ts           entries.json 로더 + slug 검증 + SEP URL 빌더
      ├─ baseline.ts          baseline.json 로더 + 가로지름(spread) 계산. 모델에게는 안 보여준다
      └─ issues.ts            content/issues 읽기. 쓰기 경로가 없다 — 쓰는 쪽은 ingest.ts
```

---

## 2. 데이터 흐름 (한 회차의 라이프사이클)

**서버가 없다.** 발행은 런타임 사건이 아니라 커밋이다. 사용자는 질문을 타이핑하지
않는다 — 편집자에게 묻는 사람은 운영자 한 명이고, 그것도 로컬에서 묻는다.

```
① 묻는다 (로컬. 이 리포 밖)
  prompt/router.md + entries.json 목록  →  claude-fable-5-1
  · thinking 항상 켜짐. output_config.effort 로 깊이 조절
  · max_tokens 는 thinking 이 함께 먹는다. 큰 값은 스트리밍으로 받아 타임아웃 회피
  · 거절(refusal)은 예외가 아니라 200 이다 — stop_reason 을 먼저 본다
  · 응답: JSON { routes[{frame, gloss, pattern, entries}], pamphlet? }
  │
  ▼
② 기록한다 — scripts/ingest.ts
  parseModelJson       JSON 파싱 + 코드펜스 제거
  검증                 slug 화이트리스트(isValidSlug), ≤3 routes, ≤6 entries/route,
                       pattern ≤200자 / pamphlet: note 8~400자, body 300~6000자
  탈락한 slug          「미출품」(omitted)으로 남는다. 조용히 사라지지 않는다
  │
  ├─ pamphlet 있고 검증 통과 →  content/issues/<id>.json   ← 사이트가 읽는 것은 이것뿐
  └─ 언제나              →  content/log/<YYYY-MM>.jsonl  ← 낙방도 이유와 함께 남는다
  │
  ▼
③ 커밋한다
  git add content/ && git push  →  Cloudflare Pages 재빌드
  │
  ▼
④ 굳는다 — next build (output: "export")
  lib/issues.ts 가 content/issues 를 읽는다
  가로지름(spread)은 저장하지 않고 routes 에서 그때 계산한다 (lib/baseline.ts)
  회차가 0건이면 홈과 /archive/none/ 이 빈 지면을 세운다 — 정상 상태다
```

한 번 봉인된 회차는 수정하지 않는다는 규약은 그대로다. 이제 그것을 코드가 아니라
git 이 지킨다. `issues.ts` 에 `save` 가 없는 이유가 이것이다.

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

- **정적 사이트다.** 서버 런타임도, API 라우트도, KV 도, 시크릿도 없다.
  `ANTHROPIC_API_KEY` 는 클라우드에 존재하지 않는다. 배포는 Cloudflare Pages
  (`npm run build` → `out/`). 설정은 `DEPLOY.md`.
- **lockfile 을 package.json 과 맞춰 둘 것.** Pages 는 lockfile 이 있으면
  `npm ci` 를 쓴다. 어긋나면 빌드가 즉시 깨진다.
- **`generateStaticParams()` 가 빈 배열이면 `output:export` 빌드가 멈춘다.**
  발행 0건은 이 프로젝트의 정상 상태이므로 `archive/[id]` 가 그때 `none`
  하나를 세운다. 회차가 생기면 그 경로는 사라진다.
- **SEP 목차 스크레이퍼는 조상 체인을 복원한다.** 목차가 하위 항목을 부모
  `<li>` 안에 중첩시키고 앵커에는 접미사만 넣기 때문이다 (`identity-time` 의
  앵커 텍스트는 "over time"). 이걸 안 하면 항목 544개의 제목이 잘린 채로
  지면에 인쇄되고, 같은 목록이 프롬프트로 들어가므로 모델의 선택 근거도 상한다.
- **`data/baseline.json` 은 1,859항목 시점에 동결됐다.** 이후 SEP 가 바뀌어
  목차에만 있는 슬러그는 `spread` 에서 `unmapped` 로 빠진다. 정상 동작이며,
  지도를 다시 얼리기 전까지 분모(45개 분야)는 그대로 둔다.

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
