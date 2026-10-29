// FMVSS / CMVSS 126 electronic stability control test, as written in 49 CFR 571.126 (read 2026-10-29 at
// law.cornell.edu/cfr/text/49/571.126): S7.6 slowly increasing steer (A), S7.9 sine with dwell, S7.11 data processing,
// S5.2 criteria. Run on the game's "dry" surface (the standard's surface has a peak friction coefficient of 1.02; the
// game's cold dry pavement is lower, which makes the test harder, not easier).
'use strict';
const {Grip, Phys, VEH, loadParams} = require('./simlib.js');
const G = 9.81, DT = Phys.DT;

// S7.11: "12-pole phaseless Butterworth" = a 6th-order Butterworth low-pass run forwards then backwards.
function butterFiltfilt(x, fc, fs){
  const w0 = 2*Math.PI*fc/fs, cw = Math.cos(w0), sw = Math.sin(w0);
  const secs = [0, 1, 2].map(k => { const Q = 1/(2*Math.cos((2*k + 1)*Math.PI/12)), al = sw/(2*Q), a0 = 1 + al;
    return [(1 - cw)/2/a0, (1 - cw)/a0, (1 - cw)/2/a0, -2*cw/a0, (1 - al)/a0]; });
  const pass = y => { for (const [b0, b1, b2, a1, a2] of secs){ let x1 = y[0], x2 = y[0], y1 = y[0], y2 = y[0];
    for (let i = 0; i < y.length; i++){ const xi = y[i], yi = b0*xi + b1*x1 + b2*x2 - a1*y1 - a2*y2; x2 = x1; x1 = xi; y2 = y1; y1 = yi; y[i] = yi; } } return y; };
  const n = x.length, pad = Math.min(n - 1, Math.round(fs)), ext = new Array(n + 2*pad);
  for (let i = 0; i < pad; i++){ ext[i] = 2*x[0] - x[pad - i]; ext[n + pad + i] = 2*x[n - 1] - x[n - 2 - i]; }
  for (let i = 0; i < n; i++) ext[pad + i] = x[i];
  pass(ext); ext.reverse(); pass(ext); ext.reverse();
  return ext.slice(pad, pad + n);
}

function makeSim(key, esc, params){
  const P = params || loadParams(), V = VEH[key];
  return Phys.createSim({vehicle:V, vehicleKey:key, grip:Grip.make(P.fixes), params:P, env:Phys.flatEnv({cond:'dry'}),
    tire:'allseason', T:-10, abs:true, esc, tcs:true, u:80/3.6});
}

// S7.6 / S7.6.1: 80 km/h held constant, steering ramps at 13.5 deg/s until about 0.5 g. A = the steering angle giving
// 0.3 g by linear regression. The regulation does not give the regression range; this uses 0.2-0.4 g (our choice).
function slowlyIncreasingSteer(key, params){
  const As = [];
  for (const dir of [1, -1]){
    const s = makeSim(key, true, params), st = s.st, sw = [], ay = [];
    let ang = 0;
    for (let i = 0; i < 60000; i++){
      if (st.t > 1) ang += 13.5*DT*dir;
      const e = 80/3.6 - st.u;
      s.step({steer:ang, throttle:Math.max(0, Math.min(1, e*1.5)), brake:0});
      sw.push(ang); ay.push(st.ayRaw);
      if (Math.abs(st.ayRaw) > .55*G || Math.abs(ang) > 300) break;
    }
    const ayf = butterFiltfilt(ay, 6, 1/DT);
    let n = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (let i = 0; i < ayf.length; i++){ const a = Math.abs(ayf[i])/G; if (a >= .2 && a <= .4){ const x = Math.abs(sw[i]); n++; sx += x; sy += a; sxx += x*x; sxy += x*a; } }
    const k = (n*sxy - sx*sy)/(n*sxx - sx*sx), b = (sy - k*sx)/n;
    As.push(Math.round((.3 - b)/k*10)/10);
  }
  return Math.round((As.reduce((a, b) => a + Math.abs(b), 0)/As.length)*10)/10;
}

