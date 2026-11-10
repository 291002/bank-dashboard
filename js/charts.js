/* Small hand-written SVG chart kit. Charts are drawn at the measured size of their box. */
(function () {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function size(el) { const r = el.getBoundingClientRect(); return { w: Math.max(60, Math.floor(r.width)), h: Math.max(40, Math.floor(r.height)) }; }
  function niceMax(v) { if (v <= 0) return 1; const p = Math.pow(10, Math.floor(Math.log10(v))); const n = v / p; return ([1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find(x => n <= x + 1e-9)) * p; }

  // Vertical bars, one measure, one colour; highlighted bars use the accent.
  function bars(el, o) {
    const { w, h } = size(el); const padL = 34, padB = 18, padT = 16, padR = 4;
    const vals = o.values.map(v => v == null ? 0 : v); const max = niceMax(Math.max(...vals, ...(o.line || []).filter(v => v != null)) * 1.05);
    const iw = w - padL - padR, ih = h - padT - padB, n = vals.length, bw = Math.min(o.line ? 22 : 26, iw / n * 0.62);
    let s = `<svg width="${w}" height="${h}" class="ch">`;
    for (let i = 0; i <= 4; i++) { const y = padT + ih - ih * i / 4; s += `<line class="grid" x1="${padL}" x2="${w - padR}" y1="${y}" y2="${y}"/><text class="ax" x="${padL - 5}" y="${y + 3}" text-anchor="end">${o.fmtAxis(max * i / 4)}</text>`; }
    const step = Math.ceil(n / Math.max(1, Math.floor(iw / (o.labels.some(l => String(l).length > 4) ? 44 : 30))));
    const X = (i) => padL + iw * (i + 0.5) / n, Y = (v) => padT + ih - ih * v / max;
    vals.forEach((v, i) => {
      const cx = X(i), bh = ih * v / max, y = padT + ih - bh;
      const hi = o.hi && o.hi.includes(i); const nul = o.values[i] == null; const cr = o.crit && o.crit.includes(i); const wr = !cr && o.warn && o.warn.includes(i);
      const tip = o.labels[i] + ' · ' + (nul ? 'not yet' : o.fmt(v)) + (o.line && o.line[i] != null ? ` · ${o.lineName || 'target'} ${o.fmt(o.line[i])} (${v >= o.line[i] ? '+' : '−'}${Math.abs((v / o.line[i] - 1) * 100).toFixed(1)}%)` : '');
      s += `<rect class="bar${hi ? ' hi' : ''}${cr ? ' cr' : wr ? ' wr' : ''}${nul ? ' nul' : ''}" style="--i:${i}" x="${cx - bw / 2}" y="${nul ? padT + ih - 2 : y}" width="${bw}" height="${nul ? 2 : Math.max(1, bh)}" rx="${Math.min(4, bw / 3)}" data-tip="${esc(tip)}"/>`;
      if (((hi && o.labelHi) || o.labelAll) && !nul) s += `<text class="val" x="${cx}" y="${y - 4}" text-anchor="middle">${o.labelAll ? o.fmt(v) : o.fmtAxis(v)}</text>`;
      if (i % step === 0) s += `<text class="ax" x="${cx}" y="${h - 4}" text-anchor="middle">${esc(o.labels[i])}</text>`;
    });
    if (o.line) {
      const pts = o.line.map((v, i) => v == null ? null : [X(i), Y(v)]).filter(Boolean);
      s += `<path class="tgt" pathLength="1" d="${pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('')}"/>`;
      pts.forEach((p, i) => { s += `<circle class="tgt-pt" cx="${p[0]}" cy="${p[1]}" r="2.6"/>`; void i; });
    }
    el.innerHTML = s + '</svg>';
  }

  // Lines with soft area under the first series and markers on the last point.
  function lines(el, o) {
    const { w, h } = size(el); const padL = 40, padB = 18, padT = 12, padR = 8;
    const all = o.series.flatMap(s => s.values.filter(v => v != null));
    let min = o.zero ? 0 : Math.min(...all), max = Math.max(...all);
    if (!o.zero) { const span = (max - min) || max * 0.1 || 1; min = Math.max(0, min - span * 0.25); max += span * 0.15; } else max = niceMax(max * 1.05);
    const iw = w - padL - padR, ih = h - padT - padB, n = o.labels.length;
    const X = (i) => padL + (n === 1 ? iw / 2 : iw * i / (n - 1)), Y = (v) => padT + ih - ih * (v - min) / (max - min || 1);
    let s = `<svg width="${w}" height="${h}" class="ch"><defs><linearGradient id="ga${el.id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--accent)" stop-opacity=".32"/><stop offset="1" stop-color="var(--accent)" stop-opacity="0"/></linearGradient></defs>`;
    for (let i = 0; i <= 3; i++) { const v = min + (max - min) * i / 3, y = Y(v); s += `<line class="grid" x1="${padL}" x2="${w - padR}" y1="${y}" y2="${y}"/><text class="ax" x="${padL - 5}" y="${y + 3}" text-anchor="end">${o.fmtAxis(v)}</text>`; }
    const step = Math.ceil(n / Math.max(1, Math.floor(iw / 42)));
    o.labels.forEach((l, i) => { if (i % step === 0 || i === n - 1) s += `<text class="ax" x="${X(i)}" y="${h - 4}" text-anchor="middle">${esc(l)}</text>`; });
    o.series.forEach((se, k) => {
      const pts = se.values.map((v, i) => v == null ? null : [X(i), Y(v)]).filter(Boolean);
      if (!pts.length) return;
      const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('');
      if (k === 0 && !o.noArea) s += `<path d="${d}L${pts[pts.length - 1][0]} ${padT + ih}L${pts[0][0]} ${padT + ih}Z" fill="url(#ga${el.id})"/>`;
      s += `<path class="ln${se.dash ? ' dash' : ''}" ${se.dash ? '' : 'pathLength="1"'} d="${d}" style="stroke:${se.color}" ${se.dash ? 'stroke-dasharray="4 4"' : ''}/>`;
      se.values.forEach((v, i) => { if (v != null) s += `<circle class="pt" cx="${X(i)}" cy="${Y(v)}" r="${i === se.values.length - 1 ? 3.5 : 2}" style="fill:${se.color}" data-tip="${esc(se.name + ' · ' + o.labels[i] + ' · ' + o.fmt(v))}"/>`; });
    });
    el.innerHTML = s + '</svg>';
  }

  // Donut with centre label; returns markup (fixed-size).
  function donut(items, o) {
    const sz = o.size || 120, r = sz / 2 - 8, c = 2 * Math.PI * r, tot = items.reduce((a, b) => a + b.value, 0) || 1; let off = 0;
    let s = `<svg width="${sz}" height="${sz}" viewBox="0 0 ${sz} ${sz}" class="donut"><circle cx="${sz / 2}" cy="${sz / 2}" r="${r}" class="track" stroke-width="${o.stroke || 14}"/>`;
    items.forEach(it => { const len = c * it.value / tot; s += `<circle cx="${sz / 2}" cy="${sz / 2}" r="${r}" fill="none" stroke="${it.color}" stroke-width="${o.stroke || 14}" stroke-dasharray="${Math.max(0, len - 1.5)} ${c}" stroke-dashoffset="${-off}" transform="rotate(-90 ${sz / 2} ${sz / 2})" data-tip="${esc(it.label + ' · ' + (o.fmt ? o.fmt(it.value) : it.value) + ' · ' + (it.value / tot * 100).toFixed(1) + '%')}"/>`; off += len; });
    return s + `<text x="50%" y="${o.sub ? '48%' : '53%'}" text-anchor="middle" class="dc">${esc(o.center || '')}</text>${o.sub ? `<text x="50%" y="63%" text-anchor="middle" class="ds">${esc(o.sub)}</text>` : ''}</svg>`;
  }

  // Progress ring (0..100)
  function ring(pct, o = {}) {
    const sz = o.size || 54, r = sz / 2 - 5, c = 2 * Math.PI * r, col = o.color || 'var(--accent)';
    return `<svg width="${sz}" height="${sz}" viewBox="0 0 ${sz} ${sz}" class="ring"><circle cx="${sz / 2}" cy="${sz / 2}" r="${r}" class="track" stroke-width="${o.stroke || 5}"/><circle cx="${sz / 2}" cy="${sz / 2}" r="${r}" fill="none" stroke="${col}" stroke-width="${o.stroke || 5}" stroke-linecap="round" stroke-dasharray="${c * Math.min(100, pct) / 100} ${c}" transform="rotate(-90 ${sz / 2} ${sz / 2})"/><text x="50%" y="55%" text-anchor="middle" class="rt">${esc(o.label != null ? o.label : Math.round(pct) + '%')}</text></svg>`;
  }

  function spark(vals, o = {}) {
    const w = o.w || 80, h = o.h || 22, v = vals.filter(x => x != null); if (!v.length) return '';
    const min = Math.min(...v), max = Math.max(...v), span = max - min || 1;
    const d = vals.map((x, i) => (i ? 'L' : 'M') + (i * w / (vals.length - 1)).toFixed(1) + ' ' + (h - 2 - (x - min) / span * (h - 4)).toFixed(1)).join('');
    return `<svg width="${w}" height="${h}" class="spark"><path pathLength="1" d="${d}" style="stroke:${o.color || 'var(--accent)'}"/></svg>`;
  }

  // Shared tooltip for anything with data-tip
  function initTip() {
    const tip = document.createElement('div'); tip.className = 'tip'; document.body.appendChild(tip);
    document.addEventListener('mousemove', (e) => {
      const t = e.target.closest && e.target.closest('[data-tip]');
      if (!t) { tip.style.opacity = 0; return; }
      tip.textContent = t.getAttribute('data-tip'); tip.style.opacity = 1;
      const x = Math.min(window.innerWidth - tip.offsetWidth - 8, e.clientX + 12), y = Math.max(8, e.clientY - tip.offsetHeight - 10);
      tip.style.transform = `translate(${x}px,${y}px)`;
    });
  }

  window.CH = { bars, lines, donut, ring, spark, initTip, esc };
})();
