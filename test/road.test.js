// Road geometry and environment (Phase 2 groundwork): frames agree with physics.js and index.html.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {Grip, Phys, VEH, loadParams} = require('../scripts/simlib.js');
const Road = require('../js/road.js');
const P = loadParams(), grip = Grip.make(P.fixes);

test('road: straight path matches the straight-road frame (s = -z, off = x) and locate inverts at', () => {
  const path = Road.buildPath([['s', 200]]);
  const p = Road.at(path, 50, 1.8);
  assert.ok(Math.abs(p.x - 1.8) < 1e-12 && Math.abs(p.z + 50) < 1e-12);
  const curve = Road.buildPath([['s', 50], ['a', 60, 90, 'R'], ['s', 50]]);
  for (const [s, off] of [[20, 1.8], [80, -1.8], [120, 3.0]]){
    const q = Road.at(curve, s, off), L = Road.locate(curve, q.x, q.z, Math.floor(s));
    assert.ok(Math.abs(L.s - s) < .02 && Math.abs(L.off - off) < .02, `s ${s} off ${off} -> ${L.s.toFixed(3)} ${L.off.toFixed(3)}`);
  }
});

test('road env: a car parked on an uphill grade rolls back; on a right curve the bank falls to the right', () => {
  const sc = {cond:'polished', T:-8, grade:6, startS:20};
  const path = Road.buildPath([['s', 200]]), env = Road.roadEnv(sc, path, grip, 'clear');
  const sim = Phys.createSim({vehicle:VEH.small, vehicleKey:'small', grip, params:P, env, tire:'winter', T:-8, z:-20});
  for (let i = 0; i < 5000; i++) sim.step({gear:'N'});
  assert.ok(sim.st.z > -20 + .2, 'rolled back toward smaller s: z ' + sim.st.z.toFixed(3));
  const scc = {cond:'polished', T:-8, grade:0}, cp = Road.buildPath([['s', 10], ['a', 100, 60, 'R'], ['s', 10]]), e2 = Road.roadEnv(scc, cp, grip, 'clear', 30);
  const q = Road.at(cp, 40, 0), out = {}; e2.sample(q.x, q.z, out);
  const right = [Math.cos(q.psi), -Math.sin(q.psi)], downhill = -(out.gx*right[0] + out.gz*right[1]);
  assert.ok(Math.abs(downhill - Road.BANK) < 1e-9, 'slope toward the right (inside of a right curve) = 6%: ' + downhill);
});
