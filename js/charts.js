/* js/charts.js — window.Charts: dependency-free responsive SVG charts (donut + grouped bars).
   No Store/App access. All text rendered via textContent (XSS-safe). */
(function () {
  'use strict';

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const STYLE_ID = 'cf-charts-style';

  // ---------------------------------------------------------------------------
  // Shared helpers
  // ---------------------------------------------------------------------------

  // Inject chart styles (draw-in animations) once; respects prefers-reduced-motion.
  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
      '.cf-donut{display:block;margin:4px auto 8px;}',
      '.cf-donut .cf-arc{animation:cf-arc-in .7s var(--ease-out) both;}',
      '@keyframes cf-arc-in{from{stroke-dasharray:0 var(--cf-circ);opacity:.25;}}',
      '.cf-bars{display:block;width:100%;height:auto;}',
      '.cf-bars .cf-bar{animation:cf-bar-in .45s var(--ease-out) both;}',
      '@keyframes cf-bar-in{from{opacity:0;}}',
      '@media (prefers-reduced-motion:reduce){',
      '.cf-donut .cf-arc,.cf-bars .cf-bar{animation:none;}',
      '}'
    ].join('\n');
    document.head.appendChild(style);
  }

  function svgEl(name, attrs) {
    const el = document.createElementNS(SVG_NS, name);
    if (attrs) {
      Object.keys(attrs).forEach(function (key) {
        el.setAttribute(key, String(attrs[key]));
      });
    }
    return el;
  }

  // Round to 2 decimals for compact SVG coordinates.
  function num(v) {
    return Math.round(v * 100) / 100;
  }

  // Nice axis step >= v from {1, 2, 2.5, 3, 4, 5, 10} × 10^k.
  function niceStep(v) {
    if (!(v > 0) || !isFinite(v)) return 1;
    const exp = Math.pow(10, Math.floor(Math.log(v) / Math.LN10));
    const f = Math.round((v / exp) * 1e6) / 1e6; // guard float noise
    let nf;
    if (f <= 1) nf = 1;
    else if (f <= 2) nf = 2;
    else if (f <= 2.5) nf = 2.5;
    else if (f <= 3) nf = 3;
    else if (f <= 4) nf = 4;
    else if (f <= 5) nf = 5;
    else nf = 10;
    return nf * exp;
  }

  // ---------------------------------------------------------------------------
  // Donut chart
  // ---------------------------------------------------------------------------

  // items: [{label, value, color}] — zero/empty → clears container, returns false.
  // opts: {size=200, stroke=26, centerTitle='', centerSub=''}
  function donut(containerEl, items, opts) {
    if (!containerEl) return false;
    containerEl.textContent = '';

    const o = opts || {};
    const size = o.size > 0 ? o.size : 200;
    const stroke = o.stroke > 0 ? o.stroke : 26;
    const centerTitle = o.centerTitle != null ? String(o.centerTitle) : '';
    const centerSub = o.centerSub != null ? String(o.centerSub) : '';

    const segs = (Array.isArray(items) ? items : []).filter(function (it) {
      return it && typeof it.value === 'number' && isFinite(it.value) && it.value > 0;
    });
    const total = segs.reduce(function (sum, it) { return sum + it.value; }, 0);
    if (!segs.length || total <= 0) return false;

    ensureStyles();

    const c = size / 2;
    const r = (size - stroke) / 2;
    const circ = 2 * Math.PI * r;
    // 2° gap between segments; none for a single full-circle segment.
    const gapLen = segs.length > 1 ? circ * (2 / 360) : 0;

    const svg = svgEl('svg', {
      class: 'cf-donut',
      width: size,
      height: size,
      viewBox: '0 0 ' + size + ' ' + size,
      'aria-hidden': 'true'
    });

    // Rotate so arcs start at 12 o'clock.
    const g = svgEl('g', { transform: 'rotate(-90 ' + c + ' ' + c + ')' });

    let acc = 0;
    segs.forEach(function (seg, i) {
      const segLen = (seg.value / total) * circ;
      const arcLen = Math.max(segLen - gapLen, 0);
      if (arcLen > 0) {
        const circle = svgEl('circle', {
          class: 'cf-arc',
          cx: c,
          cy: c,
          r: num(r),
          fill: 'none',
          stroke: seg.color || '#8E8E93',
          'stroke-width': stroke,
          'stroke-dasharray': num(arcLen) + ' ' + num(circ - arcLen),
          'stroke-dashoffset': num(-(acc + gapLen / 2))
        });
        circle.style.setProperty('--cf-circ', String(num(circ)));
        circle.style.animationDelay = (i * 60) + 'ms';
        g.appendChild(circle);
      }
      acc += segLen;
    });
    svg.appendChild(g);

    if (centerTitle) {
      // Shrink the title if it would not fit the donut hole.
      const inner = size - 2 * stroke - 14;
      let titleFs = Math.round(size * 0.11);
      titleFs = Math.min(titleFs, Math.floor(inner / (Math.max(centerTitle.length, 1) * 0.58)));
      titleFs = Math.max(11, titleFs);
      const title = svgEl('text', {
        x: c,
        y: num(centerSub ? c - 2 : c + titleFs * 0.35),
        'text-anchor': 'middle',
        'font-size': titleFs,
        'font-weight': '700',
        fill: 'currentColor'
      });
      title.textContent = centerTitle;
      svg.appendChild(title);
    }
    if (centerSub) {
      const subFs = Math.max(10, Math.round(size * 0.06));
      const sub = svgEl('text', {
        x: c,
        y: num(centerTitle ? c + subFs + 6 : c + subFs * 0.35),
        'text-anchor': 'middle',
        'font-size': subFs,
        fill: 'var(--text-2, #8E8E93)'
      });
      sub.textContent = centerSub;
      svg.appendChild(sub);
    }

    containerEl.appendChild(svg);
    return true;
  }

  // ---------------------------------------------------------------------------
  // Grouped bar chart
  // ---------------------------------------------------------------------------

  // Path for a bar with rounded top corners and a flat bottom at y0.
  function roundedTopBar(x, y, w, r, y0) {
    const x2 = x + w;
    return 'M' + num(x) + ' ' + num(y0) +
      ' L' + num(x) + ' ' + num(y + r) +
      ' Q' + num(x) + ' ' + num(y) + ' ' + num(x + r) + ' ' + num(y) +
      ' L' + num(x2 - r) + ' ' + num(y) +
      ' Q' + num(x2) + ' ' + num(y) + ' ' + num(x2) + ' ' + num(y + r) +
      ' L' + num(x2) + ' ' + num(y0) + ' Z';
  }

  // data: [{label, series:[{value, color}]}]
  // opts: {height=180, formatValue: fn(value)->string}
  function bars(containerEl, data, opts) {
    if (!containerEl) return false;
    containerEl.textContent = '';

    const o = opts || {};
    const height = o.height > 0 ? o.height : 180;
    const formatValue = typeof o.formatValue === 'function'
      ? o.formatValue
      : function (v) { return String(Math.round(v)); };

    const groups = (Array.isArray(data) ? data : []).map(function (group) {
      return {
        label: group && group.label != null ? String(group.label) : '',
        series: (group && Array.isArray(group.series) ? group.series : []).map(function (s) {
          const ok = s && typeof s.value === 'number' && isFinite(s.value) && s.value > 0;
          return { value: ok ? s.value : 0, color: (s && s.color) || '#8E8E93' };
        })
      };
    });
    if (!groups.length) return false;

    ensureStyles();

    const W = 360;
    const H = height;
    const padTop = 14;
    const padBottom = 22;
    const padLeft = 8;
    const padRight = 40; // right gutter for gridline value captions
    const plotW = W - padLeft - padRight;
    const plotH = H - padTop - padBottom;
    const y0 = padTop + plotH;

    let max = 0;
    groups.forEach(function (group) {
      group.series.forEach(function (s) { if (s.value > max) max = s.value; });
    });

    // Auto-scale: 3 gridlines at step, 2·step, 3·step with niceMax = 3·step >= max.
    const step = max > 0 ? niceStep(max / 3) : 0;
    const niceMax = step * 3;

    const svg = svgEl('svg', {
      class: 'cf-bars',
      viewBox: '0 0 ' + W + ' ' + H,
      'aria-hidden': 'true'
    });

    // Gridlines + value captions.
    for (let k = 1; k <= 3; k++) {
      const y = num(y0 - (k / 3) * plotH);
      svg.appendChild(svgEl('line', {
        x1: padLeft,
        y1: y,
        x2: W - padRight,
        y2: y,
        stroke: 'var(--sep, rgba(60,60,67,.18))',
        'stroke-width': '1'
      }));
      if (step > 0) {
        const cap = svgEl('text', {
          x: W - 2,
          y: y + 3,
          'text-anchor': 'end',
          'font-size': '9',
          fill: 'var(--text-3, #8E8E93)'
        });
        cap.textContent = String(formatValue(step * k));
        svg.appendChild(cap);
      }
    }

    // Baseline.
    svg.appendChild(svgEl('line', {
      x1: padLeft,
      y1: y0,
      x2: W - padRight,
      y2: y0,
      stroke: 'var(--sep, rgba(60,60,67,.3))',
      'stroke-width': '1'
    }));

    const sCount = groups.reduce(function (m, group) {
      return Math.max(m, group.series.length);
    }, 0) || 1;
    const groupW = plotW / groups.length;
    const innerGap = sCount > 1 ? 4 : 0;
    const barW = Math.max(2, Math.min(18, (groupW * 0.7 - innerGap * (sCount - 1)) / sCount));
    const blockW = barW * sCount + innerGap * (sCount - 1);

    groups.forEach(function (group, gi) {
      const cx = padLeft + gi * groupW + groupW / 2;
      const startX = cx - blockW / 2;

      group.series.forEach(function (s, si) {
        if (!(s.value > 0) || niceMax <= 0) return;
        // Minimum visible height so tiny positive values still show up.
        const h = Math.max((s.value / niceMax) * plotH, 1.5);
        const x = startX + si * (barW + innerGap);
        const y = y0 - h;
        const rad = Math.min(barW / 2, 5, h);
        const bar = svgEl('path', {
          class: 'cf-bar',
          d: roundedTopBar(x, y, barW, rad, y0),
          fill: s.color
        });
        bar.style.animationDelay = (gi * 40) + 'ms';
        svg.appendChild(bar);
      });

      const label = svgEl('text', {
        x: num(cx),
        y: H - 6,
        'text-anchor': 'middle',
        'font-size': '10',
        fill: 'var(--text-2, #8E8E93)'
      });
      label.textContent = group.label;
      svg.appendChild(label);
    });

    containerEl.appendChild(svg);
    return true;
  }

  // ---------------------------------------------------------------------------
  // Line / area chart (e.g. cumulative savings)
  // points: [{label, value}] (value = cents). opts: {height=170, color, formatValue}
  // ---------------------------------------------------------------------------
  let gradSeq = 0;

  function line(containerEl, points, opts) {
    containerEl.innerHTML = '';
    if (!points || points.length < 2) return false;
    opts = opts || {};
    ensureStyles();

    const H = opts.height || 170;
    const color = opts.color || 'var(--tint, #0A84FF)';
    const formatValue = typeof opts.formatValue === 'function' ? opts.formatValue : function (v) { return String(v); };
    const W = 360;
    const padTop = 14, padBottom = 22, padLeft = 10, padRight = 46;
    const plotW = W - padLeft - padRight;
    const plotH = H - padTop - padBottom;
    const y0 = padTop + plotH;

    const vals = points.map(function (p) { return p.value; });
    const dataMax = Math.max.apply(null, vals);
    const dataMin = Math.min.apply(null, vals);
    const yMin = Math.min(0, dataMin);
    const yMax = dataMax > yMin ? dataMax : yMin + 1;

    function px(i) { return padLeft + (i / (points.length - 1)) * plotW; }
    function py(v) { return y0 - ((v - yMin) / (yMax - yMin)) * plotH; }

    const gid = 'cf-area-' + (++gradSeq);
    const svg = svgEl('svg', { class: 'cf-line', viewBox: '0 0 ' + W + ' ' + H, 'aria-hidden': 'true' });

    const defs = svgEl('defs', {});
    const grad = svgEl('linearGradient', { id: gid, x1: '0', y1: '0', x2: '0', y2: '1' });
    grad.appendChild(svgEl('stop', { offset: '0', 'stop-color': color, 'stop-opacity': '0.30' }));
    grad.appendChild(svgEl('stop', { offset: '1', 'stop-color': color, 'stop-opacity': '0' }));
    defs.appendChild(grad);
    svg.appendChild(defs);

    // gridlines + value captions
    for (let k = 0; k <= 3; k++) {
      const gv = yMin + (k / 3) * (yMax - yMin);
      const gy = num(py(gv));
      svg.appendChild(svgEl('line', {
        x1: padLeft, y1: gy, x2: W - padRight, y2: gy,
        stroke: 'var(--sep, rgba(60,60,67,.18))', 'stroke-width': '1'
      }));
      const cap = svgEl('text', {
        x: W - 2, y: gy + 3, 'text-anchor': 'end', 'font-size': '9', fill: 'var(--text-3, #8E8E93)'
      });
      cap.textContent = String(formatValue(gv));
      svg.appendChild(cap);
    }

    let d = '';
    points.forEach(function (p, i) { d += (i === 0 ? 'M' : 'L') + num(px(i)) + ' ' + num(py(p.value)); });

    // area fill
    const area = d + ' L' + num(px(points.length - 1)) + ' ' + num(y0) + ' L' + num(px(0)) + ' ' + num(y0) + ' Z';
    svg.appendChild(svgEl('path', { d: area, fill: 'url(#' + gid + ')', stroke: 'none' }));

    // line
    svg.appendChild(svgEl('path', {
      class: 'cf-line-path', d: d, fill: 'none', stroke: color,
      'stroke-width': '2.5', 'stroke-linejoin': 'round', 'stroke-linecap': 'round'
    }));

    // points + x labels
    points.forEach(function (p, i) {
      const last = i === points.length - 1;
      svg.appendChild(svgEl('circle', {
        cx: num(px(i)), cy: num(py(p.value)), r: last ? 4 : 2.5,
        fill: last ? color : 'var(--bg-card, #fff)', stroke: color, 'stroke-width': last ? 0 : 1.5
      }));
      const lbl = svgEl('text', {
        x: num(px(i)), y: H - 6, 'text-anchor': 'middle', 'font-size': '10', fill: 'var(--text-2, #8E8E93)'
      });
      lbl.textContent = p.label;
      svg.appendChild(lbl);
    });

    containerEl.appendChild(svg);
    return true;
  }

  window.Charts = {
    donut: donut,
    bars: bars,
    line: line
  };
})();
