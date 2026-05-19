# patch — Next.js 앱 전체 리디자인 패치

`redesign.html`의 디자인을 0518.SEP Next.js 앱으로 그대로 옮긴 패치입니다.
**새 의존성 없음**, **기존 API 호환**, **빌드/배포에 안전**.

---

## 적용 방법

`patch/0518.SEP/` 아래 4개 파일을 같은 상대 경로로 그대로 덮어쓰세요.

```
patch/0518.SEP/src/app/layout.tsx              →  src/app/layout.tsx
patch/0518.SEP/src/app/globals.css             →  src/app/globals.css
patch/0518.SEP/src/app/page.tsx                →  src/app/page.tsx
patch/0518.SEP/src/app/api/match/route.ts      →  src/app/api/match/route.ts
```

그 다음 평소처럼:

```bash
npm run dev      # 로컬 확인
npm run build    # 프로덕션 빌드 확인
```

추가로 설치할 패키지 없습니다.

---

## 무엇이 바뀌나

### 1. `layout.tsx`
- Google Fonts 3종 로드 (`<link rel="preconnect">` + 스타일시트):
  - Noto Serif KR (본문 한글)
  - EB Garamond (라틴 활자, 이탤릭 강조)
  - JetBrains Mono (슬러그, 메타 정보)
- 메타데이터 description을 새 톤에 맞게 업데이트
- CDN 폰트 로딩 방식 — Next.js 빌드 시 별도 처리 불필요, 어디서든 안정적으로 작동

### 2. `globals.css`
- 디자인 토큰 정의: `--paper`, `--ink`, `--ink-2`, `--ink-3`, `--rule`, `--red`, 폰트 변수 3종
- `redesign.html`의 모든 클래스 그대로 이식: `.sheet`, `.masthead`, `.lede`, `.field`, `.engine`, `.matches`, `.marginalia`, `.colophon` 등
- 반응형 두 단계 (1100px → marginalia 하단으로 / 600px → 모바일)
- Tailwind 유틸리티와 충돌하지 않는 클래스명만 사용 (안정성)

### 3. `page.tsx`
- 기존 form/state 로직 보존, UI 구조만 `redesign.html`과 동일하게 재작성
- 좌측 본문 / 우측 marginalia 그리드 레이아웃
- engine plate: 매치 위에 `{model} 이 질문에서 끌어낸 패턴` + 패턴 목록 + 안내 화살표
- 평시 카운터 숨김 (한도 도달 시에만 노출)
- 에러는 잉크 적색 좌측 보더로 표시

### 4. `api/match/route.ts`
- 시스템 프롬프트가 **patterns 먼저, matches 다음**의 2단계 출력을 요구
- 응답에 `patterns: string[]`, `model: "claude-sonnet-4-6"` 추가
- 프롬프트 안에 "이것은 모델이 본 것이지 사람이 그렇게 생각해야 한다는 게 아니다" 라는 collab-schema 원칙 명시
- 파싱 실패 시 빈 배열로 안전 처리

---

## 안정성 체크리스트

- ✅ 새 dependency 없음 — `npm install` 다시 안 해도 됨
- ✅ API 응답 추가 필드는 모두 optional 처리 (`patterns ?? []`, `model ?? DEFAULT_MODEL`) — 기존 클라이언트가 있어도 안 깨짐
- ✅ 폰트는 CDN 로드 + 시스템 fallback (`ui-serif`, `Georgia`, `serif`) — 폰트 로드 실패해도 레이아웃 유지
- ✅ Tailwind preflight과 충돌 없음 — 모든 스타일은 명시적 클래스에 종속
- ✅ 반응형: 1100px / 600px 두 단계 브레이크포인트
- ✅ `prefers-color-scheme: dark` 자동 반전 제거 — 의도된 단일 라이트 모드

---

## 알려진 제약 / 다음 단계

- **폰트 CDN 의존**: Google Fonts가 차단된 환경에서는 시스템 serif로 fallback. 완전한 self-hosting이 필요하면 `next/font/google`로 마이그레이션 가능.
- **다크 모드 없음**: 의도된 결정. `redesign.html` 설계 노트 참고.
- **rate-limit 동작 미변경**: `src/lib/rate-limit.ts`는 그대로. 한도 도달 시 UI 만 새 톤으로 표시.
