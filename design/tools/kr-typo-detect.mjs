#!/usr/bin/env node
/* 한글 조판 정적 검출기 — 브라우저 없이 소스만 보고 잡을 수 있는 것들
 *
 *   node kr-typo-detect.mjs [--json] [--strict] <file.html|file.css ...>
 *
 * --json    기계용 출력
 * --strict  findings 가 있으면 exit 1 (훅에서 쓸 때)
 *
 * 설계 원칙
 *  · 의존성 0. 훅에서 매번 돌아야 하므로 설치가 필요하면 안 된다.
 *  · **커스텀 프로퍼티를 반드시 해석한다.** var() 를 못 읽는 검출기는
 *    토큰 기반 CSS 에서 "findings 0" 을 뱉는데, 그건 무결점이 아니라 미검출이다.
 *  · 확실한 것만 잡는다. 오탐이 한 번 나면 훅 전체가 무시당한다.
 */

import fs from 'node:fs';
import path from 'node:path';

const HANGUL = /[가-힣ᄀ-ᇿ㄰-㆏]/;

/* 한글 폰트 사전 — 이 목록에 있으면 "한글 글리프를 가진 폰트"로 본다.
   대부분 라틴 글리프도 함께 갖고 있다는 점이 rule kr-stack-order 의 전제다. */
const KR_FONTS = [
  'nanum', 'noto serif kr', 'noto sans kr', 'noto serif korean', 'noto sans korean',
  'pretendard', 'spoqa', 'gowun', 'hahmlet', 'gmarket', 'ibm plex sans kr',
  'apple sd gothic neo', 'applegothic', 'malgun gothic', 'source han',
  'black han sans', 'song myung', 'jua', 'do hyeon', 'sunflower', 'gaegu',
  'kirang haerang', 'stylish', 'yeon sung', 'dongle', 'gasoek', 'moirai',
  'hi melody', 'poor story', 'single day', 'east sea dokdo', 'gugi',
  '나눔', '바탕', '돋움', '굴림', '맑은 고딕', '명조', '고딕',
];
const GENERIC = [
  'serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui',
  'ui-serif', 'ui-sans-serif', 'ui-monospace', 'ui-rounded',
  '-apple-system', 'blinkmacsystemfont', 'emoji', 'math', 'fangsong',
];

const isKrFont = (n) => KR_FONTS.some((k) => n.includes(k));
const isGeneric = (n) => GENERIC.includes(n);

/* ── CSS 파싱 ───────────────────────────────────────────────── */

function stripComments(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, '');
}

/* {} 블록을 재귀적으로 훑어 { selector, decls, media } 목록을 만든다 */
function parseCSS(src) {
  src = stripComments(src);
  const rules = [];

  function walk(text, mediaCtx) {
    let i = 0;
    let buf = '';
    while (i < text.length) {
      const ch = text[i];
      if (ch === '{') {
        const head = buf.trim();
        buf = '';
        // 짝이 맞는 } 까지 읽는다
        let depth = 1;
        let body = '';
        i++;
        while (i < text.length) {
          if (text[i] === '{') depth++;
          else if (text[i] === '}') {
            depth--;
            if (depth === 0) break;
          }
          body += text[i];
          i++;
        }
        if (head.startsWith('@')) {
          // at-rule: 안쪽을 다시 훑는다 (@media, @supports …)
          const nextCtx = /^@(media|supports|container)/.test(head)
            ? (mediaCtx ? mediaCtx + ' ' + head : head)
            : mediaCtx;
          if (/^@(media|supports|container|layer)/.test(head)) walk(body, nextCtx);
          // @font-face, @keyframes 등은 본문 대상이 아니므로 버린다
        } else {
          rules.push({ selector: head, decls: parseDecls(body), media: mediaCtx || '' });
        }
      } else if (ch === '}') {
        buf = '';
      } else {
        buf += ch;
      }
      i++;
    }
  }

  walk(src, '');
  return rules;
}

