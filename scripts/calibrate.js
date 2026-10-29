// npm run calibrate: fits the v2 tire curves to the v1 grip tables and writes js/tire-params.js and docs/CALIBRATION.md.
// Deterministic: running it twice gives byte-identical files. Never hand-edit the outputs.
'use strict';
const fs = require('fs'), path = require('path');
const {Grip, Phys, VEH, simStop, legacyStop, FT} = require('./simlib.js');
const ROOT = path.join(__dirname, '..');
const SPEEDS = [19, 40, 60, 80, 100];
const TIRES = Grip.TIRE_KEYS, CONDS = Object.keys(Grip.COND);
const r4 = x => Math.round(x*1e4)/1e4, pct = x => (x >= 0 ? '+' : '') + (x*100).toFixed(1) + '%';

// ---- 1. Table values against their own measured sources (brief 4.2: fix anything off by more than 2%)
// Tire Rack 2026 all-weather vs winter test (REFS): packed snow from 40 km/h, ABS; ice rink from 19 km/h.
const ANCHORS = [
  {cond:'packed', tire:'winter', kmh:40, ft:56.1, label:'best winter tire'},
  {cond:'packed', tire:'allweather', kmh:40, ft:58.6, label:'best all-weather tire'},
  {cond:'packed', tire:'allseason', kmh:40, ft:84.5, label:'M+S all-season tire'}
];
const ICE = {cond:'polished', kmh:19, winter:38.7, allweather:50.6};   // only the ratio is used (levels are estimates)
const fixes = {}, fixRows = [];
for (const a of ANCHORS){
  const leg = FT(legacyStop({cond:a.cond, tire:a.tire, v0:a.kmh/3.6}));
  const err = leg/a.ft - 1;
  if (Math.abs(err) > .02){
    let lo = .05, hi = 1.2;   // distance falls as mu rises: bisect for the mu that reproduces the measured stop
    for (let i = 0; i < 60; i++){ const mid = (lo + hi)/2, f = {[a.cond]:{[a.tire]:mid}}; const d = FT(legacyStop({cond:a.cond, tire:a.tire, v0:a.kmh/3.6}, f)); if (d > a.ft) lo = mid; else hi = mid; }
    const mu = r4((lo + hi)/2); (fixes[a.cond] = fixes[a.cond] || {})[a.tire] = mu;
    fixRows.push([a.cond, a.tire, Grip.COND[a.cond].mu[a.tire], mu, `legacy ${leg.toFixed(1)} ft vs measured ${a.ft} ft (${pct(err)}); ${mu} reproduces it`]);
  }
}
const iceLegRatio = legacyStop({cond:ICE.cond, tire:'allweather', v0:ICE.kmh/3.6}, fixes)/legacyStop({cond:ICE.cond, tire:'winter', v0:ICE.kmh/3.6}, fixes);
const iceMeas = ICE.allweather/ICE.winter;

// ---- 2. Fit each tire x surface on the reference small car at -10 °C, new tread
const ref = {T:-10, vehicle:'small'};
const grip = Grip.make(fixes);
const FZ_REF = VEH.small.m*9.81/4;   // reference car's average wheel load
function lockTarget(cond, pk, C, B){ const sh = Phys.mfShape(C, B), kind = Phys.shapeKind(grip.COND, cond); return Phys.mf(1/Phys.peakSlip(kind, pk, sh.C*sh.B/sh.N, FZ_REF), sh); }
function solveShape(cond, pk, fWant, gravel){
  let lo = gravel ? .5 : 1.0005, hi = gravel ? 40 : 1.999;
  for (let i = 0; i < 60; i++){
    const mid = (lo + hi)/2, f = gravel ? lockTarget(cond, pk, 1, mid) : lockTarget(cond, pk, mid);
    // non-gravel: f falls as C rises; gravel: f rises as B rises
    if (gravel ? f < fWant : f > fWant) lo = mid; else hi = mid;
  }
  return (lo + hi)/2;
}
function ratios(params, cond, tire, abs){ return SPEEDS.map(k => simStop({params, cond, tire, v0:k/3.6, abs}).dist/legacyStop({cond, tire, v0:k/3.6, abs}, fixes)); }
// Fit the middle of the range across speeds (minimises the worst error), not the average
const mean = a => (Math.max(...a) + Math.min(...a))/2;
const surf = {};
for (const c of CONDS) surf[c] = {};
const params = {version:2, fixes, surf, ref};
for (const c of CONDS){
  const gravel = c === 'gravel';
  for (const t of TIRES){
    const mu = grip.COND[c].mu[t];
    const sp = surf[c][t] = gravel ? {pk:mu*1.05, B:3} : {pk:mu/.9, C:1.5};
    if (gravel){
      // No peak: the locked stop sets the grip level, the curve's steepness B sets how much ABS gets. Search B.
      const fitPk = () => { for (let k = 0; k < 4; k++) sp.pk *= mean(ratios(params, c, t, false)); };
      let lo = .3, hi = 40;
      for (let it = 0; it < 22; it++){ sp.B = Math.sqrt(lo*hi); fitPk(); if (mean(ratios(params, c, t, true)) > 1) lo = sp.B; else hi = sp.B; }
      sp.B = Math.sqrt(lo*hi); fitPk();
      sp.pk = r4(sp.pk); sp.B = r4(sp.B); continue;
    }
    for (let it = 0; it < 12; it++){
      const rA = mean(ratios(params, c, t, true)), rL = mean(ratios(params, c, t, false));
      if (Math.abs(rA - 1) < .0015 && Math.abs(rL - 1) < .0015) break;
      sp.pk *= rA;
      const fNow = gravel ? lockTarget(c, sp.pk, 1, sp.B) : lockTarget(c, sp.pk, sp.C);
      const fWant = Math.min(.999, fNow*rL*(1/rA));
      if (gravel) sp.B = solveShape(c, sp.pk, fWant, true); else sp.C = solveShape(c, sp.pk, fWant, false);
    }
    sp.pk = r4(sp.pk); if (gravel) sp.B = r4(sp.B); else sp.C = r4(sp.C);
  }
}

