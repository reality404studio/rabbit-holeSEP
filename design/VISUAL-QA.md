# VISUAL QA CONTRACT

`design/DESIGN-SYSTEM.md`를 렌더 결과에서 **PASS / FAIL로 판정 가능한 형태**로만 추출한 것.
스펙의 산문을 반복하지 않는다. 판정할 수 없는 항목은 넣지 않았다.

검토 순서는 고정이다. **상위가 FAIL인 상태에서 하위를 손보지 않는다.**

```
1 composition → 2 geometry → 3 hierarchy → 4 alignment → 5 typography
→ 6 vertical rhythm → 7 responsive → 8 optical exceptions → 9 decoration
```

검사 뷰포트: **1440 (wide)** · **1100 / 1060 (1080 경계 양쪽)** · **820 (tablet)** · **390 (mobile)**

진단 원칙: 증상이 아니라 **지배 규칙의 실패**를 먼저 찾는다.
"6px 왼쪽으로 옮긴다"가 아니라 "이 요소가 잘못된 column anchor를 상속하고 있다".

---

## A. Machine-checkable

DOM / computed style / `getBoundingClientRect()` 로 판정. 실행 스크립트: `design/tools/qa.js`

---

### A1 · 두 세로선 (L1 / L2)

**Rule** — 앵커 요소의 좌우 끝이 content 경계에 정확히 앉는다. (§3 정렬 관계, R1)

**How to inspect**
```js
const c = sheet.getBoundingClientRect(), cs = getComputedStyle(sheet);
const L1 = c.left + parseFloat(cs.paddingLeft);
const L2 = c.right - parseFloat(cs.paddingRight);
// 좌측 앵커: .mh .wing, .meta .l, .sechd .en, .foot p, 각 섹션의 첫 블록
// 우측 앵커: .mh .wing.r, .meta .r, .sechd .ko, .foot .r, 각 섹션의 마지막 블록
```

**PASS** — 좌측 앵커 전부 `|left − L1| ≤ 1px`, 우측 앵커 전부 `|right − L2| ≤ 1px`

**Failure meaning** — subgrid 상속이 끊겼거나 밴드가 자기 `grid-template-columns`를 다시 정의하고 있다. **개별 요소의 margin으로 고치지 말 것** — `grid-template-columns:subgrid`가 빠진 밴드를 찾는다.

---

### A2 · 섹션 헤더 6+6 불변

**Rule** — 본문 조판이 섹션마다 달라도 `.sechd`는 항상 6+6(모바일 3+3). (R2)

**How to inspect** — 모든 `.sechd .en` / `.sechd .ko`의 computed `grid-column`

**PASS** — 데스크톱 전부 `1 / 7` + `7 / 13`. 모바일 전부 `1 / 4` + `4 / 7`. 예외 0건.

**Failure meaning** — 섹션 컴포넌트가 헤더까지 자기 조판에 끌어들였다. 헤더는 조판 바깥의 상수다.

---

### A3 · 12px 바닥

**Rule** — 렌더된 `font-size`가 12px 미만인 텍스트 노드가 없다. (§5, 10px 단 삭제)

**How to inspect**
```js
[...document.querySelectorAll('*')].filter(el =>
  el.textContent.trim() && !el.children.length &&
  parseFloat(getComputedStyle(el).fontSize) < 11.99)
```

**PASS** — 결과 배열 길이 0. 전 뷰포트에서.

**Failure meaning** — 10px 단이 되살아났다. 좁은 화면에서 글자를 줄여 맞춘 흔적일 가능성이 높다 — §8 "축소가 아니라 위계 보존" 위반.

---

### A4 · 가로 괘선은 전폭

**Rule** — 모든 가로 괘선은 `grid-column:1/-1`. 부분 괘선 없음. (R6)

**How to inspect** — `border-top`/`border-bottom`이 0이 아닌 밴드 레벨 요소의 width

**PASS** — 각 괘선의 width == content 폭(±1px). `.ladder .row`의 점선은 예외(행 폭 = 그 행의 span).

**Failure meaning** — 괘선을 컴포넌트 안에 넣었다. 괘선은 지면의 구조물이지 컴포넌트의 장식이 아니다.

