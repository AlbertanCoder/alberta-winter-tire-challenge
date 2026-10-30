// Builds js/hazard-table.js: the fairness-rule warning distance for every stopping scenario x vehicle x weather, at
// every 2 m/s from 0 to 50 m/s (180 km/h) plus extra speeds at bends, from the full simulation (js/fair.js). HEAVY JOB (about 30-60 minutes, one CPU core): take the
// ~/claude-coord lock first. Deterministic: the same sources give a byte-identical file.
// The table uses each vehicle's own drive type; test/fair.test.js checks all four drive types against it.
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const F = require('./fairlib.js');
const DV = 2, VMAX = 50;   // base grid every 2 m/s; bends add real midpoints (below)
const SRC = ['js/physics.js', 'js/tire-params.js', 'js/vehicles.js', 'js/road.js', 'js/grip.js', 'js/fair.js'];
// Everything the table depends on: the physics sources, the stopping scenarios and the car lengths
function fingerprint(){
  const h = crypto.createHash('sha256');
  for (const f of SRC) h.update(fs.readFileSync(path.join(__dirname, '..', f), 'utf8').replace(/\r\n/g, '\n'));
  h.update(JSON.stringify(F.FAIR_SCEN)); h.update(JSON.stringify(Object.keys(F.PROF).map(k => [k, F.PROF[k].L])));
  h.update(JSON.stringify(F.VTYPE)); h.update([DV, VMAX, BEND, CHECK, DEPTH].join('|'));
  return h.digest('hex').slice(0, 16);
}
// Bends: where the braking part's slope in v² changes sharply between neighbouring cells (braking starting at a surface
// edge), the midpoint is solved for real and the cell is halved, down to 1/16 m/s, until the lookup is within 0.1 m.
const BEND = .05, CHECK = .1, DEPTH = 4;
const DUTY = Math.min(1, Math.max(.1, +process.env.FAIR_DUTY || 1));   // share of time computing (heat); results don't change
const ONLY = process.env.FAIR_ONLY || '';   // one row only, printed, not written (a quick check)
// shard = {i, n}: compute only distinct rows j with j % n === i (others come back null); i = -1 computes none (a plan)
function build(shard){
  const D = F.deps(), out = {}, seen = {}, noStop = [], t0 = Date.now(); let worst = 0, n = 0, extra = 0, uniq = 0;
  for (const sc of F.FAIR_SCEN) for (const veh of Object.keys(F.VTYPE)) for (const w of F.WEATHERS){
    const key = sc.id + '|' + veh + '|' + w;
    if (ONLY && ONLY !== key) continue;
    // A weather that leaves the surface under every metre and the temperature unchanged gives the identical simulation,
    // so its row is stored as the name of the row it equals
    const sig = sc.id + '|' + veh + '|' + D.grip.runTemp(sc, w) + '|' + Array.from({length:Math.ceil(sc.hazard.s) + 1006}, (_, i) => D.grip.surfaceAt(sc, i - 1000, w)).join();
    if (seen[sig]){ out[key] = seen[sig]; continue; }
    seen[sig] = key;
    if (shard && uniq++ % shard.n !== shard.i){ out[key] = null; continue; }
    const cf = CACHE && path.join(CACHE, key.replace(/\|/g, '_') + '.json');
    if (cf && fs.existsSync(cf)){ out[key] = JSON.parse(fs.readFileSync(cf, 'utf8')); continue; }   // done before a heat stop
    const c = F.ctx(sc, veh, D.vehicles[veh].drive, w, D);
    // Each solved speed is saved too, so a heat stop in the middle of a long row loses nothing
    const pf = cf && cf + '.part', part = pf && fs.existsSync(pf) ? JSON.parse(fs.readFileSync(pf, 'utf8')) : {};
    const solve = (v, guess) => {
      if (part[v] != null) return part[v];
      const ts = Date.now();
      // Where the 1-D model says no stop is possible, one full-sim stop from the farthest trigger point settles it cheaply
      if (!isFinite(F.legacyWarn(c, v))){
        const hiD = c.Hs + 1000, d = F.Fair.refStop(D, sc, c.P, Object.assign({}, c.o, {v, front:c.Hs - hiD}));
        if (d + F.Fair.MARGIN > hiD){ noStop.push(sc.id + '|' + veh + '|' + w + '@' + v); part[v] = hiD; return hiD; }
      }
      const r = F.Fair.solveWarn(D, sc, c.P, Object.assign({}, c.o, {v}), c.Hs, guess != null ? guess : F.legacyWarn(c, v));
      // Can't stop at all (e.g. glaze on a 6% downhill: gravity beats braking grip): the hazard appears as early as the
      // solver allows, 1 km before the road starts, so it is visible from the start (the v1 game capped this case too)
      if (r.width === Infinity && r.err > 0 && r.D >= c.Hs + 999){ noStop.push(sc.id + '|' + veh + '|' + w + '@' + v); r.err = 0; r.width = 0; }
      if (Math.abs(r.err) > .05 && !(r.width < .02)) throw new Error('no converged warning distance: ' + JSON.stringify({id:sc.id, veh, w, v, r}));
      worst = Math.max(worst, Math.min(Math.abs(r.err), r.width)); n++;
      part[v] = Math.round(r.D*100)/100;
      if (pf){ fs.writeFileSync(pf + '.tmp', JSON.stringify(part)); fs.renameSync(pf + '.tmp', pf); }
      if (DUTY < 1) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, (Date.now() - ts)*(1/DUTY - 1));   // rest to run cooler
      return part[v];
    };
    const pts = [[0, F.Fair.MARGIN]];
    // First guess: extrapolated from the two speeds below (linear in v²), else the legacy 1-D model
    for (let i = 1; i*DV <= VMAX + 1e-9; i++){ const v = i*DV, n = pts.length; pts.push([v, solve(v, n >= 2 ? F.Fair.interp(pts[n-2][0], pts[n-2][1], pts[n-1][0], pts[n-1][1], v) : null)]); }
    const brk = p => p[1] - F.Fair.MARGIN - p[0]*F.Fair.RT;
    const slope = i => (brk(pts[i+1]) - brk(pts[i]))/(pts[i+1][0]**2 - pts[i][0]**2);
    const refine = (p0, p1, depth) => {
      const vm = (p0[0] + p1[0])/2, pm = [vm, solve(vm, F.Fair.interp(p0[0], p0[1], p1[0], p1[1], vm))]; extra++;
      const e = Math.abs(F.Fair.interp(p0[0], p0[1], p1[0], p1[1], vm) - pm[1]);
      if (e <= CHECK || depth >= DEPTH) return [pm];
      return refine(p0, pm, depth + 1).concat([pm], refine(pm, p1, depth + 1));
    };
    const rowPts = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++){
      const dv2 = pts[i+1][0]**2 - pts[i][0]**2;
      const sl = i > 0 ? slope(i - 1) : slope(i), sr = i < pts.length - 2 ? slope(i + 1) : slope(i);
      const bend = Math.max(Math.abs(slope(i) - sl), Math.abs(sr - slope(i)))*dv2/8;
      if (bend > BEND) rowPts.push(...refine(pts[i], pts[i+1], 1));
      rowPts.push(pts[i+1]);
    }
    out[key] = [].concat(...rowPts);
    if (cf){ fs.writeFileSync(cf + '.tmp', JSON.stringify(out[key])); fs.renameSync(cf + '.tmp', cf); if (fs.existsSync(pf)) fs.unlinkSync(pf); }
  }
  if (noStop.length) console.log('reference driver cannot stop (hazard shown from the start):', noStop.join(' '));
  console.log('solved', n, 'speeds (' + extra + ' extra at bends) in', ((Date.now() - t0)/1000).toFixed(0), 's; worst solver residual', worst.toFixed(3), 'm');
  return out;
}
// FAIR_JOBS=n (default 1) splits the distinct rows over n child processes (one core each), watched for heat; the
// merged file is identical for any n
function write(fp, T){
  const body = Object.keys(T).map(k => '  ' + JSON.stringify(k) + ':' + (typeof T[k] === 'string' ? JSON.stringify(T[k]) : '[' + T[k].join(',') + ']')).join(',\n');
  const js = '// GENERATED by scripts/fairness.js (npm run fairness). Do not edit by hand.\n' +
    '// Fairness-rule warning distance by scenario|vehicle|weather: [speed m/s, distance m, ...] from 0 to ' + VMAX + ' m/s,\n' +
    '// or the name of an identical row (same surfaces and temperature).\n' +
    '(function(root, t){ if (typeof module === \'object\' && module.exports) module.exports = t; else root.WTHazTable = t; })(typeof self !== \'undefined\' ? self : this, {\n' +
    'fingerprint:' + JSON.stringify(fp) + ', vmax:' + VMAX + ',\nD:{\n' + body + '\n}});\n';
  fs.writeFileSync(path.join(__dirname, '..', 'js', 'hazard-table.js'), js);
  console.log('wrote js/hazard-table.js', js.length, 'bytes, fingerprint', fp);
}
// Finished rows are cached per fingerprint, so a run stopped for heat resumes where it left off
const CACHE = process.env.FAIR_CACHE || '';
// Heat watch (laptop rules, ~/claude-coord): two readings at 90 C or more stop every shard; exit code 3 means "paused for heat"
const HOT = 90, WATCH_MS = 30000;
function cpuTemp(){ try { const l = require('child_process').execFileSync(process.execPath, [path.join(require('os').homedir(), 'claude-coord', 'coord.js'), 'check'], {encoding:'utf8'}); const m = /CPU (\d+) C/.exec(l); return m ? +m[1] : null; } catch (e){ return null; } }
if (require.main === module){
  // FAIR_PARTIAL=1: write a table from the rows finished so far (a running build's cache); missing rows fall back to the
  // v1 estimate in the game, and test/fair.test.js stays red until the full build replaces the file
  if (process.env.FAIR_PARTIAL){
    const os = require('os'), fp = fingerprint(), dir = path.join(os.tmpdir(), 'wt-fair-' + fp);
    process.env.FAIR_CACHE = ''; const T = build({i:-1, n:1});
    for (const k in T){ const f = path.join(dir, k.replace(/\|/g, '_') + '.json'); if (T[k] === null && fs.existsSync(f)) T[k] = JSON.parse(fs.readFileSync(f, 'utf8')); }
    for (const k in T) if (T[k] === null || (typeof T[k] === 'string' && T[T[k]] == null)) delete T[k];
    console.log('partial table:', Object.keys(T).length, 'rows'); write(fp + '-partial', T); process.exit(0);
  }
  const SH = process.env.FAIR_SHARD;
  if (SH){ const [i, n] = SH.split('/').map(Number); fs.writeFileSync(process.env.FAIR_OUT, JSON.stringify(build({i, n}))); process.exit(0); }
  const fp = fingerprint(), jobs = ONLY ? 1 : Math.max(1, +process.env.FAIR_JOBS || 1);
  if (ONLY){ const T = build(); console.log(JSON.stringify(T[ONLY])); process.exit(0); }
  else {
    const {spawn} = require('child_process'), os = require('os'), kids = [];
    process.env.FAIR_CACHE = path.join(os.tmpdir(), 'wt-fair-' + fp); fs.mkdirSync(process.env.FAIR_CACHE, {recursive:true});
    let hot = 0;
    const watch = setInterval(() => {
      const t = cpuTemp(); hot = t != null && t >= HOT ? hot + 1 : 0;
      if (hot >= 2){ console.error('HEAT STOP: CPU ' + t + ' C twice; finished rows are cached'); kids.forEach(k => k.kill()); process.exit(3); }
    }, WATCH_MS);
    const files = Array.from({length:jobs}, (_, i) => path.join(os.tmpdir(), 'wt-fair-shard-' + i + '-of-' + jobs + '.json'));
    Promise.all(files.map((f, i) => new Promise((ok, bad) => {
      const ch = spawn(process.execPath, [__filename], {stdio:'inherit', env:Object.assign({}, process.env, {FAIR_SHARD:i + '/' + jobs, FAIR_OUT:f})}); kids.push(ch);
      ch.on('exit', code => code === 0 ? ok() : bad(new Error('shard ' + i + ' exited ' + code)));
    }))).then(() => {
      const T = build({i:-1, n:jobs});
      for (const f of files){ const part = JSON.parse(fs.readFileSync(f, 'utf8')); for (const k in part) if (Array.isArray(part[k])) T[k] = part[k]; fs.unlinkSync(f); }
      const miss = Object.keys(T).filter(k => T[k] == null); if (miss.length) throw new Error('rows missing after merge: ' + miss.join(' '));
      write(fp, T); clearInterval(watch); fs.rmSync(process.env.FAIR_CACHE, {recursive:true, force:true});
    }).catch(e => { console.error(e); process.exit(1); });
  }
}
module.exports = {fingerprint, DV, VMAX};
