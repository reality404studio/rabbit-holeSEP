import { chromium } from "playwright";
import fs from "node:fs";

const BASE = "http://localhost:3111";
const OUT = "/private/tmp/claude-501/-Users-rafaela-01-PROJECT-NOW-Rabbithol-SEP/be4bed35-4ead-4068-a17a-fabc58a25153/scratchpad/shots";
fs.mkdirSync(OUT, { recursive: true });

const E = (slug, title, reason) => ({
  slug, title, reason,
  url: `https://plato.stanford.edu/entries/${slug}/`,
});

const ENTRIES = [
  E("functionalism", "Functionalism", "마음을 무엇으로 만들어졌는지가 아니라 무엇을 하는지로 정의하는 입장입니다."),
  E("computational-mind", "The Computational Theory of Mind", "사고를 기호 연산으로 보는 관점. 오늘의 인공지능 논의가 서 있는 전제입니다."),
  E("dualism", "Dualism", "마음과 물질을 둘로 나누는 오래된 구분. 무엇에 반대해 등장했는지 확인합니다."),
  E("chinese-room", "The Chinese Room Argument", "규칙에 따라 기호를 옮기는 것만으로는 의미를 이해한 것이 아니라는 반론입니다."),
  E("turing-test", "The Turing Test", "구별할 수 없다면 구별할 근거도 없다는 반대편의 주장입니다."),
  E("consciousness", "Consciousness", "경험이 있다는 것 자체가 왜 문제인가."),
];

const ROUTE = (frame, gloss, n, off = 0) => ({
  frame, gloss, entries: ENTRIES.slice(off, off + n),
});

const FIXTURES = {
  "n1": [ROUTE("존재론적 독해", "질문을 '이 존재에게 마음이 있는가'의 문제로 읽습니다.", 1)],
  "n2": [ROUTE("인식론적 독해", "질문을 '우리가 그것을 어떻게 아는가'의 문제로 읽습니다.", 2)],
  "n6": [ROUTE("기능주의적 독해", "질문을 '무엇을 하는가로 마음을 정의할 수 있는가'의 문제로 읽습니다.", 6)],
  "r3": [
    ROUTE("존재론적 독해", "질문을 '이 존재에게 마음이 있는가'의 문제로 읽습니다.", 1, 0),
    ROUTE("인식론적 독해", "질문을 '우리가 그것을 어떻게 아는가'의 문제로 읽습니다.", 3, 1),
    ROUTE("현상학적 독해", "질문을 '겪는다는 것이 무엇인가'의 문제로 읽습니다.", 2, 4),
  ],
};

const VIEWPORTS = [
  { name: "1440", width: 1440, height: 1200 },
  { name: "1100", width: 1100, height: 1200 },
  { name: "1060", width: 1060, height: 1200 },
  { name: "820", width: 820, height: 1200 },
  { name: "390", width: 390, height: 900 },
];

