/* Crosswind gusts (brief 4.4). Pure code: no DOM, no THREE. Browser global WTWind, Node module.exports.
   A seeded gust series, so the same scenario and seed give the same wind every run. Every number here is an ESTIMATE
   chosen to be a plausible prairie crosswind, not a measurement: mean speed, gust size and gust timing are labelled so.
   gust(o) returns a function of time t (s) giving the wind velocity [x, z] in world axes (m/s), for roadEnv's wind. */
(function(root, factory){ if (typeof module === 'object' && module.exports) module.exports = factory(); else root.WTWind = factory(); })(typeof self !== 'undefined' ? self : this, function(){
'use strict';
// Settings by name. mean and gust in m/s (estimates); tau = how long a gust builds and fades, s (estimate)
const KIND = {calm:{mean:0, gust:0, tau:1}, light:{mean:4, gust:3, tau:2.5}, gusty:{mean:8, gust:6, tau:2}};
function rng(seed){ let a = seed >>> 0; return function(){ a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0)/4294967296; }; }
// o = {kind, seed, dir}: dir = direction the wind blows TOWARD, in world axes as [x, z] (normalised here), e.g. the
// road's right vector for a wind from the left. Gusts: one random target every tau seconds, eased with a smoothstep,
// so the force has no jumps (a step in side force would kick the car's yaw unrealistically).
function gust(o){
  const k = KIND[o.kind || 'calm'], r = rng(o.seed || 1), n = Math.hypot(o.dir[0], o.dir[1]) || 1, dx = o.dir[0]/n, dz = o.dir[1]/n;
  if (!k.mean && !k.gust) return t => [0, 0];
  const pts = [k.mean];                       // speed at t = 0, tau, 2 tau ...
  const at = i => { while (pts.length <= i) pts.push(Math.max(0, k.mean + k.gust*(2*r() - 1))); return pts[i]; };
  return t => {
    const x = Math.max(0, t)/k.tau, i = Math.floor(x), f = x - i, e = f*f*(3 - 2*f), w = at(i) + (at(i + 1) - at(i))*e;
    return [dx*w, dz*w];
  };
}
return {KIND, gust};
});