---

### A5 · 괘선 굵기 사다리

**Rule** — 3px ink(lead) > 1px ink(mid) > 1px hair(tail). 하단 2px ink. 제호 아래 2px+1px 이중. (R3, §3)

**How to inspect** — `.sec--lead/mid/tail`의 computed `border-top-width` + `border-top-color`

**PASS** — 정확히 `3px rgb(18,22,31)` / `1px rgb(18,22,31)` / `1px rgba(18,22,31,.2)`

**빈 상태에서는 검사하지 않는다** — `.sec.blank{border-top-color:var(--hair)}` 가
의도적으로 괘선을 흐린다(R8). 조판 후에만 판정한다.

**Failure meaning** — 3계층이 무너졌다. B2(squint)가 반드시 같이 FAIL 난다.

---

### A6 · 적색 종류 제한

**Rule** — 적색은 4종류에만. 장식/강조 목적 적색 금지. (R7 — 개수 상한이 아니다)

**How to inspect** — `color` 또는 `background`가 `--red`인 요소를 전부 수집하고 각각을 아래로 분류

**PASS** — 수집된 요소 전부가 다음 중 하나: ① 편집자 이름 밑줄 ② `.kk` ③ 조판 상태 표시(점·커서·오등록) ④ hover/error. 분류 불가 요소 0건. 그리고 **`.kk`는 한 섹션당 최대 1개.**

**측정 전 마우스를 지면 밖으로 옮길 것.** 클릭 직후 포인터가 버튼 위에 남아 있으면
`:hover` 적색이 잡혀 거짓 FAIL 이 난다(실제로 났다). hover 는 R7 이 허용하는 일시 상태다.

**Failure meaning** — 적색이 브랜드 색으로 새고 있다. "중요하니까 빨갛게"는 이 지면의 문법이 아니다.

---

### A7 · 조판 결정이 데이터에서 유도된다

**Rule** — 섹션 계층은 route 순번, 조판은 entry 개수가 정한다. 하드코딩 없음. (§10.1)

**How to inspect** — routes 1개(entry 1·2·6개) / 3개 케이스를 각각 렌더

| n | 기대 |
|---|---|
| 1 | `.lead` 1개 |
| 2 | `.facing` 1개 |
| 3 | `.lead` + `.pair` |
| 6 | `.lead` + `.pair` + `.ladder`(3행) |

**PASS** — 4케이스 전부 표대로. route 2번째는 `.sec--mid`, 3번째는 `.sec--tail`.

**Failure meaning** — 네 조판을 하나의 카드 컴포넌트로 평탄화했다. 이 디자인의 핵심 상실.

---

### A8 · `pair`의 순위 배치

**Rule** — 더 직접적인 항목(먼저 온 것)이 **넓은 쪽**. DOM 순서는 유지. (R4, §10.1)

**How to inspect** — `.pair > .item` 두 개의 DOM 순서와 computed `grid-column`

**PASS** — DOM 1번째가 `6 / 13`(넓은 쪽), 2번째가 `1 / 6`. 탭 순서는 DOM 순서 그대로.

**Failure meaning** — 시각 순위와 데이터 순위가 반대다. 덜 직접적인 항목이 더 커 보인다.

---

### A9 · 가로 스크롤 0

**Rule** — 전 뷰포트에서 가로 스크롤 없음.

**How to inspect** — `document.documentElement.scrollWidth === clientWidth`

**PASS** — 1440 / 1100 / 1060 / 820 / 390 전부 true

**Failure meaning** — `nowrap` 요소(제호) 또는 `min-width`가 그리드를 밀고 있다.

---

### A10 · 토큰 밖 리터럴

**Rule** — 새 spacing / font-size / breakpoint를 컴포넌트 로컬 매직넘버로 만들지 않는다.

**How to inspect** — `globals.css`에서 `:root` 밖의 `px` 리터럴을 grep

**PASS** — 남은 리터럴이 전부 다음 중 하나: ① §9 [예외] 목록 ② 괘선 굵기(1/1.5/2/3px) ③ 텍스처 좌표(0.5~7px). 그 외 0건.

