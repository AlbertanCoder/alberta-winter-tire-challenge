/* Vehicle parameters for the v2 physics (brief 4.5).
   INTERIM: every value below is an ESTIMATE built only from numbers already in the game (v1 VEH mass and
   driven-axle shares, PROF wheelbase/width/wheel radius) plus stated rules of thumb. The spec-sheet and NHTSA
   research that replaces them (and names the real model each type is based on) is an open Phase 1 item in
   PROGRESS.md. Units: SI (kg, m, N·m, W, rad unless named deg). */
(function(root, factory){ if (typeof module === 'object' && module.exports) module.exports = factory(); else root.WTVehicles = factory(); })(typeof self !== 'undefined' ? self : this, function(){
'use strict';
const G = 9.81;
// [key, v1 mass kg, front weight share (v1 VEH.front for FWD cars), v1 PROF wheelbase, PROF width, PROF wheel radius,
//  CG height (estimate), default drive, engine N·m (estimate), engine kW (estimate), base AWD front share]
const BASE = [
  ['small',  1250, .62, 2.55, 1.74, .31, .55, 'fwd', 190, 110, .6],
  ['sedan',  1500, .60, 2.80, 1.80, .32, .56, 'fwd', 250, 150, .6],
  ['suv',    1600, .58, 2.66, 1.82, .36, .65, 'awd', 200, 115, .6],
  ['bigsuv', 2300, .53, 3.00, 2.00, .40, .75, '4x4', 520, 265, .5],
  ['van',    2000, .57, 3.00, 1.95, .34, .66, 'fwd', 360, 210, .6],
  ['pickup', 2300, .58, 3.60, 2.00, .42, .75, '4x4', 540, 290, .5],
  ['hd',     3300, .60, 4.00, 2.05, .45, .85, '4x4', 1000, 300, .5]
];
const V = {};
for (const [key, m, front, L, w, R, h, drive, Tq, kW, awdFront] of BASE){
  const a = L*(1 - front), b = L*front;   // CG to front / rear axle
  V[key] = {
    key, m, L, a, b, h,
    tf: w - .2, tr: w - .2,               // track ≈ body width − 0.2 m (estimate)
    Iz: .95*m*a*b,                        // yaw inertia: dynamic index Iz/(m·a·b) ≈ 0.95 (rule-of-thumb estimate)
    R, Iw: .9*Math.pow(R/.31, 3),         // wheel+tire+rotor spin inertia ≈ 0.9 kg·m² at R = 0.31, scaled with R³ (estimate)
    steerRatio: key === 'hd' || key === 'pickup' || key === 'bigsuv' ? 18 : 15.5,  // estimate
    maxWheelDeg: 35,                      // estimate
    brakeFront: .7,                       // fixed front share with ABS off (estimate, front-biased so fronts lock first)
    brakeMax: 1.5*m*G*R,                  // total brake torque at full pedal: enough to lock all four on dry (estimate)
    rollFront: .6,                        // front share of roll stiffness (estimate)
    Kv: .0025,                            // ESC's stored understeer gradient, rad·s²/m (estimate; ECU calibration value)
    engine: {Tmax:Tq, Pmax:kW*1000, idle:750*Math.PI/30, redline:6200*Math.PI/30, gears:[4.2, 2.6, 1.7, 1.25, 1.0, .8], final:3.6, eff:.9},
    drive, awdFront,
    sideArea: 2.2*L,                      // projected side area for crosswind, m² (estimate)
    est:true
  };
}
return V;
});
