/* Bank Command Center — views, filters, role-based access, drill-downs. Uses window.BK (sample data) and window.CH (charts). */
(function () {
  'use strict';
  const B = window.BK, esc = CH.esc, DAY = B.DAY;
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const store = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage blocked */ } } };
  const icon = (n) => `<svg><use href="#i-${n}"/></svg>`;

  const TABS = [
    { id: 'overview', label: 'Overview', ic: 'eye' },
    { id: 'banking', label: 'Performance', ic: 'bank' },
    { id: 'risk', label: 'Risk & Capital', ic: 'shield' },
    { id: 'bms', label: 'Buildings', ic: 'build' },
    { id: 'cctv', label: 'Security & CCTV', ic: 'cam' },
  ];
  const S = {
    tab: 'overview', site: 'ALL', range: 'ytd', mapMode: 'alerts', asOf: B.TODAY, role: store.get('bcc-role') || 'exec', rBranch: store.get('bcc-rbranch') || 'B01', rRegion: store.get('bcc-rregion') || 'Greater Cairo', theme: store.get('bcc-theme') || 'dark',
    bank: { metric: 'dep', drill: 'dep', sel: null }, cam: { q: '', st: 'all', page: 0, per: 12 }, loadedAt: Date.now(), log: [],
  };
  if (!B.ROLES[S.role]) S.role = 'exec';
  if (!B.SITE[S.rBranch] || B.SITE[S.rBranch].type !== 'BR') S.rBranch = 'B01';
  if (!B.REGIONS.includes(S.rRegion)) S.rRegion = B.REGIONS[0];
  if (!['dark', 'hybrid', 'light'].includes(S.theme)) S.theme = 'dark';

  // ---------- formatting ----------
  const nf = (v, d = 0) => Number(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  const money = (v, d = 1) => v >= 1e9 ? 'EGP ' + (v / 1e9).toFixed(d) + 'B' : v >= 1e6 ? 'EGP ' + (v / 1e6).toFixed(d) + 'M' : 'EGP ' + nf(v);
  const moneyAx = (v) => v >= 1e9 ? (v / 1e9).toFixed(v >= 1e10 ? 0 : 1) + 'B' : v >= 1e6 ? (v / 1e6).toFixed(0) + 'M' : nf(v);
  const kwh = (v) => v >= 1e6 ? (v / 1e6).toFixed(2) + 'M' : v >= 1e4 ? (v / 1e3).toFixed(1) + 'k' : nf(v);
  const short = (v) => v >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : v >= 1e3 ? (v / 1e3).toFixed(v >= 1e4 ? 0 : 1) + 'k' : nf(v);
  const pct = (v, d = 1) => (v * 100).toFixed(d) + '%';
  const delta = (cur, prev) => { if (!prev) return ''; const d = (cur - prev) / prev; return `<span class="${d >= 0 ? 'c-ok' : 'c-crit'}">${d >= 0 ? '▲' : '▼'} ${Math.abs(d * 100).toFixed(1)}%</span>`; };
  const ago = (sec) => sec < 60 ? Math.round(sec) + 's ago' : sec < 3600 ? Math.round(sec / 60) + ' min ago' : Math.floor(sec / 3600) + ' h ' + Math.round(sec % 3600 / 60) + ' min ago';
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  const dLabel = (d) => d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const elapsed = () => (Date.now() - S.loadedAt) / 1000;

  // ---------- scope & access ----------
  // a role with `pick` is bound to the branch / region chosen next to the role selector
  const role = () => {
    const r = B.ROLES[S.role]; if (!r.pick) return r;
    const v = r.pick === 'branch' ? S.rBranch : 'R:' + S.rRegion, f = (x) => x === '@' ? v : x;
    return { ...r, label: r.label + ' · ' + (r.pick === 'branch' ? B.SITE[S.rBranch].short : S.rRegion), bank: f(r.bank), live: f(r.live), playback: f(r.playback) };
  };
  const isRegional = () => String(role().bank).startsWith('R:');
  const roleIds = () => role().bank === 'none' ? [] : B.SITES.filter(s => s.bank && B.allows(role().bank, s.id)).map(s => s.id);
  const roleScope = () => { const b = role().bank; return b === 'all' ? 'the whole bank' : b.startsWith('R:') ? b.slice(2) + ' region' : B.SITE[b] ? B.SITE[b].name : '—'; };
  const isLive = () => +B.startOfDay(S.asOf) === +B.TODAY;
  const region = () => S.site.startsWith('R:') ? S.site.slice(2) : null;
  const single = () => S.site !== 'ALL' && !region();
  const scopeSites = () => S.site === 'ALL' ? B.SITES : region() ? B.SITES.filter(s => s.region === region()) : [B.SITE[S.site]];
  const inScope = (siteId) => S.site === 'ALL' || S.site === siteId || (region() && B.SITE[siteId].region === region());
  const scopeName = () => S.site === 'ALL' ? 'all sites' : region() ? region() + ' region' : B.SITE[S.site].name;
  const canBank = (site) => B.allows(role().bank, site);
  const canLive = (site) => B.allows(role().live, site);
  const canPlay = (site) => B.allows(role().playback, site);
  const canCctv = () => role().live !== 'none' || role().playback !== 'none';
  const canFootage = (site) => canLive(site) || canPlay(site);
  // a tab is only shown when the role can use it
  const tabOk = (id) => id === 'overview' || id === 'bms' || (id === 'banking' && role().bank !== 'none') || (id === 'risk' && role().bank === 'all') || (id === 'cctv' && canCctv());
  const myTabs = () => TABS.filter(t => tabOk(t.id));
  function bankScope() {
    const r = role();
    if (r.bank === 'none') return { ids: [], denied: true, reason: `The ${r.label} role has no access to banking figures.` };
    const mine = roleIds(), deny = { ids: [], denied: true, reason: `The ${r.label} role can only see banking details for ${roleScope()}.` };
    if (region()) {
      const ids = B.SITES.filter(s => s.bank && s.region === region() && mine.includes(s.id)).map(s => s.id);
      if (!ids.length) return deny;
      return { ids, label: r.bank !== 'all' && ids.length === 1 ? B.SITE[ids[0]].name : region() + ' region', scoped: r.bank !== 'all' };
    }
    if (S.site !== 'ALL') {
      const s = B.SITE[S.site];
      if (!s.bank) return { ids: [], na: true, reason: `${s.name} is a data center — no banking activity is booked here.` };
      if (!canBank(s.id)) return deny;
      return { ids: [s.id], label: s.name };
    }
    if (r.bank === 'all') return { ids: mine, label: 'Whole bank' };
    return { ids: mine, label: roleScope().replace(/^the /, ''), scoped: true };
  }

  // ---------- period helpers ----------
  const days = () => B.rangeDays(S.range, S.asOf);
  const nowHour = () => new Date().getHours() + new Date().getMinutes() / 60;
  const cumTx = (h) => { let a = 0, t = 0; B.TX_HOUR.forEach((v, i) => { t += v; if (i < h) a += v * Math.min(1, h - i); }); return a / t; };
  const dayFrac = (d) => (isLive() && +d === +B.TODAY) ? cumTx(nowHour()) : 1;
  const prevFrac = (i, n) => (isLive() && i === n - 1) ? cumTx(nowHour()) : 1; // like-for-like: prior period's last day cut at the same hour
  function prevDays() { const ds = days(); const n = ds.length; return ds.map(d => new Date(+d - n * DAY)); }

  const memo = new Map();
  const M = (key, fn) => { if (!memo.has(key)) memo.set(key, fn()); return memo.get(key); };

  // ---------- energy ----------
  function energyTotal(sites, ds, prev) {
    const h = nowHour();
    return sites.reduce((a, s) => a + ds.reduce((b, d, i) => b + ((isLive() && (prev ? i === ds.length - 1 : +d === +B.TODAY)) ? B.energyHourly(s.id, d, 23).reduce((x, v, i) => x + (i < h ? v * Math.min(1, h - i) : 0), 0) : B.energyDay(s.id, d)), 0), 0);
  }
  function energySeries(sites) {
    const ds = days();
    if (S.range === 'today') {
      const up = isLive() ? Math.floor(nowHour()) : 23; const v = Array(24).fill(0);
      sites.forEach(s => B.energyHourly(s.id, ds[0], up).forEach((x, i) => { v[i] = x == null ? null : (v[i] || 0) + x; }));
      return { labels: v.map((_, i) => pad(i) + ':00'), values: v, unit: 'kWh per hour' };
    }
    if (S.range === 'ytd') {
      const m = {}; ds.forEach(d => { const k = d.getMonth(); m[k] = (m[k] || 0) + sites.reduce((a, s) => a + B.energyDay(s.id, d), 0); });
      const ks = Object.keys(m).map(Number); return { labels: ks.map(k => MON[k]), values: ks.map(k => m[k]), unit: 'kWh per month' };
    }
    return { labels: ds.map(d => pad(d.getDate()) + ' ' + MON[d.getMonth()]), values: ds.map(d => sites.reduce((a, s) => a + B.energyDay(s.id, d), 0)), unit: 'kWh per day' };
  }

  // ---------- BMS ----------
  const SEVR = { critical: 0, high: 1, major: 2, medium: 3, minor: 4, low: 5 };
  const agoSeed = (id) => 120 + Math.floor(B.r1('ago' + id) * 5400);
  function bmsAlarms() {
    return M('bmsAlarms', () => {
      const out = [];
      B.EQUIP.forEach(e => {
        if (e.status === 'ok') return;
        const sev = e.status === 'alarm' ? (e.critical ? 'critical' : 'major') : e.status === 'warn' ? (e.critical ? 'major' : 'minor') : 'minor';
        out.push({ key: 'bms:' + e.id, kind: 'bms', eq: e.id, site: e.site, sys: e.sys, sev, title: `${e.code} ${e.kind}`, msg: e.note || e.status, ago: e.id === 'HQ-CH-2' ? 23 * 60 : e.id === 'DC1-UPS-A2' ? 11 * 60 : agoSeed(e.id) });
      });
      Object.entries(B.STALE).forEach(([site, sec]) => out.push({ key: 'stale:' + site, kind: 'bms', site, sys: 'gateway', sev: 'major', title: 'BMS gateway communication lost', msg: `No data from site controller — values frozen ${Math.round(sec / 60)} min`, ago: sec }));
      return out.sort((a, b) => SEVR[a.sev] - SEVR[b.sev] || a.ago - b.ago);
    });
  }
  function availability(sites) {
    const ids = new Set(sites.map(s => s.id)); const crit = B.EQUIP.filter(e => e.critical && ids.has(e.site));
    const H = days().length * 24 - (isLive() ? 24 - nowHour() : 0);
    let up = 0; crit.forEach(e => { let down = H * 0.0012 * B.r1('av' + e.id + S.range); if (e.status === 'alarm' || e.status === 'offline') down += Math.min(H, (bmsAlarms().find(a => a.eq === e.id) || { ago: 3600 }).ago / 3600); up += Math.max(0, H - down); });
    const downNow = crit.filter(e => e.status === 'alarm' || e.status === 'offline');
    return { pct: crit.length ? up / (crit.length * H) * 100 : 100, n: crit.length, down: downNow.length };
  }

  // ---------- CCTV ----------
  function camStats(sites) {
    const ids = new Set(sites.map(s => s.id)); const cams = B.CAMS.filter(c => ids.has(c.site));
    const online = cams.filter(c => c.status === 'online').length, recOk = cams.filter(c => c.rec === 'ok').length;
    const inc = B.INCIDENTS.filter(i => ids.has(i.site) && i.status !== 'resolved');
    const ret = cams.filter(c => c.retention >= 90).length;
    return { cams, total: cams.length, online, offline: cams.length - online, recOk, recPct: cams.length ? recOk / cams.length * 100 : 100, inc, retPct: cams.length ? ret / cams.length * 100 : 100, recIssue: cams.filter(c => c.status === 'online' && c.rec !== 'ok').length };
  }

  // ---------- Banking ----------
  function bankAgg(ids, ds) {
    const key = 'bank|' + ids.join(',') + '|' + B.iso(S.asOf) + '|' + S.range + '|' + (ds === undefined ? 'cur' : 'prev');
    return M(key, () => {
      const dd = ds || days(); const asOf = ds ? new Date(+dd[dd.length - 1]) : S.asOf;
      const a = { dep: 0, loans: 0, nplAmt: 0, profit: 0, tx: 0, depYoY: 0, depMix: [0, 0, 0, 0], loanMix: [0, 0, 0, 0, 0], tx5: [0, 0, 0, 0, 0], nplSeg: [0, 0, 0, 0, 0] };
      ids.forEach(id => {
        const b = B.BANK[id]; const d = B.balanceAt(id, 'dep', asOf), l = B.balanceAt(id, 'loans', asOf);
        a.dep += d; a.loans += l; a.nplAmt += l * b.npl; a.depYoY += B.balanceAt(id, 'dep', new Date(+asOf - 365 * DAY));
        b.depMix.forEach((m, i) => a.depMix[i] += d * m);
        const f = [0.5, 1.4, 0.6, 1.25, 2.1]; const norm = b.loanMix.reduce((x, m, i) => x + m * f[i], 0);
        b.loanMix.forEach((m, i) => { a.loanMix[i] += l * m; a.nplSeg[i] += l * m * b.npl * f[i] / norm; });
        dd.forEach((day, di) => { const fr = ds ? prevFrac(di, dd.length) : dayFrac(day); a.profit += B.profitDay(id, day) * fr; B.txDay(id, day).forEach((v, i) => { a.tx5[i] += v * fr; a.tx += v * fr; }); });
      });
      a.npl = a.loans ? a.nplAmt / a.loans : 0; a.ldr = a.dep ? a.loans / a.dep : 0; a.casa = a.dep ? (a.depMix[0] + a.depMix[1]) / a.dep : 0;
      return a;
    });
  }
  function bankMonthly(ids, metric) {
    return M('bm|' + ids.join(',') + metric + B.iso(S.asOf), () => {
      const out = { labels: [], values: [] }; const end = S.asOf;
      for (let k = 11; k >= 0; k--) {
        const y = end.getFullYear(), m = end.getMonth() - k; const first = new Date(y, m, 1); const last = k === 0 ? end : new Date(y, m + 1, 0);
        out.labels.push(MON[first.getMonth()] + (first.getMonth() === 0 || k === 11 ? " '" + String(first.getFullYear()).slice(2) : ''));
        if (metric === 'dep' || metric === 'loans') out.values.push(ids.reduce((a, id) => a + B.balanceAt(id, metric, last), 0));
        else { let v = 0; for (let t = +first; t <= +last; t += DAY) { const dd = new Date(t); ids.forEach(id => { v += metric === 'profit' ? B.profitDay(id, dd) : B.txDay(id, dd).reduce((x, y2) => x + y2, 0); }); } out.values.push(v); }
      }
      return out;
    });
  }

  // ---------- Alerts (Overview) ----------
  function allAlerts() {
    return M('alerts', () => {
      const out = bmsAlarms().filter(a => a.sev !== 'minor').map(a => Object.assign({ tab: 'bms', domain: 'BMS', sysLabel: a.sys === 'gateway' ? 'BMS gateway' : B.SYS[a.sys] }, a));
      B.INCIDENTS.filter(i => i.status !== 'resolved').forEach(i => out.push({ key: 'inc:' + i.id, kind: 'inc', inc: i.id, tab: 'cctv', domain: 'Security', sysLabel: 'Security incident', site: i.site, sev: i.sev === 'critical' || i.sev === 'high' ? 'critical' : 'major', title: i.type, msg: `${i.id} · ${i.status} · camera ${i.cam}`, ago: i.ago }));
      const off = {}; B.CAMS.filter(c => c.status === 'offline').forEach(c => (off[c.site] = off[c.site] || []).push(c));
      Object.entries(off).forEach(([site, cs]) => out.push({ key: 'off:' + site, kind: 'camoff', tab: 'cctv', domain: 'CCTV', sysLabel: 'Camera offline', site, sev: cs.length >= 3 ? 'critical' : 'major', title: cs.length > 1 ? `${cs.length} cameras offline` : `Camera ${cs[0].id} offline`, msg: cs[0].note, ago: Math.max(...cs.map(c => c.since)) }));
      const rec = {}; B.CAMS.filter(c => c.status === 'online' && c.rec !== 'ok').forEach(c => (rec[c.site] = rec[c.site] || []).push(c));
      Object.entries(rec).forEach(([site, cs]) => out.push({ key: 'rec:' + site, kind: 'rec', tab: 'cctv', domain: 'CCTV', sysLabel: 'Recording health', site, sev: 'major', title: `Recording issue on ${cs.length} camera${cs.length > 1 ? 's' : ''}`, msg: cs[0].note, ago: 3 * 3600 }));
      B.SITES.filter(s => s.bank && B.BANK[s.id].npl > B.NPL_LIMIT).forEach(s => out.push({ key: 'npl:' + s.id, kind: 'bank', tab: 'banking', domain: 'Banking', sysLabel: 'Credit risk', site: s.id, sev: 'critical', title: 'NPL ratio above risk limit', msg: `NPL {npl} vs limit ${pct(B.NPL_LIMIT)}`, npl: B.BANK[s.id].npl, ago: 9 * 3600 }));
      return out.filter(a => a.kind === 'bank' ? canBank(a.site) : a.tab === 'cctv' ? canFootage(a.site) : true).sort((a, b) => SEVR[a.sev] - SEVR[b.sev] || a.ago - b.ago);
    });
  }
  const alertMsg = (a) => a.kind === 'bank' ? (canBank(a.site) ? a.msg.replace('{npl}', pct(a.npl)) : 'Details restricted for your role') : a.msg;
  const siteAlerts = (id) => allAlerts().filter(a => a.site === id);
  const siteState = (id) => { const al = siteAlerts(id); return al.some(a => a.sev === 'critical') ? 'crit' : al.length ? 'warn' : 'ok'; };

  // ---------- freshness ----------
  function freshness() {
    const e = elapsed();
    const bmsAge = (4 + e) % 10, camAge = (2 + e) % 5;
    const staleHere = Object.keys(B.STALE).filter(inScope);
    const lastFeed = new Date(); lastFeed.setMinutes(Math.floor(lastFeed.getMinutes() / 15) * 15, 0, 0);
    const eod = new Date(+B.startOfDay(S.asOf) - 60000);
    const list = [];
    if (!isLive()) list.push(`<span class="fr"><span class="dot off"></span>Historical · <b>${dLabel(S.asOf)}</b> · alarms &amp; cameras show live state</span>`);
    const nGw = scopeSites().length;
    list.push(staleHere.length && single()
      ? `<span class="fr" title="BMS gateway not reporting"><span class="dot warn"></span>BMS <b>stale ${Math.round((B.STALE[staleHere[0]] + e) / 60)} min</b></span>`
      : `<span class="fr" title="BMS polls every 10 s"><span class="dot live"></span>BMS <b data-age="bms">${Math.round(bmsAge)}s ago</b>${staleHere.length ? ` · <span class="c-warn">${nGw - staleHere.length}/${nGw}<span class="xtra"> gateways</span></span>` : ''}</span>`);
    list.push(`<span class="fr" title="Video management system heartbeat every 5 s"><span class="dot live"></span>CCTV<span class="xtra"> VMS</span> <b data-age="cam">${Math.round(camAge)}s ago</b></span>`);
    list.push(`<span class="fr" title="Balances from end-of-day close; transactions from the 15-minute intraday feed"><span class="dot info"></span><span class="xtra">Core banking · </span>EOD <b>${pad(eod.getDate())} ${MON[eod.getMonth()]} 23:59</b>${isLive() ? ` · txns <b>${pad(lastFeed.getHours())}:${pad(lastFeed.getMinutes())}</b>` : ''}</span>`);
    return list.join('');
  }
  const upd = (src) => `<span class="upd" data-upd="${src}">${src === 'bank' ? 'EOD close' : 'Live'}</span>`;

  // ======================================================================
  // Rendering
  // ======================================================================
  let charts = [];
  const chart = (id, fn) => { charts.push({ id, fn }); return `<div class="chart" id="${id}"></div>`; };
  function drawCharts() { charts.forEach(c => { const el = document.getElementById(c.id); if (el) c.fn(el); }); }
  const lockbox = (why, small) => `<div class="lockbox">${icon('lock')}<b>${small ? 'Restricted' : 'Access restricted'}</b><span>${esc(why)}</span></div>`;
  const kpiLocked = (label) => `<div class="kpi locked"><div class="kl">${label}</div><div class="kv">${icon('lock')} Restricted</div><div class="ks">Requires banking access</div></div>`;

  function render() {
    memo.clear(); charts = [];
    document.body.className = 'theme-' + S.theme;
    $$('.themes button').forEach(b => b.classList.toggle('on', b.dataset.theme === S.theme));
    const crit = allAlerts().filter(a => a.sev === 'critical' && inScope(a.site)).length;
    if (!tabOk(S.tab)) S.tab = 'overview';
    $('#tabs').innerHTML = myTabs().map(t => `<button role="tab" data-tab="${t.id}" class="${S.tab === t.id ? 'on' : ''}" aria-selected="${S.tab === t.id}">${icon(t.ic)}<span class="tl-l">${t.label}</span>${t.id === 'overview' && crit ? `<span class="cnt">${crit}</span>` : ''}</button>`).join('');
    moveInd();
    const SEGL = { today: 'Today', d7: '7D', d30: '30D', mtd: 'MTD', ytd: 'YTD' };
    $('#fRange').innerHTML = Object.entries(B.RANGES).map(([k, v]) => `<button data-range="${k}" title="${v}" class="${S.range === k ? 'on' : ''}">${SEGL[k]}</button>`).join('');
    $('#fSite').value = S.site; $('#fRole').value = S.role;
    { const rr = B.ROLES[S.role], w = $('#fScopeW'), sel = $('#fScope'); w.hidden = !rr.pick;
      if (rr.pick && sel.dataset.k !== rr.pick) { sel.dataset.k = rr.pick; w.querySelector('span').textContent = rr.pick === 'branch' ? 'Branch' : 'Region';
        sel.innerHTML = rr.pick === 'branch' ? B.REGIONS.map(g => `<optgroup label="${esc(g)}">${B.SITES.filter(x => x.type === 'BR' && x.region === g).map(x => `<option value="${x.id}">${esc(x.short)}</option>`).join('')}</optgroup>`).join('') : B.REGIONS.map(g => `<option value="${esc(g)}">${esc(g)} · ${B.SITES.filter(x => x.type === 'BR' && x.region === g).length} branches</option>`).join(''); }
      if (rr.pick) sel.value = rr.pick === 'branch' ? S.rBranch : S.rRegion; } $('#fDate').value = B.iso(S.asOf);
    $('#fresh').innerHTML = freshness();
    const v = { overview: vOverview, bms: vBms, banking: vBanking, risk: vRisk, cctv: vCctv }[S.tab];
    const sk = S.tab + '|' + S.site + '|' + role().label; const fresh = S._shown !== sk; S._shown = sk;
    $('#main').innerHTML = v();
    requestAnimationFrame(() => { drawCharts(); if (S.tab === 'cctv') layoutCams(); if (fresh) playIn(); });
    if (location.hash.slice(1) !== S.tab) history.replaceState(null, '', '#' + S.tab);
  }

  // ======================================================================
  // CEO metrics
  // ======================================================================
  const bankIds = () => B.SITES.filter(s => s.bank).map(s => s.id);
  const effDays = () => { const ds = days(); return ds.length - 1 + dayFrac(ds[ds.length - 1]); };
  function budgetProfit(ids, ds) { return ids.reduce((a, id) => a + ds.reduce((b, d) => b + B.balanceAt(id, 'dep', d) * B.BANK[id].margin / 365 * 0.94 * dayFrac(d), 0), 0); }
  function ceo(ids) {
    return M('ceo|' + ids.join(','), () => {
      const a = bankAgg(ids);
      const w = (f, wt) => { let n = 0, d = 0; ids.forEach(id => { const x = wt(id); n += B.BANK[id][f] * x; d += x; }); return d ? n / d : 0; };
      const depW = (id) => B.balanceAt(id, 'dep', S.asOf), custW = (id) => B.BANK[id].customers;
      const equity = a.dep * 0.128; const budget = budgetProfit(ids, days());
      const grow = Math.pow(1.11, (S.asOf - B.TODAY) / (365 * DAY));
      const customers = ids.reduce((s, id) => s + B.BANK[id].customers * grow, 0);
      return Object.assign({}, a, {
        equity, roe: a.profit / effDays() * 365 / equity, budget, vsBudget: budget ? a.profit / budget - 1 : 0,
        nim: w('nim', depW), cir: w('cir', depW), coverage: w('coverage', id => B.balanceAt(id, 'loans', S.asOf) * B.BANK[id].npl),
        share: a.dep / B.marketDeposits(S.asOf), customers, digital: w('digital', custW), nps: w('nps', custW), newCust: customers * w('newCust', custW),
        yoy: a.depYoY ? a.dep / a.depYoY - 1 : 0, risk: B.riskAt(S.asOf), all: ids.length === bankIds().length,
      });
    });
  }
  // hi = higher is better; lim = [hard limit / regulatory minimum, internal target]
  const KPIS = {
    profit: { label: 'Net profit', short: 'Net profit', def: 'Profit after tax for the selected period, against the approved budget.', owner: 'CFO', fmt: v => money(v, 2), axis: moneyAx },
    roe: { label: 'Return on equity', short: 'ROE', def: 'Annualised net profit ÷ shareholders’ equity (allocated equity for a branch or region).', owner: 'CFO', hi: true, lim: 'roe', fmt: v => pct(v) },
    nim: { label: 'Net interest margin', short: 'NIM', def: 'Net interest income ÷ average earning assets, annualised.', owner: 'Treasurer · ALCO', hi: true, lim: 'nim', fmt: v => pct(v, 2) },
    cir: { label: 'Cost-to-income ratio', short: 'Cost / income', def: 'Operating expenses ÷ operating income. Lower is better.', owner: 'COO', hi: false, lim: 'cir', fmt: v => pct(v) },
    car: { label: 'Capital adequacy ratio', short: 'CAR', def: 'Total regulatory capital ÷ risk-weighted assets (Basel III). CBE minimum 12.5% including the conservation buffer.', owner: 'CRO', hi: true, lim: 'car', bank: true, fmt: v => pct(v) },
    cet1: { label: 'CET1 ratio', short: 'CET1', def: 'Common equity tier 1 capital ÷ risk-weighted assets.', owner: 'CRO', hi: true, lim: 'cet1', bank: true, fmt: v => pct(v) },
    lev: { label: 'Leverage ratio', short: 'Leverage', def: 'Tier 1 capital ÷ total exposure (on and off balance sheet). CBE minimum 3%.', owner: 'CRO', hi: true, lim: 'lev', bank: true, fmt: v => pct(v) },
    lcr: { label: 'Liquidity coverage ratio', short: 'LCR', def: 'High-quality liquid assets ÷ 30-day stressed net cash outflows. CBE minimum 100%.', owner: 'Treasurer · ALCO', hi: true, lim: 'lcr', bank: true, fmt: v => pct(v, 0) },
    nsfr: { label: 'Net stable funding ratio', short: 'NSFR', def: 'Available stable funding ÷ required stable funding. CBE minimum 100%.', owner: 'Treasurer · ALCO', hi: true, lim: 'nsfr', bank: true, fmt: v => pct(v, 0) },
    npl: { label: 'Non-performing loans', short: 'NPL ratio', def: 'Stage 3 loans ÷ gross loans. Internal risk-appetite limit 6%, target ≤ 3.5%.', owner: 'CRO', hi: false, lim: 'npl', fmt: v => pct(v, 2) },
    coverage: { label: 'NPL coverage', short: 'Coverage', def: 'Loan-loss provisions ÷ non-performing loans.', owner: 'CRO', hi: true, lim: 'coverage', fmt: v => pct(v, 0) },
    cor: { label: 'Cost of risk', short: 'Cost of risk', def: 'Annualised impairment charge ÷ average gross loans. Lower is better.', owner: 'CRO', hi: false, lim: 'cor', bank: true, fmt: v => pct(v, 2) },
    top10: { label: 'Top-10 borrowers', short: 'Top-10', def: 'Exposure to the 10 largest borrower groups ÷ gross loans.', owner: 'CRO', hi: false, lim: 'top10', bank: true, fmt: v => pct(v) },
    single: { label: 'Largest single obligor', short: 'Single obligor', def: 'Largest borrower-group exposure ÷ tier 1 capital. CBE large-exposure rules apply.', owner: 'CRO', hi: false, lim: 'single', bank: true, fmt: v => pct(v) },
    nop: { label: 'FX net open position', short: 'FX NOP', def: 'Net open foreign-currency position ÷ tier 1 capital. CBE limit 10% (sample).', owner: 'Treasurer · ALCO', hi: false, lim: 'nop', bank: true, fmt: v => pct(v) },
    dep: { label: 'Customer deposits', short: 'Deposits', def: 'Total customer deposits at end-of-day close; market share is against total Egyptian banking-sector deposits (sample figure).', owner: 'Head of Retail & Corporate', fmt: v => money(v), axis: moneyAx },
  };
  function kpiValue(key, c) { return { profit: c.profit, roe: c.roe, nim: c.nim, cir: c.cir, npl: c.npl, coverage: c.coverage, dep: c.dep }[key] ?? c.risk[key]; }
  function status(key, v, c) {
    if (key === 'profit') return c.vsBudget >= 0 ? 'ok' : c.vsBudget >= -0.05 ? 'warn' : 'crit';
    if (key === 'dep') return c.all ? (c.share >= B.LIMITS.share[1] ? 'ok' : c.share >= B.LIMITS.share[0] ? 'warn' : 'crit') : (c.yoy >= DEP_GROWTH[1] ? 'ok' : c.yoy >= DEP_GROWTH[0] ? 'warn' : 'crit');
    const K = KPIS[key], [hard, tgt] = B.LIMITS[K.lim];
    return K.hi ? (v >= tgt ? 'ok' : v >= hard ? 'warn' : 'crit') : (v <= tgt ? 'ok' : v <= hard ? 'warn' : 'crit');
  }
  const DEP_GROWTH = [0.08, 0.12]; // branch / region deposit-growth floor and target (market share is only meaningful bank-wide)
  const ST_LABEL = { ok: 'On track', warn: 'Watch', crit: 'Off track' };
  function monthEnds() { const out = [], e = S.asOf; for (let k = 11; k >= 0; k--) out.push(k === 0 ? e : new Date(e.getFullYear(), e.getMonth() - k + 1, 0)); return out; }
  function kpiSeries(key, ids) {
    return M('ks|' + key + ids.join(','), () => {
      const ends = monthEnds(), c = ceo(ids), labels = bankMonthly(ids, 'dep').labels;
      const wob = (i, amp) => 1 + amp * Math.sin(i / 1.6 + B.hash(key) % 5) * (11 - i) / 11;
      let values;
      if (key === 'profit') values = bankMonthly(ids, 'profit').values;
      else if (key === 'dep') values = bankMonthly(ids, 'dep').values;
      else if (key === 'roe') { const p = bankMonthly(ids, 'profit').values, d = bankMonthly(ids, 'dep').values; values = p.map((v, i) => v / (i === 11 ? S.asOf.getDate() : ends[i].getDate()) * 365 / (d[i] * 0.128)); }
      else if (['nim', 'cir', 'npl', 'coverage'].includes(key)) values = ends.map((_, i) => kpiValue(key, c) * wob(i, key === 'npl' ? 0.09 : 0.04));
      else values = ends.map(d => B.riskAt(d)[key]);
      let target = null, limit = null;
      if (key === 'profit') target = ends.map((e, i) => { const f = new Date(e.getFullYear(), e.getMonth(), 1); const ds = []; for (let t = +f; t <= +e; t += DAY) ds.push(new Date(t)); return ids.reduce((a, id) => a + ds.reduce((b, d) => b + B.balanceAt(id, 'dep', d) * B.BANK[id].margin / 365 * 0.94, 0), 0); });
      else if (KPIS[key].lim) { target = ends.map(() => B.LIMITS[KPIS[key].lim][1]); limit = ends.map(() => B.LIMITS[KPIS[key].lim][0]); }
      return { labels, values, target, limit };
    });
  }

  function scoreTile(key, c, opts = {}) {
    const K = KPIS[key];
    if (opts.locked) return `<div class="kpi score locked"><div class="kl">${K.short}</div><div class="kv">${icon('lock')} Restricted</div><div class="ks">${esc(opts.locked)}</div></div>`;
    const v = kpiValue(key, c), st = status(key, v, c), ser = kpiSeries(key, opts.ids);
    const sub = {
      profit: `${c.vsBudget >= 0 ? '▲' : '▼'} ${pct(Math.abs(c.vsBudget))} vs budget`,
      roe: `Target ≥ ${pct(B.LIMITS.roe[1], 0)}`, nim: `Target ≥ ${pct(B.LIMITS.nim[1], 2)}`, cir: `Target ≤ ${pct(B.LIMITS.cir[1], 0)}`,
      car: `CBE min 12.5% · CET1 ${pct(c.risk.cet1)}`, lcr: `CBE min 100% · NSFR ${pct(c.risk.nsfr, 0)}`, npl: `Coverage ${pct(c.coverage, 0)}`,
      dep: c.all ? `Share ${pct(c.share, 2)} · ${c.yoy >= 0 ? '▲' : '▼'}${pct(Math.abs(c.yoy))} YoY` : `${c.yoy >= 0 ? '▲' : '▼'}${pct(Math.abs(c.yoy))} YoY · target ≥ ${pct(DEP_GROWTH[1], 0)}`,
      cet1: `Min 7.0% · target 14%`, lev: `CBE min 3.0%`, nsfr: `CBE min 100%`, coverage: `Target ≥ 150%`, cor: `Target ≤ 1.25%`,
    }[key];
    const val = key === 'profit' || key === 'dep' ? money(v, key === 'profit' && v >= 1e9 && v < 1e10 ? 2 : 1) : K.fmt(v);
    return `<div class="kpi score s-${st}" data-kpi="${key}" data-tip="${esc(K.label + ' — ' + K.def)}">
      <div class="kl">${K.short}${opts.bankLevel ? '<span class="tag">Bank</span>' : ''}<span class="stc ${st}">${ST_LABEL[st]}</span></div>
      <div class="kv">${val}</div><div class="ks">${sub}</div><div class="sk">${CH.spark(ser.values, { w: 64, h: 20, color: st === 'crit' ? 'var(--crit)' : st === 'warn' ? 'var(--warn)' : 'var(--accent)' })}</div></div>`;
  }

  function insights() {
    const out = []; const bs = bankScope();
    if (!bs.denied && !bs.na) {
      const c = ceo(bs.ids);
      out.push(`Net profit ${B.RANGES[S.range].toLowerCase()} is <b>${money(c.profit, 2)}</b> — <b class="${c.vsBudget >= 0 ? 'c-ok' : 'c-crit'}">${pct(Math.abs(c.vsBudget))} ${c.vsBudget >= 0 ? 'ahead of' : 'behind'}</b> budget.`);
      out.push(`Deposits <b>${money(c.dep)}</b>, ${c.yoy >= 0 ? 'up' : 'down'} <b>${pct(Math.abs(c.yoy))}</b> YoY · market share <b>${pct(c.share, 2)}</b> vs ${pct(B.LIMITS.share[1], 2)} target.`);
      if (role().bank === 'all') {
        const regs = B.REGIONS.map(r => ({ r, c: ceo(B.SITES.filter(s => s.bank && s.region === r).map(s => s.id)) })).filter(x => x.c.dep);
        const best = regs.slice().sort((a, b2) => b2.c.yoy - a.c.yoy)[0];
        out.push(`Fastest-growing region: <b>${esc(best.r)}</b> at <b>${pct(best.c.yoy)}</b> deposit growth YoY.`);
        out.push(`Capital &amp; liquidity comfortable: CAR <b>${pct(c.risk.car)}</b> (min 12.5%), LCR <b>${pct(c.risk.lcr, 0)}</b> (min 100%).`);
      }
      if (isRegional()) {
        const brs = bs.ids.map(id => ({ s: B.SITE[id], c: ceo([id]) })).sort((x, y) => y.c.yoy - x.c.yoy);
        if (brs.length > 1) out.push(`Branch league · ${esc(role().bank.slice(2))}: <b class="c-ok">${esc(brs[0].s.short)}</b> leads deposit growth at <b>${pct(brs[0].c.yoy)}</b> YoY; <b>${esc(brs[brs.length - 1].s.short)}</b> trails at <b>${pct(brs[brs.length - 1].c.yoy)}</b>.`);
      }
      const br = B.SITES.filter(s => s.bank && canBank(s.id) && B.BANK[s.id].npl > B.NPL_LIMIT && inScope(s.id));
      if (br.length) out.push(`Credit risk: <b class="c-crit">${br.map(s => esc(s.short)).join(', ')}</b> NPL above the 6% limit — recovery plan due at the next Credit Committee.`);
      out.push(`Customers <b>${short(c.customers)}</b> · digital active <b>${pct(c.digital, 0)}</b> · NPS <b>${Math.round(c.nps)}</b>.`);
    }
    const dcAl = bmsAlarms().filter(a => a.sev === 'critical' && B.SITE[a.site].type === 'DC' && inScope(a.site));
    dcAl.forEach(a => out.push(`Resilience: <b class="c-crit">${esc(B.SITE[a.site].short)}</b> — ${esc(a.msg)}. Core-banking redundancy reduced.`));
    const inc = B.INCIDENTS.filter(i => i.status === 'active' && (i.sev === 'critical' || i.sev === 'high') && inScope(i.site) && canFootage(i.site));
    if (inc.length) out.push(`Security: <b class="c-crit">${inc.length}</b> high-severity incident${inc.length > 1 ? 's' : ''} open — ${esc(inc[0].type)} (${esc(B.SITE[inc[0].site].short)}).`);
    return out.length ? out : ['No issues need your attention in this scope.'];
  }

  // ---------------- Egypt network map ----------------
  const PX = (lon) => (lon - 24.6) * 89, PY = (lat) => (32.55 - lat) * 100;
  const pathOf = (pts, close) => pts.map((p, i) => (i ? 'L' : 'M') + PX(p[0]).toFixed(1) + ' ' + PY(p[1]).toFixed(1)).join('') + (close ? 'Z' : '');
  const MAP_LAB = { B07: 'Alexandria' };
  const MAP_SIDE = { DC2: 'tl', B07: 't', B10: 't', B11: 'l', B09: 'l', B08: 'l', B16: 'l' };
  const INSET = { DC1: [0, .1, 'r'], B05: [0, .9, 'r'], B04: [.3, .5, 'l'], B01: [.42, .22, 'r'], B02: [.66, 0, 'r'], B03: [.46, .82, 'r'], HQ: [1, .48, 'l'], B06: [.72, .8, 'r'] };
  function mapSvg(mode) {
    const val = (s) => ceo([s.id]);
    const color = (s) => {
      if (mode === 'alerts' || !s.bank || !canBank(s.id)) return { crit: 'var(--crit)', warn: 'var(--warn)', ok: 'var(--ok)' }[siteState(s.id)];
      const c = val(s);
      if (mode === 'npl') return c.npl > B.NPL_LIMIT ? 'var(--crit)' : c.npl > B.LIMITS.npl[1] ? 'var(--warn)' : 'var(--ok)';
      return c.yoy > 0.14 ? 'var(--accent)' : c.yoy > 0.09 ? 'var(--accent2)' : 'var(--accent3)';
    };
    const rad = (s, k = 1) => (mode === 'alerts' || !s.bank || !bankOK ? (s.type === 'BR' ? 12 : 16) : Math.min(34, 8 + Math.sqrt(val(s).dep / 1e9) * 4.2)) * k;
    const tip = (s) => { const al = siteAlerts(s.id); let t = `${s.name} · ${s.region} · ${al.length ? al.length + ' alert' + (al.length > 1 ? 's' : '') : 'no alerts'}`; if (s.bank && canBank(s.id)) { const c = val(s); t += ` · deposits ${money(c.dep)} · YoY ${pct(c.yoy)} · NPL ${pct(c.npl, 2)}`; } return esc(t + ' — click for detail'); };
    let i = 0;
    const pin = (s, x, y, r, lab, side) => {
      const L = side === 'l' ? [x - r - 7, y + 8, 'end'] : side === 'tl' ? [x + r, y - r - 9, 'end'] : side === 't' ? [x, y - r - 9, 'middle'] : side === 'b' ? [x, y + r + 25, 'middle'] : [x + r + 7, y + 8, 'start'];
      const col = color(s), st = siteState(s.id);
      const shp = s.type === 'DC' ? `<rect class="shp" x="${x - r * .82}" y="${y - r * .82}" width="${r * 1.64}" height="${r * 1.64}" rx="4" fill="${col}"/>` : s.type === 'HQ' ? `<path class="shp" d="M${x} ${y - r * 1.15}L${x + r * 1.15} ${y}L${x} ${y + r * 1.15}L${x - r * 1.15} ${y}Z" fill="${col}"/>` : `<circle class="shp" cx="${x}" cy="${y}" r="${r}" fill="${col}"/>`;
      return `<g class="pin${S.site === s.id ? ' sel' : ''}${inScope(s.id) ? '' : ' dim'}" data-site="${s.id}" data-tip="${tip(s)}" style="--i:${i++}">${st === 'crit' && mode === 'alerts' ? `<circle class="pulse" cx="${x}" cy="${y}" r="${r}" style="stroke:${col}"/>` : ''}<circle class="halo" cx="${x}" cy="${y}" r="${r + 9}"/>${shp}${lab ? `<text class="pl" x="${L[0]}" y="${L[1]}" text-anchor="${L[2]}">${esc(lab)}</text>` : ''}</g>`;
    };
    const cairo = B.SITES.filter(s => s.ix), rest = B.SITES.filter(s => !s.ix);
    const cx = PX(31.28), cy = PY(30.03);
    const cst = cairo.some(s => siteState(s.id) === 'crit') ? 'crit' : cairo.some(s => siteState(s.id) === 'warn') ? 'warn' : 'ok';
    const IX = 20, IY = 720, IW = 500, IH = 330;
    let s = `<svg class="egmap" viewBox="0 0 1121 1080" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
      <defs><linearGradient id="landg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--land1)"/><stop offset="1" stop-color="var(--land2)"/></linearGradient></defs>
      <text class="sea" x="${PX(27.6)}" y="${PY(32.12)}">MEDITERRANEAN SEA</text>
      <text class="sea" transform="translate(${PX(35.55)} ${PY(26.2)}) rotate(58)">RED SEA</text>
      <path class="land" d="${pathOf(B.EGYPT, true)}"/>
      <text class="area" x="${PX(33.55)}" y="${PY(29.45)}">SINAI</text><text class="area" x="${PX(27.2)}" y="${PY(27.4)}">WESTERN DESERT</text>
      <path class="lake" d="${pathOf(B.LAKE_NASSER)}"/>${B.NILE.map(n => `<path class="nile" pathLength="1" d="${pathOf(n)}"/>`).join('')}<path class="canal" d="${pathOf(B.CANAL)}"/>`;
    rest.forEach(x => { s += pin(x, PX(x.lon), PY(x.lat), rad(x), x.type === 'DC' ? 'DC-2' : MAP_LAB[x.id] || x.short, MAP_SIDE[x.id] || 'r'); });
    s += `<path class="lead" d="M${cx} ${cy} L${IX + IW * .6} ${IY}"/>
      <g class="pin cluster${cairo.some(x => inScope(x.id)) ? '' : ' dim'}" data-region="Greater Cairo" data-tip="Greater Cairo — ${cairo.length} sites · click to filter the dashboard to this region"><circle class="halo" cx="${cx}" cy="${cy}" r="30"/><circle class="shp" cx="${cx}" cy="${cy}" r="21" fill="var(--panel-flat)" stroke="${{ crit: 'var(--crit)', warn: 'var(--warn)', ok: 'var(--ok)' }[cst]}" stroke-width="5"/><text class="cn" x="${cx}" y="${cy + 8}" text-anchor="middle">${cairo.length}</text></g>
      <g class="inset"><rect x="${IX}" y="${IY}" width="${IW}" height="${IH}" rx="16"/><text class="it" x="${IX + 16}" y="${IY + 30}">GREATER CAIRO</text>
      <path class="nile" pathLength="1" d="M${IX + IW * .44} ${IY + IH} C ${IX + IW * .47} ${IY + IH * .6}, ${IX + IW * .41} ${IY + IH * .4}, ${IX + IW * .45} ${IY + 40}"/>`;
    cairo.forEach(x => { const q = INSET[x.id] || [x.ix, x.iy, 'r']; const px = IX + 34 + q[0] * (IW - 68), py = IY + 62 + q[1] * (IH - 92); s += pin(x, px, py, rad(x, .8), x.type === 'DC' ? 'DC-1' : x.type === 'HQ' ? 'Head Office' : x.short, q[2]); });
    return s + '</g></svg>';
  }
  function mapLegend(mode) {
    if (mode === 'alerts') return `<span><span class="dot crit"></span>Critical</span><span><span class="dot warn"></span>Major</span><span><span class="dot"></span>Normal</span><span class="faint">◆ Head office · ■ Data center · ● Branch</span>`;
    if (mode === 'npl') return `<span><span class="dot"></span>≤ 3.5%</span><span><span class="dot warn"></span>3.5–6%</span><span><span class="dot crit"></span>&gt; 6% limit</span><span class="faint">Size = deposits</span>`;
    return `<span><i style="background:var(--accent)"></i>&gt; 14% YoY</span><span><i style="background:var(--accent2)"></i>9–14%</span><span><i style="background:var(--accent3)"></i>&lt; 9%</span><span class="faint">Size = deposits</span>`;
  }

  // ---------------- Overview (shaped by role) ----------------
  function opsTiles(sites) {
    const bAl = bmsAlarms().filter(x => inScope(x.site)); const av = availability(sites); const en = energyTotal(sites, days()), enP = energyTotal(sites, prevDays(), true); const cs = camStats(sites.filter(x => canFootage(x.id)));
    const stale = Object.keys(B.STALE).filter(inScope).length; const nCr = bAl.filter(x => x.sev === 'critical').length;
    const fire = B.EQUIP.filter(e => e.sys === 'fire' && inScope(e.site));
    const t = [
      { k: 'Critical alarms', ic: 'bell', v: String(nCr), st: nCr ? 'crit' : 'ok', sub: `${bAl.length} BMS alarms in total`, go: 'bms' },
      { k: 'Critical equipment', ic: 'build', v: av.pct.toFixed(2) + '%', st: av.pct >= 99.5 ? 'ok' : av.pct >= 99 ? 'warn' : 'crit', sub: `${av.down} of ${av.n} units down now`, go: 'bms' },
      { k: 'Energy', ic: 'bolt', v: kwh(en) + ' kWh', st: en <= enP ? 'ok' : 'warn', sub: `${B.RANGES[S.range]} · ${delta(en, enP)} vs prior`, go: 'bms' },
      { k: 'BMS gateways', ic: 'shield', v: `${sites.length - stale}/${sites.length}`, st: stale ? 'warn' : 'ok', sub: stale ? 'stale data at ' + Object.keys(B.STALE).filter(inScope).map(x => B.SITE[x].short).join(', ') : 'all reporting', go: 'bms' },
    ];
    if (canCctv()) t.push(
      { k: 'Cameras online', ic: 'cam', v: `${cs.online}/${cs.total}`, st: cs.offline >= 3 ? 'crit' : cs.offline ? 'warn' : 'ok', sub: `${cs.offline} offline`, go: 'cctv' },
      { k: 'Security incidents', ic: 'shield', v: String(cs.inc.length), st: cs.inc.some(i => i.sev === 'critical' || i.sev === 'high') ? 'crit' : cs.inc.length ? 'warn' : 'ok', sub: `${cs.inc.filter(i => i.status === 'acknowledged').length} acknowledged`, go: 'cctv' },
      { k: 'Recording health', ic: 'rewind', v: cs.recPct.toFixed(1) + '%', st: cs.recPct >= 99 ? 'ok' : cs.recPct >= 97 ? 'warn' : 'crit', sub: `${cs.total - cs.recOk} cameras not recording`, go: 'cctv' });
    else t.push({ k: 'Fire alarm panels', ic: 'flame', v: `${fire.filter(e => e.status === 'ok').length}/${fire.length}`, st: fire.some(e => e.status === 'alarm') ? 'crit' : fire.some(e => e.status !== 'ok') ? 'warn' : 'ok', sub: fire.some(e => e.status !== 'ok') ? fire.filter(e => e.status !== 'ok').map(e => B.SITE[e.site].short + ' ' + (e.status === 'alarm' ? 'alarm' : 'fault')).join(', ') : 'all panels normal', go: 'bms' });
    return t;
  }
  const opsTile = (x) => `<div class="kpi score s-${x.st}" data-go="${x.go}"><div class="kl">${icon(x.ic)}${esc(x.k)}<span class="stc ${x.st}">${{ ok: 'Normal', warn: 'Watch', crit: 'Action' }[x.st]}</span></div><div class="kv">${x.v}</div><div class="ks">${x.sub}</div></div>`;

  function vOverview() {
    const sites = scopeSites(); const al = allAlerts().filter(a => inScope(a.site));
    const nCrit = al.filter(a => a.sev === 'critical').length, nMaj = al.length - nCrit, nSites = new Set(al.map(a => a.site)).size;
    const bs = bankScope(); const ok = !bs.denied && !bs.na; const c = ok ? ceo(bs.ids) : null; const all = role().bank === 'all';
    const ops = opsTiles(sites);
    // banking roles get the financial scorecard; everyone else gets the operations scorecard
    const keys = ok ? (all ? ['profit', 'roe', 'nim', 'cir', 'car', 'lcr', 'npl', 'dep'] : ['profit', 'roe', 'nim', 'cir', 'npl', 'dep']) : [];
    const tiles = ok ? keys.map(k => KPIS[k].bank ? scoreTile(k, ceo(bankIds()), { ids: bankIds(), bankLevel: !c.all }) : scoreTile(k, c, { ids: bs.ids })) : ops.map(opsTile);
    const strip = `<div class="strip n${tiles.length}" style="grid-template-columns:repeat(${tiles.length},minmax(0,1fr))">${tiles.join('')}</div>`;

    const ins = insights(); S.brief = { list: ins, i: 0 };
    const opsMini = ok ? `<div class="al-ops"><div class="al-oh">${icon('shield')}Operations<span class="sp"></span><span class="ro">${icon('lock')}Read-only</span></div><div class="opsg">${ops.filter(x => x.k !== 'BMS gateways').slice(0, 6).map(x => `<div class="op" data-go="${x.go}" data-tip="${esc(x.k + ' · ' + x.sub.replace(/<[^>]+>/g, ''))}"><span class="oi ${x.st === 'crit' ? 'c-crit' : ''}">${icon(x.ic)}</span><small>${esc(x.k.split(' · ')[0])}</small><b class="${x.st === 'crit' ? 'c-crit' : ''}">${x.v.replace(' kWh', '')}</b></div>`).join('')}</div></div>` : '';
    const alerts = `<section class="panel feat p-alerts">
      <div class="ph"><h3>${icon('bell')}Attention needed</h3><span class="sp"></span><span class="pill crit"><span class="dot crit live"></span>Live</span></div>
      <div class="brief"><div class="brief-h">${icon('eye')}Briefing<span class="sp"></span><span class="bdots">${ins.map((_, i) => `<i class="${i ? '' : 'on'}"></i>`).join('')}</span></div><div class="brief-t" id="brief">${ins[0]}</div></div>
      <div class="sevbar"><span><b class="c-crit">${nCrit}</b>Critical</span><span><b class="c-warn">${nMaj}</b>Major</span><span><b>${nSites}</b>Sites</span></div>
      <div class="pb scroll"><div class="list">${al.length ? al.map(a => `<div class="li click al" data-alert="${esc(a.key)}" title="Open ${esc(B.SITE[a.site].name)}"><span class="sev ${a.sev}"></span><div class="t"><b>${esc(a.title)}</b><span>${esc(B.SITE[a.site].short)} · ${esc(a.domain)} · ${ago(a.ago)}</span><span class="faint">${esc(alertMsg(a))}</span></div><span class="go">${icon('go')}</span></div>`).join('') : '<div class="muted">No active alerts in this scope.</div>'}</div></div>${opsMini}
    </section>`;

    const reg = ok && isRegional(); const mode = all || reg ? (S.mapMode || 'alerts') : 'alerts';
    const map = `<section class="panel p-map">
      <div class="ph"><h3>${icon('build')}Branch network · Egypt</h3><span class="sp"></span>
      ${all || reg ? `<div class="mini-seg">${[['alerts', 'Alerts'], ['growth', 'Growth'], ['npl', 'NPL']].map(([k, l]) => `<button data-mapmode="${k}" class="${mode === k ? 'on' : ''}">${l}</button>`).join('')}</div>` : '<span class="upd">Site status · live</span>'}</div>
      <div class="pb map-box">${mapSvg(mode)}</div>
      <div class="legend map-leg">${mapLegend(mode)}</div></section>`;

    let right = '', layout = 'ov-full';
    if (ok) {
      const ser = kpiSeries('profit', bs.ids);
      right += `<section class="panel feat2 p-profit">
      <div class="ph"><h3>${icon('bank')}Net profit vs budget</h3><span class="legend"><span><i style="background:var(--accent)"></i>Actual</span><span><i style="background:var(--warn)"></i>Budget</span></span><span class="sp"></span><span class="scope">${esc(bs.label)}</span><span class="upd">Monthly · 12 months</span></div>
      <div class="pb"><div class="pf"><div class="pf-c">${chart('ovProfit', el => CH.bars(el, { labels: ser.labels, values: ser.values, line: ser.target, lineName: 'Budget', hi: [11], fmt: v => money(v, 2), fmtAxis: moneyAx }))}</div>
        <div class="pf-s">
          <div class="mstat" data-kpi="profit"><small>Customers</small><b>${short(c.customers)}</b><span>+${short(c.newCust)} this month</span></div>
          <div class="mstat"><small>Digital active</small><b>${pct(c.digital, 0)}</b><div class="meter"><i style="width:${c.digital * 100}%"></i></div></div>
          <div class="mstat"><small>Net promoter score</small><b class="${c.nps >= 40 ? 'c-ok' : 'c-warn'}">${Math.round(c.nps)}</b><span>Target ≥ 40</span></div>
          <div class="mstat"><small>CASA ratio</small><b>${pct(c.casa)}</b><span>Cheap funding share</span></div>
        </div></div></div></section>`;
      if (all || reg) {
        // CEO / auditor compare regions; a regional manager compares the branches in their region
        const rows = all ? B.REGIONS.map(r => ({ n: r, c: ceo(B.SITES.filter(x => x.bank && x.region === r).map(x => x.id)), at: `data-region="${esc(r)}"`, sel: S.site === 'R:' + r }))
          : roleIds().map(id => ({ n: B.SITE[id].short, c: ceo([id]), at: `data-siteset="${id}"`, sel: S.site === id }));
        const maxD = Math.max(...rows.map(x => x.c.dep));
        const clear = all ? (S.site.startsWith('R:') ? '<button class="btn" data-region="">Clear</button>' : '<span class="upd">click to filter</span>') : (S.site !== role().bank ? `<button class="btn" data-siteset="${esc(role().bank)}">Whole region</button>` : '<span class="upd">click to filter</span>');
        right += `<section class="panel p-regions"><div class="ph"><h3>${icon('bank')}${all ? 'Regions' : 'Branches · ' + esc(role().bank.slice(2))}</h3><span class="sp"></span>${clear}</div><div class="pb scroll"><table class="tb reg"><thead><tr><th>${all ? 'Region' : 'Branch'}</th><th class="r">Deposits</th><th class="r">YoY</th><th class="r">NPL</th><th class="r">C / I</th></tr></thead><tbody>${rows.map(x => `<tr class="click ${x.sel ? 'sel' : ''}" ${x.at} data-tip="${esc(x.n)} · net profit ${money(x.c.profit, 2)} · ${short(x.c.customers)} customers — click to filter"><td><b>${esc(x.n)}</b><div class="meter thin"><i style="width:${x.c.dep / maxD * 100}%"></i></div></td><td class="r num">${money(x.c.dep)}</td><td class="r">${delta(x.c.dep, x.c.depYoY)}</td><td class="r num ${x.c.npl > B.NPL_LIMIT ? 'c-crit' : x.c.npl > B.LIMITS.npl[1] ? 'c-warn' : ''}">${pct(x.c.npl, 2)}</td><td class="r num ${x.c.cir > B.LIMITS.cir[1] ? 'c-warn' : ''}">${pct(x.c.cir, 0)}</td></tr>`).join('')}</tbody></table></div></section>`;
      } else layout = 'ov-branch';
    } else {
      layout = 'ov-ops';
      const es = energySeries(sites); const peak = es.values.reduce((m, v, i) => v != null && v > (es.values[m] || 0) ? i : m, 0);
      right += `<section class="panel feat2 p-energy"><div class="ph"><h3>${icon('bolt')}Energy · kWh</h3><span class="sp"></span><span class="upd">${esc(es.unit)}</span></div>
        <div class="pb">${chart('ovEnergy', el => CH.bars(el, { labels: es.labels, values: es.values, hi: [peak], labelHi: true, fmt: v => nf(v) + ' kWh', fmtAxis: short }))}</div></section>`;
      if (canCctv()) {
        const cs = camStats(sites.filter(x => canFootage(x.id)));
        right += `<section class="panel p-rec"><div class="ph"><h3>${icon('cam')}Cameras &amp; recording</h3><span class="sp"></span>${upd('cam')}</div>
        <div class="pb"><div class="drill-body">${CH.donut([{ label: 'Online · recording', value: cs.recOk, color: 'var(--accent)' }, { label: 'Online · recording issue', value: cs.recIssue, color: 'var(--warn)' }, { label: 'Offline', value: cs.offline, color: 'var(--crit)' }], { center: cs.recPct.toFixed(1) + '%', sub: 'recording', size: 112 })}
        <div class="dl list">${[['HQ', 'Head office'], ['DC', 'Data centers'], ['BR', 'Branches']].map(([t, l]) => { const ss = sites.filter(x => x.type === t && canFootage(x.id)); if (!ss.length) return ''; const k = camStats(ss); return `<div><div style="display:flex;justify-content:space-between;font-size:11.5px"><span>${l}</span><span class="num muted">${k.online}/${k.total} · ${k.recPct.toFixed(1)}%</span></div><div class="meter ${k.recPct < 99 ? 'warn' : ''}"><i style="width:${k.recPct}%"></i></div></div>`; }).join('')}</div></div></div></section>`;
      } else {
        const sys = Object.keys(B.SYS); const cnt = sys.map(k => bmsAlarms().filter(x => x.sys === k && inScope(x.site)).length);
        right += `<section class="panel p-rec"><div class="ph"><h3>${icon('build')}BMS alarms by system</h3><span class="sp"></span>${upd('bms')}</div>
        <div class="pb">${chart('ovSys', el => CH.bars(el, { labels: sys.map(k => B.SYS[k].split(' ')[0]), values: cnt, crit: cnt.map((v, i) => bmsAlarms().some(x => x.sys === sys[i] && x.sev === 'critical' && inScope(x.site)) ? i : -1), fmt: v => v + ' alarms', fmtAxis: v => Math.round(v), labelAll: true }))}</div></section>`;
      }
    }
    return `<div class="grid ov ${layout}">${strip}${alerts}${map}${right}</div>`;
  }

  // ---------------- Risk & Capital ----------------
  const REG_SHORT = { 'Greater Cairo': 'Cairo', 'Alexandria & North Coast': 'Alex & N. Coast', 'Delta': 'Delta', 'Canal & Red Sea': 'Canal & Red Sea', 'Upper Egypt': 'Upper Egypt' };
  function bullet(key, v, max) {
    const K = KPIS[key], [hard, tgt] = B.LIMITS[K.lim]; const st = status(key, v, {}); const P = (x) => Math.max(0, Math.min(100, x / max * 100));
    return `<div class="bul" data-kpi="${key}" data-tip="${esc(K.label)} · ${K.fmt(v)} · ${K.hi ? 'minimum' : 'limit'} ${K.fmt(hard)} · target ${K.fmt(tgt)}">
      <div class="bul-h"><span>${K.label}</span><b class="c-${st}">${K.fmt(v)}</b></div>
      <div class="bul-t"><i class="bul-v ${st}" style="width:${P(v)}%"></i><i class="bul-m" style="left:${P(hard)}%"></i><i class="bul-g" style="left:${P(tgt)}%"></i></div>
      <div class="bul-f"><span>${K.hi ? 'Min' : 'Limit'} ${K.fmt(hard)}</span><span>Target ${K.fmt(tgt)}</span></div></div>`;
  }
  function vRisk() {
    const r = role();
    if (r.bank !== 'all') return vOverview();
    const ids = bankIds(); const c = ceo(ids), k = c.risk;
    const strip = `<div class="strip">${['car', 'cet1', 'lev', 'lcr', 'nsfr', 'npl', 'coverage', 'cor'].map(x => scoreTile(x, c, { ids })).join('')}</div>`;
    const cap = `<section class="panel p-cap"><div class="ph"><h3>${icon('shield')}Capital &amp; liquidity</h3><span class="sp"></span><span class="upd">Basel III · CBE minimums</span></div>
      <div class="pb scroll"><div class="buls">${bullet('car', k.car, 0.3)}${bullet('cet1', k.cet1, 0.25)}${bullet('lev', k.lev, 0.12)}${bullet('lcr', k.lcr, 3)}${bullet('nsfr', k.nsfr, 2.2)}</div></div></section>`;
    const ns = kpiSeries('npl', ids);
    const npl = `<section class="panel feat2 p-npl"><div class="ph"><h3>${icon('bank')}NPL ratio trend</h3><span class="legend"><span><i style="background:var(--accent)"></i>NPL</span><span><i style="background:var(--crit)"></i>Limit 6%</span><span><i style="background:var(--ok)"></i>Target 3.5%</span></span><span class="sp"></span><span class="upd">Coverage ${pct(c.coverage, 0)}</span></div>
      <div class="pb">${chart('rkNpl', el => CH.lines(el, { labels: ns.labels, series: [{ name: 'NPL ratio', values: ns.values, color: 'var(--accent)' }, { name: 'Risk limit', values: ns.limit, color: 'var(--crit)', dash: true }, { name: 'Target', values: ns.target, color: 'var(--ok)', dash: true }], fmt: v => pct(v, 2), fmtAxis: v => pct(v, 1) }))}</div></section>`;
    const regs = B.REGIONS.map(rg => ({ rg, c: ceo(B.SITES.filter(s => s.bank && s.region === rg).map(s => s.id)) }));
    const brs = B.SITES.filter(s => s.bank).map(s => ({ s, c: ceo([s.id]) })).sort((a, b2) => b2.c.npl - a.c.npl).slice(0, 6);
    const nplReg = `<section class="panel p-nplreg"><div class="ph"><h3>${icon('bell')}NPL by region</h3><span class="sp"></span><span class="upd">Amber above 3.5% target · red above 6% limit</span></div>
      <div class="pb" style="flex:1.1">${chart('rkReg', el => CH.bars(el, { labels: regs.map(x => REG_SHORT[x.rg]), values: regs.map(x => x.c.npl), crit: regs.map((x, i) => x.c.npl > B.NPL_LIMIT ? i : -1), warn: regs.map((x, i) => x.c.npl > B.LIMITS.npl[1] ? i : -1), fmt: v => pct(v, 2), fmtAxis: v => pct(v, 1), labelAll: true }))}</div>
      <div class="list nplb">${brs.slice(0, 3).map(x => `<div class="li click" data-site="${x.s.id}"><span class="sev ${x.c.npl > B.NPL_LIMIT ? 'critical' : x.c.npl > B.LIMITS.npl[1] ? 'major' : ''}"></span><div class="t"><b>${esc(x.s.short)}</b><span>${esc(x.s.region)} · coverage ${pct(x.c.coverage, 0)}</span></div><b class="num ${x.c.npl > B.NPL_LIMIT ? 'c-crit' : ''}">${pct(x.c.npl, 2)}</b></div>`).join('')}</div></section>`;
    const s3 = c.npl, s2 = k.stage2, s1 = 1 - s2 - s3;
    const stage = `<section class="panel p-stage"><div class="ph"><h3>${icon('eye')}Loan book by IFRS 9 stage</h3><span class="sp"></span><span class="upd">${money(c.loans)} gross</span></div>
      <div class="pb"><div class="drill-body">${CH.donut([{ label: 'Stage 1 · performing', value: s1, color: 'var(--accent)' }, { label: 'Stage 2 · watch', value: s2, color: 'var(--warn)' }, { label: 'Stage 3 · NPL', value: s3, color: 'var(--crit)' }], { center: pct(s1, 1), sub: 'stage 1', size: 118, fmt: v => pct(v, 1) })}
      <div class="dl">${[['Stage 1 · performing', s1, 'var(--accent)'], ['Stage 2 · significant increase in risk', s2, 'var(--warn)'], ['Stage 3 · non-performing', s3, 'var(--crit)']].map(([l, v, col]) => `<div class="ctl-row"><span><i class="sw" style="background:${col}"></i>${l}</span><span class="num">${money(c.loans * v)} <span class="muted">${pct(v, 1)}</span></span></div>`).join('')}
      <div class="ctl-row"><span class="muted">Cost of risk (annualised)</span><b>${pct(k.cor, 2)}</b></div><div class="ctl-row"><span class="muted">Provisions held</span><b>${money(c.nplAmt * c.coverage)}</b></div></div></div></div></section>`;
    const conc = `<section class="panel p-conc"><div class="ph"><h3>${icon('build')}Concentration</h3><span class="sp"></span><span class="upd">Share of gross loans</span></div>
      <div class="pb scroll"><div class="buls">${bullet('top10', k.top10, 0.4)}${bullet('single', k.single, 0.3)}</div>
      <div class="sectors">${B.SECTORS.map(([l, v]) => `<div class="sec-r" data-tip="${esc(l)} · ${pct(v, 0)} of loans · ${money(c.loans * v)}"><span>${esc(l)}</span><div class="meter"><i style="width:${v / 0.3 * 100}%"></i></div><b class="num">${pct(v, 0)}</b></div>`).join('')}</div></div></section>`;
    const mkt = `<section class="panel feat2 p-mkt"><div class="ph"><h3>${icon('bolt')}Market &amp; FX risk</h3><span class="sp"></span><span class="upd">ALCO pack · sample</span></div>
      <div class="pb scroll"><div class="buls">${bullet('nop', k.nop, 0.2)}</div>
      ${[['NII sensitivity · +100 bp', '+' + money(c.dep * 0.00164)], ['NII sensitivity · −100 bp', '−' + money(c.dep * 0.00171)], ['12-month repricing gap', '+' + money(c.dep * 0.034)], ['CAR impact · EGP −10% vs USD', '−0.42 pp'], ['FX deposits share', pct(0.183, 1)], ['Treasury bills & bonds / assets', pct(0.36, 1)]].map(([l, v]) => `<div class="ctl-row"><span class="muted">${l}</span><b class="num">${v}</b></div>`).join('')}</div></section>`;
    return `<div class="grid risk">${strip}${cap}${npl}${nplReg}${stage}${conc}${mkt}</div>`;
  }

  // ---------------- KPI detail drawer ----------------
  function openKpi(key) {
    const K = KPIS[key]; if (!K) return;
    const bs = bankScope(); if (bs.denied || bs.na) return;
    if (K.bank && role().bank !== 'all') return;
    const ids = K.bank ? bankIds() : bs.ids; const c = ceo(ids), v = kpiValue(key, c), st = status(key, v, c), ser = kpiSeries(key, ids);
    const fmt = K.fmt;
    let regs = '';
    if (!K.bank && role().bank === 'all') {
      const rows = B.REGIONS.map(r => { const cc = ceo(B.SITES.filter(s => s.bank && s.region === r).map(s => s.id)); return { r, v: kpiValue(key, cc), st: status(key, kpiValue(key, cc), cc) }; });
      const mx = Math.max(...rows.map(x => x.v));
      regs = `<div class="sec"><h4>${icon('bank')}By region</h4>${rows.map(x => `<div class="sec-r click" data-region="${esc(x.r)}"><span>${esc(x.r)}</span><div class="meter ${x.st === 'crit' ? 'crit' : x.st === 'warn' ? 'warn' : ''}"><i style="width:${x.v / mx * 100}%"></i></div><b class="num">${key === 'profit' || key === 'dep' ? money(x.v) : fmt(x.v)}</b></div>`).join('')}</div>`;
    }
    const tgt = key === 'profit' ? `Budget ${money(c.budget, 2)} · ${c.vsBudget >= 0 ? '+' : '−'}${pct(Math.abs(c.vsBudget))}` : key === 'dep' ? (c.all ? `Market share ${pct(c.share, 2)} · target ${pct(B.LIMITS.share[1], 2)}` : `Growth ${pct(c.yoy)} YoY · target ≥ ${pct(DEP_GROWTH[1], 0)}`) : `${K.hi ? 'Minimum' : 'Limit'} ${fmt(B.LIMITS[K.lim][0])} · target ${fmt(B.LIMITS[K.lim][1])}`;
    openDrawer(`<div class="dr-h"><div><h2>${K.label}</h2><p>${K.bank ? 'Bank-level' : esc(bs.label)} · ${key === 'profit' ? B.RANGES[S.range] : 'as of ' + dLabel(S.asOf)}</p></div><button class="x" data-close>${icon('x')}</button></div>
      <div class="sec kbig s-${st}"><div><small>Current</small><b class="cu">${key === 'profit' || key === 'dep' ? money(v, 2) : fmt(v)}</b></div><span class="stc ${st}">${ST_LABEL[st]}</span><div class="muted" style="font-size:12px;width:100%">${tgt}</div></div>
      <div class="sec"><h4>${icon('bolt')}12-month trend</h4><div style="position:relative;height:170px"><div class="chart" id="kpiTrend"></div></div></div>
      ${regs}
      <div class="sec"><h4>${icon('eye')}Definition</h4><div class="muted" style="font-size:12px">${esc(K.def)}</div><div class="ctl-row" style="margin-top:6px"><span class="muted">Accountable owner</span><b>${esc(K.owner)}</b></div><div class="ctl-row"><span class="muted">Source</span><span>${K.bank ? 'Regulatory return / ALCO pack' : 'Core banking EOD'} · sample data</span></div></div>`);
    requestAnimationFrame(() => {
      const el = $('#kpiTrend'); if (!el) return;
      const series = [{ name: K.short, values: ser.values, color: 'var(--accent)' }];
      if (ser.target) series.push({ name: key === 'profit' ? 'Budget' : 'Target', values: ser.target, color: key === 'profit' ? 'var(--warn)' : 'var(--ok)', dash: true });
      if (ser.limit) series.push({ name: K.hi ? 'Minimum' : 'Limit', values: ser.limit, color: 'var(--crit)', dash: true });
      CH.lines(el, { labels: ser.labels, series, fmt: key === 'profit' || key === 'dep' ? (x => money(x, 2)) : fmt, fmtAxis: K.axis || (x => key === 'lcr' || key === 'nsfr' || key === 'coverage' ? pct(x, 0) : pct(x, 1)), zero: key === 'profit' });
    });
  }

  // ---------------- motion helpers ----------------
  const reduced = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function countUp(root) {
    if (reduced()) return;
    // a second run (two renders in one frame) first puts back the real numbers of the run it replaces
    if (countUp.cur) countUp.cur.forEach(it => { it.tn.nodeValue = it.orig; });
    const items = $$('.kv, .cu, .mstat b, .op b, .sevbar b', root).map(el => {
      const tn = [...el.childNodes].find(n => n.nodeType === 3 && /\d/.test(n.nodeValue)); if (!tn) return null;
      const m = tn.nodeValue.match(/[\d,]*\.?\d+/); if (!m) return null;
      const raw = m[0], dec = (raw.split('.')[1] || '').length, val = parseFloat(raw.replace(/,/g, ''));
      return { tn, pre: tn.nodeValue.slice(0, m.index), post: tn.nodeValue.slice(m.index + raw.length), val, dec, comma: raw.includes(','), orig: tn.nodeValue };
    }).filter(Boolean);
    const t0 = performance.now(); countUp.cur = items;
    (function step(now) {
      if (countUp.cur !== items) return;
      const k = Math.min(1, (now - t0) / 1000), e = 1 - Math.pow(1 - k, 3);
      items.forEach(it => { if (k >= 1) { it.tn.nodeValue = it.orig; return; } const v = it.val * e; it.tn.nodeValue = it.pre + (it.comma ? v.toLocaleString('en-US', { minimumFractionDigits: it.dec, maximumFractionDigits: it.dec }) : v.toFixed(it.dec)) + it.post; });
      if (k < 1) requestAnimationFrame(step); else countUp.cur = null;
    })(t0);
  }
  function playIn() {
    const m = $('#main'); if (reduced()) return;
    $$('#main .panel, #main .strip > .kpi').forEach((p, i) => p.style.setProperty('--i', i));
    m.classList.remove('anim'); void m.offsetWidth; m.classList.add('anim'); countUp(m);
    clearTimeout(playIn.t); playIn.t = setTimeout(() => m.classList.remove('anim'), 2200);
  }
  function moveInd() {
    const nav = $('#tabs'), on = nav.querySelector('button.on'); if (!on) return;
    let ind = nav.querySelector('.ind'); if (!ind) { ind = document.createElement('span'); ind.className = 'ind'; nav.prepend(ind); }
    const to = { l: on.offsetLeft, w: on.offsetWidth };
    if (S._ind && !reduced()) { ind.style.left = S._ind.l + 'px'; ind.style.width = S._ind.w + 'px'; void ind.offsetWidth; }
    ind.style.left = to.l + 'px'; ind.style.width = to.w + 'px'; S._ind = to;
  }

  // ---------------- Building Management ----------------
  const stPill = (st) => `<span class="pill ${st}">${{ ok: 'Normal', warn: 'Warning', alarm: 'Alarm', offline: 'Offline' }[st]}</span>`;
  const sevOrder = { alarm: 0, warn: 1, offline: 2, ok: 3 };
  const eqList = (sys) => B.EQUIP.filter(e => (Array.isArray(sys) ? sys.includes(e.sys) : e.sys === sys) && inScope(e.site)).sort((a, b) => sevOrder[a.status] - sevOrder[b.status] || (b.critical - a.critical));
  const eqName = (e) => `${!single() ? B.SITE[e.site].short + ' · ' : ''}${e.code}`;
  const meter = (v, cls = '') => `<div class="meter ${cls}" style="width:70px"><i style="width:${Math.max(0, Math.min(100, v))}%"></i></div>`;

  function vBms() {
    const sites = scopeSites(); const al = bmsAlarms().filter(a => inScope(a.site));
    const av = availability(sites), en = energyTotal(sites, days()), enPrev = energyTotal(sites, prevDays(), true);
    const demand = sites.reduce((a, s) => a + (B.STALE[s.id] ? s.kw * 0.9 : s.kw) * (s.type === 'DC' ? 1 : (0.55 + 0.45 * B.TX_HOUR[new Date().getHours()] / 1.75)), 0);
    const stale = Object.keys(B.STALE).filter(inScope).length;
    const strip = `<div class="strip">
      <div class="kpi"><div class="kl">${icon('bell')}Critical alarms</div><div class="kv c-crit">${al.filter(a => a.sev === 'critical').length}</div><div class="ks">${al.length} active alarms in total</div></div>
      <div class="kpi"><div class="kl">Critical equipment availability</div><div class="kv">${av.pct.toFixed(2)}<small>%</small></div><div class="ks">${av.down} of ${av.n} critical units down · ${B.RANGES[S.range]}</div></div>
      <div class="kpi"><div class="kl">${icon('bolt')}Energy consumption</div><div class="kv">${kwh(en)}<small>kWh</small></div><div class="ks">${delta(en, enPrev)} vs prior ${B.RANGES[S.range].toLowerCase()}</div></div>
      <div class="kpi"><div class="kl">Current demand</div><div class="kv">${nf(demand)}<small>kW</small></div><div class="ks">Sum of main incomers, live</div></div>
      <div class="kpi"><div class="kl">${icon('flame')}Fire alarm panels</div><div class="kv">${eqList('fire').filter(e => e.status === 'ok').length}<small>/ ${eqList('fire').length} normal</small></div><div class="ks">${eqList('fire').filter(e => e.status !== 'ok').length} in trouble / alarm</div></div>
      <div class="kpi"><div class="kl">BMS gateways</div><div class="kv">${sites.length - stale}<small>/ ${sites.length} online</small></div><div class="ks ${stale ? 'c-warn' : ''}">${stale ? Object.keys(B.STALE).filter(inScope).map(k => B.SITE[k].short).join(', ') + ' stale ' + Math.round(Object.values(B.STALE)[0] / 60) + ' min' : 'All reporting'}</div></div>
    </div>`;

    const hv = eqList('hvac'); const ch = hv.filter(e => e.kind === 'Chiller' && e.status !== 'alarm');
    const hvac = `<section class="panel p-hvac"><div class="ph"><h3>${icon('snow')}HVAC</h3><span class="sp"></span><span class="ro">${icon('lock')}Read-only</span>${upd('bms')}</div>
      <div class="sumrow"><div><small>Units running</small><b>${hv.filter(e => e.status === 'ok' || e.status === 'warn').length}/${hv.length}</b></div><div><small>Avg chiller supply</small><b>${ch.length ? (ch.reduce((a, e) => a + e.supply, 0) / ch.length).toFixed(1) + ' °C' : '—'}</b></div><div><small>Alarms / warnings</small><b class="${hv.some(e => e.status === 'alarm') ? 'c-crit' : ''}">${hv.filter(e => e.status === 'alarm').length} / ${hv.filter(e => e.status === 'warn').length}</b></div></div>
      <div class="pb scroll"><table class="tb"><thead><tr><th>Unit</th><th>Type</th><th class="r">Supply / SP</th><th>Load</th><th>Status</th></tr></thead><tbody>${hv.map(e => `<tr class="click" data-eq="${e.id}"><td><b>${esc(eqName(e))}</b></td><td class="muted">${esc(e.kind)}</td><td class="r num ${e.status === 'warn' || e.status === 'alarm' ? 'c-warn' : ''}">${e.supply.toFixed(1)} / ${e.setpoint.toFixed(1)} °C</td><td>${meter(e.load)}</td><td>${stPill(e.status)}</td></tr>`).join('')}</tbody></table></div></section>`;

    const elList = eqList('elec');
    const es = S.range === 'today' ? null : null; // demand profile always shows the selected day
    const prof = Array(24).fill(0); const up = isLive() ? Math.floor(nowHour()) : 23;
    sites.forEach(s => B.energyHourly(s.id, S.asOf, up).forEach((v, i) => { prof[i] = v == null ? null : (prof[i] || 0) + v; }));
    const pf = elList.reduce((a, e) => a + e.pf, 0) / (elList.length || 1);
    const elec = `<section class="panel p-elec"><div class="ph"><h3>${icon('bolt')}Electrical power</h3><span class="sp"></span><span class="ro">${icon('lock')}Read-only</span>${upd('bms')}</div>
      <div class="sumrow"><div><small>Peak today</small><b>${nf(Math.max(...prof.filter(v => v != null)))} kW</b></div><div><small>Avg power factor</small><b>${pf.toFixed(2)}</b></div><div><small>Incomers / boards</small><b>${elList.length}</b></div></div>
      <div class="pb">${chart('bmsDemand', el => CH.lines(el, { labels: prof.map((_, i) => pad(i) + ':00'), series: [{ name: 'Demand (kW)', values: prof, color: 'var(--accent)' }], fmt: v => nf(v) + ' kW', fmtAxis: short }))}</div>
      <div class="faint" style="font-size:10.5px;margin-top:4px">Site demand profile, ${dLabel(S.asOf)} · hourly average kW</div></section>`;

    const ups = eqList('ups'), gen = eqList('gen');
    const upsP = `<section class="panel p-ups"><div class="ph"><h3>${icon('batt')}UPS &amp; generators</h3><span class="sp"></span><span class="ro">${icon('lock')}Read-only</span>${upd('bms')}</div>
      <div class="sumrow"><div><small>UPS normal</small><b>${ups.filter(e => e.status === 'ok').length}/${ups.length}</b></div><div><small>Generators ready</small><b class="${gen.some(e => e.status === 'alarm') ? 'c-crit' : ''}">${gen.filter(e => e.status !== 'alarm').length}/${gen.length}</b></div><div><small>Min autonomy</small><b>${Math.min(...ups.map(e => e.auton))} min</b></div></div>
      <div class="pb scroll"><table class="tb"><thead><tr><th>Unit</th><th class="r">Load</th><th>Battery / fuel</th><th class="r">Detail</th><th>Status</th></tr></thead><tbody>
      ${ups.map(e => `<tr class="click" data-eq="${e.id}"><td><b>${esc(eqName(e))}</b></td><td class="r num">${e.load.toFixed(0)}%</td><td>${meter(e.batt)}</td><td class="r num ${e.btemp > 35 ? 'c-crit' : 'muted'}">${e.auton} min · ${e.btemp.toFixed(1)} °C</td><td>${stPill(e.status)}</td></tr>`).join('')}
      ${gen.map(e => `<tr class="click" data-eq="${e.id}"><td><b>${esc(eqName(e))}</b></td><td class="r muted">—</td><td>${meter(e.fuel, e.fuel < 50 ? 'warn' : '')}</td><td class="r muted">${e.fuel.toFixed(0)}% fuel · test ${e.lastTest} d ago</td><td>${stPill(e.status)}</td></tr>`).join('')}
      </tbody></table></div></section>`;

    const fire = eqList('fire'); const zones = fire.reduce((a, e) => a + e.zones, 0);
    const fireP = `<section class="panel p-fire"><div class="ph"><h3>${icon('flame')}Fire alarm</h3><span class="sp"></span><span class="ro">${icon('lock')}Read-only</span></div>
      <div class="fire-big"><div><b class="c-ok">${fire.filter(e => e.status === 'ok').length}</b><small>Normal</small></div><div><b class="c-warn">${fire.reduce((a, e) => a + e.trouble, 0)}</b><small>Trouble</small></div><div><b class="${fire.some(e => e.alarm) ? 'c-crit' : ''}">${fire.reduce((a, e) => a + e.alarm, 0)}</b><small>Fire alarm</small></div><div><b>${fire.reduce((a, e) => a + e.disabled, 0)}</b><small>Disabled zones</small></div></div>
      <div class="pb scroll"><div class="list">${fire.map(e => `<div class="li click" data-eq="${e.id}"><span class="sev ${e.status === 'ok' ? '' : e.status}"></span><div class="t"><b>${esc(B.SITE[e.site].short)} · ${e.code}</b><span>${e.zones} zones${e.note ? ' · ' + esc(e.note) : ''}</span></div>${stPill(e.status)}</div>`).join('')}</div></div>
      <div class="faint" style="font-size:10.5px;margin-top:4px">${zones} detection zones monitored</div></section>`;

    const wat = eqList('water'); const tanks = wat.filter(e => e.level != null), leaks = wat.filter(e => e.leak != null);
    const waterP = `<section class="panel p-water"><div class="ph"><h3>${icon('drop')}Water systems</h3><span class="sp"></span><span class="ro">${icon('lock')}Read-only</span></div>
      <div class="sumrow"><div><small>Avg tank level</small><b>${tanks.length ? (tanks.reduce((a, e) => a + e.level, 0) / tanks.length).toFixed(0) + '%' : '—'}</b></div><div><small>Leaks active</small><b class="${leaks.some(e => e.leak) ? 'c-crit' : 'c-ok'}">${leaks.filter(e => e.leak).length}/${leaks.length}</b></div></div>
      <div class="pb scroll"><div class="list">${wat.map(e => `<div class="li click" data-eq="${e.id}"><span class="sev ${e.status === 'ok' ? '' : e.status}"></span><div class="t"><b>${esc(eqName(e))} <span class="muted" style="display:inline;font-weight:400">${esc(e.kind)}</span></b><span>${e.level != null ? e.level.toFixed(0) + '% level' : e.leak != null ? (e.leak ? 'WATER DETECTED' : 'Dry') : (e.run ? 'Running' : 'Standby') + ' · ' + e.pressure.toFixed(1) + ' bar'}</span></div>${e.level != null ? meter(e.level, e.level < 25 ? 'crit' : '') : stPill(e.status)}</div>`).join('')}</div></div></section>`;

    const alarmsP = `<section class="panel feat2 p-alarms"><div class="ph"><h3>${icon('bell')}Active BMS alarms</h3><span class="sp"></span><span class="pill crit">${al.filter(a => a.sev === 'critical').length} critical</span><span class="ro">${icon('lock')}Acknowledge at site BMS</span></div>
      <div class="pb scroll"><table class="tb"><thead><tr><th>Severity</th><th>Site</th><th>System</th><th>Equipment</th><th>Message</th><th class="r">Since</th></tr></thead><tbody>${al.map(a => `<tr class="click" ${a.eq ? `data-eq="${a.eq}"` : `data-site="${a.site}"`}><td><span class="pill ${a.sev}">${a.sev}</span></td><td>${esc(B.SITE[a.site].short)}</td><td class="muted">${a.sys === 'gateway' ? 'Gateway' : B.SYS[a.sys]}</td><td><b>${esc(a.title)}</b></td><td class="muted" style="white-space:normal">${esc(a.msg)}</td><td class="r num muted">${ago(a.ago)}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">No active alarms.</td></tr>'}</tbody></table></div></section>`;
    void es;
    return `<div class="grid bms">${strip}${hvac}${elec}${upsP}${fireP}${waterP}${alarmsP}</div>`;
  }

  // ---------------- Banking ----------------
  const METRICS = { dep: ['Deposits', money, moneyAx], loans: ['Gross loans', money, moneyAx], profit: ['Net profit', money, moneyAx], tx: ['Transactions', v => nf(v), short] };
  function vBanking() {
    const bs = bankScope();
    if (bs.denied || bs.na) {
      const mine = role().bank !== 'all' && role().bank !== 'none' ? role().bank : null;
      return `<div class="grid bank"><section class="panel empty" style="grid-column:1/-1;grid-row:1/-1"><div class="emp">${icon('bank')}<b>No banking figures for ${esc(scopeName())}</b><span>${bs.na ? 'Data centers do not book banking business.' : 'Your view covers ' + esc(mine ? roleScope() : 'other sites') + '.'}</span>${mine ? `<button class="btn pri" data-siteset="${esc(mine)}">Show ${esc(roleScope())}</button>` : '<button class="btn pri" data-siteset="ALL">Show whole bank</button>'}</div></section></div>`;
    }
    const a = bankAgg(bs.ids), p = bankAgg(bs.ids, prevDays()); const rl = B.RANGES[S.range];
    const strip = `<div class="strip">
      <div class="kpi" data-kpi="dep"><div class="kl">Total deposits</div><div class="kv">${money(a.dep)}</div><div class="ks">${delta(a.dep, a.depYoY)} YoY</div></div>
      <div class="kpi"><div class="kl">Gross loans</div><div class="kv">${money(a.loans)}</div><div class="ks">${bs.ids.length} booking site${bs.ids.length > 1 ? 's' : ''}</div></div>
      <div class="kpi" data-kpi="profit"><div class="kl">Net profit · ${rl}</div><div class="kv">${money(a.profit, 2)}</div><div class="ks">${delta(a.profit, p.profit)} vs prior period</div></div>
      <div class="kpi" data-kpi="npl"><div class="kl">NPL ratio</div><div class="kv ${a.npl > B.NPL_LIMIT ? 'c-crit' : ''}">${pct(a.npl, 2)}</div><div class="ks">Limit ${pct(B.NPL_LIMIT)}</div></div>
      <div class="kpi" data-kpi="cir"><div class="kl">Cost / income</div><div class="kv">${pct(ceo(bs.ids).cir)}</div><div class="ks">Target ≤ ${pct(B.LIMITS.cir[1], 0)} · LDR ${pct(a.ldr)}</div></div>
      <div class="kpi"><div class="kl">CASA ratio</div><div class="kv">${pct(a.casa)}</div><div class="ks">Current + savings ÷ deposits</div></div>
      <div class="kpi"><div class="kl">Transactions · ${rl}</div><div class="kv">${short(a.tx)}</div><div class="ks">${delta(a.tx, p.tx)} vs prior period</div></div>
    </div>`;

    const met = S.bank.metric; const mm = METRICS[met];
    const trIds = S.bank.sel && bs.ids.includes(S.bank.sel) ? [S.bank.sel] : bs.ids;
    const ser = bankMonthly(trIds, met);
    const series = [{ name: mm[0] + (trIds.length === 1 ? ' · ' + B.SITE[trIds[0]].short : ''), values: ser.values, color: 'var(--accent)' }];
    if (trIds.length === 1 && bs.ids.length > 1 && B.SITE[trIds[0]].type === 'BR') { const brs = bs.ids.filter(i => B.SITE[i].type === 'BR'); const all = bankMonthly(brs, met); series.push({ name: 'Average branch', values: all.values.map(v => v / brs.length), color: 'var(--accent2)', dash: true }); }
    const trend = `<section class="panel p-btrend"><div class="ph"><h3>${icon('bank')}Branch trend · ${esc(trIds.length === 1 ? B.SITE[trIds[0]].name : bs.label)}</h3>${bs.scoped ? `<span class="scope">Scoped to your view</span>` : ''}<span class="sp"></span>
      <div class="mini-seg">${Object.entries(METRICS).map(([k, v]) => `<button data-metric="${k}" class="${met === k ? 'on' : ''}">${v[0]}</button>`).join('')}</div>${S.bank.sel ? '<button class="btn" data-clearsel>Show all</button>' : ''}</div>
      <div class="pb">${chart('bkTrend', el => CH.lines(el, { labels: ser.labels, series, fmt: mm[1], fmtAxis: mm[2], zero: met === 'profit' || met === 'tx', noArea: false }))}</div>
      <div class="legend" style="margin-top:4px">${series.map(s => `<span><i style="background:${s.color}"></i>${esc(s.name)}</span>`).join('')}<span class="faint">12 months to ${dLabel(S.asOf)} · ${met === 'dep' || met === 'loans' ? 'month-end balance' : 'monthly total'}</span></div></section>`;

    // drill-down
    const dIds = trIds; const d = bankAgg(dIds); const dr = S.bank.drill;
    const COLS = ['var(--accent)', 'var(--accent2)', 'var(--accent3)', '#0ea5e9', '#94a3b8'];
    let items, center, sub, rows;
    if (dr === 'dep') { items = B.DEP_PRODUCTS.map((l, i) => ({ label: l, value: d.depMix[i], color: COLS[i] })); center = money(d.dep); sub = 'deposits'; rows = items.map(it => `<div class="ctl-row"><span><i style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${it.color};margin-right:6px"></i>${it.label}</span><span class="num">${money(it.value)} <span class="muted">${pct(it.value / d.dep)}</span></span></div>`).join('') + `<div class="ctl-row"><span class="muted">CASA ratio</span><b>${pct(d.casa)}</b></div>`; }
    else if (dr === 'loans') { items = B.LOAN_SEGMENTS.map((l, i) => ({ label: l, value: d.loanMix[i], color: COLS[i] })); center = money(d.loans); sub = 'gross loans'; rows = items.map((it, i) => `<div class="ctl-row"><span><i style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${it.color};margin-right:6px"></i>${it.label}</span><span class="num">${money(it.value)} <span class="${d.nplSeg[i] / it.value > B.NPL_LIMIT ? 'c-crit' : 'muted'}">NPL ${pct(d.nplSeg[i] / (it.value || 1))}</span></span></div>`).join('') + `<div class="ctl-row"><span class="muted">Stage 3 (non-performing)</span><b>${money(d.nplAmt)}</b></div>`; }
    else { items = B.CHANNELS.map((l, i) => ({ label: l, value: d.tx5[i], color: COLS[i] })).filter(x => x.value > 0); center = short(d.tx); sub = 'transactions'; rows = items.map(it => `<div class="ctl-row"><span><i style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${it.color};margin-right:6px"></i>${it.label}</span><span class="num">${nf(it.value)} <span class="muted">${pct(it.value / d.tx)}</span></span></div>`).join('') + `<div class="ctl-row"><span class="muted">Failed / declined</span><b>${pct(0.011 + B.r1('fail' + dIds.join()) * 0.008, 2)}</b></div>`; }
    const drill = `<section class="panel feat2 p-drill"><div class="ph"><h3>${icon('eye')}Drill-down</h3><span class="scope">${esc(dIds.length === 1 ? B.SITE[dIds[0]].short : bs.label)}</span><span class="sp"></span>
      <div class="mini-seg">${[['dep', 'Deposits'], ['loans', 'Loans'], ['tx', 'Transactions']].map(([k, l]) => `<button data-drill="${k}" class="${dr === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>
      <div class="pb"><div class="drill-body">${CH.donut(items, { center, sub, size: 124, fmt: dr === 'tx' ? nf : money })}<div class="dl scroll" style="max-height:100%">${rows}</div></div></div>
      <div class="faint" style="font-size:10.5px">${dr === 'tx' ? B.RANGES[S.range] + ' · core banking intraday feed' : 'Balances at EOD close ' + dLabel(new Date(+S.asOf - DAY))} · select a branch row to drill in</div></section>`;

    // branch table
    const allBank = B.SITES.filter(s => s.bank && inScope(s.id) && canBank(s.id));
    const tbl = `<section class="panel p-branches"><div class="ph"><h3>${icon('bank')}Branch performance</h3><span class="muted" style="font-size:11px">Click a row to drill into deposits, loans and transactions</span><span class="sp"></span>${upd('bank')}</div>
      <div class="pb scroll"><table class="tb"><thead><tr><th>Site</th><th>Region</th><th class="r">Deposits</th><th class="r">YoY</th><th>12-mo trend</th><th class="r">Gross loans</th><th class="r">NPL</th><th class="r">Net profit · ${rl}</th><th class="r">vs budget</th><th class="r">C / I</th><th class="r">Customers</th><th class="r">NPS</th><th class="r">Digital</th></tr></thead><tbody>
      ${allBank.map(s => {
        const x = ceo([s.id]); const sp = bankMonthly([s.id], 'dep').values;
        return `<tr class="click ${S.bank.sel === s.id ? 'sel' : ''}" data-bsel="${s.id}"><td><b>${esc(s.name)}</b></td><td class="muted">${s.region}</td><td class="r num">${money(x.dep)}</td><td class="r">${delta(x.dep, x.depYoY)}</td><td>${CH.spark(sp, { w: 70, h: 18 })}</td><td class="r num">${money(x.loans)}</td><td class="r num ${x.npl > B.NPL_LIMIT ? 'c-crit' : x.npl > B.LIMITS.npl[1] ? 'c-warn' : ''}">${pct(x.npl, 2)}${x.npl > B.NPL_LIMIT ? ' ▲' : ''}</td><td class="r num">${money(x.profit, 2)}</td><td class="r num ${x.vsBudget >= 0 ? 'c-ok' : 'c-crit'}">${x.vsBudget >= 0 ? '+' : '−'}${pct(Math.abs(x.vsBudget))}</td><td class="r num ${x.cir > B.LIMITS.cir[0] ? 'c-crit' : x.cir > B.LIMITS.cir[1] ? 'c-warn' : ''}">${pct(x.cir, 0)}</td><td class="r num">${short(x.customers)}</td><td class="r num ${x.nps < 30 ? 'c-warn' : ''}">${Math.round(x.nps)}</td><td class="r num">${pct(x.digital, 0)}</td></tr>`;
      }).join('')}</tbody></table></div></section>`;
    return `<div class="grid bank">${strip}${trend}${drill}${tbl}</div>`;
  }

  // ---------------- CCTV ----------------
  function camFiltered() {
    const q = S.cam.q.trim().toLowerCase();
    return B.CAMS.filter(c => inScope(c.site) && canFootage(c.site)).filter(c => S.cam.st === 'all' || (S.cam.st === 'online' ? c.status === 'online' : S.cam.st === 'offline' ? c.status === 'offline' : c.rec !== 'ok'))
      .filter(c => !q || [c.id, c.zone, B.SITE[c.site].name, c.nvr, c.type].some(f => f.toLowerCase().includes(q)))
      .sort((a, b) => (a.status === 'offline') === (b.status === 'offline') ? 0 : a.status === 'offline' ? -1 : 1);
  }
  function vCctv() {
    const sites = scopeSites(); const cs = camStats(sites);
    const nvrs = sites.reduce((a, s) => a + s.nvr, 0);
    const strip = `<div class="strip">
      <div class="kpi" data-camst="online"><div class="kl">${icon('cam')}Cameras online</div><div class="kv">${cs.online}<small>/ ${cs.total}</small></div><div class="ks">${(cs.online / cs.total * 100).toFixed(1)}% available</div></div>
      <div class="kpi" data-camst="offline"><div class="kl">Offline cameras</div><div class="kv ${cs.offline ? 'c-crit' : ''}">${cs.offline}</div><div class="ks">Filter grid to offline</div></div>
      <div class="kpi"><div class="kl">${icon('shield')}Active incidents</div><div class="kv ${cs.inc.length ? 'c-crit' : ''}">${cs.inc.length}</div><div class="ks">${cs.inc.filter(i => i.status === 'acknowledged').length} acknowledged</div></div>
      <div class="kpi" data-camst="rec"><div class="kl">Recording health</div><div class="kv">${cs.recPct.toFixed(1)}<small>%</small></div><div class="ks">${cs.recIssue} online with recording issue</div></div>
      <div class="kpi"><div class="kl">Retention ≥ 90 days</div><div class="kv ${cs.retPct < 100 ? 'c-warn' : ''}">${cs.retPct.toFixed(0)}<small>%</small></div><div class="ks">${cs.retPct < 100 ? [...new Set(cs.cams.filter(c => c.retention < 90).map(c => B.SITE[c.site].short))].join(', ') + ' NVR at ' + Math.min(...cs.cams.map(c => c.retention)) + ' days' : 'All sites compliant'}</div></div>
      <div class="kpi"><div class="kl">Your footage access</div><div class="kv" style="font-size:15px">${role().live === 'none' ? '<span class="c-off">No live</span>' : 'Live ✓'} · ${role().playback === 'none' ? '<span class="c-off">No playback</span>' : 'Playback ✓'}</div><div class="ks">${esc(role().label)}${role().live !== 'all' && role().live !== 'none' ? ' · ' + (isRegional() ? role().live.slice(2) + ' branches' : B.SITE[role().live].short) + ' only' : ''}</div></div>
    </div>`;
    const grid = `<section class="panel p-grid"><div class="ph"><h3>${icon('cam')}Camera grid</h3><span class="muted" style="font-size:11px">Placeholder images — no real footage</span><span class="sp"></span><span class="ro">${icon('lock')}PTZ &amp; config read-only</span>${upd('cam')}</div>
      <div class="camtools"><label class="search">${icon('search')}<input id="camq" type="search" placeholder="Search camera, zone, site or NVR…" value="${esc(S.cam.q)}" autocomplete="off"></label>
      <div class="mini-seg">${[['all', 'All'], ['online', 'Online'], ['offline', 'Offline'], ['rec', 'Recording issue']].map(([k, l]) => `<button data-camst="${k}" class="${S.cam.st === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      <div class="pager" id="pager"></div></div>
      <div class="pb"><div class="camgrid" id="camgrid"></div></div></section>`;
    const offs = cs.cams.filter(c => c.status === 'offline' || c.rec !== 'ok' || c.retention < 90);
    const retSites = [...new Set(cs.cams.filter(c => c.retention < 90).map(c => c.site))];
    const offP = `<section class="panel feat p-off"><div class="ph"><h3>${icon('bell')}Offline camera alerts</h3><span class="sp"></span><span class="pill crit">${cs.offline} offline</span></div>
      <div class="pb scroll"><div class="list">${cs.cams.filter(c => c.status === 'offline').map(c => `<div class="li click" data-cam="${c.id}"><span class="sev critical"></span><div class="t"><b>${c.id} · ${esc(c.zone)}</b><span>${esc(B.SITE[c.site].short)} · ${esc(c.note)}</span></div><span class="r">offline<br>${ago(c.since)}</span></div>`).join('')}
      ${cs.cams.filter(c => c.status === 'online' && c.rec !== 'ok').map(c => `<div class="li click" data-cam="${c.id}"><span class="sev major"></span><div class="t"><b>${c.id} · ${esc(c.zone)}</b><span>${esc(B.SITE[c.site].short)} · ${esc(c.note)}</span></div><span class="r">${c.rec === 'gap' ? 'rec gap' : 'rec error'}</span></div>`).join('')}
      ${retSites.map(s => `<div class="li"><span class="sev minor"></span><div class="t"><b>${esc(B.SITE[s].short)} · retention below target</b><span>74 of 90 days stored on NVR-1</span></div></div>`).join('')}
      ${!offs.length ? '<div class="muted">All cameras online and recording.</div>' : ''}</div></div></section>`;
    const incs = B.INCIDENTS.filter(i => inScope(i.site));
    const incP = `<section class="panel p-inc"><div class="ph"><h3>${icon('shield')}Security incidents</h3><span class="sp"></span><span class="upd">Live · last 24 h</span></div>
      <div class="pb scroll"><div class="list">${incs.map(i => `<div class="li click" data-cam="${i.cam}" title="Open ${i.cam}"><span class="sev ${i.sev}"></span><div class="t"><b>${esc(i.type)}</b><span>${i.id} · ${esc(B.SITE[i.site].short)} · ${i.cam} · ${ago(i.ago)}</span></div><span class="pill ${i.status}">${i.status}</span></div>`).join('') || '<div class="muted">No incidents in the last 24 h.</div>'}</div></div></section>`;
    return `<div class="grid cctv">${strip}${grid}${offP}${incP}</div>`;
  }
  const CAM_HUES = [[205, 30], [190, 25], [220, 22], [180, 18], [210, 35], [30, 15]];
  function camTile(c) {
    const h = CAM_HUES[B.hash(c.id) % CAM_HUES.length]; const lv = canLive(c.site);
    const style = `--c1:hsl(${h[0]} ${h[1]}% 22%);--c2:hsl(${h[0]} ${h[1]}% 11%);--c3:hsl(${h[0]} ${h[1] - 5}% 17%)`;
    return `<div class="cam ${c.status}" data-cam="${c.id}" title="${esc(c.id + ' · ' + c.zone + ' · ' + B.SITE[c.site].name)}">
      <div class="ph-img ${lv ? '' : 'blur'}" style="${style}"></div>
      ${c.status === 'offline' ? `<div class="bad">VIDEO LOSS<br><span style="font-weight:500;font-size:10px">${ago(c.since)}</span></div>` : lv ? '<div class="phl">CAMERA PLACEHOLDER</div>' : `<div class="phl" style="color:#b8c8de">${icon('rewind')}&nbsp;PLAYBACK</div>`}
      <div class="ov1"><span>${c.id}</span>${c.status === 'online' ? (c.rec === 'ok' ? '<span class="rec">REC</span>' : '<span style="color:#fbbf24">REC ⚠</span>') : ''}</div>
      <div class="ov2"><b>${esc(c.zone)}</b><span class="ts"></span></div></div>`;
  }
  function layoutCams() {
    const box = $('#camgrid'); if (!box) return;
    const list = camFiltered(); const w = box.clientWidth; const h = box.parentElement.clientHeight;
    const cols = Math.max(2, Math.round(w / 210)); const tw = (w - (cols - 1) * 8) / cols, th = Math.round(tw * 0.58);
    const fit = getComputedStyle(document.body).overflow === 'hidden';
    const rows = fit ? Math.max(1, Math.floor((h + 8) / (th + 8))) : 3;
    const per = cols * rows; S.cam.per = per; const pages = Math.max(1, Math.ceil(list.length / per));
    S.cam.page = Math.min(S.cam.page, pages - 1);
    box.style.gridTemplateColumns = `repeat(${cols}, minmax(0,1fr))`; box.style.gridAutoRows = th + 'px'; box.style.height = fit ? '100%' : 'auto';
    box.innerHTML = list.slice(S.cam.page * per, S.cam.page * per + per).map(camTile).join('') || '<div class="muted">No cameras match the search.</div>';
    $('#pager').innerHTML = `<span>${list.length ? S.cam.page * per + 1 : 0}–${Math.min(list.length, (S.cam.page + 1) * per)} of ${list.length}</span><button class="btn" data-page="-1" ${S.cam.page === 0 ? 'disabled' : ''}>‹</button><button class="btn" data-page="1" ${S.cam.page >= pages - 1 ? 'disabled' : ''}>›</button>`;
    tickStamps();
  }
  function tickStamps() { const s = stamp(new Date()); $$('.cam .ts').forEach(e => { e.textContent = s; }); }

  // ======================================================================
  // Drawer: site / equipment / alert drill-down
  // ======================================================================
  function openDrawer(html) { $('#drawerIn').innerHTML = html; $('#drawer').classList.add('on'); $('#drawer').setAttribute('aria-hidden', 'false'); $('#scrim').classList.add('on'); }
  function closeAll() { $('#drawer').classList.remove('on'); $('#drawer').setAttribute('aria-hidden', 'true'); $('#scrim').classList.remove('on'); closeViewer(); }

  function openSite(id, focusKey) {
    const s = B.SITE[id]; const al = siteAlerts(id); const av = availability([s]); const cs = camStats([s]); const bAl = bmsAlarms().filter(a => a.site === id);
    const en = energyTotal([s], days());
    const focus = focusKey ? al.find(a => a.key === focusKey) : null;
    let bankSec;
    if (!s.bank) bankSec = '<span class="muted">Data center — no banking activity booked at this site.</span>';
    else if (!canBank(id)) bankSec = '';
    else { const x = bankAgg([id]); bankSec = `<div class="kv2"><div><small>Deposits</small><b>${money(x.dep)}</b></div><div><small>Gross loans</small><b>${money(x.loans)}</b></div><div><small>NPL ratio</small><b class="${x.npl > B.NPL_LIMIT ? 'c-crit' : ''}">${pct(x.npl, 2)}</b></div><div><small>Net profit · ${B.RANGES[S.range]}</small><b>${money(x.profit, 2)}</b></div><div><small>Transactions</small><b>${nf(x.tx)}</b></div><div><small>CASA</small><b>${pct(x.casa)}</b></div></div>`; }
    openDrawer(`<div class="dr-h"><div><h2><span class="dot ${siteState(id)}"></span> ${esc(s.name)}</h2><p>${B.TYPE_LABEL[s.type]} · ${s.region} region · site code ${s.id}</p></div><button class="x" data-close>${icon('x')}</button></div>
      ${focus ? `<div class="sec" style="border:1px solid rgba(239,68,68,.45)"><h4><span class="pill ${focus.sev}">${focus.sev}</span> ${esc(focus.title)}</h4><div class="muted" style="font-size:12px">${esc(focus.sysLabel)} · ${ago(focus.ago)}<br>${esc(alertMsg(focus))}</div><div class="acts" style="margin-top:8px">${tabOk(focus.tab) ? `<button class="btn pri" data-goto="${focus.tab}" data-site-go="${id}">Open in ${TABS.find(t => t.id === focus.tab).label} ${icon('go')}</button>` : ''}${focus.eq ? `<button class="btn" data-eq="${focus.eq}">Equipment detail</button>` : ''}${focus.kind === 'inc' && canFootage(id) ? `<button class="btn" data-cam="${B.INCIDENTS.find(i => i.id === focus.inc).cam}">${icon('cam')}View camera</button>` : ''}${focus.kind === 'camoff' ? `<button class="btn" data-goto="cctv" data-site-go="${id}" data-camst-go="offline">Show offline cameras</button>` : ''}</div></div>` : ''}
      <div class="sec"><h4>${icon('bell')}Alerts at this site (${al.length})</h4><div class="list">${al.map(a => `<div class="li click" data-alert="${esc(a.key)}"><span class="sev ${a.sev}"></span><div class="t"><b>${esc(a.title)}</b><span>${esc(a.sysLabel)} · ${ago(a.ago)} · ${esc(alertMsg(a))}</span></div></div>`).join('') || '<span class="muted">No active alerts.</span>'}</div></div>
      <div class="sec"><h4>${icon('build')}Building management <span class="ro" style="margin-left:auto">${icon('lock')}Read-only</span></h4><div class="kv2"><div><small>BMS alarms</small><b class="${bAl.some(a => a.sev === 'critical') ? 'c-crit' : ''}">${bAl.length}</b></div><div><small>Critical availability</small><b>${av.pct.toFixed(2)}%</b></div><div><small>Energy · ${B.RANGES[S.range]}</small><b>${kwh(en)} kWh</b></div></div>${B.STALE[id] ? `<div class="banner" style="margin-top:8px">${icon('lock')}BMS gateway offline — values shown are ${Math.round(B.STALE[id] / 60)} min old.</div>` : ''}</div>
      ${bankSec ? `<div class="sec"><h4>${icon('bank')}Banking</h4>${bankSec}</div>` : ''}
      ${canCctv() ? `<div class="sec"><h4>${icon('cam')}CCTV &amp; security</h4><div class="kv2"><div><small>Cameras online</small><b>${cs.online}/${cs.total}</b></div><div><small>Recording health</small><b>${cs.recPct.toFixed(1)}%</b></div><div><small>Active incidents</small><b class="${cs.inc.length ? 'c-crit' : ''}">${cs.inc.length}</b></div></div></div>` : ''}
      <div class="acts">${myTabs().filter(t => t.id !== 'overview' && t.id !== 'risk').map(t => `<button class="btn" data-goto="${t.id}" data-site-go="${id}">${icon(t.ic)}${t.label}</button>`).join('')}</div>`);
  }
  function openEquip(id) {
    const e = B.EQUIP.find(x => x.id === id); if (!e) return; const s = B.SITE[e.site];
    const fields = [['Status', stPill(e.status)], ['Critical equipment', e.critical ? 'Yes' : 'No'], ['System', B.SYS[e.sys]]];
    if (e.supply != null) fields.push(['Supply temperature', e.supply.toFixed(1) + ' °C'], ['Load', e.load.toFixed(0) + '%']);
    if (e.kw != null) fields.push(['Power', nf(e.kw) + ' kW'], ['Loading', e.load.toFixed(0) + '%'], ['Power factor', e.pf.toFixed(2)]);
    if (e.batt != null) fields.push(['Battery charge', e.batt + '%'], ['Output load', e.load.toFixed(0) + '%'], ['Autonomy', e.auton + ' min'], ['Battery temperature', `<span class="${e.btemp > 35 ? 'c-crit' : ''}">${e.btemp.toFixed(1)} °C</span>`]);
    if (e.fuel != null) fields.push(['Fuel level', e.fuel.toFixed(0) + '%'], ['Mode', e.mode], ['Last test run', e.lastTest + ' days ago']);
    if (e.zones != null) fields.push(['Detection zones', e.zones], ['Zones in trouble', e.trouble], ['Zones in alarm', e.alarm], ['Disabled zones', e.disabled]);
    if (e.level != null) fields.push(['Level', e.level.toFixed(0) + '%']);
    if (e.leak != null) fields.push(['Leak', e.leak ? '<span class="c-crit">Water detected</span>' : 'Dry']);
    if (e.pressure != null) fields.push(['Discharge pressure', e.pressure.toFixed(1) + ' bar'], ['Running', e.run ? 'Yes' : 'Standby']);
    const ctl = e.setpoint != null ? [['Setpoint', `<input class="fld" style="width:80px;height:26px" value="${e.setpoint.toFixed(1)} °C" disabled>`], ['Start / stop', '<button class="btn" disabled>Start</button> <button class="btn" disabled>Stop</button>']] : [['Command', '<button class="btn" disabled>Start</button> <button class="btn" disabled>Stop</button>']];
    ctl.push(['Alarm', '<button class="btn" disabled>Acknowledge</button> <button class="btn" disabled>Reset</button>']);
    const metric = e.supply != null ? ['Supply °C', e.supply, 0.5] : e.kw != null ? ['kW', e.kw, e.kw * 0.12] : e.batt != null ? ['Battery °C', e.btemp, 1.5] : e.level != null ? ['Level %', e.level, 3] : null;
    openDrawer(`<div class="dr-h"><div><h2>${esc(e.code)} · ${esc(e.kind)}</h2><p>${esc(s.name)} · ${B.SYS[e.sys]}</p></div><button class="x" data-close>${icon('x')}</button></div>
      ${e.note ? `<div class="sec" style="border:1px solid ${e.status === 'alarm' ? 'rgba(239,68,68,.45)' : 'var(--line)'}"><h4>${stPill(e.status)} ${esc(e.note)}</h4></div>` : ''}
      <div class="sec"><h4>${icon('eye')}Live values ${B.STALE[e.site] ? '<span class="pill warn">stale</span>' : '<span class="pill ok">live</span>'}</h4>${fields.map(([k, v]) => `<div class="ctl-row"><span class="muted">${k}</span><span class="num">${v}</span></div>`).join('')}</div>
      ${metric ? `<div class="sec"><h4>${icon('bolt')}Last 24 hours · ${metric[0]}</h4><div style="position:relative;height:120px">${'<div class="chart" id="eqTrend"></div>'}</div></div>` : ''}
      <div class="sec"><h4>${icon('lock')}Controls</h4><div class="banner">${icon('lock')}Read-only view. The Command Center does not send commands to building systems — use the site BMS workstation under the permit-to-work procedure.</div>${ctl.map(([k, v]) => `<div class="ctl-row"><span class="muted">${k}</span><span>${v}</span></div>`).join('')}</div>
      <div class="acts"><button class="btn" data-site="${e.site}">${icon('build')}Open site summary</button></div>`);
    if (metric) {
      const r = B.rng('tr' + e.id); const vals = Array.from({ length: 24 }, (_, i) => metric[1] + (r() - 0.5) * metric[2] * 2 + (e.status === 'alarm' && i > 21 ? metric[2] * 3 : 0));
      if (e.id === 'HQ-CH-2') for (let i = 0; i < 23; i++) vals[i] = 6.6 + (r() - 0.5) * 0.4;
      requestAnimationFrame(() => { const el = $('#eqTrend'); if (el) CH.lines(el, { labels: vals.map((_, i) => pad((new Date().getHours() + i + 1) % 24) + ':00'), series: [{ name: metric[0], values: vals, color: 'var(--accent)' }], fmt: v => v.toFixed(1), fmtAxis: v => v.toFixed(metric[1] > 100 ? 0 : 1) }); });
    }
  }

  // ======================================================================
  // Camera viewer: live view + playback (placeholders, role-gated, logged)
  // ======================================================================
  const V = { cam: null, mode: 'live', playing: false, speed: 1, t: 0, raf: 0, last: 0 };
  function logAccess(cam, mode, ok) { S.log.unshift({ at: new Date(), role: role().label, cam: cam.id, mode, ok }); S.log = S.log.slice(0, 30); }
  function openViewer(camId) {
    const c = B.CAMS.find(x => x.id === camId); if (!c || !canFootage(c.site)) return;
    V.cam = c; V.mode = canLive(c.site) ? 'live' : canPlay(c.site) ? 'playback' : 'live'; V.playing = V.mode === 'playback'; V.speed = 1;
    const day = B.startOfDay(S.asOf); V.t = isLive() ? Date.now() - 15 * 60000 : +day + 12 * 3600000;
    const inc = B.INCIDENTS.find(i => i.cam === c.id); if (inc) V.t = Date.now() - inc.ago * 1000 - 30000;
    logAccess(c, V.mode, V.mode === 'live' ? canLive(c.site) : canPlay(c.site));
    drawViewerShell(); $('#modal').classList.add('on'); $('#modal').setAttribute('aria-hidden', 'false');
    cancelAnimationFrame(V.raf); V.last = performance.now(); V.raf = requestAnimationFrame(frame);
  }
  function closeViewer() { $('#modal').classList.remove('on'); $('#modal').setAttribute('aria-hidden', 'true'); cancelAnimationFrame(V.raf); V.cam = null; }
  function allowed() { return V.mode === 'live' ? canLive(V.cam.site) : canPlay(V.cam.site); }
  function dayStart() { return +B.startOfDay(isLive() ? new Date(V.t) : S.asOf); }
  function drawViewerShell() {
    const c = V.cam, s = B.SITE[c.site]; const ok = allowed();
    const inc = B.INCIDENTS.filter(i => i.cam === c.id);
    const rule = V.mode === 'live' ? role().live : role().playback, what = V.mode === 'live' ? 'live-view' : 'playback';
    const why = rule === 'none' ? `The ${role().label} role has no ${what} permission.` : rule !== 'all' ? `${V.mode === 'live' ? 'Live view' : 'Playback'} is limited to ${String(rule).startsWith('R:') ? 'branches in ' + rule.slice(2) : B.SITE[rule].name}.` : '';
    $('#modalIn').innerHTML = `<div>
      <div class="ph" style="margin-bottom:10px"><h3>${icon('cam')}${c.id} · ${esc(c.zone)}</h3><span class="muted">${esc(s.name)}</span><span class="sp"></span>
        <div class="mini-seg">${canLive(c.site) ? `<button data-vmode="live" class="${V.mode === 'live' ? 'on' : ''}">${icon('eye')} Live view</button>` : ''}${canPlay(c.site) ? `<button data-vmode="playback" class="${V.mode === 'playback' ? 'on' : ''}">${icon('rewind')} Playback</button>` : ''}</div>
        <button class="x" data-close>${icon('x')}</button></div>
      <div class="viewer"><canvas id="vcan" width="960" height="540"></canvas>
        <div class="vo"><span id="vts"></span><span>${V.mode === 'live' ? '<span style="color:#ff5a5a">● LIVE</span>' : '<span style="color:#7dd3fc">▶ PLAYBACK</span>'} · SAMPLE PLACEHOLDER</span></div>
        ${c.status === 'offline' && V.mode === 'live' ? `<div class="vlock"><div><b style="color:#ff8a8a">VIDEO LOSS</b><br>${esc(c.note)} · ${ago(c.since)}</div></div>` : ''}
        ${!ok ? `<div class="vlock"><div>${icon('lock')}<br><b>Footage restricted</b><br><span style="font-size:12px">${esc(why)}</span><br><span style="font-size:11px;opacity:.7">This attempt was recorded in the access log.</span></div></div>` : ''}
      </div>
      ${V.mode === 'playback' ? `<div class="tl" id="tl" title="Click to jump">${tlMarkup()}</div>
      <div class="vctl"><button class="btn" data-vplay ${ok ? '' : 'disabled'}>${icon(V.playing ? 'pause' : 'play')}${V.playing ? 'Pause' : 'Play'}</button>
        <button class="btn" data-vjump="-30" ${ok ? '' : 'disabled'}>−30 s</button><button class="btn" data-vjump="30" ${ok ? '' : 'disabled'}>+30 s</button>
        <div class="mini-seg">${[1, 4, 16].map(x => `<button data-vspeed="${x}" class="${V.speed === x ? 'on' : ''}" ${ok ? '' : 'disabled'}>${x}×</button>`).join('')}</div>
        <label class="fld" style="height:30px"><span>Jump to</span><input type="time" id="vtime" step="1" ${ok ? '' : 'disabled'}></label>
        <button class="btn" disabled title="Export needs a separate evidence request">Export clip</button></div>` : `<div class="vctl"><span class="muted" style="font-size:12px">Live stream · ${c.res} · ${c.type} · ${c.nvr}</span><span class="sp"></span><button class="btn" disabled title="Snapshots are disabled in the demo">Snapshot</button></div>`}
    </div>
    <div class="vside">
      <div class="sec"><h4>${icon('cam')}Camera</h4>${[['Status', c.status === 'online' ? '<span class="pill ok">Online</span>' : '<span class="pill crit">Offline</span>'], ['Recording', c.rec === 'ok' ? '<span class="pill ok">OK</span>' : `<span class="pill warn">${c.rec}</span>`], ['Type / resolution', c.type + ' · ' + c.res], ['Recorder', c.nvr], ['Retention', c.retention + ' days']].map(([k, v]) => `<div class="ctl-row"><span class="muted">${k}</span><span>${v}</span></div>`).join('')}${c.note ? `<div class="muted" style="font-size:11px;margin-top:6px">${esc(c.note)}</div>` : ''}</div>
      <div class="sec"><h4>${icon('shield')}Your access</h4><div class="ctl-row"><span class="muted">Live view</span><span>${canLive(c.site) ? '<span class="pill ok">Allowed</span>' : '<span class="pill off">Denied</span>'}</span></div><div class="ctl-row"><span class="muted">Playback</span><span>${canPlay(c.site) ? '<span class="pill ok">Allowed</span>' : '<span class="pill off">Denied</span>'}</span></div><div class="faint" style="font-size:10.5px;margin-top:4px">${esc(role().label)}</div></div>
      <div class="sec"><h4>${icon('lock')}PTZ (read-only)</h4><div class="ptz"><span></span><button disabled>▲</button><span></span><button disabled>◀</button><button disabled>⌂</button><button disabled>▶</button><span></span><button disabled>▼</button><span></span></div></div>
      ${inc.length ? `<div class="sec"><h4>${icon('bell')}Incidents</h4>${inc.map(i => `<div class="ctl-row"><span>${esc(i.type)}</span><span class="pill ${i.status}">${i.status}</span></div>`).join('')}</div>` : ''}
      <div class="sec"><h4>${icon('eye')}Footage access log (this session)</h4>${S.log.slice(0, 5).map(l => `<div class="ctl-row" style="font-size:11px"><span>${pad(l.at.getHours())}:${pad(l.at.getMinutes())}:${pad(l.at.getSeconds())} · ${l.cam} · ${l.mode}</span><span class="${l.ok ? 'c-ok' : 'c-crit'}">${l.ok ? 'viewed' : 'denied'}</span></div>`).join('')}</div>
    </div>`;
  }
  function tlMarkup() {
    const c = V.cam, d0 = dayStart(); const end = isLive() ? Date.now() : d0 + DAY; const P = (t) => Math.max(0, Math.min(100, (t - d0) / DAY * 100));
    let s = '';
    if (c.status === 'offline') s += `<div class="seg-rec" style="left:0;width:${P(Date.now() - c.since * 1000)}%"></div><div class="seg-gap" style="left:${P(Date.now() - c.since * 1000)}%;width:${P(end) - P(Date.now() - c.since * 1000)}%"></div>`;
    else if (c.rec === 'gap') s += `<div class="seg-rec" style="left:0;width:${P(d0 + 2.166 * 3600000)}%"></div><div class="seg-gap" style="left:${P(d0 + 2.166 * 3600000)}%;width:${P(d0 + 2.75 * 3600000) - P(d0 + 2.166 * 3600000)}%"></div><div class="seg-rec" style="left:${P(d0 + 2.75 * 3600000)}%;width:${P(end) - P(d0 + 2.75 * 3600000)}%"></div>`;
    else if (c.rec === 'error') s += `<div class="seg-rec" style="left:0;width:${P(end - 3 * 3600000)}%"></div><div class="seg-gap" style="left:${P(end - 3 * 3600000)}%;width:${P(end) - P(end - 3 * 3600000)}%"></div>`;
    else s += `<div class="seg-rec" style="left:0;width:${P(end)}%"></div>`;
    const r = B.rng('ev' + c.id + B.iso(new Date(d0))); for (let i = 0; i < 6; i++) s += `<div class="ev" style="left:${P(d0 + r() * (end - d0))}%" title="Motion event"></div>`;
    B.INCIDENTS.filter(i => i.cam === c.id).forEach(i => { s += `<div class="ev" style="left:${P(Date.now() - i.ago * 1000)}%;background:var(--crit)" title="${esc(i.type)}"></div>`; });
    for (let hh = 0; hh <= 24; hh += 3) s += `<span class="hr" style="left:${hh / 24 * 100}%">${pad(hh)}</span>`;
    return s + `<div class="head" id="tlhead"></div>`;
  }
  function frame(now) {
    if (!V.cam) return;
    const dt = now - V.last; V.last = now;
    if (V.mode === 'playback' && V.playing && allowed()) { V.t += dt * V.speed; const lim = isLive() ? Date.now() : dayStart() + DAY; if (V.t >= lim) { V.t = lim; if (!isLive()) V.playing = false; } }
    const t = V.mode === 'live' ? Date.now() : V.t;
    const cv = $('#vcan'); if (cv) paintCam(cv, V.cam, t, allowed() && !(V.cam.status === 'offline' && V.mode === 'live'));
    const ts = $('#vts'); if (ts) ts.textContent = stamp(new Date(t)) + (V.mode === 'playback' ? ` · ${V.speed}×` : '');
    const hd = $('#tlhead'); if (hd) hd.style.left = Math.max(0, Math.min(100, (t - dayStart()) / DAY * 100)) + '%';
    V.raf = requestAnimationFrame(frame);
  }
  // Synthetic scene: perspective room, moving figures, sensor noise. Clearly a placeholder.
  function paintCam(cv, c, t, show) {
    const x = cv.getContext('2d'), W = cv.width, H = cv.height; const h = CAM_HUES[B.hash(c.id) % CAM_HUES.length];
    const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, `hsl(${h[0]} ${h[1]}% 20%)`); g.addColorStop(0.55, `hsl(${h[0]} ${h[1]}% 10%)`); g.addColorStop(1, `hsl(${h[0]} ${h[1]}% 6%)`);
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    const vx = W * (0.4 + (B.hash(c.id) % 20) / 100), vy = H * 0.38;
    x.strokeStyle = 'rgba(150,190,240,.12)'; x.lineWidth = 1;
    x.strokeRect(vx - W * 0.22, vy - H * 0.2, W * 0.44, H * 0.34);
    for (let i = -6; i <= 6; i++) { x.beginPath(); x.moveTo(vx + i * W * 0.037, vy + H * 0.14); x.lineTo(vx + i * W * 0.2, H); x.stroke(); }
    for (let k = 1; k < 7; k++) { const yy = vy + H * 0.14 + (H - vy - H * 0.14) * Math.pow(k / 7, 1.6); x.beginPath(); x.moveTo(0, yy); x.lineTo(W, yy); x.stroke(); }
    [[vx - W * 0.22, vy - H * 0.2, 0, 0], [vx + W * 0.22, vy - H * 0.2, W, 0], [vx - W * 0.22, vy + H * 0.14, 0, H], [vx + W * 0.22, vy + H * 0.14, W, H]].forEach(([a, b, c2, d]) => { x.beginPath(); x.moveTo(a, b); x.lineTo(c2, d); x.stroke(); });
    if (show) {
      const r = B.rng('fig' + c.id); const nFig = 1 + Math.floor(r() * 3);
      for (let i = 0; i < nFig; i++) {
        const per = 14000 + r() * 16000, ph = r() * per, depth = 0.45 + r() * 0.5;
        const u = ((t + ph) % per) / per; const dir = r() > 0.5 ? 1 : -1; const px = dir > 0 ? u * (W + 80) - 40 : W + 40 - u * (W + 80);
        const py = vy + H * 0.14 + (H - vy - H * 0.14) * depth; const sz = 30 + depth * 70; const bob = Math.sin(t / 160 + i) * 2;
        x.fillStyle = 'rgba(10,16,26,.85)'; x.beginPath(); x.ellipse(px, py - sz * 0.05, sz * 0.25, sz * 0.06, 0, 0, Math.PI * 2); x.fill();
        x.fillStyle = `rgba(${170 + i * 20},${180 + i * 10},200,.55)`;
        x.beginPath(); x.roundRect ? x.roundRect(px - sz * 0.16, py - sz * 0.95 + bob, sz * 0.32, sz * 0.62, 8) : x.rect(px - sz * 0.16, py - sz * 0.95 + bob, sz * 0.32, sz * 0.62); x.fill();
        x.beginPath(); x.arc(px, py - sz * 1.08 + bob, sz * 0.12, 0, Math.PI * 2); x.fill();
        x.fillRect(px - sz * 0.13, py - sz * 0.36 + bob, sz * 0.1, sz * 0.32); x.fillRect(px + sz * 0.03, py - sz * 0.36 - bob, sz * 0.1, sz * 0.32);
      }
    }
    for (let i = 0; i < 350; i++) { x.fillStyle = `rgba(255,255,255,${Math.random() * 0.07})`; x.fillRect(Math.random() * W, Math.random() * H, 2, 2); }
    x.fillStyle = 'rgba(210,225,245,.22)'; x.font = '600 18px Inter, Segoe UI, sans-serif'; x.textAlign = 'center';
    x.fillText('CAMERA PLACEHOLDER — SAMPLE DATA, NOT REAL FOOTAGE', W / 2, H - 22);
  }

  // ======================================================================
  // Events
  // ======================================================================
  function go(tab, site) { if (site) S.site = site; if (tab && tabOk(tab)) S.tab = tab; S.cam.page = 0; closeAll(); render(); }
  function init() {
    CH.initTip();
    const opt = (s) => `<option value="${s.id}">${esc(s.name)}</option>`;
    $('#fSite').innerHTML = `<option value="ALL">Whole bank · all ${B.SITES.length} sites</option><optgroup label="Regions">${B.REGIONS.map(r => `<option value="R:${esc(r)}">${esc(r)} (${B.SITES.filter(s => s.region === r).length})</option>`).join('')}</optgroup>`
      + `<optgroup label="Head office &amp; data centers">${B.SITES.filter(s => s.type !== 'BR').map(opt).join('')}</optgroup>`
      + B.REGIONS.map(r => `<optgroup label="Branches · ${esc(r)}">${B.SITES.filter(s => s.type === 'BR' && s.region === r).map(opt).join('')}</optgroup>`).join('');
    $('#fRole').innerHTML = Object.entries(B.ROLES).map(([k, r]) => `<option value="${k}" title="${esc(r.desc)}">${esc(r.label)}</option>`).join('');
    $('#fDate').max = B.iso(B.TODAY); $('#fDate').min = B.iso(new Date(B.TODAY.getFullYear() - 1, 0, 1));
    const h = location.hash.slice(1); if (TABS.some(t => t.id === h)) S.tab = h;

    $('#fSite').addEventListener('change', e => { S.site = e.target.value; S.bank.sel = null; S.cam.page = 0; render(); });
    // a scoped role opens on its own branch / region; unrestricted roles open on the whole bank
    const toScope = () => { S.site = role().bank === 'all' || role().bank === 'none' ? 'ALL' : role().bank; S.bank.sel = null; S.cam.page = 0; render(); };
    $('#fRole').addEventListener('change', e => { S.role = e.target.value; store.set('bcc-role', S.role); toScope(); });
    $('#fScope').addEventListener('change', e => { const v = e.target.value; if (B.ROLES[S.role].pick === 'branch') { if (!B.SITE[v]) return; S.rBranch = v; store.set('bcc-rbranch', S.rBranch); } else { if (!B.REGIONS.includes(v)) return; S.rRegion = v; store.set('bcc-rregion', S.rRegion); } toScope(); });
    $('#fDate').addEventListener('change', e => { const v = e.target.value; if (!v) return; const d = B.startOfDay(new Date(v + 'T00:00:00')); S.asOf = d > B.TODAY ? B.TODAY : d; render(); });
    $('.themes').addEventListener('click', e => { const b = e.target.closest('[data-theme]'); if (!b) return; S.theme = b.dataset.theme; store.set('bcc-theme', S.theme); if (document.startViewTransition && !reduced()) document.startViewTransition(() => render()); else render(); });
    if (window.ResizeObserver) new ResizeObserver(() => { S._ind = null; moveInd(); }).observe($('#tabs'));
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { S._ind = null; moveInd(); });
    window.addEventListener('hashchange', () => { const t = location.hash.slice(1); if (tabOk(t) && TABS.some(x => x.id === t) && t !== S.tab) { S.tab = t; render(); } });

    document.addEventListener('click', e => {
      const t = e.target.closest('[data-siteset],[data-kpi],[data-region],[data-mapmode],[data-tab],[data-range],[data-alert],[data-site],[data-go],[data-goto],[data-eq],[data-cam],[data-camst],[data-page],[data-metric],[data-drill],[data-bsel],[data-clearsel],[data-close],[data-vmode],[data-vplay],[data-vjump],[data-vspeed]');
      if (!t) { if (e.target.id === 'scrim' || e.target.id === 'modal') closeAll(); return; }
      const d = t.dataset;
      if (d.siteset) { S.site = d.siteset; render(); }
      else if (t.hasAttribute('data-region')) { S.site = d.region ? 'R:' + d.region : 'ALL'; S.bank.sel = null; closeAll(); render(); }
      else if (d.mapmode) { if (!t.disabled) { S.mapMode = d.mapmode; render(); } }
      else if (d.kpi) openKpi(d.kpi);
      else if (d.tab) { if (tabOk(d.tab)) { S.tab = d.tab; render(); } }
      else if (d.range) { S.range = d.range; render(); }
      else if (d.alert) { const a = allAlerts().find(x => x.key === d.alert); if (a) openSite(a.site, a.key); }
      else if (d.goto) { if (d.camstGo) S.cam.st = d.camstGo; go(d.goto, d.siteGo); }
      else if (d.go) go(d.go);
      else if (d.eq) openEquip(d.eq);
      else if (d.cam) { closeAll(); openViewer(d.cam); }
      else if (d.site) openSite(d.site);
      else if (d.camst) { S.cam.st = d.camst === S.cam.st && t.classList.contains('kpi') ? 'all' : d.camst; S.cam.page = 0; if (S.tab === 'cctv') { $$('.camtools [data-camst]').forEach(b => b.classList.toggle('on', b.dataset.camst === S.cam.st)); layoutCams(); } }
      else if (d.page) { S.cam.page = Math.max(0, S.cam.page + Number(d.page)); layoutCams(); }
      else if (d.metric) { S.bank.metric = d.metric; render(); }
      else if (d.drill) { S.bank.drill = d.drill; render(); }
      else if (d.bsel) { S.bank.sel = S.bank.sel === d.bsel ? null : d.bsel; render(); }
      else if (t.hasAttribute('data-clearsel')) { S.bank.sel = null; render(); }
      else if (t.hasAttribute('data-close')) closeAll();
      else if (d.vmode) { if (V.mode !== d.vmode) { V.mode = d.vmode; V.playing = d.vmode === 'playback'; logAccess(V.cam, V.mode, allowed()); drawViewerShell(); } }
      else if (t.hasAttribute('data-vplay')) { V.playing = !V.playing; drawViewerShell(); }
      else if (d.vjump) { V.t += Number(d.vjump) * 1000; }
      else if (d.vspeed) { V.speed = Number(d.vspeed); $$('[data-vspeed]').forEach(b => b.classList.toggle('on', +b.dataset.vspeed === V.speed)); }
    });
    document.addEventListener('click', e => {
      const tl = e.target.closest('#tl'); if (!tl || !V.cam || !allowed()) return;
      const r = tl.getBoundingClientRect(); const f = (e.clientX - r.left) / r.width; V.t = Math.min(isLive() ? Date.now() : dayStart() + DAY, dayStart() + f * DAY);
    });
    document.addEventListener('change', e => { if (e.target.id === 'vtime' && e.target.value) { const [hh, mm, ss] = e.target.value.split(':').map(Number); V.t = Math.min(isLive() ? Date.now() : Infinity, dayStart() + ((hh * 60 + mm) * 60 + (ss || 0)) * 1000); } });
    document.addEventListener('input', e => { if (e.target.id === 'camq') { S.cam.q = e.target.value; S.cam.page = 0; layoutCams(); } });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeAll(); });
    let rt; window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { drawCharts(); if (S.tab === 'cctv') layoutCams(); }, 120); });

    // clock, camera timestamps and data-freshness ages
    setInterval(() => {
      const n = new Date(); $('#clock').textContent = n.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' }) + ' · ' + n.toLocaleTimeString('en-GB');
      tickStamps();
      const e = elapsed(); const a = $('[data-age="bms"]'), b = $('[data-age="cam"]');
      if (a) a.textContent = Math.round((4 + e) % 10) + 's ago'; if (b) b.textContent = Math.round((2 + e) % 5) + 's ago';
      if (S.brief && S.brief.list.length > 1 && Math.floor(e) % 7 === 6) {
        const el = $('#brief'); if (el && !el.matches(':hover')) {
          S.brief.i = (S.brief.i + 1) % S.brief.list.length; el.classList.remove('swap'); void el.offsetWidth; el.classList.add('swap'); el.innerHTML = S.brief.list[S.brief.i];
          $$('.bdots i').forEach((x, k) => x.classList.toggle('on', k === S.brief.i));
        }
      }
      $$('[data-upd="bms"],[data-upd="cam"]').forEach(x => { x.textContent = 'Updated ' + Math.round(x.dataset.upd === 'bms' ? (4 + e) % 10 : (2 + e) % 5) + 's ago'; });
    }, 1000);
    render();
  }
  window.BCC = { S, render, openSite, openEquip, openViewer, openKpi, allAlerts, bankScope, ceo, bankIds };
  document.addEventListener('DOMContentLoaded', init);
})();
