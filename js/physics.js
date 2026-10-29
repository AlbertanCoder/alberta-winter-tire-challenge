/* Alberta Winter Tire Challenge, physics v2 (brief 4.1-4.4). Pure code: no DOM, no THREE.
   Loads in the browser (window.WTPhys) and in Node (require). Fixed 1 ms step, deterministic.

   Frames (same conventions as index.html):
     world: x, z on the ground, y up. Heading psi; forward = (-sin psi, -cos psi), left = (-cos psi, sin psi).
            psi grows when the car turns left.
     body:  X forward, Y left, yaw rate r = dpsi/dt (positive = turning left).
     road:  s along the road, off positive to the right of the centre line (straight-road helper: s = -z, off = x).
   Wheels: 0 front-left, 1 front-right, 2 rear-left, 3 rear-right.

   Every number marked "estimate" has no measured source yet; PHYSICS.md lists them. */
(function(root, factory){ if (typeof module === 'object' && module.exports) module.exports = factory(); else root.WTPhys = factory(); })(typeof self !== 'undefined' ? self : this, function(){
'use strict';
const G = 9.81, DT = .001, DEG = Math.PI/180;
const RHO_AIR = 101325/(287.05*263.15);   // ideal-gas air density at -10 °C and sea-level pressure, about 1.34 kg/m³

/* ---------- Tire constants ---------- */
const TC = {
  LX: .15,       // longitudinal relaxation length, m (estimate)
  LY: .40,       // lateral relaxation length, m (estimate)
  KCAP: 3,       // deflection-state caps (slip ratio, tan of slip angle): beyond these the tire is fully sliding
  ACAP: 12,
  VBLEND: 1.5,   // m/s: below this the low-speed damping blends in (Bernard & Clover, SAE 950311, low-speed treatment)
  ZETA: .7,      // damping ratio of that low-speed term (estimate)
  LS: .1         // load sensitivity: mu falls 10% per 100% load above the vehicle's average wheel load (estimate)
};
// Slip at the force peak, by surface (same value for slip ratio and tan(slip angle), so a sliding tire pushes
// straight against its sliding direction). All estimates; ice peaks at a small slip, which is why it gives no warning.
const PEAK_SLIP = {dry:.12, snow:.15, fresh:.2, slush:.12, ice:.06, gravel:.25};
function shapeKind(COND, cond){ return cond === 'gravel' ? 'gravel' : cond === 'fresh' ? 'fresh' : COND[cond].kind; }

// Magic Formula-style curve normalised so its peak (C > 1) is 1 at s = 1. With C = 1 and a given B (gravel) the curve
// rises without a peak toward 1: a locked tire ploughs a wedge of gravel and grips more (NHTSA SAE 1999-01-1287).
function mfShape(C, B){ return B != null ? {C:1, B, N:1} : {C, B:Math.tan(Math.PI/(2*C)), N:1}; }
function mf(s, sh){ return Math.sin(sh.C*Math.atan(sh.B*s))/sh.N; }

/* ---------- Aid constants (estimates: generic logic, not any maker's) ---------- */
const ABS_C = {UP:25, DN:40, LAM_HI:.105, LAM_LO:.095, DLAM:10, VMIN:1.0, AREL:15, ATAU:.01};
const ESC_C = {K:8, DB:.035, DBK:.08, AY_MARGIN:1.0, VMIN:3, THR_CUT:.25};
const TCS_C = {SV:1.0, SVK:.08, K:.15, MAX:.35, VMIN:0};
const DRV_C = {CREEP:.03, VCREEP:1.7, KAWD:5, K4:.2};
const LOAD_TAU = .05;   // s: filter on the accelerations used for load transfer (suspension lag, estimate)

/* ---------- Coordinate helpers ---------- */
function bodyToWorld(psi, bx, by){ const s = Math.sin(psi), c = Math.cos(psi); return [-s*bx - c*by, -c*bx + s*by]; }
function worldToBody(psi, wx, wz){ const s = Math.sin(psi), c = Math.cos(psi); return [-s*wx - c*wz, -c*wx + s*wz]; }
function straightRoad(x, z){ return {s:-z, off:x}; }
function roadToWorldStraight(s, off){ return {x:off, z:-s}; }

/* ---------- Seeded random (mulberry32) ---------- */
function rng(seed){ let a = seed >>> 0; return function(){ a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0)/4294967296; }; }

/* ---------- Environments ----------
   env.sample(x, z, out) fills out = {cond, gx, gz, plough}: the surface, the ground-height gradient dh/dx, dh/dz
   (so ruts, crown, bank and grade all come through one place), and a ploughing-drag coefficient (share of load).
   env.wind(t, out) optionally fills out = {x, z}: wind velocity in world axes, m/s. */
function flatEnv(o){
  o = o || {};
  const cond = o.cond || 'dry', grade = (o.grade || 0)/100, crown = (o.crown || 0)/100, bank = (o.bank || 0)/100;
  const condFn = o.condFn || null, wind = o.wind || null, plough = o.plough || 0;
  return {
    sample(x, z, out){
      const s = -z, off = x;
      out.cond = condFn ? condFn(s, off) : cond;
      // h = grade·s − crown·|off| − bank·off  (crown: centre high; bank: falls to the right when positive)
      const dhdoff = -crown*(off >= 0 ? 1 : -1) - bank;
      out.gx = dhdoff; out.gz = -grade; out.plough = plough;
      return out;
    },
    wind: wind ? (t, out) => { const w = wind(t); out.x = w[0]; out.z = w[1]; return out; } : null
  };
}

/* ---------- Simulation ---------- */
const DRIVEN = {fwd:[1,1,0,0], rwd:[0,0,1,1], awd:[1,1,1,1], '4x4':[1,1,1,1]};
function clamp(v, a, b){ return v < a ? a : v > b ? b : v; }

function createSim(o){
  const V = o.vehicle, grip = o.grip, P = o.params, env = o.env;
  const tire = o.tire, tread = o.tread || 'new', T = o.T == null ? -10 : o.T, vehKey = o.vehicleKey || V.key;
  const absOn = o.abs !== false, escOn = absOn && o.esc !== false, tcsOn = absOn && o.tcs !== false;  // ESC and TCS use the ABS hardware
  const drive = o.drive || V.drive, driven = DRIVEN[drive];
  const m = V.m, R = V.R, Iw = V.Iw, Iz = V.Iz;
  const mEff = m + 4*Iw/(R*R);                     // coast-down drag is a measured deceleration, so it includes spinning mass
  const WX = [V.a, V.a, -V.b, -V.b], WY = [V.tf/2, -V.tf/2, V.tr/2, -V.tr/2];
  const cache = {};
  function surf(cond){
    let p = cache[cond]; if (p) return p;
    const sp = P.surf[cond][tire], k = shapeKind(grip.COND, cond);
    const ratio = grip.gripMu(tire, cond, T, vehKey, tread)/grip.gripMu(tire, cond, P.ref.T, P.ref.vehicle, 'new');
    p = cache[cond] = Object.assign({mu:sp.pk*ratio, kpk:PEAK_SLIP[k]}, mfShape(sp.C, sp.B));
    p.slope0 = p.C*p.B/p.N;                         // d f / d s at s = 0
    return p;
  }
  const u0 = o.u || 0;
  const st = {
    t:0, x:o.x || 0, z:o.z || 0, psi:o.psi || 0, u:u0, v:0, r:0, axs:0, ays:0, axRaw:0, ayRaw:0,
    vRef:u0, gear:0, delta:0, esc:false, tcs:false, abs:false, steps:0, hash:2166136261,
    w:[0,1,2,3].map(i => ({i, om:u0/R, omPrev:u0/R, ux:0, uy:0, Fz:0, Fx:0, Fy:0, Fmax:0, mu:0, kap:0, alp:0, x:0, z:0,
      cond:'', p:1, mode:0, Tb:0, Td:0, absAct:false, locked:false, bx:0, by:0, Q:0}))
  };
  const smp = {cond:'', gx:0, gz:0, plough:0}, ws = [0,1,2,3].map(() => ({cond:'', gx:0, gz:0, plough:0})), wnd = {x:0, z:0};
  const Tesc = [0,0,0,0], Ttcs = [0,0,0,0];
  // Static loads for the first step
  (function(){ const N = m*G; st.w.forEach((w, i) => { w.Fz = (i < 2 ? N*V.b/V.L : N*V.a/V.L)/2; }); })();

  function step(inp){
    const W = st.w, sn = Math.sin(st.psi), cs = Math.cos(st.psi);
    const thr0 = clamp(inp.throttle || 0, 0, 1), brk = clamp(inp.brake || 0, 0, 1), neutral = inp.gear === 'N';
    const delta = clamp((inp.steer || 0)/V.steerRatio, -V.maxWheelDeg, V.maxWheelDeg)*DEG;
    st.delta = delta;
    // --- Ground under the car and under each wheel
    env.sample(st.x, st.z, smp);
    for (let i = 0; i < 4; i++){ const w = W[i]; w.x = st.x - sn*WX[i] - cs*WY[i]; w.z = st.z - cs*WX[i] + sn*WY[i]; env.sample(w.x, w.z, ws[i]); }
    // --- Normal loads: weight normal to the road, then transfer from filtered specific forces (no algebraic loop)
    const g2 = smp.gx*smp.gx + smp.gz*smp.gz, N = m*G/Math.sqrt(1 + g2);
    const dLong = m*st.axs*V.h/V.L, dF = V.rollFront*m*st.ays*V.h/V.tf, dR = (1 - V.rollFront)*m*st.ays*V.h/V.tr;
    const fz = [N*V.b/V.L/2 - dLong/2 - dF, N*V.b/V.L/2 - dLong/2 + dF, N*V.a/V.L/2 + dLong/2 - dR, N*V.a/V.L/2 + dLong/2 + dR];
    let sum = 0; for (let i = 0; i < 4; i++){ if (fz[i] < 0) fz[i] = 0; sum += fz[i]; }
    for (let i = 0; i < 4; i++) W[i].Fz = sum > 0 ? fz[i]*N/sum : N/4;
    const Fz0 = N/4;
    // --- Driver aids that act before the wheels: ESC (yaw control) and TCS (wheel-spin control)
    const vRef = st.vRef;
    let thr = thr0; st.esc = false; st.tcs = false;
    for (let i = 0; i < 4; i++){ Tesc[i] = 0; Ttcs[i] = 0; }
    if (escOn && vRef > ESC_C.VMIN){
      // Target yaw rate from steering (bicycle model with the ECU's stored understeer gradient), limited by the
      // friction the car is showing through its lateral accelerometer. ESC never sees the real surface mu.
      const rLin = vRef*delta/(V.L + V.Kv*vRef*vRef), rMax = (Math.abs(st.ays) + ESC_C.AY_MARGIN)/vRef;
      const rt = clamp(rLin, -rMax, rMax), err = st.r - rt, db = ESC_C.DB + ESC_C.DBK*Math.abs(rt);
      if (Math.abs(err) > db){
        const M = -ESC_C.K*Iz*(err - Math.sign(err)*db);              // yaw moment wanted, N·m
        const over = Math.abs(st.r) > Math.abs(rt) && (st.r*rt >= 0);  // turning more than asked: oversteer
        const left = M > 0, wi = over ? (left ? 0 : 1) : (left ? 2 : 3);  // outside front for a spin, inside rear for a push
        const tw = wi < 2 ? V.tf : V.tr;
        Tesc[wi] = Math.min(Math.abs(M)/(tw/2)*R, .25*V.brakeMax);
        st.esc = true; thr *= ESC_C.THR_CUT;
      }
    }
    if (tcsOn){
      let any = false, slipSum = 0, nD = 0;
      for (let i = 0; i < 4; i++){ if (!driven[i]) continue; nD++;
        const ref = Math.max(0, vRef - st.r*WY[i]), sv = W[i].om*R - ref, th = TCS_C.SV + TCS_C.SVK*ref;
        slipSum += Math.max(0, sv - th);
        if (sv > th){ Ttcs[i] = Math.min(TCS_C.MAX*m*G*R/4*4, TCS_C.K*m*G*R*(sv - th)); any = true; } }
      if (any){ st.tcs = true; thr *= Math.max(.15, 1 - .5*slipSum/nD); }
    }
    // --- Engine and automatic transmission
    const E = V.engine;
    let omD = 0, nDr = 0; for (let i = 0; i < 4; i++) if (driven[i]){ omD += W[i].om; nDr++; } omD /= nDr;
    let Ta = 0;
    if (!neutral){
      const up = (2200 + 3000*thr)*Math.PI/30, down = 1300*Math.PI/30;
      while (st.gear < E.gears.length - 1 && omD*E.gears[st.gear]*E.final > up) st.gear++;
      while (st.gear > 0 && omD*E.gears[st.gear]*E.final < down) st.gear--;
      const ratio = E.gears[st.gear]*E.final, we = Math.max(E.idle, omD*ratio);
      const Te = we > E.redline ? 0 : thr*Math.min(E.Tmax, E.Pmax/we);
      Ta = Te*ratio*E.eff;
      if (thr0 < .02){ const creep = DRV_C.CREEP*m*G*R*clamp((DRV_C.VCREEP - omD*R)/DRV_C.VCREEP, 0, 1); if (creep > Ta) Ta = creep; }  // idle creep in D
    }
    // --- Split the drive torque (open differentials on each driven axle)
    const Td = [0,0,0,0];
    if (drive === 'fwd'){ Td[0] = Td[1] = Ta/2; }
    else if (drive === 'rwd'){ Td[2] = Td[3] = Ta/2; }
    else if (drive === 'awd'){
      // Simplification: an active coupling moves torque toward the axle that is slipping less.
      const ref = Math.max(1, vRef), sF = ((W[0].om + W[1].om)/2*R - vRef)/ref, sR = ((W[2].om + W[3].om)/2*R - vRef)/ref;
      const f = clamp(V.awdFront - DRV_C.KAWD*(sF - sR), .1, .9);
      Td[0] = Td[1] = Ta*f/2; Td[2] = Td[3] = Ta*(1 - f)/2;
    } else {
      // 4x4, locked centre: split so both axles accelerate alike (using last step's tire and brake torques),
      // plus a small correction that pulls the axle speeds together.
      const Qf = W[0].Q + W[1].Q, Qr = W[2].Q + W[3].Q, dom = (W[2].om + W[3].om - W[0].om - W[1].om)/2;
      const Tf = (Ta + Qf - Qr)/2 + DRV_C.K4*2*Iw*dom/DT;
      Td[0] = Td[1] = Tf/2; Td[2] = Td[3] = (Ta - Tf)/2;
    }
    // --- Brakes: pedal to torque; ABS on adds electronic brake-force distribution (ideal split for the measured decel)
    const Tp = brk*V.brakeMax;
    const dec = Math.max(0, -st.axs)/G;
    const fShare = absOn ? clamp((V.b + V.h*dec)/V.L, .5, .85) : V.brakeFront;
    st.abs = false;
    let SFx = 0, SFy = 0, SM = 0;
    for (let i = 0; i < 4; i++){
      const w = W[i], sp = surf(ws[i].cond), Fz = w.Fz;
      w.cond = ws[i].cond;
      const muI = sp.mu*Math.max(.5, 1 - TC.LS*(Fz/Fz0 - 1)), Fmax = muI*Fz;
      w.mu = muI; w.Fmax = Fmax;
      const di = i < 2 ? delta : 0, cd = Math.cos(di), sd = Math.sin(di);
      const vxb = st.u - st.r*WY[i], vyb = st.v + st.r*WX[i];
      const vx = vxb*cd + vyb*sd, vy = -vxb*sd + vyb*cd, avx = Math.abs(vx);
      // ABS: per-wheel pressure cycling from wheel speed, wheel deceleration and the reference speed
      let Tb = (Tp*(i < 2 ? fShare : 1 - fShare)/2 + Tesc[i]);
      w.absAct = false;
      if (absOn && Tb > 0){
        const ref = Math.max(.5, vRef - st.r*WY[i]);
        if (vRef < ABS_C.VMIN){ w.p = 1; w.mode = 0; }
        else {
          // Slip band with hysteresis: release above LAM_HI, hold inside the band, reapply below LAM_LO.
          // The pressure cycles around the band, as a real ABS pulses.
          // Like a real unit, it stops releasing once the wheel is spinning back up (slip falling), and stops
          // reapplying once the wheel is already slowing (slip rising).
          const lam = (ref - w.om*R)/ref, dl = lam - (w.lam == null ? lam : w.lam); w.lam = lam;
          // Filtered wheel deceleration (m/s² at the tread): a sharp drop signals lock-up before the slip threshold
          w.aw = (w.aw || 0) + (((w.om - w.omPrev)/DT*R) - (w.aw || 0))*DT/ABS_C.ATAU;
          const decelTrip = ABS_C.AREL > 0 && -w.aw > ABS_C.AREL && lam > .5*ABS_C.LAM_LO && dl > 0;
          if (decelTrip && lam <= ABS_C.LAM_HI){ w.p = Math.max(0, w.p - ABS_C.DN*DT); w.mode = 1; }
          else if (lam > ABS_C.LAM_HI){ if (dl > -ABS_C.DLAM*DT){ w.p = Math.max(0, w.p - ABS_C.DN*DT); w.mode = 1; } else w.mode = 2; }
          else if (lam < ABS_C.LAM_LO){ if (dl < ABS_C.DLAM*DT){ w.p = Math.min(1, w.p + ABS_C.UP*DT); w.mode = 0; } else w.mode = 2; }
          else w.mode = 2;
          if (w.p < 1){ w.absAct = true; st.abs = true; }
        }
        Tb *= w.p;
      } else { w.p = 1; w.mode = 0; w.cyc = false; }
      Tb += Ttcs[i];
      w.Tb = Tb; w.Td = Td[i];
      // Lateral deflection state (relaxation length, implicit so it is stable at any speed)
      w.uy = (w.uy - DT*vy)/(1 + DT*avx/TC.LY);
      const uyCap = TC.ACAP*TC.LY; if (w.uy > uyCap) w.uy = uyCap; else if (w.uy < -uyCap) w.uy = -uyCap;
      // Longitudinal: wheel spin and deflection solved together (implicit, secant tire stiffness)
      const kap0 = w.ux/TC.LX, alp = w.uy/TC.LY;
      const Ks0 = Fmax*sp.slope0/sp.kpk/TC.LX;                 // N per metre of deflection at small slip
      let Ks = Ks0;
      if (Math.abs(w.ux) > 1e-7){ const s0 = Math.sqrt(kap0*kap0 + alp*alp), fm0 = Fmax*mf(s0/sp.kpk, sp); Ks = fm0*Math.abs(kap0)/s0/Math.abs(w.ux); }
      const wl = Math.max(0, 1 - avx/TC.VBLEND), cl = wl*2*TC.ZETA*Math.sqrt(Ks0*Fz/G);
      const A = 1/(1 + DT*avx/TC.LX), Qc = Ks*A*DT + cl, den = 1 + DT*R*R/Iw*Qc, base = Ks*A*w.ux - Qc*vx;
      const omNB = (w.om + DT/Iw*(Td[i] - R*base))/den;
      let om = omNB;
      if (Tb > 0){
        const sg = w.om > 0 ? 1 : w.om < 0 ? -1 : (omNB > 0 ? 1 : omNB < 0 ? -1 : 0);
        const omB = (w.om + DT/Iw*(Td[i] - sg*Tb - R*base))/den;
        om = (sg === 0 || omB*sg <= 0) ? 0 : omB;                // brake holds the wheel (Coulomb friction)
      }
      w.omPrev = w.om; w.om = om; w.locked = om === 0 && avx > .3;
      w.ux = A*(w.ux + DT*(R*om - vx));
      const uxCap = TC.KCAP*TC.LX; if (w.ux > uxCap) w.ux = uxCap; else if (w.ux < -uxCap) w.ux = -uxCap;
      // Combined-slip force: one grip budget, pointed against the slip
      const kap = w.ux/TC.LX, sN = Math.sqrt(kap*kap + alp*alp);
      let fx = 0, fy = 0;
      if (sN > 1e-9){ const fm = Fmax*mf(sN/sp.kpk, sp); fx = fm*kap/sN; fy = fm*alp/sN; }
      fx += cl*(R*om - vx); fy -= wl*2*TC.ZETA*Math.sqrt(Ks0*TC.LX/TC.LY*Fz/G)*vy;
      const fmag = Math.sqrt(fx*fx + fy*fy); if (fmag > Fmax && fmag > 0){ fx *= Fmax/fmag; fy *= Fmax/fmag; }
      // Ploughing drag in slush or deep snow (not limited by grip)
      const pl = ws[i].plough; if (pl > 0){ const vv = Math.sqrt(vx*vx + vy*vy + .09); fx -= pl*Fz*vx/vv; fy -= pl*Fz*vy/vv; }
      w.kap = kap; w.alp = alp; w.Fx = fx; w.Fy = fy;
      w.Q = R*fx + (om > 0 ? Tb : om < 0 ? -Tb : 0);           // reaction torque on the axle, for the locked-centre split
      const bx = fx*cd - fy*sd, by = fx*sd + fy*cd; w.bx = bx; w.by = by;
      SFx += bx; SFy += by; SM += WX[i]*by - WY[i]*bx;
      // Ruts and ridges: the local cross-slope under this wheel, beyond the slope under the car, takes a share of its load
      const dgx = ws[i].gx - smp.gx, dgz = ws[i].gz - smp.gz;
      if (dgx !== 0 || dgz !== 0){ const rbx = -sn*(-Fz*dgx) - cs*(-Fz*dgz), rby = -cs*(-Fz*dgx) + sn*(-Fz*dgz); SFx += rbx; SFy += rby; SM += WX[i]*rby - WY[i]*rbx; }
    }
    // Gravity along the road surface (grade, crown, bank) at the centre of gravity
    const gwx = -N*smp.gx, gwz = -N*smp.gz, gbx = -sn*gwx - cs*gwz, gby = -cs*gwx + sn*gwz;
    // Air and rolling drag: the v1 coast-down formula 0.05 + 0.0004 v² m/s² (kept so calibration stays comparable)
    const Vs = Math.sqrt(st.u*st.u + st.v*st.v);
    let dx = 0, dy = 0;
    if (Vs > 1e-9){ const aD = .05*Math.min(1, Vs/.1) + .0004*Vs*Vs; dx = -aD*mEff*st.u/Vs; dy = -aD*mEff*st.v/Vs; }
    // Crosswind: side force and yaw moment from the wind's sideways component (estimate)
    let wy = 0, wm = 0;
    // F = ½·ρ·Cy·A·|V_rel|·w_side, with side-force coefficient Cy = 0.7 and the centre of pressure 0.25·L ahead of the
    // CG (both estimates). The car's own sideslip is left out, so zero wind gives exactly zero side force.
    if (env.wind){ env.wind(st.t, wnd); const wl2 = -cs*wnd.x + sn*wnd.z, vr = Math.sqrt(st.u*st.u + wl2*wl2); wy = .5*RHO_AIR*.7*V.sideArea*vr*wl2; wm = wy*.25*V.L; }
    const Fx = SFx + gbx + dx, Fy = SFy + gby + dy + wy, Mz = SM + wm;
    // --- Rigid body in the road plane
    const du = Fx/m + st.v*st.r, dv = Fy/m - st.u*st.r, dr = Mz/Iz;
    st.u += du*DT; st.v += dv*DT; st.r += dr*DT;
    st.psi += st.r*DT;
    const s2 = Math.sin(st.psi), c2 = Math.cos(st.psi);
    st.x += (-s2*st.u - c2*st.v)*DT; st.z += (-c2*st.u + s2*st.v)*DT;
    // Accelerometer (specific force: everything but gravity) and its filtered copy for load transfer
    st.axRaw = (Fx - gbx)/m; st.ayRaw = (Fy - gby)/m;
    const kf = DT/LOAD_TAU; st.axs += (st.axRaw - st.axs)*kf; st.ays += (st.ayRaw - st.ays)*kf;
    // Reference speed for ABS, ESC and TCS. Simplification: the aids use the car's true forward speed. Real units
    // estimate it from wheel speeds and an accelerometer, a little less accurately. They never see the surface grip.
    st.vRef = Math.max(0, st.u);
    st.t += DT; st.steps++;
    return st;
  }
  // FNV-style hash of the state, for determinism checks
  function hashStep(){
    const f = new Float64Array([st.x, st.z, st.psi, st.u, st.v, st.r, st.w[0].om, st.w[1].om, st.w[2].om, st.w[3].om]);
    const b = new Uint8Array(f.buffer); let h = st.hash >>> 0;
    for (let i = 0; i < b.length; i++){ h ^= b[i]; h = Math.imul(h, 16777619) >>> 0; }
    st.hash = h; return h;
  }
  return {st, step, hashStep, surf, WX, WY, vehicle:V};
}

return {G, DT, DEG, RHO_AIR, TC, PEAK_SLIP, ABS_C, ESC_C, TCS_C, DRV_C, mfShape, mf, shapeKind,
  bodyToWorld, worldToBody, straightRoad, roadToWorldStraight, rng, flatEnv, createSim};
});
