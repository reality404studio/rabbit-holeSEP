# 한글 조판 도구

원칙 문서: `../kr-typography.draft.md`

---

## kr-typo-detect.mjs — 정적 검출기

브라우저 없이 소스만 보고 잡을 수 있는 한글 조판 결함을 찾는다. **의존성 0.**

```bash
node design/tools/kr-typo-detect.mjs design/v9-스케일.html
node design/tools/kr-typo-detect.mjs --json  src/**/*.css      # 기계용
node design/tools/kr-typo-detect.mjs --strict <파일>            # 결함 있으면 exit 1 (훅용)
```

`.html`(인라인 `<style>`)과 `.css` 둘 다 받는다.

### 룰

| id | 심각도 | 잡는 것 |
|---|---|---|
| `kr-word-split` | error | `word-break:keep-all` 과 `overflow-wrap:break-word\|anywhere` 공존 → 어절이 쪼개진다 |
| `kr-missing-keep-all` | error | `lang="ko"` 에 한글이 있는데 `keep-all` 선언이 없다 |
| `kr-latin-tracking-on-hangul` | error | 양수 자간(≥.05em) 규칙이 **직접 한글 텍스트를 가진** 요소에 걸렸다 |
| `kr-palt-global` | warning | `palt` 를 `body`/`html`/`*`/`:root` 에 걸었다 (일본어용) |
| `kr-stack-order` | warning | 폰트 스택에서 한글 폰트가 라틴 폰트보다 앞 → 라틴이 두 종류로 그려진다 |
| `kr-tight-leading` | warning | 한글 본문(≤22px) 행간이 1.6 미만 |
| `kr-scale-noise` | warning | font-size 고유값이 10개 초과이거나 1.5px 이내로 붙은 쌍이 2개 이상 |

### 설계상 중요한 점

**커스텀 프로퍼티를 해석한다.** 이게 없으면 토큰 기반 CSS 에서 findings 0 이 나오는데,
그건 무결점이 아니라 미검출이다. (이 세션에서 다른 검출기가 실제로 이 함정에 빠졌다.)
픽스처 `bad-a.html` 은 일부러 `overflow-wrap: var(--wrap)` 로 값을 숨겨놨고, 그래도 잡힌다.

**선택자를 조상 사슬까지 맞춰본다.** 마지막 클래스 하나만 보면
`.wing.r`(한글)과 `.foot .r`(라틴)처럼 흔한 클래스명이 뒤섞여 오탐이 난다.
`:not()`·속성 선택자·`+`/`~` 가 든 선택자는 위험하므로 건너뛴다(미검출을 택한다).

**한글 직접 텍스트만 본다.** 조상에까지 텍스트를 귀속시키면 최상위 컨테이너가
모든 한글을 갖게 돼 오탐이 폭발한다.

### 한계

- 정적 분석이라 **잉크 위치·광학 정렬·실제 줄바꿈은 못 본다.** 그건 `measure-ink.js` 와 눈.
- 런타임에 JS 가 주입하는 스타일/텍스트는 못 본다.
- 폰트 사전(`KR_FONTS`)에 없는 한글 폰트는 `kr-stack-order` 가 놓친다.

---

## kr-typo-detect.test.mjs — 회귀 테스트

```bash
node design/tools/kr-typo-detect.test.mjs
```

픽스처(`__fixtures__/`)와 이 프로젝트의 v7 / v9 를 함께 돌린다.

- `bad-a.html` — 6개 룰이 동시에 걸린다
- `bad-b.html` — `keep-all` 부재
- `v9-스케일.html` — **0건이어야 한다** (오탐 감시)
- `v7` — 원본에 실제로 있던 결함이 잡힌다

**룰을 추가하면 기대값도 같이 추가할 것.** 한 번도 발화한 적 없는 룰은 있으나 마나다.
실제로 처음 만들었을 때 7개 중 4개가 미발화 상태였고, 픽스처를 만들고서야 확인됐다.

---

## measure-ink.js — 잉크 위치 측정기 (브라우저 콘솔)

박스가 아니라 **실제 잉크**의 위치·높이·중심을 잰다.
`align-items` 는 박스를 맞추지 글자를 맞추지 않으므로, 혼식 정렬은 이걸로 재야 한다.

```js
// 콘솔에 파일 내용을 붙여넣은 뒤
measureMasthead()
measureInk([['제목','.title','THE RABBIT HOLE'], ['설명','.desc','한글 표본']])
```

`DELTA` 가 0 에 가까울수록 광학적으로 맞은 것. ±1px 안쪽이면 충분하다.