function parseDecls(body) {
  const out = {};
  let depth = 0;
  let cur = '';
  const parts = [];
  for (const ch of body) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ';' && depth === 0) {
      parts.push(cur);
      cur = '';
    } else cur += ch;
  }
  if (cur.trim()) parts.push(cur);
  for (const p of parts) {
    const idx = p.indexOf(':');
    if (idx < 0) continue;
    const prop = p.slice(0, idx).trim().toLowerCase();
    const val = p.slice(idx + 1).trim();
    if (!prop) continue;
    // 같은 블록에서 중복 선언되면 뒤엣것이 이긴다
    out[prop] = val;
  }
  return out;
}

/* ── 커스텀 프로퍼티 해석 ──────────────────────────────────── */

function collectVars(rules) {
  const vars = new Map();
  for (const r of rules) {
    for (const [prop, val] of Object.entries(r.decls)) {
      if (!prop.startsWith('--')) continue;
      // :root / html / body 의 값을 우선하되, 없으면 아무거나 (미디어쿼리 값은 덮어쓰지 않음)
      const isRoot = /(^|,)\s*(:root|html|body)\s*(,|$)/.test(r.selector);
      if (isRoot || !vars.has(prop)) {
        if (isRoot && r.media) {
          if (!vars.has(prop)) vars.set(prop, val);
        } else {
          vars.set(prop, val);
        }
      }
    }
  }
  return vars;
}

function resolveVars(value, vars, depth = 0) {
  if (depth > 12 || !value.includes('var(')) return value;
  const out = value.replace(/var\(\s*(--[\w-]+)\s*(?:,([^()]*(?:\([^()]*\)[^()]*)*))?\)/g,
    (m, name, fallback) => {
      if (vars.has(name)) return vars.get(name);
      return fallback !== undefined ? fallback.trim() : m;
    });
  return out === value ? out : resolveVars(out, vars, depth + 1);
}

/* ── 값 헬퍼 ───────────────────────────────────────────────── */

function toPx(v) {
  if (!v) return null;
  // clamp(a,b,c) / min() / max() 는 최댓값 후보를 취한다 (스케일 노이즈 판단용)
  const nums = [...String(v).matchAll(/(-?\d*\.?\d+)px/g)].map((m) => parseFloat(m[1]));
  if (!nums.length) return null;
  return Math.max(...nums);
}

function toEm(v) {
  if (!v) return null;
  const m = String(v).trim().match(/^(-?\d*\.?\d+)em$/);
  return m ? parseFloat(m[1]) : null;
}

function unitlessNum(v) {
  const m = String(v).trim().match(/^(-?\d*\.?\d+)$/);
  return m ? parseFloat(m[1]) : null;
}

/* ── HTML: 클래스/선택자별 "직접 텍스트" 수집 ──────────────── */

const VOID = new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);

/* 한글 **직접** 텍스트를 가진 요소마다 그 조상 사슬을 기록한다.
 * 조상까지 텍스트를 귀속시키면 .press 같은 최상위가 모든 한글을 갖게 되고,
 * 반대로 마지막 클래스 하나만 보면 .wing.r 과 .foot .r 처럼 흔한 클래스명이
 * 뒤섞여 오탐이 난다. 그래서 사슬 전체를 들고 선택자와 제대로 맞춰본다. */
function collectHangulNodes(html) {
  const nodes = [];   // [{ chain:[{tag,id,classes}], text }]
  const stack = [];

  const tagRe = /<\/?([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^>])*?)\/?>/g;
  let last = 0;
  let m;
  while ((m = tagRe.exec(html))) {
    const text = html.slice(last, m.index);
    if (text.trim() && stack.length) {
      const top = stack[stack.length - 1];
      if (top.tag !== 'script' && top.tag !== 'style' && HANGUL.test(text)) {
        nodes.push({ chain: stack.slice(), text: text.trim() });
      }
    }
    last = tagRe.lastIndex;

    const closing = m[0][1] === '/';
    const tag = m[1].toLowerCase();
    const attrs = m[2] || '';
    if (closing) {
      for (let k = stack.length - 1; k >= 0; k--) {
        if (stack[k].tag === tag) { stack.length = k; break; }
      }
    } else if (!VOID.has(tag) && !m[0].endsWith('/>')) {
      const cls = (attrs.match(/\bclass\s*=\s*"([^"]*)"/i) || attrs.match(/\bclass\s*=\s*'([^']*)'/i) || [])[1] || '';
      const id = (attrs.match(/\bid\s*=\s*"([^"]*)"/i) || attrs.match(/\bid\s*=\s*'([^']*)'/i) || [])[1] || '';
      stack.push({ tag, classes: cls.split(/\s+/).filter(Boolean), id });
    }
  }
  return nodes;
}