/* ───────── machine checks ───────── */
const CHECKS = `(() => {
  const R = {};
  const sheet = document.querySelector('.sheet');
  const cs = getComputedStyle(sheet);
  const box = sheet.getBoundingClientRect();
  const L1 = box.left + parseFloat(cs.paddingLeft);
  const L2 = box.right - parseFloat(cs.paddingRight);
  const near = (a,b,t=1.05) => Math.abs(a-b) <= t;
  const vis = el => el && el.getClientRects().length > 0;

  // A1 — 두 세로선
  const leftSel = ['.mh .wing:not(.r)','.meta .l','.sechd .en','.foot p',
    '.sec .lead .hd','.sec .facing > .item:first-child','.sec .ladder .row:first-child',
    '.sec .pair > .item:nth-child(2)'];
  const rightSel = ['.mh .wing.r','.meta .r','.sechd .ko','.foot .r',
    '.sec .lead .n','.sec .facing > .item:last-child','.sec .pair > .item:nth-child(1)'];
  const wide = window.innerWidth >= 1080;
  const bad = [];
  for (const s of leftSel) for (const el of document.querySelectorAll(s)) {
    if (!vis(el)) continue;
    const r = el.getBoundingClientRect();
    if (!near(r.left, L1)) bad.push(s+' left '+r.left.toFixed(1)+' vs '+L1.toFixed(1));
  }
  for (const s of rightSel) for (const el of document.querySelectorAll(s)) {
    if (!vis(el)) continue;
    const r = el.getBoundingClientRect();
    if (!near(r.right, L2)) bad.push(s+' right '+r.right.toFixed(1)+' vs '+L2.toFixed(1));
  }
  R.A1 = bad.length ? {pass:false, bad:bad.slice(0,6)} : {pass:true};

  // A2 — 섹션 헤더 6+6 / 3+3
  const heads = [...document.querySelectorAll('.sechd')];
  const wantEn = wide ? '1 / 7' : '1 / 4';
  const wantKo = wide ? '7 / 13' : '4 / 7';
  const hb = [];
  for (const h of heads) {
    const en = getComputedStyle(h.querySelector('.en')).gridColumn;
    const ko = getComputedStyle(h.querySelector('.ko')).gridColumn;
    if (en !== wantEn || ko !== wantKo) hb.push(en+' | '+ko);
  }
  R.A2 = hb.length ? {pass:false, n:heads.length, bad:hb.slice(0,4)} : {pass:true, n:heads.length};

  // A3 — 12px 바닥
  const small = [...document.querySelectorAll('*')].filter(el => {
    if (el.children.length) return false;
    if (!el.textContent.trim()) return false;
    if (!vis(el)) return false;
    return parseFloat(getComputedStyle(el).fontSize) < 11.99;
  }).map(el => el.className + ' ' + getComputedStyle(el).fontSize);
  R.A3 = small.length ? {pass:false, bad:small.slice(0,5)} : {pass:true};

  // A4 — 가로 괘선 전폭
  const contentW = L2 - L1;
  const ruleSel = ['.rule2','.meta','.sec','.foot'];
  const rb = [];
  for (const s of ruleSel) for (const el of document.querySelectorAll(s)) {
    if (!vis(el)) continue;
    const g = getComputedStyle(el);
    const hasRule = parseFloat(g.borderTopWidth) > 0 || parseFloat(g.borderBottomWidth) > 0;
    if (!hasRule) continue;
    const r = el.getBoundingClientRect();
    if (!near(r.width, contentW, 1.05)) rb.push(s+' w='+r.width.toFixed(1)+' vs '+contentW.toFixed(1));
  }
  R.A4 = rb.length ? {pass:false, bad:rb.slice(0,5)} : {pass:true};

  // A5 — 괘선 굵기 사다리
  const tierOf = c => { const el = document.querySelector(c); if (!el) return null;
    const g = getComputedStyle(el); return g.borderTopWidth+' '+g.borderTopColor; };
  R.A5 = { lead: tierOf('.sec--lead'), mid: tierOf('.sec--mid'), tail: tierOf('.sec--tail'),
           foot: tierOf('.foot') };
  const isBlank = !!document.querySelector('.sec.blank');
  R.A5.pass = isBlank ? null
    : (!R.A5.lead || R.A5.lead.startsWith('3px rgb(18, 22, 31)'))
   && (!R.A5.mid  || R.A5.mid.startsWith('1px rgb(18, 22, 31)'))
   && (!R.A5.tail || R.A5.tail.startsWith('1px rgba(18, 22, 31, 0.2)'));
  if (isBlank) R.A5.note = 'blank 상태는 괘선을 의도적으로 흐린다';

  // A6 — 적색 사용처
  const RED = 'rgb(194, 24, 63)';
  const reds = [...document.querySelectorAll('*')].filter(el => {
    if (!vis(el)) return false;
    const g = getComputedStyle(el);
    return g.color === RED || g.backgroundColor === RED || g.borderBottomColor === RED;
  }).map(el => el.tagName.toLowerCase()+'.'+(typeof el.className==='string'?el.className:''));
  const allowed = /(kk|editor|dot|err|issued|reset|status)/;
  R.A6 = { found: reds, pass: reds.every(c => allowed.test(c)) };

  // A8 — pair 순위 배치
  const pair = document.querySelector('.pair');
  if (pair) {
    const it = [...pair.querySelectorAll(':scope > .item')];
    const c1 = getComputedStyle(it[0]).gridColumn, c2 = getComputedStyle(it[1]).gridColumn;
    R.A8 = wide
      ? { pass: c1==='6 / 13' && c2==='1 / 6', c1, c2 }
      : { pass: c1==='1 / 7' && c2==='1 / 7', c1, c2 };
  } else R.A8 = {pass:null, note:'no pair'};

  // A9 — 가로 스크롤
  const de = document.documentElement;
  R.A9 = { pass: de.scrollWidth <= de.clientWidth + 0.5, sw: de.scrollWidth, cw: de.clientWidth };

  // C2 — facing 괘선이 거터 정중앙
  const fa = document.querySelector('.facing');
  if (fa && wide) {
    const its = [...fa.querySelectorAll(':scope > .item')];
    if (its.length === 2) {
      const a = its[0].getBoundingClientRect(), b = its[1].getBoundingClientRect();
      const gut = parseFloat(getComputedStyle(sheet).columnGap);
      const border = b.left; // border-box left of second item
      const gutterCenter = a.right + gut/2;
      const aw = a.width, bw = b.width - parseFloat(getComputedStyle(its[1]).paddingLeft);
      R.C2 = { pass: near(border, gutterCenter, 1.05) && near(aw, bw, 1.05),
               border: border.toFixed(1), center: gutterCenter.toFixed(1),
               widths: [aw.toFixed(1), bw.toFixed(1)] };
    } else R.C2 = {pass:null};
  } else R.C2 = {pass:null, note: wide ? 'no facing' : 'stacked'};

  // C3 — caret 색
  const q = document.querySelector('.q');
  R.C3 = q ? { pass: getComputedStyle(q).caretColor === 'rgb(18, 22, 31)',
               caret: getComputedStyle(q).caretColor } : {pass:null};

  // C4 — .lat 105%
  const lat = document.querySelector('.lat');
  if (lat) {
    const child = parseFloat(getComputedStyle(lat).fontSize);
    const parent = parseFloat(getComputedStyle(lat.parentElement).fontSize);
    R.C4 = { pass: Math.abs(child/parent - 1.05) < 0.02 && getComputedStyle(lat).letterSpacing === 'normal',
             ratio: (child/parent).toFixed(3), ls: getComputedStyle(lat).letterSpacing };
  } else R.C4 = {pass:null};

  // C5 — 편집자 밑줄 길이
  const b2 = document.querySelector('.meta .editor b');
  if (b2) {
    const r = b2.getBoundingClientRect();
    const after = getComputedStyle(b2, '::after');
    R.C5 = { pass: parseFloat(after.right) > 0, right: after.right };
  } else R.C5 = {pass:null};

  // C8 — 제호 nowrap + 귀 간격
  const mast = document.querySelector('.mh .mast');
  const wl = document.querySelector('.mh .wing:not(.r)');
  const wr = document.querySelector('.mh .wing.r');
  if (mast && wide) {
    // 잉크 기준. 귀 블록은 3칸 전체를 차지하지만 글자는 그 일부만 채운다 —
    // 블록으로 재면 겹치지 않는데도 겹쳤다고 나온다
    const ink = el => { const r = document.createRange(); r.selectNodeContents(el);
                        return r.getBoundingClientRect(); };
    const ir = ink(mast);
    const gapL = ir.left - ink(wl).right;
    const gapR = ink(wr).left - ir.right;
    R.C8 = { pass: getComputedStyle(mast).whiteSpace === 'nowrap' && gapL >= 24 && gapR >= 24,
             gapL: gapL.toFixed(1), gapR: gapR.toFixed(1),
             lh: getComputedStyle(mast).lineHeight, fs: getComputedStyle(mast).fontSize };
  } else R.C8 = {pass:null, note:'narrow'};

  // 기하 실측
  const first = document.querySelector('.sechd .en');
  R.geom = { L1: L1.toFixed(1), L2: L2.toFixed(1), content: (L2-L1).toFixed(1),
             gut: getComputedStyle(sheet).columnGap,
             col: first ? ((L2-L1 - (wide?11:5)*parseFloat(getComputedStyle(sheet).columnGap))/(wide?12:6)).toFixed(2) : null };
  return R;
})()`;

