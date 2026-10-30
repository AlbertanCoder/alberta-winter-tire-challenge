/* Same steering, same pedals, only the tires changed (brief 4.7). Pure code: no DOM, no THREE. Loads in the browser
   (global WTCompare) and in Node. recorder() stores the physics input per 1 ms step; replay() feeds a recorded list to a
   fresh sim on any tire and reports where it ended. ROUGH DRAFT: refine later. */
(function(root, factory){ if (typeof module === 'object' && module.exports) module.exports = factory(); else root.WTCompare = factory(); })(typeof self !== 'undefined' ? self : this, function(){
'use strict';
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a)), R2D = 180/Math.PI;
// list entries: [n steps, steer, throttle, brake]; a new entry only when a value changes
function recorder(){
  const list = [];
  return {list, push(inp){
    const e = list[list.length - 1];
    if (e && e[1] === inp.steer && e[2] === inp.throttle && e[3] === inp.brake) e[0]++;
    else list.push([1, inp.steer, inp.throttle, inp.brake]);
  }};
}
// deps = {Phys, Road, grip, params, vehicles}; o as in the brief (sc, P, weather, T, vehicle, drive, tire, tread, abs, esc,
// tcs, x, z, psi, u, wind, inputs, half, maxT). Returns {tele:[{t, s, off, u, yawDeg}] every 20 ms, summary, end:{x, z, psi, u}}
function replay(deps, o){
  const {Phys, Road, grip, params} = deps, sc = o.sc, P = o.P, V = deps.vehicles[o.vehicle];
  const sim = Phys.createSim({vehicle:V, vehicleKey:o.vehicle, grip, params, env:Road.roadEnv(sc, P, grip, o.weather, sc.startS, o.wind || null),
    tire:o.tire, tread:o.tread, T:o.T, abs:o.abs, esc:o.esc, tcs:o.tcs, drive:o.drive, x:o.x, z:o.z, psi:o.psi, u:o.u});
  const st = sim.st, inp = {steer:0, throttle:0, brake:0, gear:'D'}, list = o.inputs || [], H = sc.hazard, hs = H && sc.kind === 'stop' ? H.s : null;
  const maxN = Math.round((o.maxT || 60)/Phys.DT), tele = [];
  let ei = 0, left = list.length ? list[0][0] : 0, hint = Math.max(0, Math.floor(sc.startS || 0)), L = Road.locate(P, st.x, st.z, hint);
  let maxYaw = 0, offRoad = false, spun = false, hitAt = null, ended = false;
  for (let n = 0; n < maxN; n++){
    if (ei < list.length){ const e = list[ei]; inp.steer = e[1]; inp.throttle = e[2]; inp.brake = e[3]; if (--left <= 0 && ++ei < list.length) left = list[ei][0]; }
    else if (st.u < .01){ ended = true; break; }
    sim.step(inp);
    if (n % 5 === 0){
      L = Road.locate(P, st.x, st.z, hint); hint = L.i;
      const yaw = wrap(st.psi - P[L.i].psi)*R2D, ay = Math.abs(yaw);
      if (ay > maxYaw) maxYaw = ay; if (ay > 90) spun = true;
      if (hs != null && hitAt == null && L.s + o.half >= hs) hitAt = Math.max(0, st.u)*3.6;
      if (!offRoad){ let side = 0; for (const w of st.w){ const f = Road.locate(P, w.x, w.z, hint).off; if (Math.abs(f) > Road.HW) side += Math.sign(f); } if (Math.abs(side) === 4) offRoad = true; }
      if (n % 20 === 0) tele.push({t:st.t, s:L.s, off:L.off, u:st.u, yawDeg:yaw});
    }
  }
  L = Road.locate(P, st.x, st.z, hint);
  return {tele, end:{x:st.x, z:st.z, psi:st.psi, u:st.u},
    summary:{stopS:L.s + o.half, maxYawDeg:maxYaw, offRoad, spun, hitAt, stopped:ended}};
}
// A short factual sentence from two summaries. tireA/tireB are plain-English names ('winter', 'all-season').
function describe(a, b, tireA, tireB, sc){
  const head = 'Same steering, same pedals, only the tires changed: ';
  const one = (x, t) => {
    if (sc && sc.hazard && sc.kind === 'stop' && x.hitAt != null) return 'on ' + t + ' tires you hit it at ' + Math.round(x.hitAt) + ' km/h';
    if (x.spun) return 'on ' + t + ' tires you spun';
    if (x.offRoad) return 'on ' + t + ' tires you left the road';
    if (sc && sc.hazard && sc.kind === 'stop') return 'on ' + t + ' tires you stopped ' + Math.max(0, Math.round(sc.hazard.s - x.stopS)) + ' m short of the hazard';
    return 'on ' + t + ' tires you stayed in control';
  };
  return head + one(a, tireA) + '; ' + one(b, tireB) + '.';
}
return {recorder, replay, describe};
});
