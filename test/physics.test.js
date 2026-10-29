// npm test: physics unit tests (brief section 5, tests 1-12). Node's built-in runner, no dependencies.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {Grip, Phys, VEH, loadParams, simStop, legacyStop, FT} = require('../scripts/simlib.js');
const P = loadParams(), grip = Grip.make(P.fixes), G = 9.81, DEG = Math.PI/180;
const SPEEDS = [19, 40, 60, 80, 100];

function sim(o){
  const V = Object.assign({}, VEH[o.vehicle || 'small'], o.veh || {});
  return Phys.createSim({vehicle:V, vehicleKey:V.key, grip, params:P, env:o.env || Phys.flatEnv({cond:o.cond || 'dry'}),
    tire:o.tire || 'winter', T:o.T == null ? -10 : o.T, abs:o.abs, esc:o.esc, tcs:o.tcs, drive:o.drive, u:o.u || 0, x:o.x, z:o.z, psi:o.psi});
}
const run = (s, inp, secs, each) => { const n = Math.round(secs/Phys.DT); for (let i = 0; i < n; i++){ s.step(typeof inp === 'function' ? inp(s.st) : inp); if (each && each(s.st) === false) break; } return s.st; };

test('1. calibration: full simulation matches legacy stopRun (ABS 2%, locked 3%) and the measured anchors (3%)', () => {
  const bad = [];
  for (const c of Object.keys(Grip.COND)) for (const t of Grip.TIRE_KEYS) for (const abs of [true, false]) for (const k of SPEEDS){
    const e = simStop({params:P, cond:c, tire:t, v0:k/3.6, abs}).dist/legacyStop({cond:c, tire:t, v0:k/3.6, abs}, P.fixes) - 1;
    if (Math.abs(e) > (abs ? .02 : .03)) bad.push(`${c}/${t} ${abs ? 'ABS' : 'locked'} ${k} km/h ${(e*100).toFixed(2)}%`);
  }
  for (const [t, ft] of [['winter', 56.1], ['allweather', 58.6], ['allseason', 84.5]]){
    const e = FT(simStop({params:P, cond:'packed', tire:t, v0:40/3.6}).dist)/ft - 1; if (Math.abs(e) > .03) bad.push(`anchor packed ${t} ${(e*100).toFixed(2)}%`);
  }
  const ratio = simStop({params:P, cond:'polished', tire:'allweather', v0:19/3.6}).dist/simStop({params:P, cond:'polished', tire:'winter', v0:19/3.6}).dist;
  if (Math.abs(ratio/(50.6/38.7) - 1) > .03) bad.push(`ice ratio ${ratio.toFixed(3)}`);
  assert.deepEqual(bad, []);
});

test('2. steady cornering: max lateral accel between 80% and 100% of peak mu x g; understeer gradient positive', () => {
  const report = [];
  for (const cond of Object.keys(Grip.COND)){
    // ESC off: this measures the tire and vehicle limit. With ESC on, ESC brakes as the steering keeps winding past the
    // limit (on gravel the held speed then gives 75% of peak; see PROGRESS.md), which measures ESC, not grip.
    const s = sim({cond, u:50/3.6, esc:false}), st = s.st, v0 = 50/3.6, mu = s.surf(cond).mu;
    let sw = 0, best = 0, win = [];
    run(s, st => { sw += 4*Phys.DT; const e = v0 - st.u; return {steer:sw, throttle:Math.max(0, Math.min(1, e*2)), brake:Math.max(0, Math.min(1, -e*.5))}; }, 60,
      st => { win.push(st.ays); if (win.length > 500) win.shift(); if (win.length === 500 && Math.abs(st.u - v0) < .3){ const m = win.reduce((a, b) => a + b, 0)/500; if (m > best) best = m; } return sw < 400; });
    report.push(`${cond}: max ay ${(best/G).toFixed(3)} g vs peak mu ${mu.toFixed(3)} (${(best/(mu*G)*100).toFixed(0)}%)`);
    assert.ok(best <= mu*G*1.0001 && best >= .8*mu*G, report[report.length - 1]);
  }
  // Understeer gradient on dry at 0.1 g and 0.3 g, constant 60 km/h: K = d(delta)/d(ay) - L/u²
  const pts = [];
  for (const target of [.1, .3]){
    const s = sim({cond:'dry', u:60/3.6}), V = s.vehicle, v0 = 60/3.6;
    let sw = 0;
    run(s, st => { const e = v0 - st.u; sw += (target*G - st.ays)*.02; return {steer:sw, throttle:Math.max(0, Math.min(1, e*2)), brake:0}; }, 12);
    pts.push([s.st.delta, s.st.ays]);
  }
  const V = VEH.small, K = (pts[1][0] - pts[0][0])/(pts[1][1] - pts[0][1]) - V.L/((60/3.6)**2);
  console.log('  ' + report.join('\n  ') + `\n  understeer gradient K = ${(K/DEG*G).toFixed(2)} deg/g`);
  assert.ok(K > 0, 'understeer gradient ' + K);
});

