/* 잉크 정렬 측정기 — 브라우저 콘솔에 붙여넣고 실행
 *
 * 왜 필요한가: CSS의 align-items 는 **박스**를 맞춘다. 그런데 한글은 전각 상자를
 * 거의 꽉 채우고(잉크 0.945em), 라틴 대문자는 캡높이~베이스라인만 채운다(0.73em).
 * 그래서 박스를 맞춰도 눈에 보이는 글자는 어긋난다. 이 스크립트는 박스가 아니라
 * 실제 잉크(actualBoundingBox)의 위치와 중심을 재서 그 어긋남을 숫자로 준다.
 *
 * 사용법:  measureInk([['제호','.mh .n','THE RABBIT HOLE'],
 *                      ['윙L','.mh .wing','내려가는 길']])
 * DELTA 가 0에 가까울수록 광학적으로 맞은 것. ±1px 안쪽이면 충분하다.
 */
function measureInk(specs) {
  const cx = document.createElement('canvas').getContext('2d');

  // 요소의 마지막 줄 베이스라인 y — 높이 0인 inline-block 은 베이스라인에 앉는다
  const baselineOf = (el) => {
    const s = document.createElement('span');
    s.style.cssText = 'display:inline-block;width:1px;height:0;overflow:hidden';
    el.appendChild(s);
    const y = s.getBoundingClientRect().top;
    s.remove();
    return y;
  };

  const rows = specs.map(([label, sel, sample]) => {
    const el = document.querySelector(sel);
    if (!el) return { label, error: 'not found: ' + sel };
    const cs = getComputedStyle(el);
    cx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const m = cx.measureText(sample);
    const b = baselineOf(el);
    const r = el.getBoundingClientRect();
    const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.2;
    const lines = Math.max(1, Math.round((r.height - parseFloat(cs.paddingBottom || 0)) / lh));
    const inkTop = b - (lines - 1) * lh - m.actualBoundingBoxAscent;
    const inkBottom = b + m.actualBoundingBoxDescent;
    return {
      label,
      lines,
      baseline: +b.toFixed(1),
      inkTop: +inkTop.toFixed(1),
      inkBottom: +inkBottom.toFixed(1),
      inkHeight: +(inkBottom - inkTop).toFixed(1),
      center: +((inkTop + inkBottom) / 2).toFixed(2),
    };
  });

  console.table(rows);
  if (rows.length >= 2 && !rows.some((r) => r.error)) {
    const [first, ...rest] = rows;
    const others = rest.reduce((a, r) => a + r.center, 0) / rest.length;
    const delta = +(first.center - others).toFixed(2);
    console.log(
      `DELTA(${first.label} 중심 − 나머지 평균 중심) = ${delta}px`,
      Math.abs(delta) < 1 ? '✓ 맞음' : '✗ 어긋남'
    );
  }
  return rows;
}

/* 이 프로젝트 제호 기준 측정 (v9 확정값: DELTA -0.03px) */
function measureMasthead() {
  return measureInk([
    ['제호', '.mh .n', 'THE RABBIT HOLE'],
    ['윙L', '.mh .wing', '내려가는 길'],
    ['윙R', '.mh .wing.r', '인쇄되지 않습니다'],
  ]);
}