**Failure meaning** — 스케일로 설명되지 않는 값이 들어왔다. 값을 바꾸기 전에 "기존 토큰으로 설명 가능한가"를 먼저 묻는다.

---

## B. Render-checkable

스크린샷을 보고 판정. 각 뷰포트에서 1장씩.

---

### B1 · 사용자 질문이 1차 지배 질량

**Rule** — squint(블러) 상태에서 가장 먼저 읽히는 덩어리는 사용자의 질문 하나. (§2 지각 3단)

**How to inspect** — **조판 후(입력이 있는)** 스크린샷에 gaussian blur 8~12px.
초안은 "조판 전"이라고 적었으나 그건 틀렸다 — 빈 상태에는 사용자의 질문이 없고
placeholder 는 E8 에 따라 의도적으로 연하다(3.32:1). 빈 상태에서 제호가 더 무겁게
읽히는 것은 결함이 아니다.

**PASS** — 입력이 있는 상태의 블러에서 **하나의 덩어리만** 뚜렷하다. 제호는 그다음.
보조 실측: 질문의 행상자 높이 > 제호의 행상자 높이.

**Failure meaning** — 입력 슬롯의 상하 여백이 줄었거나 주변 요소가 커졌다. 여백이 질량을 만든다(§6) — 크기를 키우지 말고 **여백을 되돌린다.**

---

### B2 · 섹션 3계층이 블러에서 구분된다

**Rule** — 괘선 굵기 × 섹션명 크기 × 색, 셋이 함께 움직인다. (R3)

**How to inspect** — 조판 후 스크린샷에 blur, 섹션 경계만 본다

**PASS** — 세 계층의 경계 강도가 눈에 띄게 다르다. lead가 가장 강하다.

**Failure meaning** — 셋 중 하나만 바뀌었다. 세 축을 같이 움직여야 계층이 생긴다.

---

### B3 · 질량의 좌우 관계

**Rule** — LEAD는 좌측, BACKGROUND/pair는 우측, DISPUTE/facing은 중앙. (§6)

**How to inspect** — 조판 후 blur, 각 섹션의 시각 무게중심이 어느 쪽인지

**PASS** — lead 좌측 편중 · pair 우측 편중 · facing 대칭. 셋이 서로 다르다.

**Failure meaning** — 섹션들이 같은 실루엣이 됐다. A7이 PASS인데 B3이 FAIL이면 조판은 맞고 칸 배정이 틀렸다.

---

### B4 · 빈 상태가 카드 UI로 읽히지 않는다

**Rule** — 각진 모서리, 아주 옅은 면, hairline. 카드가 아니라 아직 인쇄되지 않은 칸. (R8)

**How to inspect** — 조판 전 스크린샷

**PASS** — `border-radius` 0, 그림자 없음, 면 대비가 거의 안 보일 정도로 옅다. 더미 텍스트 괘선은 **좁은 본문 단에만**, 큰 제목 면은 민무늬.

**Failure meaning** — 스켈레톤을 일반 카드 로더로 구현했다.

---

### B5 · 비대칭이 평탄화되지 않았다

**Rule** — 네 조판이 서로 다른 실루엣을 유지한다. generic centered web layout이 아니다. (§1-5)

**How to inspect** — 조판 후 전체 스크린샷을 멀리서 본다

**PASS** — 섹션 경계를 가려도 각 섹션을 형태만으로 구별할 수 있다. 특히 `ladder`의 우하향 계단이 보인다.

**Failure meaning** — 구현 편의로 공통 컴포넌트를 만들었다.

---

### B6 · 그리드가 보이지 않는다

**Rule** — 칸 안내선·와이어프레임 표시 없음. "Show the result of the grid, not the grid." (§1-6)

**How to inspect** — 조판 전/후 스크린샷

**PASS** — 반복 세로선 없음. 보이는 선은 §3 괘선 목록에 있는 것뿐.

**Failure meaning** — 디버그 안내선이 남았다.

---

### B7 · 어절이 쪼개지지 않는다

**Rule** — `keep-all` + `overflow-wrap:normal`. (§5)

**How to inspect** — 390px에서 가장 좁은 단(`.lead .n` 방주, `.pair` 좁은 쪽)의 줄바꿈