/* ───────── run ───────── */
const browser = await chromium.launch();
const results = {};

for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();

  let fixture = FIXTURES.r3;
  await page.route("**/api/match", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ routes: fixture, model: "Claude Sonnet 4.6", remaining: 9, limit: 10 }),
    });
  });
  await page.route("**/api/status", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ count: 1, remaining: 9, limit: 10 }) }));

  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForTimeout(700);

  // 조판 전
  results[`${vp.name}/blank`] = await page.evaluate(CHECKS);
  await page.screenshot({ path: `${OUT}/${vp.name}-blank.png`, fullPage: true });

  // 조판 후
  await page.fill(".q", "인공지능의 마음이란 무엇일까?");
  await page.click(".go");
  await page.waitForFunction(() => document.querySelectorAll(".sec .lead, .sec .pair, .sec .facing, .sec .ladder").length >= 4, null, { timeout: 30000 });
  await page.waitForTimeout(9000);
  await page.mouse.move(0, 0);
  await page.waitForTimeout(200);
  results[`${vp.name}/set`] = await page.evaluate(CHECKS);
  await page.screenshot({ path: `${OUT}/${vp.name}-set.png`, fullPage: true });

  await ctx.close();
}

/* 조판 변형 — 1 / 2 / 6 entries (A7) */
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1200 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
let which = "n1";
await page.route("**/api/match", (r) =>
  r.fulfill({ status: 200, contentType: "application/json",
    body: JSON.stringify({ routes: FIXTURES[which], model: "Claude Sonnet 4.6", remaining: 9, limit: 10 }) }));
await page.route("**/api/status", (r) =>
  r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ count: 1, remaining: 9, limit: 10 }) }));

for (const k of ["n1", "n2", "n6"]) {
  which = k;
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  await page.fill(".q", "인공지능의 마음이란 무엇일까?");
  await page.click(".go");
  await page.waitForTimeout(k === "n6" ? 14000 : 7000);
  results[`A7/${k}`] = await page.evaluate(`(() => {
    const kinds = [...document.querySelectorAll('.sec')].map(s => ({
      tier: [...s.classList].find(c=>c.startsWith('sec--')),
      blocks: [...s.children].filter(c=>c!==s.firstElementChild).map(c=>c.className.split(' ')[0])
    }));
    return kinds;
  })()`);
  await page.screenshot({ path: `${OUT}/A7-${k}.png`, fullPage: true });
}
await ctx.close();
await browser.close();

fs.writeFileSync(`${OUT}/../qa-results.json`, JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
