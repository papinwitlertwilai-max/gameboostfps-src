#!/usr/bin/env node
/**
 * GameBoost FPS — project validator
 * Run after EVERY edit:   node tools/validate.js
 * Exits non-zero on failure. See AGENTS.md §7.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const p = f => path.join(ROOT, f);
let failures = 0;
const ok  = m => console.log('  \x1b[32m✓\x1b[0m ' + m);
const bad = m => { failures++; console.log('  \x1b[31m✗\x1b[0m ' + m); };
const head = m => console.log('\n\x1b[1m' + m + '\x1b[0m');
// index.html + the shared card core, for text-level checks
const readApp = () => fs.readFileSync(path.join(ROOT, 'src', 'index.html'), 'utf8') + '\n' +
  (fs.existsSync(path.join(ROOT, 'src', 'cards.js')) ? fs.readFileSync(path.join(ROOT, 'src', 'cards.js'), 'utf8') : '');

/* ── 1. Node syntax check on main-process files ─────────────────── */
head('1. Node syntax');
for (const f of ['main.js', 'src/preload.js']) {
  try { execFileSync(process.execPath, ['--check', p(f)], { stdio: 'pipe' }); ok(f); }
  catch (e) { bad(f + ' — ' + String(e.stderr || e).split('\n').slice(0, 3).join(' ')); }
}

/* ── 2. Every <script> block parses ─────────────────────────────── */
head('2. Inline scripts parse');
const htmlFiles = ['src/index.html', 'src/splash.html'].filter(f => fs.existsSync(p(f)));
const scripts = {};
for (const f of htmlFiles) {
  const html = fs.readFileSync(p(f), 'utf8');
  const blocks = html.match(/<script>[\s\S]*?<\/script>/g) || [];
  scripts[f] = blocks.map(b => b.replace(/<\/?script>/g, ''));
  let bads = 0;
  scripts[f].forEach((js, i) => {
    if (js.trim().length < 15) return;
    try { new Function(js); } catch (e) { bads++; bad(`${f} block ${i}: ${e.message.slice(0, 70)}`); }
  });
  if (!bads) ok(`${f} — ${blocks.length} block(s)`);
}

/* ── 3. CSS brace balance ───────────────────────────────────────── */
head('3. CSS brace balance');
for (const f of htmlFiles) {
  const html = fs.readFileSync(p(f), 'utf8');
  (html.match(/<style>[\s\S]*?<\/style>/g) || []).forEach((s, i) => {
    const c = s.replace(/<\/?style>/g, '');
    const o = (c.match(/{/g) || []).length, cl = (c.match(/}/g) || []).length;
    o === cl ? ok(`${f} style ${i}: ${o}/${cl}`) : bad(`${f} style ${i}: ${o}/${cl} MISMATCH`);
  });
}