**PASS** — 어절 중간에서 끊긴 줄 0. URL만 `anywhere`로 끊긴다.

**Failure meaning** — `break-word` / `anywhere`가 전역에 걸렸다. **좁아서 생긴 문제가 아니다** — 설정 문제다.

---

### B8 · 영문 제목이 대문자가 아니다

**Rule** — 항목 제목은 라틴 대소문자 유지. (E6, §10.2)

**How to inspect** — 긴 제목(`The Computational Theory of Mind` 급) 렌더

**PASS** — 대소문자 유지, 자간 `.04em` 수준. 낱말 윤곽이 살아 있다.

**Failure meaning** — `.la` 클래스의 `text-transform:uppercase`를 제목에 그대로 상속시켰다.

---

## C. Exception checks

§9의 광학 예외가 **정규화 과정에서 사라지지 않았는지** 확인. 전부 "없어졌는지"를 보는 검사다.

---

### C1 · 제호 광학 보정 (E1)

**Rule** — 귀 블록에 `padding-bottom:9px`. 4px 배수가 아니며 간격 스케일에 흡수하면 안 된다.

**How to inspect** — `design/tools/measure-ink.js`의 `measureMasthead()`

**PASS** — DELTA `|Δ| ≤ 1.5px`. (드래프트 측정값 −0.03px)

**Failure meaning** — 보정을 "이상한 값"으로 보고 8px이나 12px로 반올림했다. 제호 가운데가 오목해 보인다.

---

### C2 · DISPUTE 괘선이 거터 정중앙 (E4)

**Rule** — `padding-left:gut/2` + `margin-left:-gut/2`. 단순 `border-left`가 아니다.

**How to inspect** — `.facing > .item + .item`의 border x좌표 vs 두 칸 사이 거터의 중심

**PASS** — `|border_x − gutter_center| ≤ 1px`. 두 항목의 content 폭이 서로 같다.

**Failure meaning** — 대칭이 깨져 두 주장이 대등해 보이지 않는다.

---

### C3 · 사람의 커서 ink / 기계의 커서 red (E7)

**Rule** — 입력 caret은 잉크색, 조판 중 커서는 적색. 토큰 하나로 합치지 않는다.

**How to inspect** — `#q`의 computed `caret-color` / 조판 중 `.t.typing::after`의 `background`

**PASS** — 각각 `--ink` / `--red`. 두 값이 다르다.

**Failure meaning** — "커서 색"을 하나로 통일했다. 주체 구분이 사라진다.

---

### C4 · 혼식 라틴 105% (E2)

**Rule** — 한글 문장 안의 라틴(`SEP` 등)은 `.lat`으로 105%.

**How to inspect** — `.lat`의 computed font-size vs 부모

**PASS** — 비율 1.05 (±0.01). 그리고 `.lat`의 `letter-spacing`이 0.

**Failure meaning** — 전역 font-size 정규화가 `.lat`을 삼켰다. 한글 사이의 라틴이 아래로 내려앉아 보인다.

---

### C5 · 편집자 밑줄 길이 보정 (E3)

**Rule** — `::after`의 `right:.14em`. 자간이 마지막 글자 뒤에도 붙기 때문.

**How to inspect** — 밑줄 오른쪽 끝 vs 마지막 글자의 오른쪽 끝

**PASS** — 밑줄이 글자보다 길지 않다 (`밑줄_right ≤ 글자_right + 1px`)

**Failure meaning** — `--tr-la`를 바꾸면서 연동값을 안 바꿨다. 두 값은 같이 움직인다.

---

### C6 · `.kk` 빈 줄 남기지 않음 (E10)

**Rule** — `.kk:empty { display:none }`. 조건부 여백을 컴포넌트 기본 마진으로 흡수하지 않는다.

**How to inspect** — `gloss` 없는 섹션(또는 두 번째 이후 블록)의 제목 위 여백

**PASS** — `.kk`가 없는 블록의 제목 상단 여백이 있는 블록과 다르지 않게 정상. 빈 8px 줄 없음.

**Failure meaning** — `.kk`에 `margin-bottom`을 주고 `:empty` 처리를 뺐다.

