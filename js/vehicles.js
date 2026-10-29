/* Vehicle parameters for the v2 physics (brief 4.5). Each type is based on a real model's published specs.
   Sourced values come from docs/research/vehicle-specs.json (researched 2026-10-29; every value there has its source
   URL and a quote). Values marked "est" are estimates (no published number found); PHYSICS.md lists them.
   Units: SI (kg, m, N·m, W, rad unless named deg). */
(function(root, factory){ if (typeof module === 'object' && module.exports) module.exports = factory(); else root.WTVehicles = factory(); })(typeof self !== 'undefined' ? self : this, function(){
'use strict';
const G = 9.81;
// key: [based on, curb kg, GVWR kg (null = only a range published), wheelbase, track F, track R, front weight share,
//       CG height (= track / 2·SSF, NHTSA), rolling radius (unloaded, from tire size), steering ratio (null = est),
//       turning circle m (curb to curb), torque N·m, power kW, default drive, est-flags]
const SPEC = {
  small:  ['2019 Honda Civic Sedan LX',            1256.9, null,   2.7,    1.5469, 1.5621, .608,  .5252, .3215, 10.94, 10.79, 187, 117.8, 'fwd', {}],
  sedan:  ['2019 Toyota Camry LE',                 1495,   2029,   2.825,  1.59,   1.595,  null,  .5466, .3364, null,  11.4,  250, 151,   'fwd', {}],
  suv:    ['2019 Chevrolet Trax LS AWD',           1481.9, null,   2.5552, 1.5392, 1.5392, null,  .636,  .3467, null,  10.67, 201, 102.9, 'awd', {}],
  bigsuv: ['2019 Chevrolet Tahoe LT 4WD',          2541,   3311.2, 2.9464, 1.745,  1.745,  .522,  .7587, .4009, null,  11.89, 519, 264.7, '4x4', {}],
  van:    ['2019 Dodge Grand Caravan SE',          2050,   2744.2, 3.0782, 1.6655, 1.647,  .56,   .6678, .3621, 14.3,  11.92, 353, 211,   'fwd', {}],
  pickup: ['2019 Ford F-150 XLT SuperCrew 4x4',    2163.6, 2948.4, 3.683,  1.717,  1.717,  .5925, .7214, .4014, null,  14.63, 359, 216.3, '4x4', {}],
  hd:     ['2019 Ram 2500 Crew Cab 4x4',           3004.1, 4535.9, 3.785,  1.745,  1.729,  .578,  .8042, .3874, null,  14.6,  582, 306,   '4x4', {}]
};
// Estimates used where no published number was found:
const EST_FRONT = {sedan:.60, suv:.58};                 // v1 game values (VEH.front), est
const EST_RATIO = {sedan:15.5, suv:15.5, bigsuv:18, pickup:18, hd:18};  // overall steering ratio, est
const NAME = {small:'Small car', sedan:'Sedan', suv:'Small SUV', bigsuv:'Large SUV', van:'Minivan', pickup:'Pickup', hd:'Heavy-duty pickup'};
const V = {};
for (const key in SPEC){
  const [model, m, gvwr, L, tf, tr, front0, h, R, ratio0, turn, Tq, kW, drive] = SPEC[key];
  const front = front0 != null ? front0 : EST_FRONT[key], ratio = ratio0 != null ? ratio0 : EST_RATIO[key];
  const a = L*(1 - front), b = L*front;                 // CG to front / rear axle
  // Max road-wheel angle from the curb-to-curb turning circle D: the outer front wheel runs on radius D/2, so
  // sin(angle) = L/(D/2) (computed; both front wheels then use it, since the model has no Ackermann split)
  const maxWheelDeg = Math.asin(Math.min(1, L/(turn/2)))*180/Math.PI;
  V[key] = {
    key, name:NAME[key], basedOn:model, label:NAME[key] + ' (based on a ' + model + ')',
    m, gvwr, L, a, b, h, tf, tr, R,
    Iz: .95*m*a*b,                        // est: dynamic index Iz/(m·a·b) ≈ 0.95 (rule of thumb; NHTSA measured data stops at 1998)
    Iw: .9*Math.pow(R/.31, 3),            // est: wheel+tire+rotor spin inertia ≈ 0.9 kg·m² at R = 0.31 m, scaled with R³
    steerRatio: ratio, maxWheelDeg,
    brakeFront: .7,                       // est: fixed front share with ABS off (front-biased so the fronts lock first)
    brakeMax: 1.5*m*G*R,                  // est: total brake torque at full pedal, enough to lock all four on dry
    rollFront: .6,                        // est: front share of roll stiffness
    Kv: .0025,                            // est: ESC's stored understeer gradient, rad·s²/m
    // Engine torque and power sourced; idle, redline and gear ratios are est (generic 6-speed; the Civic's CVT and the
    // 8-speeds are approximated by it)
    engine: {Tmax:Tq, Pmax:kW*1000, idle:750*Math.PI/30, redline:6200*Math.PI/30, gears:[4.2, 2.6, 1.7, 1.25, 1.0, .8], final:3.6*R/.31, eff:.9},
    drive, awdFront:drive === 'awd' ? .6 : .5,          // est: AWD base front share
    sideArea: 2.2*L,                      // est: projected side area for crosswind, m²
    est:{front:front0 == null, steerRatio:ratio0 == null, Iz:true, gvwr:gvwr == null}
  };
}
return V;
});
