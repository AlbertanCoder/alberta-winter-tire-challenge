// Same-input comparison (brief 4.7): recorder, replay determinism, and winter vs all-season on the same pedals.
'use strict';
const test = require('node:test'), assert = require('node:assert');
const F = require('../scripts/fairlib.js'), C = require('../js/compare.js');
const D = F.deps(), sc = F.SCEN.find(s => s.id === 'cross'), P = F.Road.buildPath(sc.path), VEH = 'small';
const base = (tire, inputs, u) => ({sc, P, weather:'clear', T:sc.T, vehicle:VEH, drive:'fwd', tire, tread:'new', abs:true, esc:true, tcs:true,
  x:F.Road.at(P, sc.startS, F.Road.LANE).x, z:F.Road.at(P, sc.startS, F.Road.LANE).z, psi:F.Road.at(P, sc.startS, F.Road.LANE).psi,
  u:u/3.6, wind:null, inputs, half:2.3, maxT:30});

test('recorder run-length round trip', () => {
  const r = C.recorder(), a = {steer:0, throttle:0, brake:0, gear:'D'};
  for (let i = 0; i < 5; i++) r.push(a);
  a.brake = 1; for (let i = 0; i < 3; i++) r.push(a);
  assert.deepStrictEqual(r.list, [[5, 0, 0, 0], [3, 0, 0, 1]]);
});
test('replay is deterministic', () => {
  const inp = [[500, 0, 0, 0], [1, 0, 0, 1]];
  assert.deepStrictEqual(C.replay(D, base('winter', inp, 40)), C.replay(D, base('winter', inp, 40)));
});
test('replaying a run on the same tire reproduces its end position', () => {
  const o = base('winter', null, 40), p = F.Road.at(P, sc.startS, F.Road.LANE), rec = C.recorder();
  const sim = D.Phys.createSim({vehicle:D.vehicles[VEH], vehicleKey:VEH, grip:D.grip, params:D.params, env:F.Road.roadEnv(sc, P, D.grip, 'clear', sc.startS, null),
    tire:'winter', tread:'new', T:sc.T, abs:true, esc:true, tcs:true, drive:'fwd', x:p.x, z:p.z, psi:p.psi, u:o.u});
  const inp = {steer:0, throttle:0, brake:0, gear:'D'};
  for (let n = 0; n < 6000 && (n < 300 || sim.st.u >= .01); n++){ inp.brake = n >= 300 ? 1 : 0; inp.steer = n > 100 && n < 200 ? 20 : 0; rec.push(inp); sim.step(inp); }
  const r = C.replay(D, base('winter', rec.list, 40));
  assert.ok(Math.abs(r.end.x - sim.st.x) < 1e-9 && Math.abs(r.end.z - sim.st.z) < 1e-9);
});
test('full braking from 60 km/h on packed snow: winter stops shorter than all-season', () => {
  const inp = [[1, 0, 0, 1]], w = C.replay(D, base('winter', inp, 60)), a = C.replay(D, base('allseason', inp, 60));
  assert.ok(w.summary.stopS < a.summary.stopS, w.summary.stopS + ' vs ' + a.summary.stopS);
  assert.ok(/Same steering/.test(C.describe(w.summary, a.summary, 'winter', 'all-season', sc)));
});
test('wheels option adds per-wheel data to every sample and leaves the rest unchanged', () => {
  const inp = [[300, 0, 0, 0], [1, 10, 0, 1]], a = C.replay(D, base('winter', inp, 40)), b = C.replay(D, Object.assign(base('winter', inp, 40), {wheels:true}));
  assert.strictEqual(b.tele.length, a.tele.length);
  assert.ok(b.tele.length > 5 && a.tele.every(e => e.w === undefined));
  assert.ok(b.tele.every(e => e.w.length === 4 && e.w.every(w => w.length === 7) && Number.isFinite(e.slipDeg)));
  assert.deepStrictEqual(b.tele.map(e => e.u), a.tele.map(e => e.u));
  assert.deepStrictEqual(b.summary, a.summary);
});
