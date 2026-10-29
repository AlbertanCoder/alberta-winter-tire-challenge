// Shared helpers for scripts/calibrate.js and the tests. Node only.
'use strict';
const path = require('path');
const Grip = require(path.join(__dirname, '..', 'js', 'grip.js'));
const Phys = require(path.join(__dirname, '..', 'js', 'physics.js'));
const VEH = require(path.join(__dirname, '..', 'js', 'vehicles.js'));

function loadParams(){ try { delete require.cache[require.resolve('../js/tire-params.js')]; return require('../js/tire-params.js'); } catch (e){ return null; } }

// Full-simulation straight-line stop on a flat, uniform surface. Brake pedal goes to `brake` at t = 0 (reaction 0).
// Returns the distance travelled until the car stops (forward speed under 0.01 m/s), in metres.
function simStop(o){
  const params = o.params || loadParams(), grip = Grip.make(params.fixes);
  const V = VEH[o.vehicle || 'small'];
  const env = Phys.flatEnv({cond:o.cond, grade:o.grade || 0});
  const sim = Phys.createSim({vehicle:V, vehicleKey:V.key, grip, params, env, tire:o.tire, tread:o.tread, T:o.T == null ? -10 : o.T,
    abs:o.abs, esc:o.esc, tcs:o.tcs, drive:o.drive, u:o.v0});
  const st = sim.st, z0 = st.z, inp = {steer:0, throttle:0, brake:o.brake == null ? 1 : o.brake, gear:o.gear || 'D'};
  for (let n = 0; n < 600000; n++){ sim.step(inp); if (st.u < .01) break; }
  return {dist:z0 - st.z, t:st.t, sim};
}
function legacyStop(o, fixes){
  const g = Grip.make(fixes);
  return g.stopRun(o.tire, {cond:o.cond, T:o.T == null ? -10 : o.T, grade:o.grade || 0}, 0, o.v0, {vehicle:o.vehicle || 'small', tread:o.tread || 'new', abs:o.abs !== false, rt:0}).dist;
}
const KMH = v => v/3.6, FT = m => m/.3048;
module.exports = {Grip, Phys, VEH, loadParams, simStop, legacyStop, KMH, FT};