test('3. FMVSS/CMVSS 126 sine with dwell (49 CFR 571.126), dry: every vehicle passes with ESC on; ESC off reported', () => {
  const F = require('../scripts/fmvss126.js'), lines = [], fails = [];
  // The standard covers GVWR <= 4,536 kg: all seven qualify (sourced GVWRs; the Civic and Trax publish only a range,
  // both far below). Over 3,500 kg GVWR (the Ram 2500, 4,535.9 kg) the displacement limit is 1.52 m (S5.2.3).
  for (const key of Object.keys(VEH)) for (const esc of [true, false]){
    const r = F.series(key, esc, VEH[key].gvwr > 3500);
    const worst = Math.max(...r.runs.map(x => x.r1)), disp = Math.min(...r.runs.filter(x => x.amp >= 5*r.A).map(x => x.disp));
    lines.push(`${key} ESC ${esc ? 'on ' : 'off'} A ${r.A} deg: ${r.pass ? 'pass' : 'fail'} (worst yaw 1 s after steer ${(worst*100).toFixed(0)}%, min displacement ${disp.toFixed(2)} m)`);
    if (esc && !r.pass) fails.push(key);
  }
  console.log('  ' + lines.join('\n  '));
  assert.deepEqual(fails, []);
});

test('4. front wheels locked at 50 km/h on packed snow: full steering turns the heading less than 2 deg in 1 s', () => {
  const s = sim({cond:'packed', u:50/3.6, abs:false, veh:{brakeFront:1}}), V = s.vehicle;
  const st = run(s, {steer:V.maxWheelDeg*V.steerRatio, brake:1}, 1);
  assert.ok(st.w[0].om === 0 && st.w[2].om > 0, 'fronts locked, rears rolling');
  assert.ok(Math.abs(st.psi)/DEG < 2, 'heading change ' + (st.psi/DEG).toFixed(2) + ' deg');
});

test('5. rear wheels locked at 60 km/h on packed snow with a tiny initial yaw: yaw grows past 30 deg before the stop', () => {
  const s = sim({cond:'packed', u:60/3.6, abs:false, veh:{brakeFront:0}});
  s.st.r = .02;
  let maxYaw = 0;
  run(s, {brake:1}, 20, st => { const travel = Math.atan2(-(-Math.sin(st.psi)*st.u - Math.cos(st.psi)*st.v), -(-Math.cos(st.psi)*st.u + Math.sin(st.psi)*st.v)); maxYaw = Math.max(maxYaw, Math.abs(st.psi)); return Math.hypot(st.u, st.v) > .05; });
  assert.ok(maxYaw/DEG > 30, 'max yaw ' + (maxYaw/DEG).toFixed(1) + ' deg');
});

