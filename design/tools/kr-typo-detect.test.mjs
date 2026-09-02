#!/usr/bin/env node
/* kr-typo-detect 회귀 테스트 —  node design/tools/kr-typo-detect.test.mjs
 *
 * 검출기에 룰을 추가하면 여기에 기대값도 같이 추가할 것.
 * 발화한 적 없는 룰은 있으나 마나다.
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const DETECT = path.join(here, 'kr-typo-detect.mjs');
const FIX = path.join(here, '__fixtures__');
const ROOT = path.resolve(here, '..', '..');

function run(file) {
  const out = execFileSync('node', [DETECT, '--json', file], { encoding: 'utf8' });
  return JSON.parse(out).map((f) => f.rule);
}

const cases = [
  {
    name: 'bad-a — 6개 룰이 동시에 걸린다 (overflow-wrap 은 var() 뒤에 숨겨둠)',
    file: path.join(FIX, 'bad-a.html'),
    expect: ['kr-word-split', 'kr-palt-global', 'kr-latin-tracking-on-hangul',
             'kr-stack-order', 'kr-tight-leading', 'kr-scale-noise'],
    forbid: ['kr-missing-keep-all'],
  },
  {
    name: 'bad-b — keep-all 선언 자체가 없다',
    file: path.join(FIX, 'bad-b.html'),
    expect: ['kr-missing-keep-all'],
    forbid: ['kr-word-split'],
  },
  {
    name: 'v9 — 깨끗해야 한다 (오탐 0)',
    file: path.join(ROOT, 'design', 'v9-스케일.html'),
    expect: [],
    forbid: ['kr-word-split', 'kr-palt-global', 'kr-latin-tracking-on-hangul',
             'kr-stack-order', 'kr-tight-leading', 'kr-missing-keep-all', 'kr-scale-noise'],
  },
  {
    name: 'v7 — 원본에 실제로 있던 결함이 잡힌다',
    file: path.join(ROOT, '_sepzip', 'SEP 토끼굴 v7 - 에디션.html'),
    expect: ['kr-palt-global', 'kr-latin-tracking-on-hangul', 'kr-scale-noise'],
    forbid: [],
  },
];

let failed = 0;
for (const c of cases) {
  let rules;
  try { rules = run(c.file); }
  catch (e) { console.log(`✗ ${c.name}\n    실행 실패: ${e.message}`); failed++; continue; }

  const missing = c.expect.filter((r) => !rules.includes(r));
  const wrong = c.forbid.filter((r) => rules.includes(r));
  if (missing.length || wrong.length) {
    failed++;
    console.log(`✗ ${c.name}`);
    if (missing.length) console.log(`    안 걸림(걸려야 함): ${missing.join(', ')}`);
    if (wrong.length) console.log(`    오탐(걸리면 안 됨): ${wrong.join(', ')}`);
    console.log(`    실제: ${rules.join(', ') || '없음'}`);
  } else {
    console.log(`✓ ${c.name}  (${rules.length}건)`);
  }
}

/* --strict 종료 코드 — 훅이 이걸로 판단한다 */
function exitCode(file) {
  try { execFileSync('node', [DETECT, '--strict', file], { stdio: 'ignore' }); return 0; }
  catch (e) { return e.status; }
}
const strictBad = exitCode(path.join(FIX, 'bad-a.html'));
const strictGood = exitCode(path.join(ROOT, 'design', 'v9-스케일.html'));
if (strictBad === 1 && strictGood === 0) console.log('✓ --strict 종료 코드 (결함 1, 정상 0)');
else { failed++; console.log(`✗ --strict 종료 코드 — bad=${strictBad} good=${strictGood}`); }

console.log(failed ? `\n${failed}건 실패` : '\n전부 통과');
process.exit(failed ? 1 : 0);
