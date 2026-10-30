// Hazard fairness (brief 4.11): the game's warning-distance table agrees with the full simulation within 0.5 m.
'use strict';
const test = require('node:test'), assert = require('node:assert');
const path = require('path');
const F = require('../scripts/fairlib.js'), {fingerprint} = require('../scripts/fairness.js');
const TAB = require(path.join(__dirname, '..', 'js', 'hazard-table.js'));

test('fairness table is up to date with the physics, scenarios and cars (else run npm run fairness)', () => {
  assert.strictEqual(TAB.fingerprint, fingerprint());
  for (const sc of F.FAIR_SCEN) for (const veh of Object.keys(F.VTYPE)) for (const w of F.WEATHERS)
    assert.ok(TAB.D[sc.id + '|' + veh + '|' + w], 'missing ' + sc.id + '|' + veh + '|' + w);
});

test('fairness table within 0.5 m of the full simulation: every scenario, every drive type, random vehicles, weathers and speeds', () => {
  const D = F.deps(), rnd = F.Phys.rng(4242), pick = a => a[Math.floor(rnd()*a.length)];
  let worst = {e:0}, n = 0;
  for (const sc of F.FAIR_SCEN) for (const drive of F.DRIVES){
    const veh = pick(Object.keys(F.VTYPE)), w = pick(['clear', 'snow', 'blowing', 'frzrain']), v = .5 + rnd()*44.5;
    const c = F.ctx(sc, veh, drive, F.weatherKey(w), D);
    const sim = F.Fair.solveWarn(D, sc, c.P, Object.assign({}, c.o, {v}), c.Hs, F.legacyWarn(c, v)).D;
    const tab = F.Fair.lookup(F.Fair.row(TAB, sc.id + '|' + veh + '|' + F.weatherKey(w)), v), e = Math.abs(tab - sim); n++;
    if (e > worst.e) worst = {e, id:sc.id, veh, drive, w, kmh:(v*3.6).toFixed(1), sim:sim.toFixed(2), tab:tab.toFixed(2)};
    assert.ok(e < .5, JSON.stringify({id:sc.id, veh, drive, w, kmh:v*3.6, sim, tab}));
  }
  // The bridge at 115-125 km/h: braking would start right at the dry-to-ice edge, the steepest stretch of any row
  for (const v of [32.2, 32.5, 32.8, 33.2, 33.6, 34.4]){
    const sc = F.SCEN.find(s => s.id === 'bridge'), c = F.ctx(sc, 'small', 'fwd', 'clear', D);
    const sim = F.Fair.solveWarn(D, sc, c.P, Object.assign({}, c.o, {v}), c.Hs, F.legacyWarn(c, v)).D;
    const tab = F.Fair.lookup(F.Fair.row(TAB, 'bridge|small|clear'), v), e = Math.abs(tab - sim); n++;
    if (e > worst.e) worst = {e, id:'bridge', veh:'small', drive:'fwd', w:'clear', kmh:(v*3.6).toFixed(1), sim:sim.toFixed(2), tab:tab.toFixed(2)};
    assert.ok(e < .5, JSON.stringify({id:'bridge', kmh:v*3.6, sim, tab}));
  }
  console.log('fairness: ' + n + ' samples, worst ' + worst.e.toFixed(3) + ' m', JSON.stringify(worst));
});