---

### C7 · 빈 상태 facing의 subgrid 해제 (E11)

**Rule** — `.sec.blank .facing > .item { grid-row:auto; display:block }`

**How to inspect** — 조판 전 facing 스켈레톤의 높이

**PASS** — 두 블록 높이 == 예약값(112px). 납작하게 접히지 않는다.

**Failure meaning** — 빈 행이 0으로 접혀 `min-height`가 무시됐다. 블록이 실처럼 보인다.

---

### C8 · 제호 nowrap + line-height .9 (E5)

**Rule** — 제호는 줄바꿈하지 않고, 행간 .9로 죽은 공간을 없앤다.

**How to inspect** — 1100 / 1060 / 820px에서 제호와 귀 사이 간격.
**반드시 `Range.getBoundingClientRect()` 로 잉크를 잰다.** 귀는 3칸 블록 전체를
차지하지만 글자는 그 일부만 채우므로, `getBoundingClientRect()` 로 블록을 재면
겹치지 않는데도 겹쳤다고 나온다(실제로 이 검사가 −57.5px 거짓 경보를 냈다).

**PASS** — 제호 1줄 유지, 잉크 간격 ≥ 24px.

**Failure meaning** — clamp 하한이나 귀 칸 배정이 틀렸다.

---

## 판정 기록 — 2026-08-20

실행: `node design/tools/qa.mjs` (playwright, deviceScaleFactor 2, `/api/match` 를 픽스처로 가로챔)
빌드: `npm run build` → `PORT=3111 npm run start`

`P` pass · `—` 해당 없음 · `n/a` 그 상태에서는 판정하지 않음

| # | 1440 | 1100 | 1060 | 820 | 390 | 비고 |
|---|---|---|---|---|---|---|
| A1 두 세로선 | P | P | P | P | P | 좌우 앵커 전부 오차 ≤1px |
| A2 헤더 6+6 | P | P | P | P | P | 4개 섹션 전부 `1/7`+`7/13` (좁은 화면 `1/4`+`4/7`) |
| A3 12px 바닥 | P | P | P | P | P | 11.99px 미만 0건 |
| A4 괘선 전폭 | P | P | P | P | P | |
| A5 굵기 사다리 | P | P | P | P | P | 빈 상태는 n/a (R8 이 의도적으로 흐림) |
| A6 적색 종류 | P | P | P | P | P | 상시 `.kk`×3 + 편집자 밑줄. 분류 불가 0건 |
| A7 조판 유도 | P | — | — | — | — | n=1→lead · 2→facing · 3→lead+pair · 6→lead+pair+ladder |
| A8 pair 순위 | P | P | P | P | P | 넓은 쪽 `6/13` = DOM 1번째 |
| A9 가로 스크롤 | P | P | P | P | P | |
| A10 리터럴 | P | P | P | P | P | 초안은 2건 위반이었다 — clamp 하한(26/32px)과 예약 행상자(20/28px)가 로컬 리터럴이었다. 토큰화 후 통과 |
| B1 질문 지배 | P | P | P | P | P | 행상자 87.5px vs 제호 64.0px (입력 상태) |
| B2 3계층 블러 | P | P | P | P | P | |
| B3 좌우 질량 | P | P | P | — | — | lead 좌 · pair 우 · facing 대칭 |
| B4 카드 아님 | P | P | P | P | P | radius 0, 그림자 없음 |
| B5 비대칭 유지 | P | P | P | — | — | 좁은 화면은 §8 대로 의도적 평탄화 |
| B6 그리드 비노출 | P | P | P | P | P | |
| B7 어절 유지 | P | P | P | P | P | URL 만 `anywhere` 로 끊김 |
| B8 제목 대소문자 | P | P | P | P | P | |
| C1 제호 보정 | P | P | P | — | — | `--mh-optical:9px` 유지 |
| C2 거터 정중앙 | P | P | — | — | — | border 720.0 == center 720.0, 폭 480.0/480.0 |
| C3 커서 두 색 | P | P | P | P | P | caret `rgb(18,22,31)` / 조판 커서 `--red` |
| C4 라틴 105% | P | P | P | P | P | 비율 1.050, letter-spacing normal |
| C5 밑줄 보정 | P | P | P | P | P | `::after` right 1.68px (=.14em) |
| C6 `.kk` 빈 줄 | P | P | P | P | P | |
| C7 빈 facing | P | P | P | P | P | |
| C8 제호 간격 | P | P | — | — | — | 잉크 간격 28.0 / 76.6px |

