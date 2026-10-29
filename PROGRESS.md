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
2. `js/legacy-grip.js`: the grip tables and `stopRun()` lifted verbatim from index.html (the reference).
3. `scripts/calibrate.js` -> `js/tire-params.js` + `docs/CALIBRATION.md`; `test/*.test.js` for tests 1-12.
4. Then game integration, inputs, comparison/X-ray, road effects and scenarios, docs, media (phases 2-7).

## Session log
- 2026-10-29 start: weekly usage 83% (resets 2026-11-03 04:00 Edmonton), 5h 37%. Free memory 0.9-2.1 GB
  (under the 2.34 GB floor). Playwright 1.64.1 installed 22:20 UTC; it uses the already-cached Chromium build 1248, so no browser download. CPU (thermal zone, approx) 75-85 C.

## Open issues
- Phase 0 rule slip: the Playwright install (2 packages, 2 s) started while free memory read 2.0 GB, under the 2.3 GB floor. Fixed by making `coord.js lock` refuse on low memory or CPU >= 90 C.
- Vehicle specs (brief 4.5) are interim estimates in js/vehicles.js until the spec-sheet research is done (Phase 1).

## Proposals (outside the brief; not done)