// S7.9: sine at 0.7 Hz with a 500 ms dwell at the second peak, coasting at 80 km/h. dir +1 = counterclockwise (left) first.
function sineWithDwell(key, amp, dir, esc, params){
  const s = makeSim(key, esc, params), st = s.st, T = 1/.7, t0 = 1.0, cos = t0 + T + .5;
  const tt = [], sw = [], yaw = [], ay = [];
  for (let i = 0; i < Math.round((cos + 3)/DT); i++){
    const t = st.t; let a = 0;
    if (t >= t0 && t < t0 + .75*T) a = amp*Math.sin(2*Math.PI*.7*(t - t0));
    else if (t >= t0 + .75*T && t < t0 + .75*T + .5) a = -amp;
    else if (t >= t0 + .75*T + .5 && t < cos) a = amp*Math.sin(2*Math.PI*.7*(t - t0 - .5));
    s.step({steer:dir*a, throttle:0, brake:0});
    tt.push(st.t); sw.push(dir*a); yaw.push(st.r); ay.push(st.ayRaw);
  }
  const swf = butterFiltfilt(sw, 10, 1/DT), yf = butterFiltfilt(yaw, 6, 1/DT), af = butterFiltfilt(ay, 6, 1/DT);
  const at = (arr, t) => { const i = Math.min(arr.length - 2, Math.max(0, Math.floor(t/DT) - 1)), f = (t - tt[i])/DT; return arr[i] + (arr[i + 1] - arr[i])*f; };
  // S7.11.6 BOS: filtered steering reaches 5 deg in the initial direction
  let bos = null; for (let i = 1; i < swf.length; i++) if (dir*swf[i] >= 5){ bos = tt[i - 1] + (5 - dir*swf[i - 1])/(dir*swf[i] - dir*swf[i - 1])*DT; break; }
  // S7.11.8 the first local yaw-rate peak caused by the steering reversal (opposite sign to the initial yaw)
  let rev = 0; for (let i = 0; i < tt.length; i++) if (tt[i] > t0 + .5*T){ rev = i; break; }
  let pk = 0; for (let i = rev + 1; i < yf.length - 1; i++){ const y = -dir*yf[i]; if (y > 0 && y >= -dir*yf[i - 1] && y >= -dir*yf[i + 1]){ pk = y; break; } }
  const y1 = -dir*at(yf, cos + 1), y175 = -dir*at(yf, cos + 1.75);
  // S7.11.9 lateral displacement: double integration of lateral acceleration, zeroed at BOS, read at BOS + 1.07 s
  let v = 0, d = 0, disp = 0;
  for (let i = 0; i < tt.length; i++){ if (tt[i] < bos) continue; v += af[i]*DT; d += v*DT; if (tt[i] >= bos + 1.07){ disp = Math.abs(d); break; } }
  return {amp, dir, peak:pk, r1:pk > 0 ? y1/pk : Infinity, r175:pk > 0 ? y175/pk : Infinity, disp};
}

// The full S7.9 series and S5.2 verdict for one vehicle. gvwrOver3500: S5.2.3 uses 1.52 m instead of 1.83 m.
function series(key, esc, gvwrOver3500, params){
  const A = slowlyIncreasingSteer(key, params), amps = [];
  const last = 6.5*A <= 300 ? Math.max(6.5*A, 270) : 300;
  for (let a = 1.5*A; a < last - 1e-9; a += .5*A) if (a <= 300) amps.push(a);
  amps.push(last);
  const runs = [], minDisp = gvwrOver3500 ? 1.52 : 1.83;
  for (const amp of amps) for (const dir of [1, -1]){
    const r = sineWithDwell(key, amp, dir, esc, params);
    r.pass = r.r1 <= .35 && r.r175 <= .2 && (amp < 5*A || r.disp >= minDisp);
    runs.push(r);
  }
  return {key, esc, A, runs, pass:runs.every(r => r.pass)};
}

module.exports = {butterFiltfilt, slowlyIncreasingSteer, sineWithDwell, series};
if (require.main === module){
  for (const key of (process.argv[2] || 'small').split(',')) for (const esc of [true, false]){
    const s = series(key, esc, key === 'hd');
    const worst = s.runs.reduce((w, r) => r.r1 > w.r1 ? r : w, s.runs[0]);
    console.log(`${key} ESC ${esc ? 'on ' : 'off'} A=${s.A} deg  ${s.pass ? 'PASS' : 'FAIL'}  runs ${s.runs.length}  worst yaw@1.0s ${(worst.r1*100).toFixed(0)}% @${worst.amp.toFixed(0)} deg  min disp ${Math.min(...s.runs.filter(r => r.amp >= 5*s.A).map(r => r.disp)).toFixed(2)} m  fails: ${s.runs.filter(r => !r.pass).map(r => `${r.amp.toFixed(0)}${r.dir > 0 ? 'L' : 'R'}(${(r.r1*100).toFixed(0)}%/${(r.r175*100).toFixed(0)}%/${r.disp.toFixed(2)}m)`).join(' ')}`);
  }
}
