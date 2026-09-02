# 배포 — Cloudflare Workers

이 앱은 **정적 사이트가 아니다.** `/api/match` 가 서버에서 Anthropic API 를
호출하므로 서버 런타임이 필요하다. 정적 내보내기를 하면 API 라우트가 사라지고,
키를 클라이언트에 넣으면 공개 사이트에 그대로 노출된다.

배포 경로는 **Cloudflare Workers + `@opennextjs/cloudflare`** 다.
API 키는 Cloudflare 의 암호화된 Secret 으로만 존재하고 브라우저로 가지 않는다.

## 사전 조건

Cloudflare 에는 쓰기 가능한 파일시스템이 없다. 하루 한도 카운터와 도록
보관소가 둘 다 Workers KV 를 쓴다 (`src/lib/kv.ts`).
바인딩이 없으면 프로세스 메모리로 떨어지고 재시작하면 사라진다 — 배포본
로그에 `[kv] ... 바인딩이 없습니다` 가 보이면 아래 1번이 안 된 것이다.

## 순서

### 1. KV 네임스페이스 만들기

```
npx wrangler kv namespace create RABBITHOLE_KV
```

출력된 `id` 를 `wrangler.jsonc` 의 `kv_namespaces[0].id` 에 붙여넣고 커밋한다.
(대시보드에서 만들었다면 Workers & Pages → KV 에서 id 를 복사)

### 2. GitHub 연결

Cloudflare 대시보드 → Workers & Pages → **Create** → **Import a repository**
→ `reality404studio/rabbit-holeSEP` 선택.

빌드 설정:

| 항목 | 값 |
|---|---|
| Build command | `npm run cf:build` |
| Deploy command | `npx wrangler deploy` |
| Build output directory | `.open-next` |

`wrangler.jsonc` 가 리포에 있으므로 KV 바인딩과 `nodejs_compat` 은 자동으로 잡힌다.

### 3. API 키 넣기 — 마지막

**리포에도, `wrangler.jsonc` 에도 적지 않는다.**

대시보드 → 해당 Worker → Settings → **Variables and Secrets** →
Type을 **Secret** 으로 두고:

```
ANTHROPIC_API_KEY = <키>
```

CLI 를 쓴다면:

```
npx wrangler secret put ANTHROPIC_API_KEY
```

넣은 뒤 재배포해야 반영된다.

## 로컬

```
npm run dev          # next dev. KV 바인딩 없으면 메모리 폴백
npm run cf:build     # 배포 산출물 생성 (.open-next/worker.js)
npm run cf:preview   # workerd 로 로컬 미리보기 — 배포와 같은 런타임
npm run cf:deploy    # 수동 배포
```

로컬에서는 `.env.local` 의 `ANTHROPIC_API_KEY` 를 읽는다. 이 파일은
`.gitignore` 되어 있고 커밋되면 안 된다.

## 알려진 것

- **모델은 `claude-fable-5-1`.** thinking 이 항상 켜져 있어 thinking 토큰이
  `max_tokens` 를 함께 먹는다. 그래서 3500 → 16000 으로 올렸다.
  `temperature` / `budget_tokens` / assistant prefill 은 이 모델에서 400 이다.
- **거절(refusal) 은 예외가 아니라 HTTP 200 이다.** `stop_reason` 을 먼저 본다.
  `fallbacks: "default"` 로 서버측 대체 모델을 켜 두었다.
- 시스템 프롬프트에 SEP 목차 1,859 항목이 통째로 들어간다(≈138KB).
  `cache_control: ephemeral` 로 캐시되지만 **첫 호출은 비싸다.**
  하루 한도(`DAILY_LIMIT = 20`, `src/lib/rate-limit.ts`)가 유일한 비용 방어선이다.
- 카운터는 원자적이지 않다. 동시 요청 둘이 한 번 더 통과할 수 있다.
  정확해야 하면 Durable Object 로 옮긴다.