### 실측 기하

| 뷰포트 | content | 칸 | 거터 |
|---|---|---|---|
| 1440 | 984.0px | **60.00px** | 24px |
| 1100 | 964.0px | 58.33px | 24px |
| 1060 | 996.0px | 152.67px | 16px |
| 820 | 756.0px | 112.67px | 16px |
| 390 | 326.0px | 41.00px | 16px |

1440 에서 content 984.0 / 칸 60.00 / 거터 24 — §3 의 계산값과 정확히 일치.

### 이 검수에서 잡은 것

**설계 결함 2건** (둘 다 지배 규칙의 실패였고, 국소 보정으로 고치지 않았다)

1. `.pair` 의 두 항목이 **다른 행에 놓였다.** 명시 칸만 주고 `grid-row` 를 주지 않아
   자동배치가 2번을 다음 행으로 밀었다 — 드래프트가 제호에서 겪은 것과 같은 실패다.
   → `.pair>.item{grid-row:1}` (좁은 화면에서는 `auto` 로 되돌림)
2. `gloss` 를 첫 `.item` **안에** 넣어 `facing` 의 행 공유가 깨졌다. 한쪽에만 한 줄이
   더 있으니 두 제목이 같은 줄에서 시작하지 않았다 — facing 의 정의 자체가 무너진다.
   → `.kk` 를 섹션 레벨로 올려 조판 **위에** 둔다. 어떤 조판의 기하도 바뀌지 않는다.

**검사 도구 결함 3건** (도구가 틀렸고 디자인은 옳았다 — `detection-failures.md` 에 합류할 사례)

1. C8 이 블록을 재서 −57.5px 충돌을 보고했다. 잉크로 재면 +28.0px. 귀는 3칸 블록을
   차지하지만 글자는 그 일부만 채운다. → `Range` 로 잰다.
2. A6 이 `button.go` 를 적색으로 잡았다. 클릭 후 포인터가 버튼에 남아 `:hover` 가
   걸린 것. → 측정 전 마우스를 치운다.
3. A5 가 빈 상태에서 FAIL 했다. `.sec.blank` 가 괘선을 흐리는 건 R8 의 의도다.
   → 빈 상태에서는 판정하지 않는다.

**하네스 결함 2건** — 첫 재실행이 `EADDRINUSE` 로 새 서버 기동에 실패했는데
`curl` 은 살아 있는 **옛 서버**에 200 을 받았다. 고친 코드가 아니라 고치기 전 빌드를
검사하고 "전부 통과"를 보고할 뻔했다. 실제로 화면이 그대로여서 발각됐다.
→ 검사 전에 **served CSS 해시가 바뀌었는지** 확인한다.

2. A10(리터럴 감사)을 눈으로 훑고 "통과"로 적었는데, 주석을 걷어내고 선언만 파싱하니
   실제 위반이 2건 있었다 — `clamp()` 하한 `26px`/`32px` 과 예약 행상자 `20px`/`28px`.
   → `--t-mast-min` `--t-r1-min` `--lb-meta` `--lb-body` 로 토큰화했다.
   grep 한 줄로는 부족하다. **주석 제거 후 선언 단위로 파싱**해야 한다.

### 남은 것 (계약 위반 아님)

- 390px 에서 `sec--lead` 의 섹션명 `READING ONE` 이 두 줄로 나뉜다.
  3칸(126px)에 20px 라틴 대문자 + `.13em` 자간이라 넘친다. 크기를 줄이면 R3 의
  3계층 결합(굵기×크기×색)이 깨지므로 건드리지 않았다.
- `lead` 조판의 9칸 블록이 영문 한 단어 제목(`Functionalism`)일 때 비어 보인다.
  §10.2 의 결과다 — 드래프트의 한글 제목은 두 줄이었다. 규칙 위반은 아니다.
