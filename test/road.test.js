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

test('road env: straights are crowned 2% at the centreline (falling to each edge); black ice and no steering drifts to the edge', () => {
  const sc = {cond:'black', T:-5, grade:0}, path = Road.buildPath([['s', 400]]), env = Road.roadEnv(sc, path, grip, 'clear', 10);
  for (const off of [Road.LANE, -Road.LANE]){
    const q = Road.at(path, 50, off), out = {}; env.sample(q.x, q.z, out);
    const right = [Math.cos(q.psi), -Math.sin(q.psi)], dh = out.gx*right[0] + out.gz*right[1];
    assert.ok(Math.abs(dh + Math.sign(off)*Road.CROWN) < 1e-9, 'height falls away from the centreline at 2%: off ' + off + ' dh/doff ' + dh);
  }
  const q = Road.at(path, 20, Road.LANE);
  const sim = Phys.createSim({vehicle:VEH.small, vehicleKey:'small', grip, params:P, env, tire:'allseason', T:-5, esc:false, x:q.x, z:q.z, psi:q.psi, u:100/3.6});
  for (let i = 0; i < 3000; i++) sim.step({steer:0, throttle:.15, brake:0});
  const off = Road.locate(path, sim.st.x, sim.st.z, 0).off;
  console.log('crown drift: 3 s at 100 km/h on black ice, no steering: ' + (off - Road.LANE).toFixed(3) + ' m toward the right edge');
  assert.ok(off > Road.LANE + .01, 'drifted toward the low (right) edge: off ' + off.toFixed(3));
});
