/* Bank Command Center — simulated CCTV scenes (canvas). Each camera zone gets a bank-like scene
   (banking hall, teller line, ATM lobby, vault, server hall, parking …) with people moving according to
   time of day and branch hours, night IR on outdoor cameras, lens/noise/vignette and VMS-style analytics boxes.
   Simulated feeds for the demo — not real footage. Exposes window.CAMSCENE.paint(canvas, cam, t, opts). */
(function () {
  'use strict';
  const hash = (s) => { let h = 2166136261; s = String(s); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  const rng = (seed) => { let a = hash(seed); return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };
  const lerp = (a, b, f) => a + (b - a) * f;
  const pick = (r, a) => a[Math.floor(r() * a.length)];

  // ---------- scene kind from camera zone ----------
  function kindOf(zone) {
    const z = zone.toLowerCase();
    if (/atm/.test(z)) return 'atm';
    if (/teller|cash centre/.test(z)) return 'teller';
    if (/vault/.test(z)) return /corridor/.test(z) ? 'corridor' : 'vault';
    if (/data hall|cage|server|ups/.test(z)) return 'servers';
    if (/parking b|loading dock/.test(z)) return 'garage';
    if (/parking|perimeter|fence|yard|fuel|gatehouse|loading bay/.test(z)) return 'outdoor';
    if (/entrance|exit|mantrap/.test(z)) return 'entrance';
    if (/back office|executive|treasury|noc/.test(z)) return 'office';
    if (/stair|corridor/.test(z)) return 'corridor';
    return 'hall';
  }

  // ---------- one-point perspective: X,Y in back-wall screen coords, s = depth scale (1 = back wall) ----------
  function geo(W, H, r, kind) {
    const outdoor = kind === 'outdoor';
    // indoor cameras are ceiling-mounted (~2.7 m): the horizon sits near the top of the back wall
    const vx = W * (0.38 + r() * 0.24), vy = H * (outdoor ? 0.3 : 0.27 + r() * 0.05);
    const bw = W * (outdoor ? 0.9 : 0.4 + r() * 0.1), bh = H * (outdoor ? 0.2 : 0.3 + r() * 0.05);
    const bx0 = vx - bw * (0.35 + r() * 0.3), by0 = vy - bh * (outdoor ? 0.55 : 0.12 + r() * 0.08);
    const G = { W, H, vx, vy, bx0, bx1: bx0 + bw, by0, by1: by0 + bh, bw, bh, smax: (H * 1.1 - vy) / (by0 + bh - vy) };
    G.S = (d) => lerp(1, G.smax, d);
    G.p = (X, Y, s) => [vx + (X - vx) * s, vy + (Y - vy) * s];
    G.X = (u) => G.bx0 + u * G.bw; G.Y = (h) => G.by1 - h * G.bh; // h: fraction of wall height (≈3 m)
    G.f = (u, d, h = 0) => G.p(G.X(u), G.Y(h), G.S(d));
    return G;
  }
  function poly(x, pts, fill, stroke) { x.beginPath(); pts.forEach((p, i) => i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1])); x.closePath(); if (fill) { x.fillStyle = fill; x.fill(); } if (stroke) { x.strokeStyle = stroke; x.stroke(); } }
  function grad(x, x0, y0, x1, y1, stops) { const g = x.createLinearGradient(x0, y0, x1, y1); stops.forEach(([o, c]) => g.addColorStop(o, c)); return g; }
  // box on the floor: u0..u1 across, d0..d1 depth, h height (wall fractions)
  function box(x, G, u0, u1, d0, d1, h, c, h0 = 0) {
    const [top, front, side] = c;
    const A = G.f(u0, d1, h0), Bp = G.f(u1, d1, h0), C = G.f(u1, d1, h), D = G.f(u0, d1, h);
    const sx = G.X(u0) > G.vx ? u0 : G.X(u1) < G.vx ? u1 : null; // visible side face
    if (sx !== null) poly(x, [G.f(sx, d0, h0), G.f(sx, d1, h0), G.f(sx, d1, h), G.f(sx, d0, h)], side);
    if (G.Y(h) > G.vy) poly(x, [D, C, G.f(u1, d0, h), G.f(u0, d0, h)], top); else poly(x, [G.f(u0, d1, h0), G.f(u1, d1, h0), G.f(u1, d0, h0), G.f(u0, d0, h0)], top);
    poly(x, [A, Bp, C, D], front);
  }
  // rectangle on the back wall (u, h fractions)
  function wallRect(x, G, u0, u1, h0, h1, fill) { x.fillStyle = fill; x.fillRect(G.X(u0), G.Y(h1), (u1 - u0) * G.bw, (h1 - h0) * G.bh); }
  // quad on a side wall (side 0 left / 1 right), d0..d1, h0..h1
  function sideRect(x, G, side, d0, d1, h0, h1, fill) { poly(x, [G.f(side, d0, h0), G.f(side, d1, h0), G.f(side, d1, h1), G.f(side, d0, h1)], fill); }

  // ---------- room shell ----------
  function shell(x, G, pal, opt = {}) {
    const { W, H } = G; const far = Math.max(4, G.smax * 1.6); x.fillStyle = pal.floor2; x.fillRect(0, 0, W, H);
    const L0 = G.p(G.bx0, G.by1, far), R0 = G.p(G.bx1, G.by1, far), L1 = G.p(G.bx0, G.by0, far), R1 = G.p(G.bx1, G.by0, far);
    // ceiling, side walls, floor, back wall
    poly(x, [[G.bx0, G.by0], [G.bx1, G.by0], R1, L1], grad(x, 0, 0, 0, G.by0, [[0, pal.ceil2], [1, pal.ceil]]));
    poly(x, [[G.bx0, G.by0], [G.bx0, G.by1], L0, L1], grad(x, 0, 0, G.bx0, 0, [[0, pal.wallL2], [1, pal.wallL]]));
    poly(x, [[G.bx1, G.by0], [G.bx1, G.by1], R0, R1], grad(x, W, 0, G.bx1, 0, [[0, pal.wallR2], [1, pal.wallR]]));
    poly(x, [[G.bx0, G.by1], [G.bx1, G.by1], R0, L0], grad(x, 0, G.by1, 0, H, [[0, pal.floor], [1, pal.floor2]]));
    x.fillStyle = grad(x, 0, G.by0, 0, G.by1, [[0, pal.back], [1, pal.back2]]); x.fillRect(G.bx0, G.by0, G.bw, G.bh);
    // floor tiles
    if (pal.tile) {
      x.strokeStyle = pal.tile; x.lineWidth = 1;
      const n = opt.tiles || 8;
      for (let i = -n; i <= 2 * n; i++) { const a = G.f(i / n, 0), b = G.f(i / n, 1.2); x.beginPath(); x.moveTo(a[0], a[1]); x.lineTo(b[0], b[1]); x.stroke(); }
      for (let k = 1; k < 14; k++) { const d = Math.pow(k / 14, 1.7) * 1.2; const a = G.f(-3, d), b = G.f(4, d); x.beginPath(); x.moveTo(a[0], a[1]); x.lineTo(b[0], b[1]); x.stroke(); }
    }
    // skirting
    x.fillStyle = pal.skirt || 'rgba(0,0,0,.25)'; x.fillRect(G.bx0, G.by1 - G.bh * 0.03, G.bw, G.bh * 0.03);
    [0, 1].forEach(s => sideRect(x, G, s, 0, 1.3, 0, 0.03, pal.skirt || 'rgba(0,0,0,.25)'));
    // ceiling light panels with glow on floor
    if (opt.lights !== false) for (let d = 0.08; d < 1.1; d += 0.24) for (const u of opt.lightU || [0.25, 0.75]) {
      const a = G.f(u - 0.07, d, 1), b = G.f(u + 0.07, d, 1), c = G.f(u + 0.07, d + 0.07, 1), e = G.f(u - 0.07, d + 0.07, 1);
      poly(x, [a, b, c, e], pal.light || 'rgba(255,250,235,.85)');
      const fp = G.f(u, d + 0.03); const rr = G.bh * G.S(d) * 0.7;
      const g = x.createRadialGradient(fp[0], fp[1], 0, fp[0], fp[1], rr); g.addColorStop(0, 'rgba(255,248,230,.10)'); g.addColorStop(1, 'rgba(255,248,230,0)');
      x.fillStyle = g; x.fillRect(fp[0] - rr, fp[1] - rr, rr * 2, rr * 2);
    }
  }
  // bank brand sign: logo mark like the dashboard header (rounded square blue→cyan) + bar of "lettering"
  function brand(x, G, u, h, w, theme) {
    const X = G.X(u), Y = G.Y(h), s = w * G.bw; const m = s * 0.28;
    x.fillStyle = grad(x, X, Y, X + m, Y + m, [[0, theme.a2], [1, theme.a]]);
    x.beginPath(); x.roundRect ? x.roundRect(X, Y, m, m, m * 0.25) : x.rect(X, Y, m, m); x.fill();
    x.fillStyle = 'rgba(255,255,255,.9)'; x.fillRect(X + m * 0.28, Y + m * 0.3, m * 0.44, m * 0.1); x.fillRect(X + m * 0.3, Y + m * 0.45, m * 0.08, m * 0.25); x.fillRect(X + m * 0.62, Y + m * 0.45, m * 0.08, m * 0.25); x.fillRect(X + m * 0.25, Y + m * 0.72, m * 0.5, m * 0.08);
    x.fillStyle = 'rgba(235,242,255,.85)'; x.fillRect(X + m * 1.25, Y + m * 0.22, s - m * 1.3, m * 0.26);
    x.fillStyle = 'rgba(180,200,230,.55)'; x.fillRect(X + m * 1.25, Y + m * 0.6, (s - m * 1.3) * 0.7, m * 0.14);
  }

  // palettes: interiors echo the dashboard (navy feature walls with cyan accent)
  function palette(kind, theme, r) {
    const warm = { ceil: '#cfc9bd', ceil2: '#a9a397', wallL: '#c9c1b2', wallL2: '#8f887b', wallR: '#c4bcad', wallR2: '#8b8477', floor: '#bfb3a0', floor2: '#8d816f', back: theme.navy, back2: theme.navy2, tile: 'rgba(60,50,40,.16)', skirt: 'rgba(40,35,30,.35)' };
    switch (kind) {
      case 'servers': return { ceil: '#3b4350', ceil2: '#262c36', wallL: '#4a5260', wallL2: '#2b313b', wallR: '#4a5260', wallR2: '#2b313b', floor: '#8a9099', floor2: '#5b6069', back: '#3a414d', back2: '#2b313b', tile: 'rgba(20,25,35,.35)', light: 'rgba(235,245,255,.9)' };
      case 'vault': case 'corridor': return { ceil: '#bdbab3', ceil2: '#94918a', wallL: '#b5b1a8', wallL2: '#7a776f', wallR: '#b0aca3', wallR2: '#78746c', floor: '#9e9a92', floor2: '#6e6a63', back: kind === 'vault' ? '#8f8c85' : theme.navy, back2: kind === 'vault' ? '#77746d' : theme.navy2, tile: 'rgba(40,40,40,.18)' };
      case 'garage': return { ceil: '#7d7f80', ceil2: '#5c5e60', wallL: '#8a8c8c', wallL2: '#5f6162', wallR: '#8a8c8c', wallR2: '#5f6162', floor: '#77797a', floor2: '#55585a', back: '#8d8f8f', back2: '#6a6c6d', tile: null, light: 'rgba(240,248,255,.9)' };
      case 'office': return Object.assign({}, warm, { floor: '#7d8592', floor2: '#5a6170', tile: 'rgba(30,35,45,.12)', back: '#d8d3c8', back2: '#b7b1a5' });
      default: return Object.assign(warm, r() > 0.5 ? { floor: '#d3cbbd', floor2: '#9b9283' } : {});
    }
  }

  // ---------- static scene furniture per kind ----------
  const SCN = {};
  SCN.hall = (x, G, pal, th, r) => {
    shell(x, G, pal);
    brand(x, G, 0.08 + r() * 0.3, 0.82, 0.42, th);
    wallRect(x, G, 0, 1, 0.62, 0.64, th.a); // cyan stripe
    // queue display + counters along back wall
    wallRect(x, G, 0.68, 0.9, 0.66, 0.8, '#0b1220'); x.fillStyle = '#ff5a3c'; x.font = `700 ${G.bh * 0.09}px Consolas, monospace`; x.fillText('A 047', G.X(0.7), G.Y(0.69));
    // seating rows (seat + backrest)
    for (let k = 0; k < 2; k++) for (let i = 0; i < 4; i++) { const u = 0.58 + i * 0.09, d = 0.32 + k * 0.15; box(x, G, u, u + 0.075, d + 0.05, d + 0.065, 0.32, ['#2b4a7a', '#22406e', '#152847'], 0.15); box(x, G, u, u + 0.075, d, d + 0.06, 0.15, ['#34578c', '#1d3560', '#152847']); }
    box(x, G, 0.06, 0.24, 0.28, 0.33, 0.34, ['#efe9dd', th.navy, th.navy2]); // customer service desk
    box(x, G, 0.12, 0.18, 0.29, 0.3, 0.48, ['#111', '#0d1117', '#151a22'], 0.34);
  };
  SCN.hall.front = { d: 0.08, draw: (x, G, pal, th) => {
    box(x, G, 0.05, 0.95, 0.06, 0.1, 0.36, ['#e8e1d3', '#6b5640', '#57452f']);
    for (let i = 0; i < 4; i++) { const u = 0.1 + i * 0.22; poly(x, [G.f(u, 0.08, 0.36), G.f(u + 0.16, 0.08, 0.36), G.f(u + 0.16, 0.08, 0.62), G.f(u, 0.08, 0.62)], 'rgba(190,225,240,.14)', 'rgba(220,240,255,.3)'); }
  } };
  SCN.teller = (x, G, pal, th, r) => {
    shell(x, G, pal);
    brand(x, G, 0.3, 0.85, 0.4, th); wallRect(x, G, 0, 1, 0.7, 0.72, th.a);
    // back office cabinets
    for (let i = 0; i < 6; i++) box(x, G, 0.02 + i * 0.16, 0.16 + i * 0.16, 0.0, 0.05, 0.3, ['#cfc6b6', '#9b917f', '#8a806e']);
  };
  SCN.teller.front = { d: 0.24, draw: (x, G, pal, th) => {
    box(x, G, -0.3, 1.3, 0.2, 0.24, 0.37, ['#efe9dd', '#5e4a35', '#4b3a28']); // counter, glass partitions, monitors
    for (let i = 0; i < 5; i++) {
      const u = -0.12 + i * 0.3; const a = G.f(u, 0.22, 0.37), b = G.f(u + 0.24, 0.22, 0.37), c = G.f(u + 0.24, 0.22, 0.75), d = G.f(u, 0.22, 0.75);
      poly(x, [a, b, c, d], 'rgba(190,225,240,.16)', 'rgba(220,240,255,.35)');
      box(x, G, u + 0.06, u + 0.14, 0.19, 0.2, 0.5, ['#222', '#111', '#1a1a1a'], 0.37);
      const n = G.f(u + 0.02, 0.24, 0.25); x.fillStyle = th.a; x.font = `700 ${G.bh * G.S(0.24) * 0.07}px Segoe UI, sans-serif`; x.fillText(String(i + 1), n[0], n[1]);
    }
  } };
  SCN.atm = (x, G, pal, th, r) => {
    shell(x, G, Object.assign({}, pal, { back: '#d9d4ca', back2: '#bdb7ab' }), { lightU: [0.5] });
    wallRect(x, G, 0, 1, 0.78, 1, th.navy); brand(x, G, 0.3, 0.95, 0.4, th);
    const n = 2 + Math.floor(r() * 2);
    for (let i = 0; i < n; i++) {
      const u0 = 0.12 + i * (0.8 / n), u1 = u0 + 0.8 / n - 0.1;
      wallRect(x, G, u0 - 0.02, u1 + 0.02, 0, 0.72, th.navy2);
      wallRect(x, G, u0, u1, 0.42, 0.6, '#1b2533'); wallRect(x, G, u0 + 0.04, u1 - 0.04, 0.46, 0.57, '#2f7fb0');
      wallRect(x, G, u0 + 0.02, u1 - 0.02, 0.3, 0.38, '#3a4656'); wallRect(x, G, u0, u1, 0.62, 0.68, th.a);
    }
    // glass front at the camera side
    x.fillStyle = 'rgba(200,230,245,.05)'; x.fillRect(0, 0, G.W, G.H);
  };
  SCN.vault = (x, G, pal, th, r) => {
    shell(x, G, pal, { lightU: [0.5] });
    // safe deposit boxes on side walls
    [0, 1].forEach(s => { for (let d = 0.02; d < 0.9; d += 0.06) for (let h = 0.08; h < 0.88; h += 0.1) sideRect(x, G, s, d + 0.004, d + 0.054, h + 0.01, h + 0.09, (Math.floor(d * 50 + h * 30) % 3) ? '#b9a77a' : '#a99665'); });
    // round vault door on back wall
    const cx = G.X(0.5), cy = G.Y(0.48), R = G.bh * 0.42;
    x.fillStyle = '#6f7378'; x.beginPath(); x.arc(cx, cy, R * 1.12, 0, 7); x.fill();
    x.fillStyle = grad(x, cx - R, cy - R, cx + R, cy + R, [[0, '#d5d8dc'], [0.5, '#9aa0a7'], [1, '#6c7178']]); x.beginPath(); x.arc(cx, cy, R, 0, 7); x.fill();
    x.strokeStyle = 'rgba(40,45,50,.5)'; x.lineWidth = R * 0.05; x.beginPath(); x.arc(cx, cy, R * 0.7, 0, 7); x.stroke();
    x.lineWidth = R * 0.08; for (let k = 0; k < 3; k++) { const a = k * 2.094 + 0.4; x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx + Math.cos(a) * R * 0.5, cy + Math.sin(a) * R * 0.5); x.stroke(); }
    x.fillStyle = '#4a4f55'; x.beginPath(); x.arc(cx, cy, R * 0.14, 0, 7); x.fill();
    box(x, G, 0.38, 0.62, 0.36, 0.42, 0.3, ['#9ba1a8', '#6d737a', '#5b6066']); // inspection table
    // floor hazard line
    const a = G.f(0, 0.2), b = G.f(1, 0.2); x.strokeStyle = 'rgba(240,190,40,.7)'; x.lineWidth = G.bh * 0.03; x.beginPath(); x.moveTo(a[0], a[1]); x.lineTo(b[0], b[1]); x.stroke();
  };
  SCN.corridor = (x, G, pal, th, r) => {
    shell(x, G, pal, { lightU: [0.5], tiles: 4 });
    wallRect(x, G, 0.3, 0.7, 0, 0.75, '#5d6670'); wallRect(x, G, 0.49, 0.51, 0, 0.75, '#3b424a'); // steel double door
    wallRect(x, G, 0.75, 0.82, 0.42, 0.55, '#20262e'); x.fillStyle = '#22c55e'; x.fillRect(G.X(0.77), G.Y(0.5), G.bw * 0.02, G.bh * 0.03); // card reader
    [0, 1].forEach(s => { sideRect(x, G, s, 0.3, 0.45, 0, 0.72, '#7b6a55'); sideRect(x, G, s, 0.7, 0.85, 0, 0.72, '#7b6a55'); sideRect(x, G, s, 0, 1.3, 0.62, 0.64, th.a); });
    wallRect(x, G, 0.42, 0.58, 0.85, 0.93, '#1c9a4b'); // exit sign
  };
  SCN.entrance = (x, G, pal, th, r) => {
    shell(x, G, Object.assign({}, pal, { back: '#9fb5c4', back2: '#cfd9df' }));
    // glass façade with sliding doors showing daylight/street
    x.fillStyle = grad(x, 0, G.by0, 0, G.by1, [[0, '#e9f1f6'], [0.6, '#c7d3da'], [1, '#9aa5ac']]); x.fillRect(G.bx0, G.by0, G.bw, G.bh);
    for (let i = 0; i <= 6; i++) wallRect(x, G, i / 6 - 0.006, i / 6 + 0.006, 0, 1, '#4b5561');
    wallRect(x, G, 0, 1, 0.8, 0.83, '#4b5561');
    wallRect(x, G, 0.33, 0.67, 0, 0.8, 'rgba(160,200,220,.25)');
    // security gate posts + guard desk
    box(x, G, 0.28, 0.31, 0.25, 0.3, 0.6, ['#9aa3ad', '#6e7781', '#5d656e']); box(x, G, 0.69, 0.72, 0.25, 0.3, 0.6, ['#9aa3ad', '#6e7781', '#5d656e']);
    box(x, G, 0.85, 1.15, 0.45, 0.6, 0.36, ['#ece6da', th.navy, th.navy2]);
    // entrance mat
    poly(x, [G.f(0.3, 0.05), G.f(0.7, 0.05), G.f(0.7, 0.35), G.f(0.3, 0.35)], 'rgba(40,45,55,.55)');
    brand(x, G, 0.36, 0.95, 0.3, th);
  };
  SCN.office = (x, G, pal, th, r) => {
    shell(x, G, pal, { lightU: [0.2, 0.5, 0.8] });
    wallRect(x, G, 0.05, 0.95, 0.35, 0.8, 'rgba(150,185,215,.35)'); for (let i = 0; i <= 5; i++) wallRect(x, G, 0.05 + i * 0.18 - 0.004, 0.05 + i * 0.18 + 0.004, 0.35, 0.8, '#6d6a64');
    wallRect(x, G, 0.3, 0.7, 0.82, 0.95, th.navy);
    const rows = 3; for (let k = 0; k < rows; k++) for (let i = 0; i < 3; i++) {
      const u = 0.06 + i * 0.33, d = 0.2 + k * 0.26;
      box(x, G, u, u + 0.24, d, d + 0.08, 0.25, ['#e6e2da', '#a7a097', '#938c83']);
      box(x, G, u + 0.06, u + 0.16, d, d + 0.01, 0.4, ['#111', '#0d1117', '#151a22'], 0.27);
      const s = G.f(u + 0.07, d + 0.012, 0.38), s2 = G.f(u + 0.15, d + 0.012, 0.29); x.fillStyle = 'rgba(80,170,230,.55)'; x.fillRect(s[0], s[1], s2[0] - s[0], s2[1] - s[1]);
    }
  };
  SCN.servers = (x, G, pal, th, r) => {
    shell(x, G, pal, { lightU: [0.5], tiles: 6 });
    // raised floor perforated tiles in aisle
    const rows = [[-0.55, 0.15], [0.85, 1.55]];
    rows.forEach(([u0, u1]) => { for (let d = 0; d < 1.05; d += 0.09) {
      box(x, G, u0, u1, d, d + 0.085, 0.72, ['#2a2f37', '#16191e', '#1d2128']);
      // LEDs on the visible rack face side
      const su = G.X(u0) > G.vx ? u0 : u1; const rr = rng('led' + d + su);
      for (let k = 0; k < 9; k++) { const p = G.f(su, d + 0.01 + rr() * 0.07, 0.1 + rr() * 0.58); x.fillStyle = rr() > 0.85 ? '#f59e0b' : rr() > 0.4 ? '#34d399' : '#38bdf8'; x.fillRect(p[0], p[1], Math.max(1, G.S(d) * 1.1), Math.max(1, G.S(d) * 1.1)); }
    } });
    // cage mesh on back wall
    x.strokeStyle = 'rgba(160,170,185,.35)'; x.lineWidth = 1; for (let u = 0; u <= 1; u += 0.04) { x.beginPath(); x.moveTo(G.X(u), G.by0); x.lineTo(G.X(u), G.by1); x.stroke(); }
    wallRect(x, G, 0.35, 0.65, 0.88, 0.95, th.a);
  };
  SCN.garage = (x, G, pal, th, r) => {
    shell(x, G, pal, { lightU: [0.2, 0.8] });
    wallRect(x, G, 0, 1, 0.45, 0.55, '#d6b53a'); // painted band
    const a = G.f(0.5, 0), b = G.f(0.5, 1.2); x.setLineDash([G.bh * 0.15, G.bh * 0.12]); x.strokeStyle = 'rgba(240,240,230,.6)'; x.lineWidth = 2; x.beginPath(); x.moveTo(a[0], a[1]); x.lineTo(b[0], b[1]); x.stroke(); x.setLineDash([]);
    for (let d = 0; d < 1.2; d += 0.22) { [0.02, 0.98].forEach(u => { const p = G.f(u < 0.5 ? -0.25 : 1.25, d), q = G.f(u, d); x.strokeStyle = 'rgba(240,240,230,.5)'; x.beginPath(); x.moveTo(p[0], p[1]); x.lineTo(q[0], q[1]); x.stroke(); }); }
    for (let d = 0.1; d < 1.2; d += 0.44) [-0.02, 0.97].forEach(u => box(x, G, u, u + 0.05, d, d + 0.03, 1, ['#9c9e9f', '#a6a8a9', '#86888a']));
  };
  SCN.outdoor = (x, G, pal, th, r) => {
    const { W, H } = G;
    x.fillStyle = grad(x, 0, 0, 0, G.by0, [[0, '#9cc3e0'], [1, '#d8e5ec']]); x.fillRect(0, 0, W, G.by0 + 2);
    // building / skyline
    x.fillStyle = '#c8bca6'; x.fillRect(0, G.by0 - G.bh * 1.1, W * (0.3 + r() * 0.3), G.bh * 1.15);
    x.fillStyle = 'rgba(70,90,110,.55)'; for (let i = 0; i < 12; i++) for (let k = 0; k < 3; k++) x.fillRect(i * W * 0.05 + 6, G.by0 - G.bh * (1 - k * 0.32), W * 0.03, G.bh * 0.18);
    x.fillStyle = grad(x, 0, G.by0, 0, H, [[0, '#a39d92'], [1, '#6f6a62']]); x.fillRect(0, G.by0, W, H - G.by0);
    // asphalt + bays
    poly(x, [G.f(0.1, 0), G.f(0.9, 0), G.f(1.4, 1.2), G.f(-0.4, 1.2)], '#55575a');
    x.strokeStyle = 'rgba(235,235,225,.6)'; x.lineWidth = 1.5;
    for (let u = 0.1; u <= 0.91; u += 0.08) { const p = G.f(u, 0.05), q = G.f(u, 0.3); x.beginPath(); x.moveTo(p[0], p[1]); x.lineTo(q[0], q[1]); x.stroke(); }
    // perimeter fence along the back
    x.strokeStyle = 'rgba(60,65,70,.8)'; for (let u = -0.5; u <= 1.5; u += 0.03) { const p = G.f(u, 0, 0), q = G.f(u, 0, 0.9); x.beginPath(); x.moveTo(p[0], p[1]); x.lineTo(q[0], q[1]); x.stroke(); }
    const f0 = G.f(-0.5, 0, 0.9), f1 = G.f(1.5, 0, 0.9); x.beginPath(); x.moveTo(f0[0], f0[1]); x.lineTo(f1[0], f1[1]); x.stroke();
    // light poles
    [0.05, 0.95].forEach(u => { const p = G.f(u, 0.5), q = G.f(u, 0.5, 2.2); x.strokeStyle = '#3c4046'; x.lineWidth = G.S(0.5) * 2; x.beginPath(); x.moveTo(p[0], p[1]); x.lineTo(q[0], q[1]); x.stroke(); });
    // barrier gate
    const g0 = G.f(0.95, 0.3), g1 = G.f(0.95, 0.3, 0.35); x.fillStyle = '#d9d9d9'; x.fillRect(g0[0] - 4, g1[1], 8, g0[1] - g1[1]);
    x.strokeStyle = '#e8463c'; x.lineWidth = G.S(0.3) * 2; const g2 = G.f(0.75, 0.3, 0.33); x.beginPath(); x.moveTo(g1[0], g1[1]); x.lineTo(g2[0], g2[1]); x.stroke();
  };

  // parked cars (static) for garage/outdoor
  function car(x, G, u, d, w, col, dl) {
    const L = dl || 0.1, H1 = 0.22, H2 = 0.42; // body ~0.7 m, roof ~1.3 m (wall = 3 m)
    const u0 = u - w / 2, u1 = u + w / 2;
    box(x, G, u0, u1, d, d + L * 1.8, H1, [col, shade(col, -0.25), shade(col, -0.35)], 0.03);
    box(x, G, u0 + w * 0.12, u1 - w * 0.12, d + L * 0.4, d + L * 1.3, H2, ['rgba(25,35,45,.92)', 'rgba(40,55,70,.9)', 'rgba(30,40,50,.9)'], H1);
    const lp = G.f(u0 + w * 0.08, d + L * 1.8, 0.07), rp = G.f(u1 - w * 0.08, d + L * 1.8, 0.07); x.fillStyle = 'rgba(255,240,210,.8)'; const sz = G.S(d) * 2.2; x.fillRect(lp[0], lp[1], sz * 2, sz); x.fillRect(rp[0] - sz * 2, rp[1], sz * 2, sz);
    // wheels
    const w0 = G.f(u0, d + 0.03, 0.03), w1 = G.f(u1, d + 0.03, 0.03); x.fillStyle = '#111'; x.fillRect(w0[0] - sz, w0[1] - sz, sz * 1.6, sz * 2); x.fillRect(w1[0] - sz * 0.6, w1[1] - sz, sz * 1.6, sz * 2);
  }
  function shade(hex, f) { const n = parseInt(hex.slice(1), 16); const c = [n >> 16, (n >> 8) & 255, n & 255].map(v => Math.max(0, Math.min(255, Math.round(v * (1 + f))))); return `rgb(${c[0]},${c[1]},${c[2]})`; }
  const CAR_COLS = ['#d9dcdf', '#1c1f24', '#8e959d', '#f2f2f0', '#6b1f24', '#2d4a73', '#bfc4c9', '#3f4448'];

  // ---------- people ----------
  const SKIN = ['#c99a74', '#b5835e', '#a87452', '#d8ad88', '#8f6142'];
  const HAIR = ['#1c1714', '#2b211b', '#3b2e24', '#141414'];
  const CLOTH = ['#2e3a4f', '#5a4636', '#7a7f87', '#e5e1d8', '#3d5a45', '#7b2e35', '#1f2430', '#a88b65', '#4f6d8c', '#d9c7a8'];
  function person(x, G, u, d, t, o) {
    const s = G.S(d); const [px, py] = G.f(u, d); const hgt = G.bh * (o.seat ? 0.4 : 0.57) * s * (o.k || 1);
    const walk = o.walk ? Math.sin(t / 190 * (o.pace || 1) + o.ph) : 0; const bob = o.walk ? Math.abs(walk) * hgt * 0.015 : Math.sin(t / 1400 + o.ph) * hgt * 0.004;
    const w = hgt * 0.27;
    // shadow
    x.fillStyle = 'rgba(0,0,0,.28)'; x.beginPath(); x.ellipse(px, py, w * 0.75, w * 0.18, 0, 0, 7); x.fill();
    const top = py - hgt - bob;
    // legs
    if (!o.seat) {
      x.fillStyle = o.pants;
      const lw = w * 0.36, lh = hgt * 0.46, sw = walk * w * 0.3;
      x.fillRect(px - w * 0.38 + sw, py - lh - bob, lw, lh); x.fillRect(px + w * 0.02 - sw, py - lh - bob, lw, lh);
      x.fillStyle = '#16181b'; x.fillRect(px - w * 0.42 + sw, py - hgt * 0.035, lw * 1.15, hgt * 0.035); x.fillRect(px - sw, py - hgt * 0.035, lw * 1.15, hgt * 0.035);
    }
    // torso (long garment for some)
    const tl = o.long ? hgt * 0.72 : hgt * 0.36; const ty = top + hgt * 0.17;
    x.fillStyle = o.top; x.beginPath(); x.roundRect ? x.roundRect(px - w / 2, ty, w, tl, [w * 0.3, w * 0.3, w * 0.08, w * 0.08]) : x.rect(px - w / 2, ty, w, tl); x.fill();
    if (o.shirt) { x.fillStyle = o.shirt; x.beginPath(); x.moveTo(px - w * 0.12, ty); x.lineTo(px + w * 0.12, ty); x.lineTo(px, ty + tl * 0.35); x.fill(); }
    // arms
    x.fillStyle = shade(o.topHex || '#555555', -0.15); const as = o.walk ? walk * hgt * 0.03 : 0;
    x.fillRect(px - w * 0.62, ty + hgt * 0.02 - as, w * 0.17, hgt * 0.33); x.fillRect(px + w * 0.45, ty + hgt * 0.02 + as, w * 0.17, hgt * 0.33);
    // head
    const hr = hgt * 0.075; const hy = top + hr * 1.05;
    x.fillStyle = o.skin; x.beginPath(); x.arc(px, hy, hr, 0, 7); x.fill();
    if (o.hijab) { x.fillStyle = o.hijab; x.beginPath(); x.arc(px, hy - hr * 0.1, hr * 1.18, Math.PI * 0.95, Math.PI * 2.05); x.lineTo(px + hr * 1.2, hy + hr * 1.5); x.lineTo(px - hr * 1.2, hy + hr * 1.5); x.fill(); x.fillStyle = o.skin; x.beginPath(); x.ellipse(px, hy + hr * 0.1, hr * 0.62, hr * 0.75, 0, 0, 7); x.fill(); }
    else { x.fillStyle = o.hair; x.beginPath(); x.arc(px, hy - hr * 0.15, hr * 1.02, Math.PI * (o.back ? 0 : 1.05), Math.PI * (o.back ? 2 : 1.95)); x.fill(); }
    if (o.cap) { x.fillStyle = o.cap; x.fillRect(px - hr * 1.1, hy - hr * 1.05, hr * 2.2, hr * 0.55); }
    if (o.bag) { x.fillStyle = '#3a2d22'; x.fillRect(px + w * 0.5, ty + hgt * 0.25, w * 0.32, hgt * 0.16); }
    const bot = o.hb ? G.f(u, d, o.hb)[1] : py;
    return { x: px - w * 0.7, y: top - hr * 0.3, w: w * 1.4, h: bot - top + hr * 0.3, d };
  }
  function look(r, role) {
    const f = r() < 0.48; const top = role === 'guard' ? '#1f2a3a' : role === 'staff' ? '#1b2d4f' : role === 'tech' ? '#3b4a5c' : pick(r, CLOTH);
    return { skin: pick(r, SKIN), hair: pick(r, HAIR), top, topHex: top, pants: role === 'staff' || role === 'guard' ? '#1a1d24' : pick(r, ['#22262e', '#3a3f48', '#2c3a52', '#4a3f35', '#1b1b1b']),
      hijab: f && role !== 'guard' && r() < 0.75 ? pick(r, ['#e8e0d2', '#6b4f3a', '#24324d', '#b7a28a', '#7a2f3a', '#3a3a3a']) : null, long: f && r() < 0.4 && role === 'cust',
      shirt: role === 'staff' || (role === 'cust' && r() < 0.25) ? '#e9eef5' : role === 'guard' ? '#c9d3df' : null, cap: role === 'guard' && r() < 0.5 ? '#151c28' : null, bag: role === 'cust' && r() < 0.3, k: 0.94 + r() * 0.12, ph: r() * 6.28, pace: 0.9 + r() * 0.3 };
  }

  // ---------- activity model ----------
  function hourOf(t) { const d = new Date(t); return d.getHours() + d.getMinutes() / 60; }
  function isWeekend(t) { const w = new Date(t).getDay(); return w === 5 || w === 6; } // Fri/Sat in Egypt
  function occ(kind, site, t) {
    const h = hourOf(t); const we = isWeekend(t);
    if (kind === 'servers') return h > 8 && h < 18 && !we ? 0.45 : 0.15;
    if (kind === 'outdoor' || kind === 'garage') return h > 7 && h < 19 ? (we ? 0.2 : 0.6) : 0.06;
    if (site.startsWith('DC')) return h > 8 && h < 18 && !we ? 0.4 : 0.1;
    const open = !we && h >= 8.5 && h < 15; const staffHrs = !we && h >= 8 && h < 17;
    if (open) return 0.55 + 0.4 * Math.exp(-Math.pow((h - 11.5) / 1.6, 2)); // midday peak
    if (kind === 'atm') return h > 6 && h < 24 ? 0.35 : 0.08;
    return staffHrs ? 0.12 : 0.0;
  }
  // a looping walker: visible on cycle k if hash < occupancy
  function loopPos(path, f) { const n = path.length - 1; const p = Math.min(n - 1e-6, f * n); const i = Math.floor(p), q = p - i; return [lerp(path[i][0], path[i + 1][0], q), lerp(path[i][1], path[i + 1][1], q)]; }

  function actors(kind, cam, t) {
    const r = rng('act' + cam.id); const out = []; const o = occ(kind, cam.site, t); const h = hourOf(t);
    const open = !isWeekend(t) && h >= 8.5 && h < 15, staff = !isWeekend(t) && h >= 8 && h < 17;
    const walkers = (n, paths) => {
      for (let i = 0; i < n; i++) {
        const T = 16000 + r() * 22000, ph = r() * T, path = pick(r, paths), lk = look(r, 'cust');
        const cyc = Math.floor((t + ph) / T), f = ((t + ph) % T) / T;
        if (rng(cam.id + i + ':' + cyc)() > o) continue;
        const [u, d] = loopPos(path, f); const dx = path[path.length - 1][0] - path[0][0];
        out.push(Object.assign(lk, { u, d, walk: true, back: dx === 0 && path[1][1] < path[0][1] }));
      }
    };
    const stand = (u, d, role, extra) => out.push(Object.assign(look(rng(cam.id + role + u + d), role), { u, d, walk: false }, extra));
    switch (kind) {
      case 'hall':
        if (staff) [0.2, 0.45, 0.72].forEach(u => stand(u, 0.03, 'staff', { hb: 0.36 }));
        stand(0.95, 0.25, 'guard');
        if (open) { const seated = Math.round(o * 6); for (let i = 0; i < seated; i++) stand(0.6 + (i % 4) * 0.09, 0.36 + Math.floor(i / 4) * 0.15, 'cust', { seat: true, back: true }); for (let i = 0; i < Math.round(o * 3); i++) stand(0.2 + i * 0.25, 0.15, 'cust', { back: true }); }
        walkers(7, [[[-0.4, 0.95], [0.3, 0.6], [0.5, 0.2]], [[0.5, 0.2], [0.8, 0.6], [1.4, 0.9]], [[1.4, 0.4], [-0.4, 0.75]], [[-0.4, 0.3], [1.4, 0.45]]]);
        break;
      case 'teller':
        if (staff) [0, 1, 2, 3, 4].forEach(i => { if (i < 4 || h < 13) stand(0.0 + i * 0.3, 0.12, 'staff', { hb: 0.37 }); });
        if (open) { for (let i = 0; i < 5; i++) if (rng(cam.id + 'cq' + i + Math.floor(t / 45000))() < o) stand(i * 0.3, 0.3, 'cust', { back: true }); for (let i = 0; i < Math.round(o * 4); i++) stand(0.5 + (i % 2) * 0.05, 0.5 + i * 0.12, 'cust', { back: true }); }
        walkers(3, [[[-0.5, 0.75], [1.5, 0.6]], [[1.5, 0.8], [-0.5, 0.9]]]);
        break;
      case 'atm': {
        const T = 70000; const cyc = Math.floor(t / T), f = (t % T) / T;
        if (rng(cam.id + 'atm' + cyc)() < o * 1.5) { if (f < 0.15) out.push(Object.assign(look(rng(cam.id + 'a' + cyc), 'cust'), { u: lerp(0.5, 0.3, f / 0.15), d: lerp(1.0, 0.12, f / 0.15), walk: true, back: true })); else if (f < 0.8) out.push(Object.assign(look(rng(cam.id + 'a' + cyc), 'cust'), { u: 0.3, d: 0.12, walk: false, back: true })); else out.push(Object.assign(look(rng(cam.id + 'a' + cyc), 'cust'), { u: lerp(0.3, 0.7, (f - 0.8) / 0.2), d: lerp(0.12, 1.05, (f - 0.8) / 0.2), walk: true })); }
        walkers(2, [[[0.75, 1.05], [0.7, 0.14], [0.7, 0.14], [0.8, 1.05]]]);
        break;
      }
      case 'vault': if (staff && rng(cam.id + 'v' + Math.floor(t / 600000))() < 0.5) { stand(0.42, 0.45, 'staff'); stand(0.66, 0.32, 'guard'); } break;
      case 'corridor': walkers(3, [[[0.5, 0.0], [0.5, 1.1]], [[0.45, 1.1], [0.45, 0.0]]]); if (o > 0.1 && cam.zone.includes('Vault')) stand(0.85, 0.5, 'guard'); break;
      case 'entrance':
        stand(0.95, 0.38, 'guard');
        walkers(6, [[[0.5, 0.0], [0.45, 0.5], [0.2, 1.1]], [[0.8, 1.1], [0.55, 0.4], [0.5, 0.0]], [[0.4, 0.0], [0.4, 1.1]]]);
        break;
      case 'office': if (staff) for (let k = 0; k < 3; k++) for (let i = 0; i < 3; i++) if (rng(cam.id + 'o' + k + i)() < 0.8) stand(0.18 + i * 0.33, 0.33 + k * 0.26, 'staff', { seat: true }); walkers(2, [[[-0.3, 0.92], [1.3, 0.95]]]); break;
      case 'servers': walkers(2, [[[0.35, 0.0], [0.35, 1.1]], [[0.4, 1.1], [0.42, 0.1]]]); if (rng(cam.id + 'tech' + Math.floor(t / 900000))() < o) stand(0.3, 0.45, 'tech'); break;
      case 'garage': case 'outdoor': walkers(3, [[[-0.4, 0.6], [1.4, 0.5]], [[0.4, 0.2], [0.2, 1.1]]]); if (cam.zone.match(/gate|perimeter|fence/i)) stand(0.85, 0.65, 'guard'); break;
    }
    return out;
  }
  function vehicles(kind, cam, t) {
    if (kind !== 'garage' && kind !== 'outdoor') return { parked: [], moving: [] };
    const r = rng('cars' + cam.id); const o = occ(kind, cam.site, t); const day = Math.floor(t / 86400000);
    const parked = [];
    const slots = kind === 'garage' ? [[-0.15, 0.1], [-0.15, 0.4], [-0.15, 0.7], [1.15, 0.15], [1.15, 0.45], [1.15, 0.75]] : [0.14, 0.22, 0.3, 0.38, 0.46, 0.54, 0.62, 0.7, 0.78, 0.86].map(u => [u, 0.06]);
    slots.forEach((s, i) => { const v = rng(cam.id + 'slot' + i + day + Math.floor(hourOf(t) / 2))(); if (v < o + 0.15) parked.push({ u: s[0], d: s[1], w: kind === 'garage' ? 0.28 : 0.065, dl: kind === 'garage' ? 0.1 : 0.022, col: CAR_COLS[Math.floor(r() * CAR_COLS.length)] }); });
    const moving = []; const T = 45000, f = (t % T) / T; if (rng(cam.id + 'mv' + Math.floor(t / T))() < o && f < 0.5) moving.push({ u: kind === 'garage' ? 0.5 : lerp(-0.6, 1.6, f * 2), d: kind === 'garage' ? lerp(1.0, -0.05, f * 2) : 0.55, w: kind === 'garage' ? 0.26 : 0.14, dl: kind === 'garage' ? 0.1 : 0.03, col: CAR_COLS[Math.floor(t / T) % CAR_COLS.length] });
    return { parked, moving };
  }

  // ---------- caches ----------
  const cache = new Map();
  function themeColors() {
    const cs = getComputedStyle(document.body); const v = (n, d) => (cs.getPropertyValue(n) || '').trim() || d;
    return { a: v('--accent', '#22d3ee'), a2: v('--accent2', '#3b82f6'), navy: '#16294a', navy2: '#0e1d36', key: v('--accent', '') + v('--accent2', '') };
  }
  function layers(cam, W, H, th) {
    const key = cam.id + '|' + W + 'x' + H + '|' + th.key; if (cache.has(key)) return cache.get(key);
    if (cache.size > 120) cache.clear();
    const kind = kindOf(cam.zone); const r = rng('scene' + cam.id); const G = geo(W, H, r, kind); const pal = palette(kind, th, r);
    const mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };
    const back = mk(); const bx = back.getContext('2d'); SCN[kind](bx, G, pal, th, r);
    let front = null; const fr = SCN[kind].front;
    if (fr) { front = mk(); fr.draw(front.getContext('2d'), G, pal, th); }
    const L = { kind, G, back, front, frontD: fr ? fr.d : 99, fisheye: cam.type === 'Fisheye', outdoor: kind === 'outdoor' };
    cache.set(key, L); return L;
  }
  const noise = [];
  function noiseTex(i) {
    if (!noise.length) for (let k = 0; k < 4; k++) { const c = document.createElement('canvas'); c.width = 160; c.height = 90; const x = c.getContext('2d'); const im = x.createImageData(160, 90); const r = rng('n' + k); for (let p = 0; p < im.data.length; p += 4) { const v = 128 + (r() - 0.5) * 255; im.data[p] = im.data[p + 1] = im.data[p + 2] = v; im.data[p + 3] = 255; } x.putImageData(im, 0, 0); noise.push(c); }
    return noise[i % noise.length];
  }

  // ---------- paint one frame ----------
  function paint(cv, cam, t, opts = {}) {
    const x = cv.getContext('2d'); const W = cv.width, H = cv.height; const th = themeColors();
    if (opts.show === false) { x.fillStyle = '#05080d'; x.fillRect(0, 0, W, H); x.globalAlpha = 0.25; x.imageSmoothingEnabled = false; x.drawImage(noiseTex(Math.floor(t / 80)), 0, 0, W, H); x.globalAlpha = 1; x.imageSmoothingEnabled = true; return; }
    const L = layers(cam, W, H, th); const G = L.G; const h = hourOf(t); const night = L.outdoor && (h < 6 || h >= 18.3);
    x.save();
    if (L.fisheye) { x.fillStyle = '#000'; x.fillRect(0, 0, W, H); x.beginPath(); x.ellipse(W / 2, H / 2, H * 0.62, H * 0.52, 0, 0, 7); x.clip(); }
    x.drawImage(L.back, 0, 0);
    const v = vehicles(L.kind, cam, t); v.parked.concat(v.moving).sort((a, b) => a.d - b.d).forEach(c => car(x, G, c.u, c.d, c.w, c.col, c.dl));
    const people = actors(L.kind, cam, t).sort((a, b) => a.d - b.d); const boxes = [];
    let frontDone = false;
    people.forEach(p => {
      if (!frontDone && L.front && p.d > L.frontD) { x.drawImage(L.front, 0, 0); frontDone = true; }
      if (p.d < -0.05 || p.d > 1.25) return;
      const bb = person(x, G, p.u, p.d, t, p); if (bb.x + bb.w > 0 && bb.x < W && bb.y < H) boxes.push(bb);
    });
    if (L.front && !frontDone) x.drawImage(L.front, 0, 0);
    // camera look: night IR (grayscale, center hotspot), slight colour grade, vignette, sensor noise
    if (night) {
      x.globalCompositeOperation = 'saturation'; x.fillStyle = '#808080'; x.fillRect(0, 0, W, H); x.globalCompositeOperation = 'multiply';
      const g = x.createRadialGradient(W * 0.5, H * 0.6, H * 0.1, W * 0.5, H * 0.6, W * 0.7); g.addColorStop(0, '#d8d8d8'); g.addColorStop(1, '#2a2a2a'); x.fillStyle = g; x.fillRect(0, 0, W, H);
      x.globalCompositeOperation = 'source-over';
    } else { x.globalCompositeOperation = 'soft-light'; x.fillStyle = 'rgba(40,80,120,.35)'; x.fillRect(0, 0, W, H); x.globalCompositeOperation = 'source-over'; }
    const vg = x.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, W * 0.72); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, `rgba(0,0,0,${L.fisheye ? 0.75 : 0.45})`); x.fillStyle = vg; x.fillRect(0, 0, W, H);
    x.globalAlpha = night ? 0.16 : 0.07; x.globalCompositeOperation = 'overlay'; x.drawImage(noiseTex(Math.floor(t / 90)), 0, 0, W, H); x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1;
    if (opts.blur) { x.filter = 'blur(6px)'; x.drawImage(cv, 0, 0); x.filter = 'none'; }
    x.restore();
    // analytics overlay (VMS object detection), coloured with the dashboard accent
    if (opts.analytics || opts.incident) {
      const fs = Math.max(9, H * 0.028); x.font = `600 ${fs}px Inter, Segoe UI, sans-serif`; x.lineWidth = Math.max(1, H / 360);
      const show = opts.analytics ? boxes.filter(b => b.h > H * 0.06) : boxes.slice(-1); const labelled = new Set(show.slice().sort((a, b) => b.h - a.h).slice(0, 4));
      show.forEach((b, i) => {
        const hot = opts.incident && i === show.length - 1; const col = hot ? '#ef4444' : th.a; const c = Math.min(b.w, b.h) * 0.25;
        x.strokeStyle = col; x.beginPath();
        [[b.x, b.y, 1, 1], [b.x + b.w, b.y, -1, 1], [b.x, b.y + b.h, 1, -1], [b.x + b.w, b.y + b.h, -1, -1]].forEach(([px, py, sx, sy]) => { x.moveTo(px + sx * c, py); x.lineTo(px, py); x.lineTo(px, py + sy * c); });
        x.stroke();
        if ((opts.analytics && labelled.has(b)) || hot) { const lab = hot ? (opts.incident || 'ALERT') : 'Person ' + (0.86 + (hash(cam.id + i) % 13) / 100).toFixed(2); const tw = x.measureText(lab).width + 8; const lx = Math.max(2, Math.min(W - tw - 2, b.x)), ly = Math.max(fs + 6, b.y); x.fillStyle = hot ? 'rgba(239,68,68,.85)' : 'rgba(6,16,30,.7)'; x.fillRect(lx, ly - fs - 4, tw, fs + 4); x.fillStyle = hot ? '#fff' : col; x.fillText(lab, lx + 4, ly - 4); }
      });
    }
    return { people: boxes.length, night };
  }
  window.CAMSCENE = { paint, kindOf, clear: () => cache.clear() };
})();
