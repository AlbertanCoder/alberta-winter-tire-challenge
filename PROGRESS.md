# Physics v2 progress

Brief: `docs/PHYSICS_V2_BRIEF.md`. Branch: `physics-v2`. To resume, start a session with "continue" (brief section 0.7).

## Phase checklist (brief section 6)
- [x] Phase 0, setup: section 0, section 9 kit + status line, index.html read once, plan, package.json with Playwright
- [ ] Phase 1, physics core, tires, vehicles, calibration (no game changes); first Fable check
- [ ] Phase 2, game integration: physics in the game, collisions, outcomes, camera, visuals, sound, aid toggles, Teaching mode, hazard fairness
- [ ] Phase 3, inputs: analog keyboard and pads, tilt, gamepad and wheel
- [ ] Phase 4, same-input comparison, X-ray replay, Physics check from the simulation
- [ ] Phase 5, road effects and the four new scenarios
- [ ] Phase 6, docs, Learn text, small fixes, number checks
- [ ] Phase 7, media and the final check
- [ ] First Fable check (after Phase 1)
- [ ] Final Fable check (end of Phase 7)
- [ ] LinkedIn draft Fable read

## Commits
| Phase | Commit | Note |
|---|---|---|

## Plan (short)
1. `js/physics.js`: pure UMD module (browser global `WTPhys` + Node `module.exports`), no DOM/THREE.
   Coordinate helpers first (body/world/road), then tire (combined-slip Magic Formula with a relaxation-length
   low-speed blend), wheel spin, loads with filtered accelerations, drivetrain, brakes/ABS/EBD, ESC, TCS.
   Fixed 1 ms step, seeded PRNG (mulberry32), no frame-rate dependence.
2. `js/grip.js`: the grip tables and `stopRun()` lifted verbatim from index.html (the reference).
3. `scripts/calibrate.js` -> `js/tire-params.js` + `docs/CALIBRATION.md`; `test/*.test.js` for tests 1-12.
4. Then game integration, inputs, comparison/X-ray, road effects and scenarios, docs, media (phases 2-7).

## Session log
- 2026-10-29 start: weekly usage 83% (resets 2026-11-03 04:00 Edmonton), 5h 37%. Free memory 0.9-2.1 GB
  (under the 2.34 GB floor). Playwright 1.64.1 installed 22:20 UTC; it uses the already-cached Chromium build 1248, so no browser download. CPU (thermal zone, approx) 75-85 C.

## Phase 1 status (2026-10-29, work in progress, NOT done)
Built: js/grip.js (v1 tables + legacy stopRun, verbatim), js/physics.js (4-wheel model, relaxation-length tire states,
implicit wheel spin, combined-slip Magic Formula, filtered load transfer, gravity from road gradient per wheel, engine +
automatic + creep, FWD/RWD/AWD/4x4, brakes + EBD, slip-band ABS, ESC, TCS, crosswind, ploughing drag),
js/vehicles.js (INTERIM estimates), scripts/calibrate.js -> js/tire-params.js + docs/CALIBRATION.md, test/physics.test.js.
Last `npm test`: 11 pass, 1 fail (test 1 only: gravel x winter ABS). `npm run calibrate` is deterministic (byte-identical re-run).
Resume here, in this order:
1. Test 1 fails only on gravel x winter ABS: -2.01% at 19 km/h, +2.05% at 100 km/h (limit 2%). Spread across speeds is 4%;
   likely cause: at the start of each stop the ABS overshoots into lock, and on gravel a locked tire grips MORE, which helps
   short stops most. Lowering the ABS cut-off speed to 0.5 m/s changed nothing (reverted). Faster release (ABS_C.DN)
   trades gravel against fresh snow: DN 40 (current) gravel/winter +2.05%; DN 60 fresh/allweather +2.1%; DN 75
   fresh/winter +2.3%; DN 100 gravel passes (-1.3% worst) but fresh/winter +2.4%. Root cause to fix: uneven ABS cycling
   on loose surfaces (rising or flat force curves), not a single knob. Do not re-run this sweep.
2. DONE (interim): test 3, scripts/fmvss126.js, follows 49 CFR 571.126 as read 2026-10-29 at law.cornell.edu
   (eCFR blocks automated reads). All 7 vehicles pass with ESC on; all 7 fail with ESC off (worst yaw 73-93% of peak
   1 s after steer). Choices to list in PHYSICS.md: the regulation gives no range for the A regression, so 0.2-0.4 g
   is used; run on the game's dry surface (mu about 0.88 peak vs the standard's PFC 1.02 surface); HD pickup uses the
   1.52 m limit pending its sourced GVWR. Must be re-run after the vehicle research (item 3).
3. Vehicle research (brief 4.5): pick the real base model for each of the 7 types, source every parameter, replace
   js/vehicles.js, match PROF wheelbase/width, re-run calibrate and tests.
4. Cornering stiffness / peak slip / relaxation lengths / load sensitivity are labelled estimates in physics.js; find a
   published source for cornering stiffness (brief 4.2) or keep them labelled.
5. Performance test measured 4.08-4.88 ms per simulated second (limit 5): close; profile physics.js step() if it creeps.
6. Write PHYSICS.md (equations + every parameter's source or "estimate"), then the first Fable check (brief section 10).
Simplifications to list in PHYSICS.md / Honest limits: ABS/ESC/TCS use the true forward speed as their reference
(real units estimate it); no Ackermann; one peak slip per surface for both directions; torque converter not modelled
(full engine torque at launch); no engine braking; lateral aero from the car's own sideslip ignored.

## Open issues
- Phase 0 rule slip: the Playwright install (2 packages, 2 s) started while free memory read 2.0 GB, under the 2.3 GB floor. Fixed by making `coord.js lock` refuse on low memory or CPU >= 90 C.
- Vehicle specs (brief 4.5) are interim estimates in js/vehicles.js until the spec-sheet research is done (Phase 1).

## Proposals (outside the brief; not done)
