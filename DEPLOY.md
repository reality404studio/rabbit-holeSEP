# 배포 — Cloudflare Pages

이 앱은 **정적 사이트다.** 서버 런타임도, API 라우트도, 시크릿도 없다.

발행은 런타임 사건이 아니라 **커밋**이다. 매달 편집자(Fable)에게 질문을 던지고,
스스로 도록감이라 판단해 `pamphlet` 을 채워 온 회차만 `content/issues/` 에
파일로 떨어진다. 그 파일을 커밋·푸시하면 Pages 가 다시 빌드한다.

한 번 봉인된 회차는 수정하지 않는다는 규약은 그대로다. 이제 그걸 코드가 아니라
git 이 지킨다.

## 사전 조건

없다. KV 도, `ANTHROPIC_API_KEY` 도 클라우드에 존재하지 않는다.
`data/entries.json`(SEP 목차 1,865항목)은 리포에 커밋되어 있다.

## Cloudflare 설정

대시보드 → Workers & Pages → **Create** → **Pages** → **Connect to Git**
→ `reality404studio/rabbit-holeSEP`.

| 항목 | 값 |
|---|---|
| Production branch | `main` |
| Framework preset | `Next.js (Static HTML Export)` — 없으면 `None` |
| Build command | `npm run build` |
| Build output directory | `out` |

환경 변수는 없다. `next.config.mjs` 의 `output: "export"` 가 `out/` 을 뱉는다.

## 매달 발행 절차

### 1. 편집자에게 묻는다

`prompt/router.md` 를 시스템 프롬프트로 쓴다. 그 본문 뒤에 SEP 항목 목록이
`<slug> :: <영어 제목>` 형식으로 이어붙어야 한다:

```
npx tsx -e "import{buildEntriesText}from'./src/lib/entries';console.log(buildEntriesText())" > /tmp/entries.txt
```

응답을 JSON 파일로 받아 둔다 (코드펜스로 감싸여 와도 된다 — 벗겨낸다).

### 2. 기록한다

```
npm run ingest -- --question "<이번 달 질문>" --response <응답.json>
```

두 가지가 쓰인다:

- `content/issues/<id>.json` — 모델이 `pamphlet` 을 채웠고 길이 규약을 통과했을 때만.
  **사이트가 읽는 것은 이것뿐이다.**
- `content/log/<YYYY-MM>.jsonl` — 언제나. 발행되지 않은 회차도 이유와 함께 남는다.

스크립트는 모델을 부르지 않는다. 부르는 방법과 기록하는 방법을 일부러 갈라놨다.

### 3. 커밋한다

```
git add content/ && git commit && git push
```

발행 = 커밋 하나. 되돌리기는 `git revert`.

## 낙방 기록에 대하여

`content/log/` 가 이 프로젝트의 자산이다. 발행분보다 **발행되지 않은 것들**이
"편집자가 무엇을 도록감으로 보는가" 를 훨씬 많이 말한다.

그래서 살아남을 질문을 미리 골라선 안 된다. 발행 조건 세 개는 전부 질문이
아니라 *응답*의 속성이고 (`prompt/router.md` 의 「팜플렛 발행」 절), 통과할
법한 질문을 고르기 시작하면 통과율이 아무것도 측정하지 않게 된다.

## 발행 0건인 달

정상이다. 회차가 하나도 없으면 홈과 `/archive/none/` 이 빈 지면을 세운다.
지면이 "봉인된 회차가 아직 없습니다" 라고 직접 말한다 — 발행이 예외라는
명제를 지면이 증명하는 자리다.

## 로컬

```
npm run dev      # next dev
npm run build    # out/ 생성. 배포와 같은 산출물
npx serve out    # 정적 결과 확인
```

## 알려진 것

- **`generateStaticParams()` 가 빈 배열이면 `output:export` 빌드가 멈춘다.**
  발행 0건이 정상 상태이므로 `src/app/archive/[id]/page.tsx` 가 그때
  `none` 하나를 세운다. 회차가 생기면 이 경로는 사라진다.
- **모델은 `claude-fable-5-1`.** thinking 이 항상 켜져 있어 thinking 토큰이
  `max_tokens` 를 함께 먹는다. `temperature` / `budget_tokens` / assistant
  prefill 은 이 모델에서 400 이다. 거절(refusal)은 예외가 아니라 HTTP 200 이라
  `stop_reason` 을 먼저 본다.
- **SEP 목차 스크레이퍼는 조상 체인을 복원한다.** 목차가 하위 항목을 부모
  `<li>` 안에 중첩시키고 앵커에는 접미사만 넣기 때문이다
  (`identity-time` 의 앵커 텍스트는 "over time" 이다). 부모를 붙여
  "identity: over time" 으로 만든다. 이걸 안 하면 항목 544개의 제목이
  잘린 채로 지면에 인쇄된다.