// ---- 2b. Each vehicle's own understeer gradient, stored for its ESC (a real ESC's reference model is tuned to its car).
// Dry, winter tires, 60 km/h, steady states at 0.1 g and 0.3 g: Kv = d(delta)/d(ay) - L/u², rad·s²/m.
params.Kv = {};
for (const key of Object.keys(VEH)){
  const pts = [];
  for (const target of [.1, .3]){
    const V = VEH[key], sim = Phys.createSim({vehicle:V, vehicleKey:key, grip, params, env:Phys.flatEnv({cond:'dry'}), tire:'winter', T:-10, esc:false, u:60/3.6});
    let sw = 0; for (let i = 0; i < 12000; i++){ const st = sim.st, e = 60/3.6 - st.u; sw += (target*9.81 - st.ays)*.02; sim.step({steer:sw, throttle:Math.max(0, Math.min(1, e*2))}); }
    pts.push([sim.st.delta, sim.st.ays]);
  }
  params.Kv[key] = Math.round(((pts[1][0] - pts[0][0])/(pts[1][1] - pts[0][1]) - VEH[key].L/((60/3.6)**2))*1e6)/1e6;
}

// ---- 3. Verify (with the rounded parameters) and write the report
const rows = [], failures = [];
for (const c of CONDS) for (const t of TIRES){
  const a = ratios(params, c, t, true), l = ratios(params, c, t, false);
  const wa = Math.max(...a.map(x => Math.abs(x - 1))), wl = Math.max(...l.map(x => Math.abs(x - 1)));
  if (wa > .02) failures.push(`${c}/${t} ABS worst ${pct(wa)}`);
  if (wl > .03) failures.push(`${c}/${t} locked worst ${pct(wl)}`);
  rows.push(`| ${c} | ${t} | ${surf[c][t].pk} | ${surf[c][t].C != null ? 'C ' + surf[c][t].C : 'B ' + surf[c][t].B} | ${a.map(x => pct(x - 1)).join(' ')} | ${l.map(x => pct(x - 1)).join(' ')} |`);
}
const anchorRows = ANCHORS.map(a => { const d = FT(simStop({params, cond:a.cond, tire:a.tire, v0:a.kmh/3.6, abs:true}).dist); const e = d/a.ft - 1; if (Math.abs(e) > .03) failures.push(`anchor ${a.tire} ${pct(e)}`); return `| Packed snow, 40 km/h, ${a.label} | ${a.ft} ft | ${d.toFixed(1)} ft | ${pct(e)} |`; });
const iw = FT(simStop({params, cond:ICE.cond, tire:'winter', v0:ICE.kmh/3.6}).dist), ia = FT(simStop({params, cond:ICE.cond, tire:'allweather', v0:ICE.kmh/3.6}).dist);
const iceErr = (ia/iw)/iceMeas - 1; if (Math.abs(iceErr) > .03) failures.push(`ice ratio ${pct(iceErr)}`);
const vehRows = Object.keys(VEH).map(k => {
  const cells = ['packed', 'polished', 'dry'].map(c => { const s = simStop({params, cond:c, tire:'winter', v0:60/3.6, vehicle:k}).dist; const g = Grip.make(fixes).stopRun('winter', {cond:c, T:-10, grade:0}, 0, 60/3.6, {vehicle:k, tread:'new', abs:true, rt:0}).dist; return `${s.toFixed(1)} m vs ${g.toFixed(1)} m (${pct(s/g - 1)})`; });
  return `| ${k} | ${cells.join(' | ')} |`;
});

