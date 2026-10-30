/* Hazard fairness (brief 4.11). Pure code: no DOM, no THREE. Loads in the browser (global WTFair) and in Node.
   The reference driver: winter tires, new tread, ABS, ESC and traction control on, the player's vehicle and drive type,
   holding speed in the right lane, reacting 1.0 s after the hazard appears, then braking fully while steering to keep
   the lane. warnDist(v) is how far ahead of the car's front the hazard must appear so that driver stops 2.5 m short.
   The game reads warnDist from a table that scripts/fairness.js builds with this same full simulation. */
(function(root, factory){ if (typeof module === 'object' && module.exports) module.exports = factory(); else root.WTFair = factory(); })(typeof self !== 'undefined' ? self : this, function(){
'use strict';
const RT = 1.0, MARGIN = 2.5, LANE = 1.8;
// Lane-keeping gains for the reference driver (estimates, chosen so it holds the lane centre within a few cm)
const KEEP = {path:1, off:.06, head:.8};
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
// deps = {Phys, Road, grip, params, vehicles}. o = {vehicle, drive, weather, T, v (m/s), front (s of the car's front),
// half (half the car's length)}. Returns the distance the car's front travels until the car stops, in metres.
function refStop(deps, sc, P, o){
  const {Phys, Road, grip, params} = deps, V = deps.vehicles[o.vehicle];
  const sc0 = o.front - o.half, p = Road.at(P, sc0, LANE);
  const sim = Phys.createSim({vehicle:V, vehicleKey:o.vehicle, grip, params, env:Road.roadEnv(sc, P, grip, o.weather, sc0),
    tire:'winter', tread:'new', T:o.T, abs:true, esc:true, tcs:true, drive:o.drive, x:p.x, z:p.z, psi:p.psi, u:o.v});
  const st = sim.st, inp = {steer:0, throttle:0, brake:0, gear:'D'}, n0 = Math.round(RT/Phys.DT);
  let hint = Math.max(0, Math.min(P.length - 1, Math.floor(sc0))), L = Road.locate(P, st.x, st.z, hint);
  for (let n = 0; n < 200000; n++){
    if (n < n0) inp.throttle = Math.max(0, Math.min(1, (o.v - st.u)*1.5));   // holding speed, as the game's driver does
    else { inp.throttle = 0; inp.brake = 1; if (st.u < .01) break; }
    if (n % 10 === 0){
      L = Road.locate(P, st.x, st.z, hint); hint = L.i;
      const k = P[L.i].k, eh = wrap(st.psi - P[L.i].psi);
      const d = Math.atan(V.L*k)*KEEP.path + KEEP.off*(L.off - LANE) - KEEP.head*eh;   // road-wheel angle, positive = left
      inp.steer = d*180/Math.PI*V.steerRatio;
    }
    sim.step(inp);
  }
  L = Road.locate(P, st.x, st.z, hint);
  return L.s - sc0;
}
// Warning distance for one speed: the hazard at Hs, the reference driver's stop ending MARGIN short of it.
// guess: a starting estimate (the legacy 1-D model). e(D) = stop distance + margin - D falls as D grows. Secant steps
// inside a bracket, bisecting when a step leaves it: where braking would start at a surface edge (dry onto ice) e is
// very steep, and the bracket still pins D. Returns {D, err, width (final bracket, m), evals}.
function solveWarn(deps, sc, P, o, Hs, guess){
  // Trigger points stay between the hazard itself and the start of the road (a 1 km run-up is added before s = 0)
  const lo = MARGIN, hi = Hs + 1000, cl = D => Math.max(lo, Math.min(hi, D));
  const f = D => { const d = refStop(deps, sc, P, Object.assign({}, o, {front:Hs - D})); return d + MARGIN - D; };
  let D0 = cl(guess), e0 = f(D0), k = 1; if (Math.abs(e0) < .01) return {D:D0, err:e0, width:0, evals:k};
  // Bracket: a (e > 0, trigger too late) and b (e < 0, too early)
  let a = null, ea, b = null, eb;
  const take = (D, e) => { if (e > 0){ if (a == null || D > a){ a = D; ea = e; } } else if (b == null || D < b){ b = D; eb = e; } };
  take(D0, e0);
  let D1 = cl(D0 + e0), e1 = f(D1); k++; take(D1, e1);
  for (let step = Math.max(1, Math.abs(e0)); (a == null || b == null) && k < 30; step *= 2){   // widen until bracketed
    const D = a == null ? cl(Math.min(D0, D1) - step) : cl(Math.max(D0, D1) + step), e = f(D); k++; take(D, e);
    if (D === lo || D === hi) break;
  }
  if (a == null || b == null) return {D:D1, err:e1, width:Infinity, evals:k};
  let D = D1, e = e1;
  while (Math.abs(e) > .01 && b - a > .01 && k < 60){
    let Dn = b - eb*(b - a)/(eb - ea);                       // secant (false position) inside the bracket
    if (!(Dn > a && Dn < b) || Math.abs(Dn - D) < 1e-4) Dn = (a + b)/2;
    if (k % 3 === 0) Dn = (a + b)/2;                          // every third step bisects, so the bracket always shrinks
    D = Dn; e = f(D); k++; take(D, e);
  }
  if (Math.abs(e) > .01){ D = (a + b)/2; }
  return {D, err:e, width:b - a, evals:k};
}
// Table lookup: row = [v0, D0, v1, D1, ...], speeds ascending (m/s), extra speeds where the curve bends sharply.
// Braking distance grows with v², so the braking part (D minus the margin and the reaction distance) is interpolated
// linearly in v² between table speeds.
function interp(v0, D0, v1, D1, v){
  const b0 = D0 - MARGIN - v0*RT, b1 = D1 - MARGIN - v1*RT, f = (v*v - v0*v0)/(v1*v1 - v0*v0);
  return MARGIN + v*RT + b0 + (b1 - b0)*f;
}
function lookup(row, v){
  v = Math.max(0, v);
  let lo = 0, hi = row.length/2 - 1;
  while (hi - lo > 1){ const m = (lo + hi) >> 1; if (row[2*m] <= v) lo = m; else hi = m; }
  return interp(row[2*lo], row[2*lo + 1], row[2*hi], row[2*hi + 1], v);
}
// The table row for a key (a row may name an identical row instead of repeating it)
function row(tab, key){ const r = tab.D[key]; return typeof r === 'string' ? tab.D[r] : r; }
return {RT, MARGIN, KEEP, refStop, solveWarn, interp, lookup, row};
});
