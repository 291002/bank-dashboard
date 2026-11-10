/* Bank Command Center — SAMPLE DATA MODEL.
   Every number here is generated from a fixed seed so all tabs agree with each other.
   Nothing is connected to a real bank, BMS, VMS or core-banking system. */
(function () {
  'use strict';

  // ---------- seeded helpers ----------
  function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rng(seed) { let a = hash(String(seed)); return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  const r1 = (seed) => rng(seed)();
  const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
  const DAY = 86400000;
  const iso = (d) => { const z = new Date(d); return z.getFullYear() + '-' + String(z.getMonth() + 1).padStart(2, '0') + '-' + String(z.getDate()).padStart(2, '0'); };
  const startOfDay = (d) => { const z = new Date(d); z.setHours(0, 0, 0, 0); return z; };
  const TODAY = startOfDay(new Date());

  // ---------- sites ----------
  // Egyptian network. Places are real, the bank itself is fictional. lon/lat drive the map; ix/iy place sites in the Greater Cairo inset.
  const REGIONS = ['Greater Cairo', 'Alexandria & North Coast', 'Delta', 'Canal & Red Sea', 'Upper Egypt'];
  const SITES = [
    { id: 'HQ', name: 'Head Office · New Capital', short: 'Head Office', type: 'HQ', region: 'Greater Cairo', city: 'New Administrative Capital', lon: 31.75, lat: 30.02, ix: .9, iy: .52, cams: 64, nvr: 4, bank: true, kwh: 41800, kw: 2350 },
    { id: 'DC1', name: 'Smart Village Data Center', short: 'DC-1 Smart Village', type: 'DC', region: 'Greater Cairo', city: 'Smart Village, Giza', lon: 31.02, lat: 30.07, ix: .12, iy: .28, cams: 48, nvr: 3, bank: false, kwh: 96500, kw: 4120 },
    { id: 'DC2', name: 'Borg El Arab DR Center', short: 'DC-2 Borg El Arab', type: 'DC', region: 'Alexandria & North Coast', city: 'Borg El Arab', lon: 29.6, lat: 30.9, lab: 'l', cams: 36, nvr: 2, bank: false, kwh: 61200, kw: 2610 },
  ];
  const BR = [
    ['B01', 'Downtown Cairo', 'Greater Cairo', 31.24, 30.05, .5, .4], ['B02', 'Heliopolis', 'Greater Cairo', 31.33, 30.09, .66, .22], ['B03', 'Maadi', 'Greater Cairo', 31.26, 29.96, .55, .76],
    ['B04', 'Dokki', 'Greater Cairo', 31.21, 30.04, .35, .52], ['B05', '6th of October', 'Greater Cairo', 30.93, 29.97, .14, .74], ['B06', 'New Cairo', 'Greater Cairo', 31.47, 30.03, .74, .64],
    ['B07', 'Alexandria Smouha', 'Alexandria & North Coast', 29.95, 31.21], ['B08', 'El Alamein', 'Alexandria & North Coast', 28.95, 30.83, 0, 0, 'l'],
    ['B09', 'Tanta', 'Delta', 31.0, 30.79, 0, 0, 'l'], ['B10', 'Mansoura', 'Delta', 31.38, 31.04], ['B11', 'Zagazig', 'Delta', 31.5, 30.58],
    ['B12', 'Port Said', 'Canal & Red Sea', 32.3, 31.26], ['B13', 'Ismailia', 'Canal & Red Sea', 32.27, 30.6], ['B14', 'Sharm El Sheikh', 'Canal & Red Sea', 34.33, 27.91], ['B15', 'Hurghada', 'Canal & Red Sea', 33.81, 27.26],
    ['B16', 'Assiut', 'Upper Egypt', 31.18, 27.18, 0, 0, 'l'], ['B17', 'Luxor', 'Upper Egypt', 32.64, 25.69], ['B18', 'Aswan', 'Upper Egypt', 32.9, 24.09],
  ];
  BR.forEach(([id, n, reg, lon, lat, ix, iy, lab]) => {
    const r = rng('site' + id);
    SITES.push({ id, name: n + ' Branch', short: n, type: 'BR', region: reg, city: n, lon, lat, ix, iy, lab, cams: 12 + Math.floor(r() * 9), nvr: 1, bank: true, kwh: Math.round(950 + r() * 900), kw: Math.round(70 + r() * 60) });
  });
  // Simplified outline of Egypt and the Nile (lon, lat) for the network map
  const EGYPT = [[25, 31.6], [25.15, 31.65], [26.2, 31.55], [27.25, 31.37], [28.4, 31.0], [29.1, 30.95], [29.9, 31.22], [30.35, 31.48], [31.0, 31.6], [31.8, 31.52], [32.3, 31.3], [33.2, 31.12], [34.22, 31.32], [34.9, 29.5], [34.62, 28.75], [34.42, 28.1], [34.27, 27.74], [33.75, 28.15], [33.25, 28.75], [32.85, 29.45], [32.56, 29.97], [32.62, 29.45], [32.75, 28.85], [33.35, 27.95], [33.83, 27.15], [34.28, 26.1], [34.95, 24.95], [35.5, 23.95], [35.65, 23.15], [36.88, 22.0], [31.45, 22.0], [25, 22.0]];
  const NILE = [
    [[31.35, 22.0], [31.9, 22.6], [32.4, 23.25], [32.9, 24.05], [32.92, 24.6], [32.8, 25.3], [32.64, 25.7], [32.72, 26.1], [32.2, 26.2], [31.75, 26.5], [31.45, 26.95], [31.18, 27.18], [30.88, 27.62], [30.75, 28.1], [30.9, 28.6], [31.1, 29.1], [31.25, 29.6], [31.24, 30.1]],
    [[31.24, 30.1], [31.05, 30.35], [30.8, 30.7], [30.55, 31.05], [30.37, 31.45]],
    [[31.24, 30.1], [31.25, 30.55], [31.45, 30.95], [31.8, 31.48]],
  ];
  const LAKE_NASSER = [[31.35, 22.0], [31.9, 22.6], [32.4, 23.25], [32.88, 23.95]];
  const CANAL = [[32.3, 31.26], [32.31, 30.6], [32.56, 29.97]];
  const SITE = Object.fromEntries(SITES.map(s => [s.id, s]));
  const TYPE_LABEL = { HQ: 'Headquarters', DC: 'Data center', BR: 'Branch' };

  // ---------- roles (role-based access) ----------
  const ROLES = {
    exec: { label: 'CEO / Executive Committee', desc: 'All banking, risk and capital details · live view + playback', bank: 'all', live: 'all', playback: 'all' },
    rm: { label: 'Regional Manager', pick: 'region', desc: 'Banking details and live view for every branch in the chosen region · no playback', bank: '@', live: '@', playback: 'none' },
    bm: { label: 'Branch Manager', pick: 'branch', desc: 'Banking details and live view for the chosen branch only · no playback', bank: '@', live: '@', playback: 'none' },
    audit: { label: 'Internal Auditor', desc: 'All banking details · playback only', bank: 'all', live: 'none', playback: 'all' },
    sec: { label: 'Security Officer', desc: 'Live view + playback · no banking details', bank: 'none', live: 'all', playback: 'all' },
    fac: { label: 'Facilities Engineer', desc: 'BMS monitoring · no banking details or footage', bank: 'none', live: 'none', playback: 'none' },
  };
  // rule: 'all' | 'none' | site id | 'R:<region>' (branches of that region only)
  const allows = (rule, site) => rule === 'all' || rule === site || (String(rule).startsWith('R:') && !!SITE[site] && SITE[site].type === 'BR' && SITE[site].region === rule.slice(2));

  // ---------- date ranges ----------
  const RANGES = { today: 'Today', d7: '7 days', d30: '30 days', mtd: 'Month to date', ytd: 'Year to date' };
  function rangeDays(range, asOf) {
    const end = startOfDay(asOf); let start;
    if (range === 'today') start = end;
    else if (range === 'd7') start = new Date(end - 6 * DAY);
    else if (range === 'd30') start = new Date(end - 29 * DAY);
    else if (range === 'mtd') start = new Date(end.getFullYear(), end.getMonth(), 1);
    else start = new Date(end.getFullYear(), 0, 1);
    const out = []; for (let t = +start; t <= +end; t += DAY) out.push(new Date(t));
    return out;
  }
  const isWeekend = (d) => d.getDay() === 5 || d.getDay() === 6; // Fri/Sat weekend

  // ---------- energy ----------
  const HOUR_PROFILE = { HQ: [.55, .52, .5, .5, .52, .58, .72, .9, 1.12, 1.25, 1.3, 1.32, 1.33, 1.33, 1.3, 1.25, 1.15, 1, .85, .75, .68, .62, .58, .56], DC: [.97, .96, .96, .95, .95, .96, .98, 1, 1.02, 1.03, 1.04, 1.05, 1.06, 1.06, 1.06, 1.05, 1.04, 1.02, 1.01, 1, .99, .99, .98, .97], BR: [.35, .33, .33, .32, .33, .36, .5, .9, 1.4, 1.6, 1.65, 1.65, 1.62, 1.6, 1.55, 1.45, 1.2, .8, .55, .45, .4, .38, .36, .35] };
  function energyDay(siteId, d) {
    const s = SITE[siteId]; const doy = (d - new Date(d.getFullYear(), 0, 1)) / DAY;
    const season = 1 + 0.12 * Math.sin((doy - 100) / 365 * 2 * Math.PI);
    const wk = isWeekend(d) ? (s.type === 'DC' ? 0.99 : s.type === 'HQ' ? 0.62 : 0.42) : 1;
    return s.kwh * season * wk * (0.95 + r1('e' + siteId + iso(d)) * 0.1);
  }
  function energyHourly(siteId, d, upToHour) {
    const s = SITE[siteId]; const p = HOUR_PROFILE[s.type]; const day = energyDay(siteId, d); const sum = p.reduce((a, b) => a + b, 0);
    return p.map((f, h) => h > upToHour ? null : day * f / sum * (0.96 + r1('eh' + siteId + iso(d) + h) * 0.08));
  }

  // ---------- banking ----------
  const DEP_PRODUCTS = ['Current accounts', 'Savings accounts', 'Term deposits', 'Certificates of deposit'];
  const LOAN_SEGMENTS = ['Corporate', 'SME', 'Mortgage', 'Personal loans', 'Credit cards'];
  const CHANNELS = ['Teller', 'ATM', 'Mobile app', 'Internet banking', 'Cards / POS'];
  const BANK = {};
  SITES.filter(s => s.bank).forEach(s => {
    const r = rng('bank' + s.id);
    const dep = s.type === 'HQ' ? 68.2e9 : (s.region === 'Greater Cairo' ? 8 + r() * 8 : s.region === 'Alexandria & North Coast' ? 5.5 + r() * 5 : 3.2 + r() * 4.4) * 1e9;
    const ldr = s.type === 'HQ' ? 0.78 : 0.48 + r() * 0.26;
    const growth = 0.07 + r() * 0.12;
    const npl = s.id === 'B10' ? 0.069 : s.type === 'HQ' ? 0.028 : 0.021 + r() * 0.03;
    const depMix = s.type === 'HQ' ? [0.34, 0.1, 0.38, 0.18] : (() => { const a = [0.22 + r() * .1, 0.3 + r() * .12, 0.22 + r() * .1, 0.1 + r() * .08]; const t = a.reduce((x, y) => x + y); return a.map(v => v / t); })();
    const loanMix = s.type === 'HQ' ? [0.72, 0.14, 0.06, 0.05, 0.03] : (() => { const a = [0.08 + r() * .1, 0.18 + r() * .14, 0.22 + r() * .12, 0.26 + r() * .1, 0.1 + r() * .06]; const t = a.reduce((x, y) => x + y); return a.map(v => v / t); })();
    const txBase = s.type === 'HQ' ? [1400, 2600, 62000, 24000, 64000] : [380 + r() * 420, 900 + r() * 900, 2600 + r() * 3200, 700 + r() * 900, 1500 + r() * 1700];
    BANK[s.id] = { dep, loans: dep * ldr, growth, npl, depMix, loanMix, txBase, margin: 0.029 + r() * 0.012,
      nim: s.type === 'HQ' ? 0.058 : 0.052 + r() * 0.018, cir: s.type === 'HQ' ? 0.24 : 0.3 + r() * 0.24, coverage: s.id === 'B10' ? 1.18 : 1.45 + r() * 0.5,
      customers: s.type === 'HQ' ? 21000 : Math.round((dep / 1e9) * (5200 + r() * 2600)), digital: s.type === 'HQ' ? 0.82 : 0.42 + r() * 0.28, nps: s.type === 'HQ' ? 48 : Math.round(22 + r() * 38), newCust: 0.011 + r() * 0.012 };
  });
  // Balances move smoothly with time; value at a date = base scaled by growth.
  function balanceAt(siteId, kind, d) {
    const b = BANK[siteId]; const yrs = (d - TODAY) / (365 * DAY);
    const base = kind === 'dep' ? b.dep : b.loans;
    const g = kind === 'dep' ? b.growth : b.growth * 0.85;
    const wobble = 1 + 0.006 * Math.sin(+d / (9 * DAY) + hash(siteId) % 7);
    return base * Math.pow(1 + g, yrs) * wobble;
  }
  function profitDay(siteId, d) { const b = BANK[siteId]; return balanceAt(siteId, 'dep', d) * b.margin / 365 * (0.75 + r1('p' + siteId + iso(d)) * 0.5) * (isWeekend(d) ? 0.7 : 1.08); }
  function txDay(siteId, d) {
    const b = BANK[siteId];
    return b.txBase.map((v, i) => { const wk = isWeekend(d) ? [0.15, 0.7, 0.85, 0.7, 0.9][i] : 1; return Math.round(v * wk * (0.88 + r1('t' + siteId + iso(d) + i) * 0.24)); });
  }
  const TX_HOUR = [.2, .1, .08, .06, .06, .1, .3, .7, 1.2, 1.6, 1.7, 1.75, 1.7, 1.6, 1.5, 1.35, 1.2, 1.15, 1.1, 1, .85, .7, .5, .3];

  // ---------- BMS equipment ----------
  const SYS = { hvac: 'HVAC', elec: 'Electrical power', ups: 'UPS', gen: 'Generators', fire: 'Fire alarm', water: 'Water systems' };
  const EQUIP = [];
  function eq(site, sys, kind, code, critical, m) { EQUIP.push(Object.assign({ id: site + '-' + code, code, site, sys, kind, critical, status: 'ok', note: '' }, m)); }
  SITES.forEach(s => {
    const r = rng('eq' + s.id);
    if (s.type === 'HQ') {
      for (let i = 1; i <= 3; i++) eq(s.id, 'hvac', 'Chiller', 'CH-' + i, true, { load: 55 + r() * 25, supply: 6.4 + r() * 0.8, setpoint: 6.5, unit: '°C' });
      for (let i = 1; i <= 6; i++) eq(s.id, 'hvac', 'Air handling unit', 'AHU-0' + i, false, { load: 40 + r() * 40, supply: 13 + r() * 2, setpoint: 14, unit: '°C' });
      ['TR-1', 'TR-2'].forEach(c => eq(s.id, 'elec', 'Transformer 2.5 MVA', c, true, { load: 45 + r() * 15, kw: 1050 + r() * 200, pf: 0.93 + r() * 0.04 }));
      eq(s.id, 'elec', 'Main distribution board', 'MDB-1', true, { load: 52 + r() * 10, kw: 2210, pf: 0.95 });
      ['UPS-1', 'UPS-2'].forEach(c => eq(s.id, 'ups', 'UPS 400 kVA', c, true, { load: 38 + r() * 15, batt: 100, auton: 22 + Math.round(r() * 8), btemp: 24 + r() * 2 }));
      ['GEN-1', 'GEN-2'].forEach(c => eq(s.id, 'gen', 'Diesel generator 1,500 kVA', c, true, { fuel: 78 + r() * 18, mode: 'Standby / auto', lastTest: 3 + Math.floor(r() * 4) }));
      eq(s.id, 'fire', 'Fire alarm control panel', 'FACP-1', true, { zones: 48, trouble: 0, alarm: 0, disabled: 1 });
      eq(s.id, 'water', 'Domestic water tank', 'TK-1', false, { level: 72 + r() * 15 });
      eq(s.id, 'water', 'Fire water tank', 'TK-2', true, { level: 96 });
      ['P-1', 'P-2'].forEach((c, i) => eq(s.id, 'water', 'Booster pump', c, false, { run: i === 0, pressure: 4.2 + r() * 0.4 }));
      ['LD-B1', 'LD-B2', 'LD-B3'].forEach(c => eq(s.id, 'water', 'Leak detector', c, true, { leak: false }));
    } else if (s.type === 'DC') {
      const n = s.id === 'DC1' ? 4 : 3;
      for (let i = 1; i <= n; i++) eq(s.id, 'hvac', 'Chiller', 'CH-' + i, true, { load: 60 + r() * 20, supply: 9.8 + r() * 0.8, setpoint: 10, unit: '°C' });
      for (let i = 1; i <= (s.id === 'DC1' ? 8 : 6); i++) eq(s.id, 'hvac', 'CRAH unit', 'CRAH-0' + i, true, { load: 55 + r() * 25, supply: 21.6 + r() * 1.4, setpoint: 22, unit: '°C' });
      ['TR-A', 'TR-B'].forEach(c => eq(s.id, 'elec', 'Transformer 3 MVA', c, true, { load: 55 + r() * 10, kw: s.kw / 2 * (0.95 + r() * 0.1), pf: 0.96 + r() * 0.03 }));
      eq(s.id, 'elec', 'IT load (all PDUs)', 'PDU-ALL', true, { load: 61 + r() * 8, kw: s.kw * 0.62, pf: 0.99 });
      (s.id === 'DC1' ? ['UPS-A1', 'UPS-A2', 'UPS-B1', 'UPS-B2'] : ['UPS-A1', 'UPS-B1']).forEach(c => eq(s.id, 'ups', 'UPS 800 kVA', c, true, { load: 44 + r() * 12, batt: 100, auton: 12 + Math.round(r() * 6), btemp: 23 + r() * 2 }));
      (s.id === 'DC1' ? ['GEN-A', 'GEN-B', 'GEN-C'] : ['GEN-A', 'GEN-B']).forEach(c => eq(s.id, 'gen', 'Diesel generator 2,000 kVA', c, true, { fuel: 82 + r() * 15, mode: 'Standby / auto', lastTest: 2 + Math.floor(r() * 5) }));
      eq(s.id, 'fire', 'Fire panel + gas suppression', 'FACP-1', true, { zones: 32, trouble: 0, alarm: 0, disabled: 0 });
      eq(s.id, 'water', 'Chilled-water make-up tank', 'TK-1', true, { level: 80 + r() * 12 });
      ['LD-RM1', 'LD-RM2'].forEach(c => eq(s.id, 'water', 'Under-floor leak detection', c, true, { leak: false }));
    } else {
      for (let i = 1; i <= 3; i++) eq(s.id, 'hvac', 'DX package unit', 'AC-' + i, i === 1, { load: 45 + r() * 35, supply: 13.5 + r() * 2, setpoint: 14, unit: '°C' });
      eq(s.id, 'elec', 'Main distribution board', 'MDB', true, { load: 35 + r() * 25, kw: s.kw * (0.85 + r() * 0.2), pf: 0.9 + r() * 0.07 });
      eq(s.id, 'ups', 'UPS 40 kVA', 'UPS-1', true, { load: 30 + r() * 25, batt: 100, auton: 35 + Math.round(r() * 20), btemp: 24 + r() * 3 });
      eq(s.id, 'gen', 'Diesel generator 150 kVA', 'GEN-1', true, { fuel: 60 + r() * 35, mode: 'Standby / auto', lastTest: 1 + Math.floor(r() * 6) });
      eq(s.id, 'fire', 'Fire alarm control panel', 'FACP-1', true, { zones: 12, trouble: 0, alarm: 0, disabled: 0 });
      eq(s.id, 'water', 'Roof water tank', 'TK-1', false, { level: 55 + r() * 40 });
      eq(s.id, 'water', 'Leak detector (server room)', 'LD-1', true, { leak: false });
    }
  });
  const E = (id) => EQUIP.find(e => e.id === id);
  // Intentional demo anomalies (so alerts and drill-downs have something to show)
  Object.assign(E('HQ-CH-2'), { status: 'alarm', load: 0, supply: 13.9, note: 'Compressor trip — high discharge pressure' });
  Object.assign(E('DC1-UPS-A2'), { status: 'alarm', btemp: 41.2, note: 'Battery string temperature high (41.2 °C, limit 35 °C)' });
  Object.assign(E('B04-GEN-1'), { status: 'alarm', mode: 'Fault / locked out', note: 'Failed to start during weekly test' });
  Object.assign(E('HQ-LD-B2'), { status: 'alarm', leak: true, note: 'Water detected — basement B2 pump room' });
  Object.assign(E('B07-FACP-1'), { status: 'warn', trouble: 1, note: 'Zone 7 detector fault (trouble)' });
  Object.assign(E('DC2-CRAH-04'), { status: 'warn', supply: 24.1, note: 'Supply air above setpoint (+2.1 °C)' });
  Object.assign(E('B11-TK-1'), { status: 'warn', level: 18, note: 'Tank level low (18%)' });
  Object.assign(E('B02-AC-3'), { status: 'offline', load: 0, note: 'Out of service — planned maintenance' });
  Object.assign(E('HQ-GEN-2'), { fuel: 41, status: 'warn', note: 'Fuel below 50% — refill scheduled' });
  // BMS gateway communication loss at one branch → its data is stale
  const STALE = { B09: 17 * 60 }; // seconds since last BMS update

  // ---------- CCTV ----------
  const ZONES = {
    HQ: ['Main entrance', 'Lobby', 'Reception', 'Executive floor', 'Treasury floor', 'Cash centre', 'Vault corridor', 'Vault', 'Parking B1', 'Parking B2', 'Loading dock', 'Perimeter north', 'Perimeter south', 'Lift lobby', 'Stairwell', 'Server room'],
    DC: ['Perimeter fence', 'Gatehouse', 'Visitor entrance', 'Mantrap', 'Data hall A', 'Data hall B', 'Cage row', 'UPS room', 'Generator yard', 'Fuel store', 'Loading bay', 'NOC'],
    BR: ['Entrance', 'Banking hall', 'Teller line', 'ATM lobby', 'Vault', 'Back office', 'Rear exit', 'Parking'],
  };
  const CAMS = [];
  SITES.forEach(s => {
    const z = ZONES[s.type]; const r = rng('cam' + s.id);
    for (let i = 1; i <= s.cams; i++) {
      const zone = z[(i - 1) % z.length]; const n = Math.ceil(i / z.length);
      CAMS.push({ id: s.id + '-C' + String(i).padStart(2, '0'), site: s.id, zone: zone + (n > 1 ? ' ' + n : ''), type: pick(r, ['Dome', 'Bullet', 'Dome', 'Fisheye', 'PTZ']), res: pick(r, ['4 MP', '4 MP', '8 MP', '2 MP']), nvr: 'NVR-' + (1 + (i - 1) % s.nvr), status: 'online', rec: 'ok', note: '', retention: 90 });
    }
  });
  const C = (id) => CAMS.find(c => c.id === id);
  ['B06-C04', 'B06-C05', 'B06-C09'].forEach(id => Object.assign(C(id), { status: 'offline', rec: 'none', note: 'PoE switch SW-2 port fault', since: 42 * 60 }));
  Object.assign(C('HQ-C58'), { status: 'offline', rec: 'none', note: 'No video signal', since: 2 * 3600 + 14 * 60 });
  Object.assign(C('DC2-C21'), { status: 'offline', rec: 'none', note: 'Camera not responding (ping timeout)', since: 9 * 60 });
  ['DC2-C12', 'DC2-C13', 'DC2-C14'].forEach(id => Object.assign(C(id), { rec: 'gap', note: 'Recording gap 02:10–02:45 (storage failover)' }));
  Object.assign(C('B11-C03'), { rec: 'error', note: 'Recording error — disk write failure on NVR-1' });
  CAMS.filter(c => c.site === 'B08').forEach(c => c.retention = 74); // retention below 90-day target

  const INCIDENTS = [
    { id: 'INC-4471', site: 'DC1', cam: 'DC1-C07', type: 'Door forced open — Cage row 4', sev: 'critical', status: 'active', ago: 6 * 60 },
    { id: 'INC-4469', site: 'B03', cam: 'B03-C04', type: 'ATM tamper alarm — ATM lobby', sev: 'high', status: 'active', ago: 18 * 60 },
    { id: 'INC-4466', site: 'B11', cam: 'B11-C01', type: 'Loitering at entrance (after hours)', sev: 'medium', status: 'active', ago: 47 * 60 },
    { id: 'INC-4462', site: 'HQ', cam: 'HQ-C10', type: 'Tailgating at Parking B2 barrier', sev: 'medium', status: 'acknowledged', ago: 95 * 60 },
    { id: 'INC-4458', site: 'B05', cam: 'B05-C01', type: 'Panic button test — no response gap', sev: 'low', status: 'resolved', ago: 5 * 3600 },
    { id: 'INC-4451', site: 'B12', cam: 'B12-C07', type: 'Rear exit door held open', sev: 'low', status: 'resolved', ago: 9 * 3600 },
  ];

  // ---------- bank-level capital, liquidity & market risk (sample) ----------
  function riskAt(d) {
    const m = (d - TODAY) / (30.4 * DAY); const w = (k, a) => Math.sin(m / k + a);
    return {
      car: 0.204 + 0.004 * w(2.1, 1) + 0.0007 * m, cet1: 0.168 + 0.003 * w(2.3, 2) + 0.0006 * m, lev: 0.087 + 0.002 * w(3, 3),
      lcr: 2.38 + 0.12 * w(1.7, 4), nsfr: 1.62 + 0.05 * w(2.4, 5), cor: 0.011 + 0.0015 * w(2, 6), nop: 0.032 + 0.008 * w(1.5, 7),
      top10: 0.184 + 0.006 * w(3.2, 8), single: 0.141 + 0.005 * w(2.8, 9), stage2: 0.072 + 0.006 * w(2.2, 10),
    };
  }
  // [regulatory/hard limit, internal target]
  const LIMITS = { car: [0.125, 0.18], cet1: [0.07, 0.14], lev: [0.03, 0.06], lcr: [1, 1.8], nsfr: [1, 1.3], npl: [0.06, 0.035], coverage: [1, 1.5], cor: [0.02, 0.0125], nop: [0.1, 0.05], top10: [0.25, 0.2], single: [0.2, 0.15], cir: [0.4, 0.35], roe: [0.18, 0.25], nim: [0.05, 0.06], share: [0.015, 0.0175] };
  // Market total deposits for share calculation (sample, ~EGP 11.8T growing ~18%/yr)
  const marketDeposits = (d) => 11.8e12 * Math.pow(1.18, (d - TODAY) / (365 * DAY));
  const SECTORS = [['Households & retail', .24], ['Manufacturing', .21], ['Government & public sector', .18], ['Trade', .14], ['Real estate & construction', .09], ['Tourism', .07], ['Other', .07]];

  window.BK = {
    REGIONS, EGYPT, NILE, LAKE_NASSER, CANAL, riskAt, LIMITS, marketDeposits, SECTORS,
    TODAY, DAY, iso, startOfDay, rng, r1, hash,
    SITES, SITE, TYPE_LABEL, ROLES, allows, RANGES, rangeDays, isWeekend,
    energyDay, energyHourly, BANK, balanceAt, profitDay, txDay, TX_HOUR, DEP_PRODUCTS, LOAN_SEGMENTS, CHANNELS,
    SYS, EQUIP, STALE, CAMS, INCIDENTS, NPL_LIMIT: 0.06,
  };
})();