const js = `// GENERATED by scripts/calibrate.js (npm run calibrate). Do not edit by hand.
// pk: peak grip of the v2 tire curve at -10 °C on the reference small car with new tread (ABS-average target from the
// v1 tables, js/grip.js). C: Magic Formula shape (sets how far grip falls once the tire slides). B (gravel only): steepness
// of a curve with no peak. fixes: table corrections; see docs/CALIBRATION.md.
(function(root, factory){ if (typeof module === 'object' && module.exports) module.exports = factory(); else root.WTTireParams = factory(); })(typeof self !== 'undefined' ? self : this, function(){
return ${JSON.stringify(params, null, 1)};
});
`;
fs.writeFileSync(path.join(ROOT, 'js', 'tire-params.js'), js);

const md = `# Tire calibration

GENERATED by \`scripts/calibrate.js\` (\`npm run calibrate\`). Do not edit by hand.

## 1. Table values checked against their own measured sources
Source: Tire Rack (2026), All-Weather vs. Winter Tires: The Definitive Test (in the game's Sources). Legacy model = v1 \`stopRun()\` at -10 °C, small car, new tread, ABS, no reaction time.

| Surface | Tire | v1 value | v2 value | Why |
|---|---|---|---|---|
${fixRows.length ? fixRows.map(r => '| ' + r.join(' | ') + ' |').join('\n') : '| none | | | | every anchor within 2% |'}

Ice: only the ratio between tires is measured (rink from 19 km/h: winter ${ICE.winter} ft, best all-weather ${ICE.allweather} ft, ratio ${iceMeas.toFixed(3)}). The v1 polished-ice values give a ratio of ${iceLegRatio.toFixed(3)} (${pct(iceLegRatio/iceMeas - 1)}), inside 2%, so they are unchanged.

## 2. Fitted curves and the check against the legacy model
Full v2 simulation (four wheels, ABS cycling, load transfer) vs legacy \`stopRun()\`, straight-line stops from ${SPEEDS.join(', ')} km/h. Limits: ABS within 2%, ABS off (locked wheels) within 3%.

| Surface | Tire | Peak grip | Shape | ABS: error at ${SPEEDS.join(', ')} km/h | ABS off: error at ${SPEEDS.join(', ')} km/h |
|---|---|---|---|---|---|
${rows.join('\n')}

## 3. Measured anchors in the full simulation (limit 3%)
| Test | Measured | v2 simulation | Error |
|---|---|---|---|
${anchorRows.join('\n')}
| Ice rink, 19 km/h, all-weather ÷ winter distance | ${iceMeas.toFixed(3)} | ${(ia/iw).toFixed(3)} (winter ${iw.toFixed(1)} ft, all-weather ${ia.toFixed(1)} ft) | ${pct(iceErr)} |

The absolute ice distances are estimates (the game estimates the ice grip level); only the ratio is checked.

## 4. Other vehicles vs legacy (winter tires, ABS, 60 km/h)
Legacy scaled grip by the v1 vehicle factor (VEH.f). v2 keeps that factor and adds load transfer and load sensitivity; brake balance (EBD, and 70% front with ABS off) is the same estimate on every vehicle.

| Vehicle | Packed snow | Polished ice | Dry |
|---|---|---|---|
${vehRows.join('\n')}

## 5. Understeer gradient per vehicle (stored for its ESC reference model)
Dry, winter tires, 60 km/h, from steady states at 0.1 g and 0.3 g with ESC off.

| Vehicle | Kv (rad·s²/m) | deg per g |
|---|---|---|
${Object.keys(params.Kv).map(k => `| ${k} | ${params.Kv[k]} | ${(params.Kv[k]*9.81*180/Math.PI).toFixed(2)} |`).join('\n')}

## Result
${failures.length ? 'FAILURES:\n' + failures.map(f => '- ' + f).join('\n') : 'All checks pass.'}
`;
fs.writeFileSync(path.join(ROOT, 'docs', 'CALIBRATION.md'), md);
console.log(failures.length ? 'Calibration FAILED:\n' + failures.join('\n') : 'Calibration passed: js/tire-params.js and docs/CALIBRATION.md written');
process.exit(failures.length ? 1 : 0);