/* 하나의 복합 선택자(.a.b#c 또는 div.a)가 한 요소와 맞는가 */
function matchCompound(compound, el) {
  const c = compound.replace(/::?[\w-]+(\([^)]*\))?/g, '');   // 의사 클래스/요소 제거
  if (!c) return true;
  const tagM = c.match(/^([a-zA-Z][\w-]*)/);
  if (tagM && tagM[1].toLowerCase() !== el.tag) return false;
  for (const [, id] of c.matchAll(/#([\w-]+)/g)) if (el.id !== id) return false;
  for (const [, cls] of c.matchAll(/\.([\w-]+)/g)) if (!el.classes.includes(cls)) return false;
  return true;
}

/* 선택자 하나가 조상 사슬과 맞는가 (자손 ' ' 과 자식 '>' 만 지원) */
function matchesChain(sel, chain) {
  if (sel.includes(':not(') || /[+~[]/.test(sel)) return false;   // 위험한 건 건너뛴다
  const parts = sel.replace(/>/g, ' > ').trim().split(/\s+/).filter(Boolean);
  let ci = chain.length - 1;
  let i = parts.length - 1;
  if (i < 0) return false;
  if (!matchCompound(parts[i], chain[ci])) return false;
  i--; ci--;
  while (i >= 0) {
    if (parts[i] === '>') {
      i--;
      if (i < 0 || ci < 0) return false;
      if (!matchCompound(parts[i], chain[ci])) return false;
      i--; ci--;
    } else {
      let found = false;
      while (ci >= 0) {
        if (matchCompound(parts[i], chain[ci])) { found = true; ci--; break; }
        ci--;
      }
      if (!found) return false;
      i--;
    }
  }
  return true;
}

/* 선택자가 가리키는 요소가 한글 직접 텍스트를 갖는가 */
function selectorHasHangul(selector, nodes) {
  for (const sel of selector.split(',').map((s) => s.trim())) {
    if (!sel) continue;
    for (const n of nodes) if (matchesChain(sel, n.chain)) return true;
  }
  return false;
}

/* ── 규칙 ──────────────────────────────────────────────────── */

function analyze(file, css, html) {
  const rules = parseCSS(css);
  const vars = collectVars(rules);
  const nodes = collectHangulNodes(html || '');
  const findings = [];
  const add = (id, name, severity, detail, why) =>
    findings.push({ rule: id, name, severity, file, detail, why });

  const R = (v) => (v == null ? v : resolveVars(String(v), vars));

  /* 1 ─ keep-all 과 overflow-wrap 이 싸운다 */
  for (const r of rules) {
    const wb = R(r.decls['word-break']);
    const ow = R(r.decls['overflow-wrap'] || r.decls['word-wrap']);
    if (wb && /keep-all/.test(wb) && ow && /(break-word|anywhere)/.test(ow)) {
      add('kr-word-split', '어절이 쪼개진다', 'error',
        `${r.selector} { word-break:${wb.trim()}; overflow-wrap:${ow.trim()} }`,
        'overflow-wrap 이 keep-all 을 이긴다. 칸이 좁아지면 "먹었습니/다" 처럼 어절 중간에서 끊긴다. overflow-wrap:normal 로 두고, 끊을 곳이 없는 URL 에만 anywhere 를 준다.');
    }
  }

  /* 2 ─ palt 를 전역에 걸었다 */
  for (const r of rules) {
    const ff = R(r.decls['font-feature-settings']);
    if (!ff || !/palt/.test(ff)) continue;
    const global = /(^|,)\s*(\*|:root|html|body)\s*(,|$)/.test(r.selector);
    if (global) {
      add('kr-palt-global', 'palt 를 본문에 걸었다', 'warning',
        `${r.selector} { font-feature-settings:${ff.trim()} }`,
        'palt 는 일본어 조판용 비례 자간 조정이다. 한글 본문에 걸면 자간이 들쭉날쭉해진다. 큰 디스플레이 글자에만.');
    }
  }

  /* 3 ─ 라틴용 자간/대문자 규칙 안에 한글이 들어 있다 */
  for (const r of rules) {
    const lsRaw = R(r.decls['letter-spacing']);
    if (!lsRaw) continue;
    const em = toEm(lsRaw);
    const px = toPx(lsRaw);
    const positive = (em != null && em >= 0.05) || (px != null && px >= 1);
    if (!positive) continue;
    if (!selectorHasHangul(r.selector, nodes)) continue;
    const upper = /uppercase/.test(R(r.decls['text-transform']) || '');
    add('kr-latin-tracking-on-hangul', '한글이 라틴 자간을 물려받는다', 'error',
      `${r.selector} { letter-spacing:${lsRaw.trim()}${upper ? '; text-transform:uppercase' : ''} } ← 이 선택자의 직접 텍스트에 한글이 있다`,
      '한글에 양수 자간을 주면 글자가 낱개로 흩어진다. 라틴 전용 클래스와 한글 전용 클래스를 분리하고 마크업에서 span 을 나눌 것.');
  }

  /* 4 ─ 폰트 스택에서 한글 폰트가 라틴 폰트보다 앞에 있다 */
  const seenStacks = new Set();
  const checkStack = (label, value) => {
    const v = R(value);
    if (!v || /^(inherit|initial|unset|revert)$/i.test(v.trim())) return;
    const names = v.split(',').map((s) => s.trim().replace(/^["']|["']$/g, '').toLowerCase()).filter(Boolean);
    if (names.length < 2) return;
    const key = names.join('|');
    if (seenStacks.has(key)) return;
    let krAt = -1;
    for (let i = 0; i < names.length; i++) {
      if (krAt < 0 && isKrFont(names[i])) krAt = i;
      else if (krAt >= 0 && !isGeneric(names[i]) && !isKrFont(names[i])) {
        seenStacks.add(key);
        add('kr-stack-order', '한글 폰트가 라틴 폰트보다 앞에 있다', 'warning',
          `${label}: ${v.trim()}`,
          `한글 폰트 대부분이 라틴 글리프도 갖고 있다. 앞에 두면 문장 속 라틴을 한글 폰트가 그리고, 제목·라벨은 진짜 라틴 폰트가 그려서 한 지면에 라틴 활자가 두 종류 생긴다. 라틴 폰트를 앞에 둘 것 ("${names[i]}" 를 "${names[krAt]}" 앞으로).`);
        return;
      }
    }
  };
  for (const [name, val] of vars) if (/font|family|prose|serif|sans/i.test(name)) checkStack(name, val);
  for (const r of rules) if (r.decls['font-family']) checkStack(r.selector, r.decls['font-family']);

  /* 5 ─ 한글을 담은 본문 요소의 행간이 CJK 권장치보다 좁다 */
  for (const r of rules) {
    const lhRaw = R(r.decls['line-height']);
    const fsRaw = R(r.decls['font-size']);
    if (!lhRaw) continue;
    if (!selectorHasHangul(r.selector, nodes)) continue;
    const fs = toPx(fsRaw);
    let ratio = unitlessNum(lhRaw);
    if (ratio == null) {
      const lhPx = toPx(lhRaw);
      if (lhPx != null && fs) ratio = lhPx / fs;
    }
    if (ratio == null) continue;
    // 큰 글자(디스플레이)는 좁아도 된다. 본문 크기에서만 본다.
    if (fs != null && fs > 22) continue;
    if (ratio < 1.6) {
      add('kr-tight-leading', '한글 본문 행간이 좁다', 'warning',
        `${r.selector} { line-height:${lhRaw.trim()}${fsRaw ? `; font-size:${fsRaw.trim()}` : ''} } → 비율 ${ratio.toFixed(2)}`,
        'CJK 본문 권장 행간은 1.7 내외 (W3C klreq 예시 160%). 한글은 받침 때문에 세로 공간을 더 먹는다.');
    }
  }

  /* 6 ─ lang="ko" 인데 keep-all 이 아예 없다 */
  if (html && /<html[^>]*\blang\s*=\s*["']ko/i.test(html) && HANGUL.test(html)) {
    const hasKeepAll = rules.some((r) => /keep-all/.test(R(r.decls['word-break']) || ''));
    if (!hasKeepAll) {
      add('kr-missing-keep-all', 'keep-all 이 없다', 'error',
        'word-break:keep-all 선언이 문서 어디에도 없다',
        '기본 줄바꿈 규칙은 CJK 를 글자 단위로 끊는다. 한글은 어절 단위로 끊어야 읽힌다.');
    }
  }

  /* 7 ─ 타입 스케일 노이즈 */
  const sizes = new Set();
  for (const r of rules) {
    const v = R(r.decls['font-size']);
    const px = toPx(v);
    // 6px 미만은 실제 글자 크기가 아니라 calc(var(--x) * 1px) 같은 승수에서 나온 값이다
    if (px != null && px >= 6) sizes.add(Math.round(px * 10) / 10);
  }
  const arr = [...sizes].sort((a, b) => a - b);
  const clusters = [];
  for (let i = 1; i < arr.length; i++) {
    if (arr[i] - arr[i - 1] <= 1.5) clusters.push(`${arr[i - 1]}/${arr[i]}`);
  }
  if (arr.length > 10 || clusters.length >= 2) {
    add('kr-scale-noise', '타입 스케일이 값의 나열이다', 'warning',
      `font-size 고유값 ${arr.length}개 [${arr.join(', ')}]` +
      (clusters.length ? ` · 1.5px 이내로 붙은 쌍: ${clusters.join(', ')}` : ''),
      '역할 수보다 값이 훨씬 많으면 스케일이 아니라 노이즈다. 인접 값이 1~2px 차이면 보이지도 않으면서 아무 일도 안 한다. 역할별로 접고 인접 단 사이를 최소 1.25배로 벌릴 것.');
  }

  return findings;
}

/* ── 실행 ──────────────────────────────────────────────────── */

const argv = process.argv.slice(2);
const asJson = argv.includes('--json');
const strict = argv.includes('--strict');
const files = argv.filter((a) => !a.startsWith('--'));

if (!files.length) {
  console.error('usage: node kr-typo-detect.mjs [--json] [--strict] <file.html|file.css ...>');
  process.exit(2);
}

let all = [];
for (const f of files) {
  let src;
  try { src = fs.readFileSync(f, 'utf8'); }
  catch (e) { console.error(`읽기 실패: ${f} — ${e.message}`); continue; }
  const ext = path.extname(f).toLowerCase();
  let css = '';
  let html = '';
  if (ext === '.css') css = src;
  else {
    html = src;
    for (const m of src.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) css += m[1] + '\n';
  }
  if (!css.trim()) continue;
  all = all.concat(analyze(f, css, html));
}

if (asJson) {
  console.log(JSON.stringify(all, null, 2));
} else if (!all.length) {
  console.log('한글 조판 검출기: 걸린 것 없음  (' + files.join(', ') + ')');
} else {
  const order = { error: 0, warning: 1 };
  all.sort((a, b) => (order[a.severity] ?? 9) - (order[b.severity] ?? 9));
  console.log(`한글 조판 검출기 — ${all.length}건\n`);
  for (const f of all) {
    const tag = f.severity === 'error' ? 'ERROR  ' : 'WARNING';
    console.log(`[${tag}] ${f.name}  (${f.rule})`);
    console.log(`   ${path.basename(f.file)} — ${f.detail}`);
    console.log(`   → ${f.why}\n`);
  }
}

if (strict && all.length) process.exit(1);
