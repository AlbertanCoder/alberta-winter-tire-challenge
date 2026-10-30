/* Road geometry and the physics environment for a scenario (Phase 2). Pure code: no DOM, no THREE.
   buildPath, at and locate are copied from index.html v1 so the game and the physics share one geometry.
   Road frame: s along the road, off positive to the right; heading psi as in physics.js. */
(function(root, factory){ if (typeof module === 'object' && module.exports) module.exports = factory(); else root.WTRoad = factory(); })(typeof self !== 'undefined' ? self : this, function(){
'use strict';
const HW = 3.6, LANE = 1.8, BANK = .06;   // v1: road half-width, right-lane centre, curves banked 6%
// Normal crown on straights: asphalt crowned at the centreline (of each roadway on divided highways), 0.02 m/m down to
// each edge. Alberta Transportation, Highway Geometric Design Guide, ch. C (Feb 2022), C.1.2 and Table C-1-1a.
// Simplification: crown switches straight to the curve's bank at the curve start (no superelevation runoff).
const CROWN = .02;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
// One sample per metre: {x, z, psi, k} with curvature k = +1/R for left curves, -1/R for right (index.html v1)
function buildPath(def){
  const P = []; let x = 0, z = 0, psi = 0; P.push({x, z, psi, k:0});
  def.forEach(seg => {
    if (seg[0] === 's'){ for (let i = 0; i < seg[1]; i++){ x += -Math.sin(psi); z += -Math.cos(psi); P.push({x, z, psi, k:0}); } }
    else { const R = seg[1], n = Math.round(R*seg[2]*Math.PI/180), d = seg[3] === 'R' ? -1 : 1;
      for (let i = 0; i < n; i++){ const pm = psi + d*.5/R; x += -Math.sin(pm); z += -Math.cos(pm); psi += d/R; P.push({x, z, psi, k:d/R}); } }
  });
  return P;
}
function at(P, s, off){
  const i = clamp(Math.floor(s), 0, P.length - 2), f = clamp(s - i, 0, 1), a = P[i], b = P[i+1];
  let x = a.x + (b.x - a.x)*f, z = a.z + (b.z - a.z)*f; const psi = a.psi + (b.psi - a.psi)*f;
  const ex = s < 0 ? s : Math.max(0, s - (P.length - 1)); if (ex){ x -= Math.sin(psi)*ex; z -= Math.cos(psi)*ex; }
  return {x: x + Math.cos(psi)*off, z: z - Math.sin(psi)*off, psi};
}
function locate(P, x, z, hint){
  let best = hint, bd = Infinity;
  for (let i = Math.max(0, hint - 25); i < Math.min(P.length, hint + 60); i++){ const dx = x - P[i].x, dz = z - P[i].z, d = dx*dx + dz*dz; if (d < bd){ bd = d; best = i; } }
  const p = P[best], dx = x - p.x, dz = z - p.z;
  return {i:best, s: best + (dx*-Math.sin(p.psi) + dz*-Math.cos(p.psi)), off: dx*Math.cos(p.psi) - dz*Math.sin(p.psi)};
}
// Physics environment for a scenario: surface from the v1 surfaceAt (by s), grade along the road, 6% bank on curves
// (falling toward the inside of the curve), crown on straights (sc.crown in %, default 2). grip = WTGrip.make(fixes).
// wind: optional function of time returning the wind velocity [x, z] in world axes, m/s. The hint keeps locate() local.
function roadEnv(sc, P, grip, weather, s0, wind){
  const crown = (sc.crown == null ? CROWN*100 : sc.crown)/100;
  let hint = Math.max(0, Math.floor(s0 || sc.startS || 0));
  const grade = (sc.grade || 0)/100;
  return {
    P,
    sample(x, z, out){
      const L = locate(P, x, z, hint); hint = L.i;
      const p = P[L.i], dhdoff = p.k > 0 ? BANK : p.k < 0 ? -BANK : L.off >= 0 ? -crown : crown;
      out.cond = grip.surfaceAt(sc, L.s, weather);
      out.gx = grade*-Math.sin(p.psi) + dhdoff*Math.cos(p.psi);
      out.gz = grade*-Math.cos(p.psi) - dhdoff*Math.sin(p.psi);
      out.plough = 0; out.s = L.s; out.off = L.off;
      return out;
    },
    wind: wind ? (t, out) => { const w = wind(t); out.x = w[0]; out.z = w[1]; return out; } : null
  };
}
return {HW, LANE, BANK, CROWN, buildPath, at, locate, roadEnv};
});