/* ── 4-8. Evaluate the app script in a DOM sandbox ──────────────── */
head('4. Tweak registry');
const CARDS_JS = fs.existsSync(p('src/cards.js')) ? fs.readFileSync(p('src/cards.js'), 'utf8') : '';
try { if (CARDS_JS) { new Function(CARDS_JS); ok('src/cards.js parses (shared card core)'); } else bad('src/cards.js is missing'); }
catch (e) { bad('src/cards.js: ' + e.message.slice(0, 80)); }
// the app sees cards.js first (it is loaded by its own <script src> before the inline app script)
const appJs = CARDS_JS + '\n;' + (scripts['src/index.html'] || []).reduce((a, b) => b.length > a.length ? b : a, '');
let R = null;
if (!appJs) { bad('could not locate the main app script'); }
else {
  const els = {};
  const el = id => els[id] || (els[id] = {
    textContent: '', className: '', innerHTML: '', value: '', disabled: false, checked: false,
    scrollTop: 0, scrollHeight: 0, firstChild: null, children: [],
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    dataset: {}, style: { setProperty() {} }, addEventListener() {}, removeEventListener() {},
    appendChild() {}, removeChild() {}, remove() {}, focus() {}, click() {},
    setAttribute() {}, removeAttribute() {}, getAttribute: () => null,
    querySelector: () => el('_q'), querySelectorAll: () => [], closest: () => null
  });
  const store = {};
  global.localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
  global.document = {
    getElementById: el, querySelector: s => el(String(s).replace(/[#.\[\]="']/g, '')),
    querySelectorAll: () => [], createElement: () => el('_new' + Math.random()),
    documentElement: el('_html'), body: el('_body'), head: el('_head'),
    addEventListener() {}, execCommand: () => true, hasFocus: () => true, hidden: false
  };
  global.navigator = { clipboard: { writeText: async () => {} } };
  global.window = {
    addEventListener() {}, removeEventListener() {},
    boost: {
      isDesktop: true,
      run: async () => ({ ok: true, out: '142', err: '' }),
      sysinfo: async () => ({ cpu: 'AMD Ryzen 7 2700X', gpu: 'NVIDIA GeForce GTX 1650', ram: 16 }),
      restorePoint: async () => ({ ok: true }),
      hwStats: async () => ({ cpuLoad: 25, ramUsed: 7.5, ramTot: 16, cpuTemp: 52, gpuTemp: 58 }),
      quickPing: async () => ({ ms: 12 }),
      listGames: async () => ['FiveM'],
      overlayShow: async () => ({ ok: true }), overlayHide: async () => ({ ok: true }),
      discordSet: async () => ({ ok: true }),
      runBatch: async (c) => (c || []).map(() => ({ ok: true, out: '', err: '' })),
      startupList: async () => [], startupToggle: async () => ({ ok: true }),
      powerPlanList: async () => [], powerPlanDump: async () => ({ ok: true, out: '' }),
      buildTrixiePlan: async () => ({ ok: true, guid: 'x', applied: 0, skipped: 0 }),
      openPowerCfg: async () => ({ ok: true }), onTrixieProgress: () => {},
      timerRes: async () => ({ ok: true }), dpcCheck: async () => ({ ok: true, dpc: 0, irq: 0 }),
      getHwid: async () => ({ ok: true, hwid: 'a'.repeat(32) }),
      licenseLoad: async () => null, licenseClear: async () => ({ ok: true }),
      licenseCall: async () => ({ ok: true }),
      isAdmin: async () => ({ ok: true, admin: true, canWrite: true }),
      gpuCaps: async () => ({ vendor: 'nvidia', name: 'RTX 4090', dlssVer: '3.7.0', dlssMajor: 3, hasFG: true, hasRR: true }),
      osProfile: async () => ({ build: 26200, product: 'Windows 11 Pro', activated: true, hasDefender: true, hasMF: true, hasWU: true, hasXbox: true, svcCount: 280, debloated: false, hasUdpGlobal: true }),
      svcDisable: async () => ({ ok: true, done: [], missing: [], blocked: [], prot: [] }),
      svcRestore: async () => ({ ok: true, restored: 0 }),
      healthCheck: async () => ({ ok: true, bad: [], warn: [] }),
      blocklistGet: async () => ({ ok: true, source: 'off', seq: 0, rules: {} }),
      supportBundle: async () => ({ ok: true, path: 'x.zip' })
    }
  };
  global.setInterval = () => 1; global.clearInterval = () => {};
  global.setTimeout = () => 0;   global.clearTimeout = () => {};
  global.confirm = () => true;   global.alert = () => {};
  global.Blob = function () {};  global.URL = { createObjectURL: () => '' };
  global.btoa = s => Buffer.from(s, 'binary').toString('base64');

  try {
    R = new Function(appJs + '\n;return {T,CATS,BULK_EXCLUDE,' +
      'gpuProfile:typeof gpuProfile==="function"?gpuProfile:null,' +
      'pickAutoTweaks:typeof pickAutoTweaks==="function"?pickAutoTweaks:null,' +
      'cpuProfile:typeof cpuProfile==="function"?cpuProfile:null,' +
      'brainSkip:typeof brainSkip==="function"?brainSkip:null,' +
      'brainOnRevert:typeof brainOnRevert==="function"?brainOnRevert:null,' +
      'brainOnApply:typeof brainOnApply==="function"?brainOnApply:null,' +
      'CARD_REQ:typeof CARD_REQ==="object"?CARD_REQ:null,' +
      'cardBlocked:typeof cardBlocked==="function"?cardBlocked:null,' +
      'setOS:function(o){OS=o},setRemote:function(o){REMOTE_REQ=o},' +
      'capFor:typeof capFor==="function"?capFor:null,findHogs:typeof findHogs==="function"?findHogs:null,ramProfile:typeof ramProfile==="function"?ramProfile:null,buildTunePlan:typeof buildTunePlan==="function"?buildTunePlan:null};')();
    ok('app script evaluates');
  } catch (e) { bad('app script threw: ' + e.message.slice(0, 100)); }
}

if (R && Array.isArray(R.T)) {
  const T = R.T, CATS = R.CATS || {};
  ok(`${T.length} tweaks across ${new Set(T.map(t => t.cat)).size} categories`);

  const malformed = T.filter(t => !t || !t.id || !t.cat || !t.name || !Array.isArray(t.apply) ||
    (t.revert !== null && !Array.isArray(t.revert)));
  malformed.length ? bad('malformed cards: ' + malformed.map(t => (t && t.id) || '?').join(', '))
                   : ok('0 malformed cards');

  const ids = T.map(t => t.id);
  const dupes = ids.filter((x, i) => ids.indexOf(x) !== i);
  dupes.length ? bad('duplicate ids: ' + [...new Set(dupes)].join(', ')) : ok('0 duplicate ids');

  const missing = [...new Set(T.map(t => t.cat))].filter(c => !CATS[c]);
  missing.length ? bad('categories missing a CATS label: ' + missing.join(', '))
                 : ok('every category has a CATS label');

  const emptyCmds = T.filter(t => t.apply.some(c => typeof c !== 'string' || !c.trim()));
  emptyCmds.length ? bad('empty/non-string commands in: ' + emptyCmds.map(t => t.id).join(', '))
                   : ok('all commands are non-empty strings');

  head('5. Safety guards');
  const hardcodedDns = T.filter(t => t.apply.concat(t.revert || []).some(c => /netsh[^|]*dns[^|]*"(Ethernet|Wi-Fi|Local Area Connection)"/i.test(c)));
  hardcodedDns.length ? bad('hardcoded adapter name (AGENTS.md §2.5): ' + hardcodedDns.map(t => t.id).join(', '))
                      : ok('no hardcoded network adapter names');

  const experimental = T.filter(t => t.apply.some(c => /autotuninglevel\s*=\s*experimental/i.test(c)));
  experimental.length ? bad('autotuninglevel=experimental (AGENTS.md §9.6): ' + experimental.map(t => t.id).join(', '))
                      : ok('no autotuninglevel=experimental');
}

head('6. GPU tier detection');
if (R && typeof R.gpuProfile === 'function') {
  const cases = [
    ['NVIDIA GeForce RTX 4090', 32, 'nvidia', 'high'],
    ['NVIDIA GeForce RTX 4070', 32, 'nvidia', 'high'],
    ['NVIDIA GeForce RTX 3060', 16, 'nvidia', 'mid'],
    ['NVIDIA GeForce RTX 2060', 16, 'nvidia', 'mid'],
    ['NVIDIA GeForce GTX 1650', 16, 'nvidia', 'low'],
    ['AMD Radeon RX 9070 XT', 32, 'amd', 'high'],
    ['AMD Radeon RX 7900 XTX', 32, 'amd', 'high'],
    ['AMD Radeon RX 7800 XT', 32, 'amd', 'high'],
    ['AMD Radeon RX 7600', 16, 'amd', 'mid'],
    ['AMD Radeon RX 6600', 16, 'amd', 'mid'],
    ['AMD Radeon RX 6500 XT', 16, 'amd', 'low'],
    ['AMD Radeon RX 580', 8, 'amd', 'low'],
    ['AMD Radeon(TM) Graphics', 31, 'amd', 'low'],
    ['Intel(R) Arc(TM) A770 Graphics', 16, 'intel', 'mid'],
    ['Intel(R) UHD Graphics 770', 16, 'intel', 'low']
  ];
  let miss = 0;
  cases.forEach(([gpu, ram, v, tier]) => {
    const r = R.gpuProfile({ gpu, ram });
    if (r.vendor !== v || r.tier !== tier) { miss++; bad(`${gpu} → ${r.vendor}/${r.tier} (expected ${v}/${tier})`); }
  });
  if (!miss) ok(`all ${cases.length} GPU models classified correctly`);
} else console.log('  - gpuProfile() not found, skipped');

head('7. Auto Tune vendor routing');
if (R && typeof R.pickAutoTweaks === 'function' && Array.isArray(R.T)) {
  const find = id => R.T.find(t => t.id === id);
  const nv = R.pickAutoTweaks({ cpu: 'x', gpu: 'NVIDIA GeForce RTX 4070', ram: 32 });
  const am = R.pickAutoTweaks({ cpu: 'x', gpu: 'AMD Radeon RX 6600', ram: 16 });
  const nvOK = nv.ids.some(i => (find(i) || {}).cat === 'nvidia') && !nv.ids.some(i => (find(i) || {}).cat === 'amd');
  const amOK = am.ids.some(i => (find(i) || {}).cat === 'amd') && !am.ids.some(i => (find(i) || {}).cat === 'nvidia');
  nvOK ? ok('NVIDIA machine gets nvidia cards only') : bad('NVIDIA routing wrong');
  amOK ? ok('AMD machine gets amd cards only')       : bad('AMD routing wrong');
} else console.log('  - pickAutoTweaks() not found, skipped');


head('8. CPU tier detection');
if (R && typeof R.cpuProfile === 'function') {
  const cpus = [
    ['AMD Ryzen 9 9800X3D 8-Core Processor', 8, 'amd', 'high'],
    ['AMD Ryzen 7 2700X Eight-Core Processor', 8, 'amd', 'mid'],
    ['AMD Ryzen 5 3600 6-Core Processor', 6, 'amd', 'mid'],
    ['AMD Ryzen 3 3200G', 4, 'amd', 'low'],
    ['Intel(R) Core(TM) i9-14900K', 24, 'intel', 'high'],
    ['Intel(R) Core(TM) i5-12400F', 6, 'intel', 'mid'],
    ['Intel(R) Core(TM) i3-10100', 4, 'intel', 'low'],
    ['Intel(R) Core(TM) i7-6700K', 4, 'intel', 'mid'],
    ['Intel(R) Core(TM) Ultra 9 285K', 24, 'intel', 'high'],
    ['Intel(R) Celeron(R) N4020', 2, 'intel', 'low']
  ];
  let miss = 0;
  cpus.forEach(([cpu, cores, v, tier]) => {
    const r = R.cpuProfile({ cpu, cores });
    if (r.vendor !== v || r.tier !== tier) { miss++; bad(`${cpu} -> ${r.vendor}/${r.tier} (expected ${v}/${tier})`); }
  });
  if (!miss) ok(`all ${cpus.length} CPU models classified correctly`);
} else console.log('  - cpuProfile() not found, skipped');

head('9. Risky cards excluded from Auto Tune');
if (R && typeof R.pickAutoTweaks === 'function' && Array.isArray(R.T)) {
  const risky = R.T.filter(t => t.risky).map(t => t.id);
  const machines = [
    { cpu: 'AMD Ryzen 7 2700X', gpu: 'NVIDIA GeForce GTX 1650', ram: 16, cores: 8, laptop: false },
    { cpu: 'Intel(R) Core(TM) i7-12700H', gpu: 'NVIDIA GeForce RTX 3060 Laptop GPU', ram: 16, cores: 14, laptop: true }
  ];
  let leak = 0;
  machines.forEach(m => { const p = R.pickAutoTweaks(m); risky.forEach(id => { if (p.ids.includes(id)) { leak++; bad(`risky card ${id} leaked into Auto Tune`); } }); });
  if (!leak) ok(`${risky.length} risky card(s) correctly kept out of Auto Tune`);
  const lap = R.pickAutoTweaks(machines[1]);
  lap.ids.includes('cpu_idledisable') ? bad('cpu_idledisable applied on a laptop') : ok('laptop avoids heat-heavy tweaks');
} else console.log('  - skipped');


head('10. Intel hybrid routing');
if (R && typeof R.cpuProfile === 'function' && typeof R.pickAutoTweaks === 'function' && Array.isArray(R.T)) {
  const hyb = [
    ['Intel(R) Core(TM) i7-12700H', true], ['Intel(R) Core(TM) i9-14900K', true],
    ['Intel(R) Core(TM) Ultra 9 285K', true], ['Intel(R) Core(TM) i7-11700K', false],
    ['Intel(R) Core(TM) i7-6700K', false], ['AMD Ryzen 9 9800X3D', false]
  ];
  let miss = 0;
  hyb.forEach(([cpu, want]) => { const r = R.cpuProfile({ cpu, cores: 8 }); if (!!r.hybrid !== want) { miss++; bad(`hybrid flag wrong for ${cpu}`); } });
  if (!miss) ok(`hybrid detection correct on ${hyb.length} CPUs`);

  const intelIds = R.T.filter(t => t.cat === 'intel').map(t => t.id);
  const base = { gpu: 'NVIDIA GeForce RTX 3070', ram: 16, cores: 8, laptop: false };
  const modern = R.pickAutoTweaks({ ...base, cpu: 'Intel(R) Core(TM) i7-12700H' });
  const older  = R.pickAutoTweaks({ ...base, cpu: 'Intel(R) Core(TM) i7-9700K' });
  const ryzen  = R.pickAutoTweaks({ ...base, cpu: 'AMD Ryzen 7 5800X' });
  // 7f2f5cfa is "Heterogeneous policy in effect", not "prefer P-cores". The value
  // we wrote was never verified and a wrong one can send game threads to E-cores,
  // so these two are opt-in -- see AGENTS 9.17.
  modern.ids.includes('intel_pcore')
    ? bad('intel_pcore applied automatically with an unverified value')
    : ok('Intel hybrid scheduling stays opt-in');
  older.ids.includes('intel_pcore')  ? bad('pre-12th-gen Intel wrongly got intel_pcore') : ok('pre-12th-gen Intel skips hybrid scheduling');
  intelIds.some(i => ryzen.ids.includes(i)) ? bad('AMD machine got Intel-only cards') : ok('AMD machine gets no Intel cards');
} else console.log('  - skipped');


head('11. X3D CCD routing');
if (R && typeof R.cpuProfile === 'function' && typeof R.pickAutoTweaks === 'function') {
  const ccdCases = [
    ['AMD Ryzen 9 9950X3D 16-Core Processor', 16, 2, true],
    ['AMD Ryzen 9 9900X3D 12-Core Processor', 12, 2, true],
    ['AMD Ryzen 9 7950X3D 16-Core Processor', 16, 2, true],
    ['AMD Ryzen 7 9800X3D 8-Core Processor', 8, 1, false],
    ['AMD Ryzen 7 7800X3D 8-Core Processor', 8, 1, false],
    ['AMD Ryzen 7 5800X3D 8-Core Processor', 8, 1, false],
    ['AMD Ryzen 9 7950X 16-Core Processor', 16, 2, false]
  ];
  let miss = 0;
  ccdCases.forEach(([cpu, cores, ccd, dual]) => {
    const r = R.cpuProfile({ cpu, cores });
    if (r.ccd !== ccd || !!r.dualCcd !== dual) { miss++; bad(`${cpu} -> ccd=${r.ccd} dual=${r.dualCcd} (expected ${ccd}/${dual})`); }
  });
  if (!miss) ok(`CCD detection correct on ${ccdCases.length} AMD CPUs`);

  const base = { gpu: 'NVIDIA GeForce RTX 4090', ram: 32, laptop: false };
  const dual = R.pickAutoTweaks({ ...base, cpu: 'AMD Ryzen 9 9950X3D', cores: 16 });
  const single = R.pickAutoTweaks({ ...base, cpu: 'AMD Ryzen 7 9800X3D', cores: 8 });
  const intel = R.pickAutoTweaks({ ...base, cpu: 'Intel(R) Core(TM) i9-14900K', cores: 24 });
  dual.ids.includes('amd_x3d_ccd')   ? ok('dual-CCD X3D gets the CCD diagnostic') : bad('dual-CCD X3D missing amd_x3d_ccd');
  single.ids.includes('amd_x3d_ccd') ? bad('single-CCD X3D wrongly got amd_x3d_ccd') : ok('single-CCD X3D skips the CCD diagnostic');
  single.ids.includes('amd_x3d')     ? ok('X3D machines get amd_x3d') : bad('X3D missing amd_x3d');
  intel.ids.includes('amd_x3d')      ? bad('Intel machine got amd_x3d') : ok('Intel machine gets no X3D cards');
} else console.log('  - skipped');

head('12. Diagnostic cards stay out of bulk');
if (R && Array.isArray(R.T) && typeof R.pickAutoTweaks === 'function') {
  const diag = R.T.filter(t => t.diag).map(t => t.id);
  const plain = R.pickAutoTweaks({ cpu: 'Intel(R) Core(TM) i5-12400F', gpu: 'NVIDIA GeForce RTX 3060', ram: 16, cores: 6, laptop: false });
  const leaked = diag.filter(id => plain.ids.includes(id));
  leaked.length ? bad('diagnostic cards leaked onto an unrelated machine: ' + leaked.join(', '))
                : ok(`${diag.length} diagnostic card(s) correctly spec-gated`);
} else console.log('  - skipped');


head('13. Learning brain');
if (R && typeof R.brainSkip === 'function' && typeof R.brainOnRevert === 'function' && typeof R.pickAutoTweaks === 'function') {
  const sys = { cpu: 'AMD Ryzen 7 7800X3D', gpu: 'NVIDIA GeForce RTX 4070', ram: 32, cores: 8, laptop: false };
  const before = R.pickAutoTweaks(sys).ids;
  const victim = before.find(id => id !== 'amd_x3d' && id !== 'cpu_latency_tune');
  R.brainOnRevert(victim); R.brainOnRevert(victim);
  R.brainSkip(victim) ? ok('two reverts mark a tweak as declined') : bad('revert count not tracked');
  const after = R.pickAutoTweaks(sys).ids;
  after.includes(victim) ? bad(`declined tweak ${victim} still offered by Auto Tune`)
                         : ok('Auto Tune stops offering a declined tweak');
  R.brainOnApply('hwsched', true); R.brainOnApply('hwsched', true);
  R.brainSkip('hwsched') ? bad('a succeeding tweak was wrongly skipped') : ok('succeeding tweaks are never skipped');
} else console.log('  - brain functions not found, skipped');


head('14. Cards that change things must be undoable');
if (R && Array.isArray(R.T)) {
  // การ์ดที่เขียนค่าถาวร ต้องมี revert  ยกเว้นหมวด repair/clean ซึ่งเป็นการซ่อม
  const WRITES = /reg add|Set-ItemProperty|New-ItemProperty|secedit|bcdedit \/set|Add-MpPreference|schtasks \/Change/i;
  const EXEMPT = new Set(['repair', 'clean']);
  const bad = R.T.filter(t => !t.revert && !EXEMPT.has(t.cat) && WRITES.test((t.apply || []).join(' ')));
  bad.length
    ? bad.forEach(t => bad(`${t.id} makes a permanent change without revert`))
    : ok('every non-repair card that writes settings can be reverted');

  // การ์ด risky ต้องมี revert เสมอ  ผู้ใช้ต้องถอยได้
  const risky = R.T.filter(t => t.risky && !t.revert);
  risky.length
    ? risky.forEach(t => bad(`risky card ${t.id} has no revert`))
    : ok('every risky card can be reverted');
}

head('15. Settings that a user has measured');
if (R && typeof R.pickAutoTweaks === 'function') {
  const base = { gpu: 'NVIDIA GeForce RTX 4090', ram: 32, laptop: false };
  const dual = R.pickAutoTweaks({ ...base, cpu: 'AMD Ryzen 9 9950X3D', cores: 16 }).ids;
  const single = R.pickAutoTweaks({ ...base, cpu: 'AMD Ryzen 7 9800X3D', cores: 8 }).ids;
  const plain = R.pickAutoTweaks({ ...base, cpu: 'Intel(R) Core(TM) i5-12400F', cores: 6 }).ids;

  // Removing these two on 9950X3D shipped with a measured 200 -> ~100 fps loss.
  // Both are back in for every CPU and must stay in until someone benchmarks
  // an alternative -- see AGENTS 9.14 / 9.15.
  (dual.includes('coreparking') && single.includes('coreparking'))
    ? ok('core parking is disabled on every X3D part')
    : bad('an X3D part lost Disable Core Parking -- this cost measured FPS before');
  (dual.includes('win32prio') && plain.includes('win32prio'))
    ? ok('Win32PrioritySeparation applied on every core count')
    : bad('Win32PrioritySeparation skipped somewhere without evidence');
}

head('16. "Nothing to do" is not a failure');
{
  // reg delete on an absent key, net stop on a stopped service and taskkill on an
  // absent process all exit non-zero. On a machine that was never tuned this used
  // to mark working tweaks as failed, so the dashboard percentage never moved.
  const src = readApp();
  const paths = src.match(/const benign =/g) || [];
  paths.length >= 2
    ? ok(`benign-exit handling present in both apply paths (${paths.length})`)
    : bad(`benign-exit handling missing from one apply path (found ${paths.length}, need 2)`);

  const samples = [
    'ERROR: The system was unable to find the specified registry key or value.',
    'The service is not started.',
    'ERROR: The process "x.exe" not found.',
    'ERROR: The system cannot find the file specified.',
    ''
  ];
  const re = /unable to find|cannot find|not found|is not started|The system cannot find|ERROR: The process/i;
  const missed = samples.filter(t => !(re.test(t) || /^\s*$/.test(t)));
  missed.length
    ? missed.forEach(t => bad(`benign output not recognised: ${JSON.stringify(t.slice(0, 40))}`))
    : ok('all common "nothing to do" outputs are treated as success');
}

head('17. Values known to break other software');
if (R && Array.isArray(R.T)) {
  // SystemResponsiveness = 0 leaves no guaranteed CPU for non-multimedia work.
  // steamwebhelper then misses its startup timeout and Steam exits silently --
  // no crash, no event log. Windows default is 20. See AGENTS 9.19.
  const zero = R.T.filter(t => /SystemResponsiveness[^0-9]*\/d 0\b/.test((t.apply || []).join(' ')));
  zero.length
    ? zero.forEach(t => bad(`${t.id} sets SystemResponsiveness=0, which stops Steam launching`))
    : ok('no card sets SystemResponsiveness to 0');

  // whatever a card sets, its revert must restore the Windows default
  ['sysresp', 'mmcss'].forEach(id => {
    const t = R.T.find(x => x.id === id);
    if (!t) return;
    /SystemResponsiveness[^0-9]*\/d 20\b/.test((t.revert || []).join(' '))
      ? ok(`${id} reverts SystemResponsiveness to the Windows default (20)`)
      : bad(`${id} does not restore SystemResponsiveness to 20`);
  });
}

head('18. Proving the work actually landed');
{
  const M = fs.readFileSync(path.join(ROOT, 'main.js'), 'utf8');
  const H = readApp();

  // A command reporting success is not proof the value is in the registry --
  // policy or another tool can overwrite it immediately. Read it back.
  M.includes("ipcMain.handle('is-admin'")
    ? ok('runtime admin check exists, not just the manifest')
    : bad('no runtime admin check -- HKLM writes can fail silently');
  /IsInRole/.test(M) && /New-ItemProperty[^\n]*_probe/.test(M)
    ? ok('admin check proves an actual HKLM write, not just group membership')
    : bad('admin check does not prove write access');
  H.includes('checkAdmin()')
    ? ok('admin state reported at startup')
    : bad('admin state never surfaced to the user');
  (H.match(/if\(VERBOSE\)/g) || []).length >= 2
    ? ok('raw Windows output available in both apply paths')
    : bad('verbose output missing from one apply path');
  H.includes('id="logVerbose"')
    ? ok('user can toggle full output')
    : bad('no way to see what Windows actually replied');
}

head('19. Bulk revert must not poison the brain');
{
  const H = readApp();
  // revertAll loops revertTweak. If that counts as the user rejecting each tweak,
  // two presses of Revert All make the brain decline everything and Auto Tune
  // drops to a handful of cards -- reported as "5%".
  /revertTweak\(ids\[i\], true\)/.test(H)
    ? ok('revertAll marks its reverts as bulk')
    : bad('revertAll counts every card as a user rejection');
  /if\(!bulk\) brainOnRevert/.test(H)
    ? ok('brain ignores bulk reverts')
    : bad('brain still records bulk reverts as rejections');

  // a card whose verify expects a value the card no longer writes reports a
  // permanent false failure
  const T2 = R && R.T ? R.T : [];
  const stale = T2.filter(t => {
    if (!t.verify) return false;
    const m = (t.apply || []).join(' ').match(/SystemResponsiveness[^0-9]*\/d (\d+)/);
    if (!m) return false;
    return parseInt(t.verify.expect, 16) !== parseInt(m[1], 10);
  });
  stale.length
    ? stale.forEach(t => bad(`${t.id} verify expects ${t.verify.expect} but the card writes a different value`))
    : ok('no card verifies against a value it no longer writes');

  H.includes('OPPOSITES')
    ? ok('cards that write opposite values cancel each other in the UI')
    : bad('two opposite cards can both show as applied');
}

head('20. Two cards must not fight over one registry value');
if (R && Array.isArray(R.T)) {
  // A registry value holds one value. If two cards write different values to the
  // same one, both can still show as applied while only the last one survived --
  // the dashboard percentage and the Restore page then both lie.
  const RX = /reg add\s+"([^"]+)"\s+\/v\s+("([^"]+)"|(\S+))(?:[^\n]*?\/d\s+("[^"]*"|\S+))?/gi;
  const writes = {};
  R.T.forEach(t => {
    const seen = new Set();
    (t.apply || []).forEach(c => {
      let m; RX.lastIndex = 0;
      while ((m = RX.exec(c))) {
        const key = (m[1] + '\\' + (m[3] || m[4])).toLowerCase();
        const val = (m[5] || '?').replace(/"/g, '');
        const sig = t.id + '=' + val;
        if (seen.has(sig)) continue;
        seen.add(sig);
        (writes[key] = writes[key] || []).push({ id: t.id, val, excl: t.excl });
      }
    });
  });

  let conflicts = 0, dupes = 0;
  Object.entries(writes).forEach(([key, list]) => {
    const ids = [...new Set(list.map(x => x.id))];
    if (ids.length < 2) return;
    const vals = new Set(list.map(x => x.val));
    const short = key.split('\\').slice(-2).join('\\');
    if (vals.size > 1) {
      // different values -> they cancel each other, must declare the same excl group
      const groups = new Set(list.map(x => x.excl || null));
      if (groups.size === 1 && !groups.has(null)) {
        ok(`${short}: ${ids.join(' / ')} conflict but share excl group`);
      } else {
        bad(`${short}: ${ids.join(' / ')} write different values with no shared excl group`);
        conflicts++;
      }
    } else {
      dupes++;
    }
  });
  conflicts === 0 && ok('no card silently overwrites another card\'s value');
  dupes && ok(`${dupes} value(s) written by more than one card with the same value (harmless, but redundant)`);
}

head('21. Works on every Windows, not just this one');
{
  const M = fs.readFileSync(path.join(ROOT, 'main.js'), 'utf8');
  const H = readApp();

  // Disabling a service that something else depends on breaks that thing
  // silently -- the user then hunts a mystery for days.
  M.includes("ipcMain.handle('svc-disable'") && /DependentServices/.test(M)
    ? ok('services are disabled only after checking what depends on them')
    : bad('services disabled without a dependency check');
  /SVC_PROTECTED/.test(M) && /RpcSs/.test(M) && /DcomLaunch/.test(M) && /AppInfo/.test(M)
    ? ok('a protected list keeps load-bearing services from ever being touched')
    : bad('no protected service list');
  H.includes('CARD_SERVICES')
    ? ok('service cards route through the safe path')
    : bad('some card still shells out to sc config directly');

  // A value that does not exist on this build fails with a confusing error
  M.includes("ipcMain.handle('os-profile'")
    ? ok('build, edition, activation and debloat state are read at startup')
    : bad('no OS profiling');
  H.includes('CARD_REQ') && H.includes('cardBlocked')
    ? ok('cards unsupported on this build are skipped with a reason')
    : bad('no per-card Windows requirement check');

  // Catch breakage immediately instead of letting the user discover it later
  M.includes("ipcMain.handle('health-check'")
    ? ok('system health is checked after tuning')
    : bad('no post-tune health check');
  (H.match(/await runHealthCheck\(\)/g) || []).length >= 2
    ? ok('health check runs after every bulk operation')
    : bad('a bulk operation finishes without a health check');
}

head('22. Validator stub must keep up with preload');
{
  // Three times now a new preload API has been added without updating the stub,
  // and the whole validator crashed instead of reporting anything useful.
  const pre = fs.readFileSync(path.join(ROOT, 'src', 'preload.js'), 'utf8');
  const self = fs.readFileSync(__filename, 'utf8');
  const apis = [...pre.matchAll(/^\s*([A-Za-z0-9_]+)\s*:/gm)].map(m => m[1])
    .filter(n => n !== 'isDesktop');
  const missing = apis.filter(a => !new RegExp('\\b' + a + '\\s*:').test(self));
  missing.length
    ? missing.forEach(a => bad(`stub is missing ${a}() -- add it to the boost stub in this file`))
    : ok(`stub covers all ${apis.length} preload APIs`);
}

head('23. Reboot state must survive and be visible');
{
  const H = readApp();

  // Real case: 81 tweaks reverted without a reboot left HwSchMode in the registry
  // out of step with the loaded driver, and Steam's CEF could not draw its window.
  // steam.exe ran with no window and no error anywhere. Warning on revert matters
  // as much as warning on apply.
  (H.match(/markPendingReboot\(/g) || []).length >= 5
    ? ok('reboot state recorded on apply, revert and every bulk path')
    : bad('some path changes reboot-sensitive values without recording it');
  /applied\.delete\(id\);\s*persist\(\);\s*\n\s*markPendingReboot/.test(H)
    ? ok('revert warns about reboot -- the case that actually broke Steam')
    : bad('revert does not warn about reboot');
  H.includes('REBOOT_KEY') && H.includes("store.get(REBOOT_KEY")
    ? ok('pending reboot persists across app restarts')
    : bad('pending reboot is lost when the app closes');
  H.includes('gaugeNote')
    ? ok('the percentage says when it is not yet real')
    : bad('percentage claims success before the reboot that makes it true');

  // A brain that has learned to refuse everything looks like a broken app
  /skipped\.length >= 20/.test(H)
    ? ok('warns when the brain has blocked an unusual number of tweaks')
    : bad('no warning when Auto Tune is starved by the brain');

  if (R && Array.isArray(R.T)) {
    const diag = R.T.find(t => t.id === 'rep_diagnose');
    if (!diag) bad('no card diagnoses why a program will not launch');
    else {
      const c = (diag.apply || []).join(' ');
      /reg add|Set-ItemProperty|New-ItemProperty|sc config/.test(c)
        ? bad('the diagnostic card changes settings -- it must only read')
        : ok('diagnostic card is read-only');
      ['SystemResponsiveness', 'Debugger', 'msvcp140_1', 'mfplat', 'LetAppsRunInBackground']
        .every(k => c.includes(k))
        ? ok('diagnostic covers every cause seen in the field')
        : bad('diagnostic is missing a known cause');
    }
  }
}

head('24. Every helper a handler calls must exist');
{
  const M = fs.readFileSync(path.join(ROOT, 'main.js'), 'utf8');
  // Handlers were ported from the other app without their helper. Every call
  // threw ReferenceError the first time a user pressed the button.
  const calls = [...M.matchAll(/\b([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g)].map(m => m[1]);
  const helpers = ['runPs', 'psJson'];
  helpers.forEach(h => {
    if (!calls.includes(h)) return;
    new RegExp('function\\s+' + h + '\\s*\\(').test(M)
      ? ok(h + ' is defined where it is called')
      : bad(h + '() is called but never defined -- every handler using it throws');
  });
}

head('25. Generated PowerShell is ASCII with a BOM');
{
  // Thai text in a .ps1 breaks on machines whose console code page is not UTF-8.
  // Comments count too. This has slipped through three times because only the
  // JS was inspected, never the script it produces. So produce them and look.
  const H = {};
  const files = {};
  const Module = require('module');
  const origResolve = Module._resolveFilename;
  Module._resolveFilename = function (r, ...a) { return r === 'electron' ? 'ES' : origResolve.call(this, r, ...a); };
  const realWrite = fs.writeFileSync;
  fs.writeFileSync = function (f, d) {
    const n = path.basename(String(f));
    if (n.endsWith('.ps1')) { files[n] = String(d); return; }
    return realWrite.apply(fs, arguments);
  };
  const win = () => ({ loadFile(){}, loadURL(){}, on(){}, webContents:{ on(){}, send(){}, setWindowOpenHandler(){} }, setMenu(){}, isDestroyed:()=>false, show(){}, focus(){}, close(){}, setAlwaysOnTop(){}, setIgnoreMouseEvents(){}, setBounds(){}, destroy(){}, hide(){} });
  require.cache['ES'] = { id:'ES', exports:{ app:{ whenReady:()=>({then:()=>{}}), on(){}, getPath:()=>'/tmp' }, BrowserWindow:Object.assign(function(){ return win(); }, { getAllWindows:()=>[] }), ipcMain:{ handle:(n,f)=>{ H[n]=f; } }, shell:{ openExternal(){} }, screen:{ getPrimaryDisplay:()=>({ workAreaSize:{width:1920,height:1080}, bounds:{width:1920,height:1080} }) } }, loaded:true };
  const cp = require('child_process');
  const o1 = cp.spawn, o2 = cp.execFile, o3 = cp.exec;
  cp.spawn = () => ({ stdout:{on(){}}, stderr:{on(){}}, on(){}, kill(){}, killed:false });
  cp.execFile = () => {}; cp.exec = () => {};
  try { delete require.cache[require.resolve(path.join(ROOT,'main.js'))]; require(path.join(ROOT, 'main.js')); } catch (e) {}
  const ARG = { 'svc-disable':{names:['X']}, 'svc-restore':{names:['X']}, 'nic-tune':{only:'all',groups:['lat']}, 'nic-reset':{only:'all'}, 'run-batch':['echo'], 'run-cmd':'echo', 'quick-ping':'1.1.1.1', 'restore-point':'T', 'timer-res':true, 'license-call':{key:'X',hwid:'y'}, 'startup-toggle':{name:'x',on:true}, 'discord-set':{state:'x'}, 'open-link':'discord' };
  Object.keys(H).forEach(h => { try { H[h](null, h in ARG ? ARG[h] : undefined); } catch (e) {} });
  fs.writeFileSync = realWrite; cp.spawn = o1; cp.execFile = o2; cp.exec = o3;
  Module._resolveFilename = origResolve;
  global.__GEN_PS = files;   // reused by section 40 (real parser)
  const names = Object.keys(files);
  let broken = 0;
  names.forEach(n => {
    const d = files[n];
    const nonAscii = [...d].filter(c => c.charCodeAt(0) > 127 && c.charCodeAt(0) !== 0xFEFF).length;
    const bom = d.charCodeAt(0) === 0xFEFF;
    const balanced = (d.match(/\(/g)||[]).length === (d.match(/\)/g)||[]).length && (d.match(/\{/g)||[]).length === (d.match(/\}/g)||[]).length;
    if (nonAscii || !bom || !balanced || /@@/.test(d)) {
      broken++;
      bad(`${n}: ${nonAscii ? nonAscii + ' non-ASCII chars ' : ''}${bom ? '' : 'no BOM '}${balanced ? '' : 'unbalanced brackets '}${/@@/.test(d) ? 'placeholder left' : ''}`.trim());
    }
  });
  broken === 0 && names.length > 0 ? ok(`${names.length} generated scripts are ASCII, have a BOM, and balance`) : (names.length === 0 && bad('no scripts were generated -- harness is broken'));
}

head('26. PowerShell in cards runs on every machine');
if (R && Array.isArray(R.T)) {
  // Without -ExecutionPolicy Bypass the command is blocked silently on any
  // machine whose policy is Restricted -- which is the default on many.
  let all = 0; const bad2 = [];
  R.T.forEach(t => (t.apply || []).concat(t.revert || []).forEach(c => {
    if (!/powershell/i.test(c)) return; all++;
    if (!/-ExecutionPolicy\s+Bypass/i.test(c) || !/-NoProfile/i.test(c)) bad2.push(t.id);
  }));
  bad2.length
    ? [...new Set(bad2)].forEach(id => bad(`${id} runs powershell without -ExecutionPolicy Bypass or -NoProfile`))
    : ok(`${all} powershell commands in cards carry -NoProfile -ExecutionPolicy Bypass`);
}

head('27. Running through Parsec must not drop the session mid-run');
{
  const H = readApp();
  const M = fs.readFileSync(path.join(ROOT, 'main.js'), 'utf8');
  M.includes('remoteSession') && M.includes('viaParsec') ? ok('remote session and Parsec are detected') : bad('no remote detection');
  H.includes('orderForRemote') ? ok('session-dropping cards are deferred to the end') : bad('no remote-aware ordering');
  if (R && Array.isArray(R.T)) {
    const nb = R.T.filter(t => /Disable-NetAdapterRsc|Restart-NetAdapter|Disable-NetAdapter\b/.test((t.apply||[]).join(' ')) && inBulk(t));
    nb.length ? nb.forEach(t => bad(t.id + ' bounces the NIC inside bulk -- Parsec drops for certain')) : ok('no bulk card bounces the NIC');
    const flagged = R.T.filter(t => t.remote).length;
    flagged >= 4 ? ok(flagged + ' cards flagged remote') : bad('session-dropping cards are not flagged');
  }
}

head('28. gaugeNote must not sit between the number and the % sign');
{
  const H = readApp();
  // A block element inserted inside .gauge-num pushed the % onto its own line
  // and out of the ring. The note belongs after the TUNED label.
  /<div class="gauge-num"><span id="gaugeNum">[^<]*<\/span><span class="pct">%<\/span><\/div>/.test(H)
    ? ok('number and % share one line')
    : bad('something is inserted between gaugeNum and .pct');
  /gauge-lbl">TUNED<\/div>\s*<div id="gaugeNote"/.test(H)
    ? ok('gaugeNote sits below TUNED')
    : bad('gaugeNote is not below the label');
}

head('29. Reboot state clears itself after an actual reboot');
{
  const H = readApp();
  const M = fs.readFileSync(path.join(ROOT, 'main.js'), 'utf8');
  // The bar only cleared when the user pressed the app's own restart button.
  // Restarting from the Start menu left it stuck after every reboot.
  M.includes('lastBoot') ? ok('os-profile reports LastBootUpTime') : bad('boot time is not read');
  H.includes('REBOOT_AT_KEY') ? ok('pending-reboot records when it was set') : bad('no timestamp on pending reboot');
  H.includes('function clearRebootIfBooted') && /new Date\(boot\) > new Date\(at\)/.test(H)
    ? ok('pending reboot is cleared when boot time is newer than the record')
    : bad('reboot state never self-clears');
  /clearRebootIfBooted\(\);\s*refreshRebootBar\(\);\s*syncStateFromRegistry/.test(H)
    ? ok('startup order: clear-if-booted -> show bar -> sync registry')
    : bad('startup order is wrong -- bar may flash or show stale state');
}

head('30. Cyber HUD UI: default, variants, offline fonts, motion budget');
{
  // Oct 2026: Cyber HUD 3D replaced the instrument panel. These checks keep it
  // coherent and make sure its animation never costs FPS while a game runs.
  const H = fs.readFileSync(path.join(ROOT, 'src', 'index.html'), 'utf8');
  /localStorage\.getItem\('gb_theme3'\)\|\|'laser'/.test(H) ? ok('laser is the first-run default') : bad('default theme is not laser');
  const m = H.match(/const THEMES=\{([\s\S]*?)\n\};/);
  const keys = m ? [...m[1].matchAll(/^\s*([a-z0-9]+):\{name:/gm)].map(x => x[1]) : [];
  keys.length === 3 && keys[0] === 'laser' ? ok('three variants, laser first: ' + keys.join(', ')) : bad('THEMES should be laser + two variants, got ' + keys.join(','));
  keys.filter(k => k !== 'laser').every(k => new RegExp('\\[data-theme="' + k + '"\\]\\{[^}]*--laser:').test(H)) ? ok('every variant redefines the accent') : bad('a variant has no --laser override');
  !/\[data-theme="(softsakura|panel|phosphor|neon|pixel)"\]/.test(H) ? ok('older theme CSS removed') : bad('old theme CSS is still present');
  !/fonts\.googleapis/.test(H) ? ok('no Google Fonts request (works offline)') : bad('UI still loads fonts from the internet');
  ["'Oxanium'", "'Rajdhani'", "'IBM Plex Sans Thai'"].every(f => H.includes("@font-face{font-family:" + f)) ? ok('display, label and Thai fonts are embedded') : bad('an embedded font is missing');
  /id="gaugeFill" d="M0 6 H257\.6"[^>]*stroke-dasharray="257\.6"/.test(H) && H.includes('const CIRC = 257.6') ? ok('energy bar length matches CIRC') : bad('energy bar length no longer matches CIRC');
  /setProperty\('--tuned', pct\)/.test(H) ? ok('reactor ring follows the tuned %') : bad('reactor ring is not driven by the gauge');
  /html\.idle \*[^{]*\{animation-play-state:paused!important\}/.test(H) && /classList\.toggle\('idle',[^)]*document\.hidden[^;]*hasFocus\(\)\)/.test(H)
    ? ok('all animation pauses when the window is not focused (no FPS cost in game)') : bad('animations keep running in the background');
  !/color-mix\(/.test(H) ? ok('no CSS that Electron 22 (Win7/8 build) cannot draw') : bad('color-mix() breaks the legacy build');
}

head('31. Input queues must never be shrunk below the Windows default');
if (R && Array.isArray(R.T)) {
  // A tweak-guide myth: shrinking KeyboardDataQueueSize / MouseDataQueueSize
  // supposedly lowers latency. The queue is a ring buffer, not a delay -- it
  // adds nothing when it is not full. Shrinking it only means keystrokes and
  // mouse events are dropped when the machine is busy, which the user hit as
  // "some keys do not register" while gaming and streaming.
  const low = [];
  R.T.forEach(t => (t.apply || []).forEach(c => {
    const m = c.match(/(Keyboard|Mouse)DataQueueSize[^0-9]*\/d (\d+)/);
    if (m && +m[2] < 100) low.push(`${t.id} sets ${m[1]}DataQueueSize to ${m[2]}`);
  }));
  low.length
    ? low.forEach(x => bad(x + ' -- below the Windows default of 100, input will be dropped'))
    : ok('no card shrinks the keyboard or mouse input queue');
}

head('32. BBR2 must never be applied on Windows 11 24H2+ (build 26100+)');
if (R && Array.isArray(R.T)) {
  // Real case (Oct 2026, build 26200): Auto Tune set the internet TCP template
  // to BBR2. On 24H2+ BBR2 stalls same-host TCP (connect succeeds, no data
  // flows). steam.exe hung right after "Console Log Start", webhelper ran with
  // no window. GPU off / htmlcache / Medal / FontCache tests all changed
  // nothing; switching back to CTCP fixed it instantly with no reboot.
  const bbr = R.T.find(t => t.id === 'net_bbr');
  if (!bbr) ok('no BBR2 card');
  else {
    if (R.cardBlocked && R.setOS) {
      R.setOS({ build: 26200 });
      R.cardBlocked('net_bbr') ? ok('cardBlocked stops net_bbr on build 26200') : bad('net_bbr is NOT blocked on build 26200 -- Steam will hang');
      R.setOS({ build: 26100 });
      R.cardBlocked('net_bbr') ? ok('cardBlocked stops net_bbr on build 26100') : bad('net_bbr is NOT blocked on build 26100');
      R.setOS({ build: 22631 });
      !R.cardBlocked('net_bbr') ? ok('net_bbr still allowed on 23H2 (22631)') : bad('net_bbr wrongly blocked on 22631');
      R.setOS({});
    } else bad('validator cannot reach cardBlocked/setOS');
    const a = (bbr.apply || []).join(' ');
    /CurrentBuild/.test(a) && /26100/.test(a)
      ? ok('net_bbr script checks the build itself (works even if OS profile failed to load)')
      : bad('net_bbr script has no build guard of its own');
  }
  const fix = R.T.find(t => t.id === 'rep_steamfix');
  fix && /congestionprovider=ctcp/.test((fix.apply || []).join(' ')) && /bbr/.test((fix.apply || []).join(' '))
    ? ok('Steam repair switches BBR back to CTCP')
    : bad('Steam repair does not undo BBR2');
}

head('33. Every sidebar page has a title entry');
if (R && R.CATS) {
  // startup and powerplan were in the sidebar but not in CATS: nav() threw on
  // CATS[page].t before rendering, so both pages opened blank.
  const H = readApp();
  const navs = [...new Set([...H.matchAll(/class="nav[^"]*" data-nav="([a-z0-9]+)"/g)].map(m => m[1]))];
  const miss = navs.filter(n => !R.CATS[n]);
  miss.length ? miss.forEach(n => bad(`sidebar page "${n}" has no CATS entry -- the page cannot open`))
              : ok(`all ${navs.length} sidebar pages have a title`);
}

head('34. Shared card core is wired in everywhere');
{
  // Cards moved out of index.html into src/cards.js (Oct 2026). If a build
  // script forgets to copy it the .exe opens with zero cards.
  const H = fs.readFileSync(path.join(ROOT, 'src', 'index.html'), 'utf8');
  const i = H.indexOf('<script src="cards.js"></script>'), j = H.indexOf('<script>');
  i > -1 && i < j ? ok('index.html loads cards.js before the app script') : bad('cards.js is not loaded before the app script');
  !/^const T = \[/m.test(H) ? ok('no second card list left inside index.html') : bad('index.html still defines its own T');
  for (const f of ['BUILD.bat', 'BUILD_LEGACY.bat']) {
    if (!fs.existsSync(p(f))) continue;
    /copy \/y "%~dp0src\\cards\.js"/.test(fs.readFileSync(p(f), 'utf8')) ? ok(f + ' copies src/cards.js') : bad(f + ' does not copy src/cards.js -- the exe would have no cards');
  }
  /\b(document|window|localStorage)\./.test(CARDS_JS.replace(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`[^`]*`/g, '').replace(/\/\*[\s\S]*?\*\//g, '')) ? bad('cards.js touches the DOM -- it must stay pure data') : ok('cards.js is pure data');
}

head('35. Remote blocklist is signed and actually used');
{
  const M = fs.readFileSync(p('main.js'), 'utf8'), H = readApp();
  /crypto'\)\.verify\(null,/.test(M) && /BLOCKLIST_PUBKEY = '[A-Za-z0-9+\/=]{40,}'/.test(M) ? ok('main.js verifies an Ed25519 signature') : bad('blocklist is not signature-checked');
  /fresh\.seq >= cached\.seq/.test(M) ? ok('older blocklists cannot roll back a newer one') : bad('no rollback protection');
  !/PRIVATE KEY/.test(M + H + fs.readFileSync(p('src/preload.js'), 'utf8')) ? ok('no private key inside the app') : bad('a PRIVATE KEY is inside the app -- anyone could sign blocklists');
  if (R && R.setRemote && R.cardBlocked) {
    R.setOS({ build: 22631 }); R.setRemote({ cpu_x: { all: true, why: 'test' }, hwsched: { maxBuild: 22000, why: 'remote' } });
    R.cardBlocked('cpu_x') === 'test' ? ok('remote "all" rule blocks a card') : bad('remote all-rule ignored');
    R.cardBlocked('hwsched') === 'remote' ? ok('remote build rule overrides the built-in one') : bad('remote build rule ignored');
    R.setRemote({}); R.setOS({});
  } else bad('validator cannot reach setRemote');
  /loadBlocklist\(\)/.test(H.replace('async function loadBlocklist()', '')) ? ok('blocklist is loaded at startup') : bad('loadBlocklist is never called');
}

head('36. Every startup loader is actually called');
{
  // loadGpuCaps existed but was never called: DLSS / Frame Gen detection and the
  // GPU cards in Auto Tune silently never ran.
  const H = fs.readFileSync(path.join(ROOT, 'src', 'index.html'), 'utf8');
  const loaders = [...H.matchAll(/async function (load[A-Z]\w*)\(/g)].map(m => m[1]);
  const dead = loaders.filter(n => (H.match(new RegExp('\\b' + n + '\\(', 'g')) || []).length < 2);
  dead.length ? dead.forEach(n => bad(n + '() is defined but never called')) : ok(loaders.length + ' loaders, all called');
}

head('37. Support bundle collects without leaking');
{
  const M = fs.readFileSync(p('main.js'), 'utf8');
  const a = M.indexOf('const SUPPORT_PS = `'), b = M.indexOf("`\nipcMain.handle('support-bundle'");
  if (a < 0 || b < 0) bad('support bundle handler missing');
  else {
    const ps = M.slice(a, b);
    /console_log\.txt/.test(ps) && /bootstrap_log/.test(ps) ? ok('Steam logs are included (console_log first, see AGENTS 9.12)') : bad('Steam logs missing from the bundle');
    /congestion|supplemental/.test(ps) && /Image File Execution Options/.test(ps) ? ok('TCP congestion provider and IFEO are included') : bad('bundle misses BBR / IFEO state');
    !/Chrome\\User Data|Login Data|Cookies|\\Documents|Downloads/i.test(ps) ? ok('no browser profiles, documents or downloads are collected') : bad('bundle reaches into private user data');
    /-Tail \d+/.test(ps) ? ok('logs are tail-limited') : bad('logs are copied whole');
  }
  /id="supportBtn"/.test(fs.readFileSync(path.join(ROOT, 'src', 'index.html'), 'utf8')) ? ok('button is in the UI') : bad('no support button in the UI');
}

head('38. Pre-game check: frame cap, background hogs, XMP');
if (R && R.capFor && R.findHogs && R.ramProfile) {
  R.capFor(144) === 141 && R.capFor(240) === 237 && R.capFor(60) === 60 ? ok('frame cap = refresh - 3 (60Hz stays 60)') : bad('frame cap math is wrong');
  const h = R.findHogs([{ name: 'Ld9BoxHeadless', ram: 900 }, { name: 'steam' }, { name: 'wallpaper64' }, { name: 'MedalEncoder' }, { name: 'obs64' }]);
  const names = h.map(x => x.name).join(',');
  names === 'Ld9BoxHeadless,wallpaper64,MedalEncoder,obs64' ? ok('hogs found: ' + names) : bad('hog detection wrong: ' + names);
  h.find(x => x.name === 'obs64').kill === false ? ok('OBS is warned about, never auto-closed') : bad('OBS would be closed -- it may be streaming');
  !R.findHogs([{ name: 'steam' }, { name: 'Discord' }, { name: 'FiveM' }]).length ? ok('normal apps are not flagged') : bad('a normal app is flagged as a hog');
  const d4 = R.ramProfile({ ram: 16, ramSticks: 2, ramSpeed: 2133, ramRated: 2133, ramType: 26, ramSizes: '8,8', laptop: false });
  d4.maybeJedec ? ok('desktop DDR4 at 2133 gets the XMP hint (SPD reported JEDEC only)') : bad('DDR4 2133 desktop not flagged');
  !R.ramProfile({ ram: 16, ramSticks: 2, ramSpeed: 2133, ramRated: 2133, ramType: 26, ramSizes: '8,8', laptop: true }).maybeJedec ? ok('laptops are not nagged (RAM is usually soldered)') : bad('laptop flagged for XMP');
  !R.ramProfile({ ram: 32, ramSticks: 2, ramSpeed: 3200, ramRated: 3200, ramType: 26, ramSizes: '16,16', laptop: false }).maybeJedec ? ok('DDR4 3200 is fine') : bad('DDR4 3200 flagged');
  R.ramProfile({ ram: 32, ramSticks: 2, ramSpeed: 4800, ramRated: 4800, ramType: 34, ramSizes: '16,16', laptop: false }).maybeJedec ? ok('DDR5 at 4800 gets the EXPO hint') : bad('DDR5 4800 not flagged');
  const H = fs.readFileSync(path.join(ROOT, 'src', 'index.html'), 'utf8');
  (H.match(/closest\('\[data-kill\]'\)/g) || []).length === 1 && /data-hogkill/.test(H) ? ok('hog "close" buttons do not steal Top Processes clicks') : bad('data-kill handler collision');
} else bad('validator cannot reach capFor/findHogs/ramProfile');

head('39. Auto Tune: plan, no excl pairs, always finishes');
{
  const H = fs.readFileSync(path.join(ROOT, 'src', 'index.html'), 'utf8');
  const at = (H.match(/async function autoTune\(\)\{[\s\S]*?\n\}/) || [''])[0];
  // the old body used `todo` from another function, threw after applying, and
  // left the button stuck, the reboot flag unset and the health check unrun
  !/\btodo\b/.test(at) ? ok('autoTune uses no variable from another function') : bad('autoTune references `todo` again');
  /finally\s*\{[\s\S]*markPendingReboot[\s\S]*runHealthCheck[\s\S]*atBusy=false/.test(at) ? ok('reboot flag, health check and button reset sit in finally') : bad('a post-apply step is outside finally');
  /await bootReady\(\)/.test(at) ? ok('waits for OS, GPU, blocklist and specs before picking') : bad('Auto Tune can pick before the machine is read');
  /showPlan\(/.test(at) ? ok('shows the plan and waits for confirmation') : bad('no plan confirmation');
  if (R && R.pickAutoTweaks && R.buildTunePlan) {
    const sys = { cpu: 'Intel Core i5-14400F', gpu: 'NVIDIA GeForce RTX 5060 Ti', ram: 32, cores: 10, threads: 16, ramSticks: 2, ramSpeed: 3200, ramRated: 3200, ramType: 26, ramSizes: '16,16' };
    const ids = R.pickAutoTweaks(sys).ids;
    const groups = {};
    ids.forEach(id => { const c = R.T.find(x => x.id === id); if (c && c.excl) (groups[c.excl] = groups[c.excl] || []).push(id); });
    const clash = Object.entries(groups).filter(([, v]) => v.length > 1);
    !clash.length ? ok('no two cards of one excl group in the same Auto Tune (HAGS on/off)') : bad('Auto Tune picks both of: ' + clash.map(([k, v]) => k + '=' + v.join('+')).join('; '));
    const bat = R.buildTunePlan(Object.assign({}, sys, { laptop: true, onBattery: true }));
    !bat.ids.some(id => /^(cpu_idledisable|cpu_ultimate|cpu_coreparking|pwr_)/.test(id)) && bat.warns.some(w => /แบตเตอรี่/.test(w.t))
      ? ok('on battery: power cards held back and the user is told') : bad('battery case not handled');
    const hz = R.buildTunePlan(Object.assign({}, sys, { hz: 165 }));
    hz.warns.some(w => /162 FPS/.test(w.t)) ? ok('plan carries the frame-cap advice for this screen (165Hz -> 162)') : bad('frame cap missing from plan');
  } else bad('validator cannot reach pickAutoTweaks/buildTunePlan');
}

head('40. Every PowerShell command parses (real parser)');
{
  // Reading JS that builds PowerShell has missed broken scripts before (§4.21,
  // §4.25). This hands every script to PowerShell's own parser instead.
  const cands = process.platform === 'win32' ? ['powershell.exe'] : ['pwsh', '/opt/pwsh/pwsh'];
  let exe = null;
  for (const c of cands) { try { execFileSync(c, ['-NoProfile', '-Command', '1'], { stdio: 'pipe', timeout: 20000 }); exe = c; break; } catch (e) {} }
  if (!exe) console.log('  \x1b[33m•\x1b[0m PowerShell not found on this machine — parse check skipped (install pwsh to enable)');
  else {
    const os = require('os');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gbps-'));
    const label = {}; let n = 0;
    const put = (name, code) => { const f = path.join(dir, 's' + (n++) + '.ps1'); fs.writeFileSync(f, code, 'utf8'); label[path.basename(f)] = name; };
    if (R && Array.isArray(R.T)) R.T.forEach(t => [...(t.apply || []), ...(Array.isArray(t.revert) ? t.revert : [])].forEach((c, i) => {
      let m = /-Command "([\s\S]*)"\s*$/.exec(c);
      if (m) return put(`${t.id} cmd ${i}`, m[1]);
      m = /-EncodedCommand ([A-Za-z0-9+\/=]+)/.exec(c);
      if (m) return put(`${t.id} enc ${i}`, Buffer.from(m[1], 'base64').toString('utf16le'));
    }));
    Object.entries(global.__GEN_PS || {}).forEach(([k, v]) => put('generated ' + k, String(v).replace(/^﻿/, '')));
    const ps = "$o=@(); Get-ChildItem -LiteralPath '" + dir.replace(/'/g, "''") + "' -Filter *.ps1 | ForEach-Object { $e=$null; [void][System.Management.Automation.Language.Parser]::ParseFile($_.FullName,[ref]$null,[ref]$e); foreach($x in $e){ $o += ($_.Name + ' | ' + $x.Message) } }; $o -join \"`n\"";
    let out = '';
    try { out = execFileSync(exe, ['-NoProfile', '-Command', ps], { encoding: 'utf8', timeout: 120000, maxBuffer: 8 << 20 }); } catch (e) { out = 'RUNFAIL ' + e.message; }
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {}
    const errs = out.split('\n').map(l => l.trim()).filter(Boolean);
    if (errs.length) errs.slice(0, 12).forEach(l => { const [f, ...msg] = l.split(' | '); bad((label[f] || f) + ': ' + msg.join(' | ')); });
    else ok(`${n} PowerShell scripts (cards + generated) parse cleanly with ${path.basename(exe)}`);
  }
}

/* ── summary ────────────────────────────────────────────────────── */
console.log('');
if (failures) { console.log(`\x1b[31m✗ ${failures} check(s) failed\x1b[0m\n`); process.exit(1); }
console.log('\x1b[32m✓ all checks passed\x1b[0m\n');