test('6. split-mu braking (left on ice, right on dry), ABS on, no steering: the car yaws toward the high-grip side', () => {
  const env = Phys.flatEnv({condFn:(s, off) => off < 0 ? 'polished' : 'dry'});
  const st = run(sim({env, u:80/3.6, esc:false}), {brake:1}, 1);   // ESC off: the split-mu physics alone
  assert.ok(st.psi < -.5*DEG, 'yaw ' + (st.psi/DEG).toFixed(2) + ' deg (negative = right, the dry side)');
});

test('7. FWD, one front wheel on polished ice: open differential limits drive to ~2x the ice wheel; TCS gets more', () => {
  const env = Phys.flatEnv({condFn:(s, off) => off < 0 ? 'polished' : 'dry'});
  // "The ice wheel's grip" = the grip available to it (mu x its load). The open-diff limit is a steady-state idea, so it
  // is checked at light throttle, where the spinning wheel speeds up slowly and its inertia takes little torque.
  const drive = (tcs, thr) => { const s = sim({env, drive:'fwd', tcs}); let sum = 0, ice = 0, n = 0;
    run(s, {throttle:thr}, 2, st => { if (st.t > 1){ sum += st.w[0].Fx + st.w[1].Fx; ice += st.w[0].Fmax; n++; } }); return {drive:sum/n, ice:ice/n}; };
  const light = drive(false, .15), off = drive(false, 1), on = drive(true, 1);
  const r = light.drive/(2*light.ice);
  console.log(`  TCS off, light throttle: drive ${light.drive.toFixed(0)} N = ${r.toFixed(2)} x (2 x ice wheel grip ${light.ice.toFixed(0)} N); full throttle: TCS off ${off.drive.toFixed(0)} N, TCS on ${on.drive.toFixed(0)} N`);
  assert.ok(r > .8 && r < 1.2, 'open diff ratio ' + r);
  assert.ok(on.drive > 1.5*off.drive, 'TCS more drive');
});

test('8. 6% polished-ice hill at -8 C: brakes hold when mu cos > sin, slide otherwise; no pedal rolls back; still on flat', () => {
  const th = Math.atan(.06);
  for (const tire of Grip.TIRE_KEYS){
    const s = sim({cond:'polished', tire, T:-8, env:Phys.flatEnv({cond:'polished', grade:6})});
    const mu = s.surf('polished').mu, holds = mu*Math.cos(th) > Math.sin(th);
    const st = run(s, {brake:1}, 10);
    const moved = Math.abs(st.z);
    assert.ok(holds ? moved < .05 : moved > .5, `${tire}: mu ${mu.toFixed(4)} ${holds ? 'should hold' : 'should slide'}, moved ${moved.toFixed(3)} m`);
  }
  // The "slides" half needs a case that slides: summer tires on glaze ice on the same 6% grade
  { const s = sim({tire:'summer', T:-8, env:Phys.flatEnv({cond:'glaze', grade:6})}), mu = s.surf('glaze').mu;
    assert.ok(mu*Math.cos(th) < Math.sin(th), 'glaze/summer should be below the hold limit, mu ' + mu);
    const st = run(s, {brake:1}, 10); assert.ok(st.z > .5, 'glaze/summer slid ' + st.z.toFixed(3) + ' m'); }
  // Stop from speed, then sit with the brake held: no creep after the stop (Fable review 1)
  for (const [cond, kmh, abs] of [['polished', 20, true], ['packed', 40, false], ['dry', 20, true]]){
    const s = sim({cond, u:kmh/3.6, abs}); run(s, {brake:1}, 30, st => st.u > .01); run(s, {brake:1}, 1);
    const z1 = s.st.z; run(s, {brake:1}, 10); assert.ok(Math.abs(s.st.z - z1) < .001, cond + ' sit-still drift ' + Math.abs(s.st.z - z1)); }
  const back = run(sim({cond:'polished', T:-8, env:Phys.flatEnv({cond:'polished', grade:6})}), {}, 10);
  assert.ok(back.z > 1, 'no pedal: rolled back ' + back.z.toFixed(2) + ' m');
  for (const inp of [{brake:.3}, {gear:'N'}]){ const f = run(sim({cond:'dry'}), inp, 10); assert.ok(Math.hypot(f.x, f.z) < .001, 'flat drift ' + Math.hypot(f.x, f.z)); }
});

// Ruts and ridges (zero force on a flat profile) are tested in Phase 5, when the rut environment exists.
test('9. crown on black ice, no steering: drifts toward the low side; zero wind gives zero side force', () => {
  const env = Phys.flatEnv({cond:'black', crown:2});
  const st = run(sim({env, u:100/3.6, x:1.8, T:-5}), {gear:'N'}, 4);
  assert.ok(st.x > 1.8 + .05, 'drift toward the low (right) edge: off ' + st.x.toFixed(3));
  const a = run(sim({env:Phys.flatEnv({cond:'black'}), u:100/3.6}), {gear:'N'}, 3);
  const b = run(sim({env:Phys.flatEnv({cond:'black', wind:() => [0, 0]}), u:100/3.6}), {gear:'N'}, 3);
  assert.equal(a.x, b.x); assert.equal(a.r, b.r);
  assert.equal(a.x, 0);   // flat profile: no sideways force at all
});

test('10. coasting in neutral follows the drag formula within 1%; the four loads always sum to the normal weight', () => {
  const s = sim({cond:'dry', u:100/3.6});
  let prev = s.st.u, worst = 0;
  run(s, {gear:'N'}, 20, st => { if (st.steps % 1000 === 0){ const a = (prev - st.u)/1, vm = (prev + st.u)/2, want = .05 + .0004*vm*vm; worst = Math.max(worst, Math.abs(a/want - 1)); prev = st.u; } });
  assert.ok(worst < .01, 'worst drag error ' + (worst*100).toFixed(2) + '%');
  const s2 = sim({cond:'packed', u:70/3.6, env:Phys.flatEnv({cond:'packed', grade:5, crown:2})}), V = s2.vehicle;
  let errMax = 0;
  run(s2, st => ({steer:120*Math.sin(st.t*3), brake:st.t > 2 ? .6 : 0}), 5, st => { const N = V.m*G/Math.sqrt(1 + .05*.05 + .02*.02); errMax = Math.max(errMax, Math.abs(st.w.reduce((a, w) => a + w.Fz, 0) - N)); });
  assert.ok(errMax < 1e-6, 'load sum error ' + errMax);
});

test('11. determinism: identical runs give identical hashes; replaying recorded inputs reproduces the run', () => {
  const drive = st => ({steer:90*Math.sin(st.t*2), throttle:st.t < 2 ? .5 : 0, brake:st.t > 3 ? 1 : 0});
  const go = inpFn => { const s = sim({cond:'packed', u:60/3.6}), rec = []; for (let i = 0; i < 5000; i++){ const inp = inpFn(s.st, i); rec.push(inp); s.step(inp); s.hashStep(); } return {h:s.st.hash, rec}; };
  const a = go(drive), b = go(drive), c = go((st, i) => a.rec[i]);
  assert.equal(a.h, b.h); assert.equal(a.h, c.h);
});

test('12. performance: one simulated second costs under 5 ms', () => {
  const s = sim({cond:'packed', u:80/3.6}), inp = {steer:30, throttle:.2};
  run(s, inp, 2);   // warm up
  // Best of three 5-s windows (the laptop is shared; the 5 ms limit itself is unchanged)
  let ms = Infinity; for (let k = 0; k < 3; k++){ const t0 = process.hrtime.bigint(); run(s, inp, 5); ms = Math.min(ms, Number(process.hrtime.bigint() - t0)/1e6/5); }
  console.log(`  ${ms.toFixed(2)} ms per simulated second`);
  assert.ok(ms < 5);
});
