# Alberta Winter Tire Challenge - Physics v2 build brief

You're working on my game, the GitHub repo AlbertanCoder/alberta-winter-tire-challenge, on my Windows 11 laptop. It's live on GitHub Pages and linked from my LinkedIn. Another Claude Code session (my Kinan vs Mom game build) runs on this laptop at the same time, so section 9 (sharing the laptop and my weekly usage) applies from the first minute, and section 10 says which model does which job. This brief is the whole job. The design decisions in it are already made, so don't re-ask them. Work straight through, and only stop where this brief says to.

## 0. Start here
1. Check you're in the repo (`git remote -v` shows AlbertanCoder/alberta-winter-tire-challenge). If not, find it and work from there.
2. Run `claude --version`, `node -v` (need 18 or newer) and `git --version`. If Node is missing, stop and tell me the one command to install it.
3. Run `git status`. If there are uncommitted changes, stop and show them to me. Otherwise: `git switch main`, `git pull`, then `git switch -c physics-v2` (or switch to it if it already exists) and push it with `-u`.
4. Set up the shared kit in section 9 (light work, no heavy jobs) before anything else, then run `node ~/claude-coord/coord.js check` once and apply the section 9 usage rules to what it shows.
5. Check which branch GitHub Pages deploys from (`gh api repos/AlbertanCoder/alberta-winter-tire-challenge/pages` if the GitHub CLI is installed). If it isn't main, say so in the Phase 0 report.
6. Save this entire brief, word for word, as `docs/PHYSICS_V2_BRIEF.md`. Create `PROGRESS.md` with the phase checklist from section 6, commit hashes, open issues and a "Proposals" list. Commit both and push.
7. If a session starts with "continue", read `docs/PHYSICS_V2_BRIEF.md` and `PROGRESS.md`, run `node ~/claude-coord/coord.js check`, restart the section 9 watch, then pick up at the first unfinished phase.

Commit and push to `physics-v2` at the end of every phase. Use subagents only as section 10 describes. The planned stops are the usage and heat stops in section 9, the merge question in section 7 and the LinkedIn handoff in section 7.

## 1. Working rules
1. Done is a command, not a sentence. Each phase in section 6 has DONE commands; a phase is done only when they produce the stated output.
2. Evidence is pasted, not described. Paste commands and their raw output. Don't write "should work", "successfully completed", "I've updated", "all set" or "done!" unless the proof follows on the next line.
3. Red tests in the middle of work are normal. But never mark a phase done, commit it as done, or start the next phase with a failing check. Never loosen a test's expectation or tolerance to make it pass unless this brief says the expectation was wrong. If you can't make a check pass honestly, stop and report the failure verbatim.
4. Show the diff before calling a phase done: `git diff --stat` plus the full diff of the most important file.
5. No invented facts. If a number isn't in the repo, in this brief, or in a source you actually opened, you don't know it. Every physical parameter gets a source or is labelled an estimate, in a code comment and in PHYSICS.md.
6. No unrequested work. Anything outside this brief goes in PROGRESS.md under "Proposals". Don't restructure parts of index.html this brief doesn't touch.
7. This brief outranks older instructions. If something conflicts with it, say so; don't silently pick one.
8. Report each phase in this format: DONE criterion, Result (raw output), Diff, Did, Didn't, Unverified. "Unverified" is mandatory; write "none" only if that's true.

## 2. Why this exists (it decides every judgment call)
The game teaches Alberta drivers why winter tires matter. Straight-line braking is decent now, but the car can only travel the way it's pointing: it can't slide sideways, fishtail, overcorrect or spin. Real black ice isn't like that. At 100 km/h on black ice you feel nothing until you steer, brake or accelerate. Then the back end steps out, the correction overshoots, the car sways back and forth and spins into the snowbank.

Some players will look for any reason to dismiss it: "cars don't stop straight, they swerve", "my car has stability control", "you just drove worse the second time", "those numbers are made up". My LinkedIn network includes engineers. So:
- The mechanics come first. Graphics don't matter beyond what's already there.
- Honesty beats drama. Calibrate only to cited data. Never tune physics, tires or vehicles to make a scenario come out a particular way or to make winter tires look better. If a result surprises you (say ESC saves the all-season car), the game shows it as it is, and you note it in PROGRESS.md.
- Every claim the game makes traces to a source or to the model itself.

## 3. Where the game is now (verify; line numbers are approximate, so search by name)
- Everything is in `index.html` (about 2,450 lines, 215 KB): HTML, CSS and one script, with Three.js r128 from cdnjs. No build step, no package.json. It must keep working when index.html is opened straight from disk (file://), so add code as classic `<script src>` files, not ES modules. Don't upgrade Three.js.
- Grip: `COND` (mu per tire per surface at -10 °C; packed snow and ice come from Tire Rack's 2026 tests, the rest are estimates), `TMUL` (temperature), `HARD` (compound stiffening below 7 °C), `TREAD`, `VEH.f` (heavier vehicles slightly lower mu), `LOCK`/`lockEff` (locked-wheel grip / ABS grip), `absEff` (ABS on gravel 0.8), `mu()`, `gripMu()`, `decel()`.
- `stopRun()`: a 1-D straight-line stopping model with drag 0.05 + 0.0004*v^2 m/s^2. Used by `warnDist()` for hazard placement (a winter-tire driver with new tread, ABS and a 1.0 s reaction stops 2.5 m short) and by `physCheck()` for the results bars.
- `step(dt)`: a point mass with a friction circle. Heading changes kinematically (`r.psi -= r.v*curv*dt`) and `r.vis` fakes a little visual yaw. This is what gets replaced.
- `hazards()` and `checkEnd()`: collisions are axis-aligned overlaps in road coordinates (s along the road, off across it), which is wrong once the car can rotate.
- `frame()`: physics substeps of 1/120 s. `run.rec` stores [t, x, z, psi - vis] for the ghost car and side-view replay. Traffic respawn uses `Math.random()`.
- Conventions: forward is (-sin psi, -cos psi); `off` is positive to the right of the road centre; `HW` = 3.6 m half-width; `LANE` = 1.8 m (right-lane centre); curves are banked 6%.
- Inputs are on/off (keys and on-screen pads). The steering input ramps to full in about half a second, and with no pedal the car holds its speed (a hidden cruise control).
- The HUD shows a "GRIP USED" meter and ABS/SLIDING/WHEELSPIN/LOCKED tags.
- 14 scenarios in `SCEN`. A Learn drawer with research, myths, a cost calculator, "How the game works", "Fair points" and 55 references in `REFS`.
- Known data issue: the legacy model stops the all-season tire on packed snow from 40 km/h in about 80.0 ft at -10 °C, but the Tire Rack figure it cites is 84.5 ft (-5.4%). mu of about 0.236 instead of 0.25 reproduces it. Winter (56.0 vs 56.1 ft) and all-weather (59.2 vs 58.6 ft) are fine.
- Known claim to check: the Stoney Trail scenario note says stopping from 100 km/h on black ice takes "almost three football fields" even on winter tires. The legacy model gives about 230 m for a winter-tire small SUV at that scenario's -8 °C, which is about 2.5 fields of 91.4 m.

## 4. What to build (all decided)

### 4.1 Vehicle dynamics: four-wheel model in the road plane
- A rigid body with forward and sideways velocity, yaw rate, heading and position, plus four wheels with their own spin (I_w * domega/dt = drive torque - brake torque - R*Fx), so lock-up and wheelspin emerge instead of being scripted.
- Normal load per wheel with longitudinal load transfer (m*a_x*h/L) and lateral load transfer split front/rear by roll stiffness, using filtered accelerations to avoid an algebraic loop. The four loads always add up to the weight component normal to the road.
- Gravity projected onto the car's axes from the real road slope under it: grade, curve banking and road crown (4.4). This matters when the car is sideways on a hill.
- Steering: steering-wheel angle to road-wheel angle through each vehicle's steering ratio, up to max lock, front wheels only.
- Drivetrain: FWD and RWD with an open differential (so one wheel on ice limits drive force); AWD that sends torque to the axle that has grip (document the simplification); 4x4 with a locked centre. A simple engine (torque limit and power limit), an automatic transmission, and idle creep at low speed. All four drive types stay selectable on every vehicle, as now.
- Brakes: pedal to torque. With ABS on, include electronic brake-force distribution. With ABS off, a fixed front-biased split per vehicle, so the fronts lock first, and if the rears lock the car can spin, as in real life.
- Drag: keep the existing 0.05 + 0.0004*v^2 m/s^2 so calibration stays comparable, and note it as a simplification.
- Fixed timestep (1 ms or smaller) and deterministic: same scenario, same inputs and same seed give the identical result. Replace every `Math.random()` that affects the simulation with a seeded generator (snow and spray can stay random).
- Low speed: the car must come to a complete stop and sit still, hold on a hill when the brakes can hold it, and slide back when they can't, with no jitter or creep. Use relaxation-length slip states or a proper low-speed blend (see Bernard & Clover, "Tire Modeling for Low-Speed and High-Speed Calculations", SAE 950311).
- The physics is pure code (no DOM, no THREE) in `js/physics.js` that loads in both the browser and Node, so it can be tested on its own.

### 4.2 Tire model and calibration
- Per-wheel combined-slip forces from a Pacejka Magic Formula-style curve (Pacejka, Tire and Vehicle Dynamics, 3rd ed.), combined so braking, steering and accelerating share one grip budget. A locked or sliding tire pushes against the direction it's sliding, so locked front wheels can't steer.
- Shape is the whole point: on ice the force peaks at a small slip and drops once the tire slides, which is why there's no warning. The ABS-off calibration below carries the game's existing locked-wheel factors (`LOCK`, `lockEff`) into the curve shapes.
- Load sensitivity (mu drops slightly as load rises). Cornering stiffness from published tire data, labelled.
- Sideways peak mu equals braking peak mu unless a source you open supports a difference; label it either way.
- `COND`, `TMUL`, `HARD` and `TREAD` stay the source of truth for target ABS-average grip (with the correction below). The new tire curves turn those targets into forces.
- Calibration, reproducible with `npm run calibrate`, which writes `js/tire-params.js` and `docs/CALIBRATION.md`:
  - First, fix table values that don't reproduce their own measured source within 2% (the all-season packed-snow value in section 3). Record every change and the reason in CALIBRATION.md, and update any text that depends on it.
  - For every tire x surface at -10 °C, new tread, on the reference small car: the full simulation's straight-line stopping distance from 19, 40, 60, 80 and 100 km/h matches the legacy `stopRun()` within 2% with ABS (reaction time 0), and within 3% with ABS off.
  - Measured anchors: packed snow from 40 km/h (winter 56.1 ft, best all-weather 58.6 ft, M+S all-season 84.5 ft) within 3%. For ice, the game uses only the measured ratio between tires (rink from 19 km/h: winter 38.7 ft, best all-weather 50.6 ft) and estimates the level, so check that ratio within 3% and report the absolute numbers.
  - Other vehicles: report each one's stopping distance vs legacy (which used `VEH.f`). Match within 3% or explain the physical reason in CALIBRATION.md.
- Keep the legacy `stopRun()` in the test suite as the reference.

### 4.3 Driver aids: ABS, ESC and traction control, on by default, each with a toggle
- ABS: per-wheel slip control that cycles like a real system. Off means the wheels lock.
- ESC (new toggle, default on): compares the car's yaw rate with what the steering asks for (limited by what the road can give), brakes individual wheels (the outside front to stop a spin, the inside rear to tighten understeer) and cuts engine torque. It may only use signals a real car has: wheel speeds, yaw rate, lateral acceleration and steering angle. It never reads the true surface mu. Toggle hint: ESC has been required on new light vehicles sold in Canada and built since September 1, 2011 (CMVSS 126).
- Traction control (new toggle, default on): limits driven-wheel spin by cutting torque and braking the spinning wheel, which is how a car with an open differential gets moving with one wheel on ice.
- A dashboard ESC light that flashes when ESC or traction control steps in, like a real car.

### 4.4 Road effects
- Road crown on straights (normal crown is typically about 2% cross slope; find and cite a Canadian road design source) and banking on curves, so on ice an uncorrected car slowly drifts toward the low side.
- Crosswind gusts: side force and yaw moment from a seeded gust series. Add a Wind option to the run settings (calm or gusty), default calm unless a scenario says otherwise. Gust values are estimates; say so.
- Patchy grip per wheel: each tire reads its own surface. Extend scenario surfaces to zones across the road as well as along it: bare or polished wheel tracks, a snowy lane middle, ice patches, a snowy shoulder.
- Snow ruts and slush ridges: model the snow surface as a height profile across the lane. Each wheel feels the cross-slope under it (a sideways share of its load), and slush adds ploughing drag. Every rut and ridge parameter is an estimate; say so.
- Leaving the road: wheels in deep shoulder snow get heavy drag and little grip, and hitting the snowbank ends the run, as now.

### 4.5 Vehicles based on real models' published specs
- Base each of the 7 types on a real, popular model and say so in the vehicle picker, for example "Small SUV (based on a 2019 Chevrolet Trax AWD)". Pick the other six yourself from common Canadian sellers and list them in PHYSICS.md.
- Per vehicle: curb mass, wheelbase, front and rear track, weight distribution, CG height, yaw inertia, tire rolling radius, steering ratio and max road-wheel angle, brake split, engine torque and power, drivetrain. Sources: manufacturer spec sheets; NHTSA measured inertial data (Heydinger et al., "Measured Vehicle Inertial Parameters - NHTSA's Data Through November 1998", SAE 1999-01-1336); NHTSA rollover data where it lists a static stability factor (CG height = track / (2 x SSF)). Where no measurement exists, use the nearest measured comparable vehicle or a stated rule of thumb, and label it an estimate.
- Keep the existing 3D shapes (`PROF`) and match their wheelbase and width to the new specs.

### 4.6 Inputs
- Internally, everything is analog: steering-wheel angle in degrees, throttle 0-1, brake 0-1.
- Keyboard and on-screen pads (keep both): holding steer turns the wheel at a set rate and releasing lets it return toward centre; gas ramps up and down; brake ramps up fast (a panic stop). Remove the hidden cruise control: no pedal means coasting, like a real automatic (with idle creep at low speed). Keep all rates as named constants in one place, with comments.
- Tilt to steer on phones, held sideways like a wheel. iOS needs `DeviceOrientationEvent.requestPermission()` called from a tap on an https page, so add a "Use tilt steering" button. Calibrate centre at the start, with a small dead zone, smoothing and a sensitivity setting.
- Game controllers and USB wheels through the Gamepad API: standard mapping for controllers (left stick steers, right trigger gas, left trigger brake), plus a short "Set up controller" screen for wheels and odd mappings (turn fully left, then right, press gas, press brake), saved in localStorage.
- A small steering-wheel angle readout on the HUD.

### 4.7 Comparison: replay your exact inputs on the other tires
- Record every input per physics step. After a run, re-simulate the same inputs on the comparison tire (winter vs the player's tire, as `compOf` does now) and show both outcomes, labelled "Same steering, same pedals, only the tires changed."
- "My results" and the copied share text use these same-input comparisons. Retry stays, so players can still drive again themselves.
- The side-view replay shows both runs with their real yaw.

### 4.8 X-ray replay (the "show the math" screen)
- After a run: a top-down slow-motion view with a scrubber, play/pause and 0.25x, 0.5x and 1x speed. Two synced panels, your tires vs the comparison tires (stacked on phones).
- At each wheel, a circle for the grip that tire has available right now (from its load and surface) and an arrow for the force it's actually making: green under 70%, amber up to 97%, red at the limit (the current meter's colours), with text labels so it doesn't rely on colour alone. Also show the car's heading vs its direction of travel (slip angle in degrees), its path, the steering-wheel angle and the pedals.
- Plain-English captions generated from the telemetry, for example: "2.4 s: the rear tires were asked for 3,900 N of sideways grip but could only give 2,600 N. The back end swings out." / "Front wheels locked: steering does nothing." / "ESC is braking the outside front wheel to stop the spin." A "Show numbers" toggle reveals the raw values.
- Works in phone portrait and landscape, is keyboard accessible, and respects reduced motion.

### 4.9 Realism vs teaching
- Hide the grip meter and the ABS/SLIDING/WHEELSPIN/LOCKED tags by default, because real drivers get no warning. A "Teaching mode" toggle (in run settings and the pause menu) brings them back. Keep the speedometer, limit sign, ESC light and steering readout.

### 4.10 Four new scenarios
1. Overpass spin, based on a real one. A two-lane one-way freeway at 100 km/h, dry, about -5 °C, with black ice in the shade under an overpass. Before the overpass, the driver glances at the passenger: the camera turns toward the passenger seat for about a second while the car keeps going and drifts from crown and a light crosswind (the drift comes from the physics, not a script). A car is coming up in the left lane. Goal: get back to your lane and through the shade without spinning or hitting anything. Intro text: "Based on a real spin under an Edmonton freeway overpass. Nobody was hurt." Don't name a road or a driver. After the run, show cited advice on recovering from a skid (small, smooth corrections; look and steer where you want to go; ease off the gas).
2. Can't get moving. An icy intersection (flat or a slight upgrade; say which and why) with one front wheel on polished ice. The light turns green and traffic waits behind you. Goal: clear the intersection before the light turns red. Drive type, traction control and tires all matter; the physics decides.
3. Icy left turn. A signalized intersection on packed snow, polished where cars stop and start. Turning left across oncoming lanes, too much speed makes the front tires push wide toward oncoming traffic. Goal: finish the turn in the correct lane.
4. Slush ridge lane change. An arterial at 60-70 km/h with packed ruts in each lane and a slush ridge between lanes. A stalled car blocks your lane, and there's a gap in the next one. Goal: change lanes across the ridge without losing control or hitting anything.
- Each follows the existing scenario pattern (group, place, note, goal, signs, outcome texts) and the fairness rule where it applies.

### 4.11 Existing scenarios, outcomes and fairness
- All 14 existing scenarios run on the new physics. Collisions use oriented rectangles (the car's real footprint at its real yaw) against vehicles, people, animals and barriers. Off-road uses the wheel positions.
- New outcomes where they happen: "Spun out" (more than 90° from the road direction) and "Slid into the next lane", alongside the existing ones. Swerve verdicts come from what physically happened; keep the "experts advise braking straight" text.
- The fairness rule stays: hazards appear where a driver on winter tires, new tread, ABS, reacting in 1.0 s, just stops 2.5 m short. Hazard placement and the Physics check bars must agree with the new simulation. A 2% error on a 230 m black-ice stop is about 5 m, double the 2.5 m margin. So whatever computes placement (the full simulation, precomputed per scenario, or a fast oracle derived from it) must agree with the full simulation within 0.5 m for every scenario, vehicle, weather and speed the game allows, proven by a test, without dropping frames.
- Curve and hill Physics check bars also come from the simulation (or a formula proven within 5% of it).
- The camera follows the car's smoothed direction of travel (blending to its heading at low speed), not its heading, so a spin is visible without the camera whipping around. Wheels steer and spin at their real speed (locked wheels stop turning). Skid marks come from each wheel. Small cosmetic body roll and pitch from load transfer are fine.
- Sound: tire squeal from real slip, and the ABS pulse when ABS is working.
- Check with a script every number in scenario notes, Learn text and myths that the model produces (the "almost three football fields" note in section 3 is one), and update the text where the model disagrees.

### 4.12 Small fixes
- Add the live link to the "Copy my results" text and to the top of the README. Get it with `gh api repos/AlbertanCoder/alberta-winter-tire-challenge/pages --jq .html_url` if the GitHub CLI is installed; otherwise use https://albertancoder.github.io/alberta-winter-tire-challenge/ after confirming it loads.
- Save results and settings in localStorage (a versioned key, wrapped in try/catch, and the game still works without it), with a "Clear my results" button.

### 4.13 Honesty and docs
- `PHYSICS.md`: the equations in plain notation, every parameter with its source or "estimate", and what the model can't do. `docs/CALIBRATION.md` and `docs/VALIDATION.md` are generated by scripts and never hand-edited.
- Learn: rewrite "How the game works" in plain English for non-technical readers, with a link to PHYSICS.md for engineers. Update "Honest limits" (no suspension or tire heating, a flat-plane model, generic ABS, ESC and AWD logic, ruts and gusts are estimates, and so on) and "Fair points". Add every new source to `REFS`.
- Check the "Fair points" snow-circle claim (a 2024 test where the best winter and best all-season tires were within about 2.4%). European "all-season" tyres in tests like that often carry the snowflake symbol, which makes them the North American all-weather category. If so, reword it accurately.
- README: new physics section, controls (tilt, controllers), Teaching mode, X-ray replay, new scenarios.
- Keep the "not sponsored or endorsed" wording. Naming car models as the basis for specs is fine.

### 4.14 Media for LinkedIn
- Using a fixed, scripted input sequence (the same inputs for both tires, committed with the scripts), record with Playwright: the overpass scenario on all-season vs winter tires, then the X-ray replay. Convert to MP4 (H.264; add `ffmpeg-static` as a dev dependency if ffmpeg isn't installed), under 8 MB, as `media/overpass-spin.mp4`. Use a plausible, moderate correction, not one picked to force a dramatic result, and caption it "Same steering, same pedals, only the tires changed." If the default (ESC on) result isn't dramatic, that's the honest result: add a second clip with ESC off, labelled "older car without stability control".
- Refresh the README screenshots, including the X-ray view and the phone layout.

## 5. Verification (automated; everything must pass)
- `package.json` with dev dependencies only (Playwright, plus ffmpeg-static if needed). The game itself stays dependency-free. A `.gitignore` for node_modules and test output. Every command is an npm script, so it runs the same on Windows.
- Test hooks in the page only when the URL has `?test=1`: load a scenario, set tire, vehicle and aids, feed a scripted input timeline, run faster than real time, and read the outcome and telemetry.
- `npm test` (Node's `node --test`), physics unit tests:
  1. The calibration checks in 4.2.
  2. Steady cornering on each surface: maximum steady lateral acceleration is no more than peak mu x g and at least 80% of it (load transfer and load sensitivity explain the gap; report the numbers). Understeer gradient positive at moderate lateral acceleration for the default setup.
  3. FMVSS 126 / CMVSS 126 sine with dwell on dry pavement with ESC on, following 49 CFR 571.126 exactly: A from the standard's slowly increasing steer test; a 0.7 Hz sine with a 500 ms dwell at the second peak, starting while coasting at 80 km/h; amplitudes from 1.5A in 0.5A steps up to 6.5A or 270° (300° cap). Pass: yaw rate at most 35% of its first peak 1.0 s after completion of steer and at most 20% at 1.75 s; lateral displacement at least 1.83 m at 1.07 s after beginning of steer (1.52 m above 3,500 kg GVWR). Every vehicle the standard covers must pass with ESC on. Report ESC-off results without asserting them.
  4. Front wheels locked (front-only braking) at 50 km/h on packed snow, rears rolling: full steering changes the heading by less than 2° in 1 s.
  5. Rears locked (rear-only braking) at 60 km/h on packed snow with a tiny initial yaw: the yaw angle grows past 30° before the car stops.
  6. Split-mu braking (left wheels on ice, right on dry), ABS on, no steering: the car yaws toward the high-grip side.
  7. One front wheel on polished ice, FWD, traction control off: drive force is limited to about twice the ice wheel's grip (open differential). With traction control on, it's clearly more.
  8. Hill (6% polished ice, -8 °C): the brakes hold where mu*cos(theta) > sin(theta) and slide otherwise; with no pedal the car rolls back. Standing still for 10 s on flat ground drifts less than 1 mm.
  9. Crown on black ice with no steering: the drift is toward the low side. Zero wind gives zero side force, and ruts and ridges give zero force on a flat profile.
  10. Coasting in neutral matches the drag formula within 1%. The four wheel loads always sum correctly.
  11. Determinism: identical runs give an identical telemetry hash, and replaying the recorded inputs on the same tire reproduces the original run exactly.
  12. Performance: one simulated second costs under 5 ms in Node on this laptop.
- `npm run test:e2e` (Playwright, headless Chromium, run as a heavy job under section 9): every scenario x {winter, all-season} x {ESC on, off}, driven by a scripted test driver (holds speed, keeps its lane, brakes 1.0 s after the hazard appears), loads with no console errors and reaches a result. The winter-tire scripted driver is safe in every existing stopping scenario (the fairness rule guarantees it). For the four new scenarios, write outcomes per tire to VALIDATION.md without asserting who wins. Tilt and gamepad inputs work through emulated events. Screenshots of every scenario and the X-ray view at desktop and phone sizes go to `test-results/`.
- `npm run calibrate` and `npm run validate` regenerate their docs with no unexpected diff.

## 6. Phases (after each: commit, push to physics-v2, update PROGRESS.md, report)
Every phase's DONE also includes: `git status --porcelain` is empty and `git log origin/physics-v2..HEAD` is empty. Every heavy job in every phase follows section 9, and section 10 decides which model does each piece.
- Phase 0, setup: section 0 done, the section 9 kit and status line working, index.html read once in full, a short plan in PROGRESS.md, `package.json` with Playwright installed. DONE: `node ~/claude-coord/coord.js check` prints a reading, `npm ls --depth=0` lists the dev dependencies, and the commit shows in `git log --oneline -1`.
- Phase 1, physics core, tires, vehicles and calibration (no game changes yet). DONE: `npm test` exits 0 with tests 1-12 listed, `npm run calibrate` leaves no diff, and the first Fable check (section 10) is done with every finding fixed or answered in PROGRESS.md.
- Phase 2, game integration: the new physics in the game, collisions, outcomes, camera, visuals, sound, aid toggles, Teaching mode and hazard fairness. DONE: `npm test` and `npm run test:e2e` exit 0.
- Phase 3, inputs: analog keyboard and pads, tilt, gamepad and wheel. DONE: the e2e input tests pass.
- Phase 4, same-input comparison, X-ray replay and the Physics check from the simulation. DONE: e2e tests cover them and pass, and screenshots are saved.
- Phase 5, road effects and the four new scenarios. DONE: every scenario passes e2e.
- Phase 6, docs, Learn text, small fixes and number checks. DONE: `npm run validate` regenerates VALIDATION.md cleanly, README and Learn are updated, and every new source is in REFS.
- Phase 7, media and the final check. DONE: `npm test`, `npm run test:e2e`, `npm run calibrate` and `npm run validate` all pass in one run, the media files exist and are under the size limit, and the final Fable check (section 10) is done with every finding fixed or answered in PROGRESS.md.

## 7. Finish
1. A final report in the section 1 format, including a list of everything labelled an estimate, and a short laptop summary from `~/claude-coord/health.log`: hottest reading, how many cool-down pauses, and weekly usage at the start and end of the build.
2. Teach me. Write `docs/HOW_THE_PHYSICS_WORKS.md`: one page in plain English I could use to explain the physics to anyone (why the back end steps out on ice, why ABS lets you steer, what ESC can and can't do, why winter tires help). Then show me the 2-3 lines of code that matter most, explain them in plain words, ask me 3 questions one at a time, and check my answers.
3. Ask me once: "All checks pass. Merge physics-v2 into main now? This updates the public link." Only if I say yes: merge, push, confirm GitHub Pages rebuilt, and give me the live link. Remind me to test tilt steering on my iPhone on the live link, and tell me the command to undo the merge if something's wrong.
4. Update the rest of my GitHub: the repo's README already reflects v2. My profile README (repo AlbertanCoder/AlbertanCoder) doesn't mention the game yet, so offer to add a short entry with the live link, show me the diff, and push it only if I say yes.
5. LinkedIn handoff. Don't post, edit or delete anything on LinkedIn yourself: LinkedIn's user agreement bans using bots or automated methods to create posts. Instead:
   - Ask me to paste the text of my current post about the game, so the new one matches my voice and doesn't contradict it.
   - Draft the new post: short and plain, in my voice. Say what changed (real sliding, spinning and stability control, the X-ray replay, the same-inputs comparison, the four new scenarios), include the live link, and point to `media/overpass-spin.mp4` as the video. Claim only what the model does: it's a physics model calibrated to published tests, not a perfect copy of real driving.
   - Have Fable give the draft its final read (section 10), then save it as `linkedin-post-v2.md` on my Desktop (outside the repo) and show it to me.
   - Give me a short checklist: post the new one with the video and the link, check it looks right, then delete the old post.

## 8. Pitfalls
- Sign conventions: write and test helpers for body, world and road (s, off) coordinates before anything else.
- Wheel spin dynamics are stiff: use a small enough step or a stable update, and test that energy behaves.
- Slip is undefined near zero speed: handle it explicitly (4.1).
- Load transfer can become an algebraic loop: use filtered accelerations.
- Nothing frame-rate dependent may affect the simulation.
- index.html is about 60k tokens: read it once in Phase 0, then search by function name, or have a Haiku subagent find things (section 10).
- Keep everything else working: file:// loading, dark mode, reduced motion, the WebGL fallback, the Learn drawer and cost calculator, pause, the map and results screens, the side-view replay and sound.

## 9. Sharing the laptop: heat, memory, weekly usage and the other session
My laptop (an ASUS ROG Flow X16, 2022) has shut itself off from heat before, and my Kinan vs Mom session runs on it at the same time as you. Heat comes mostly from sustained CPU and GPU work rather than from memory, so the two sessions take turns on heavy jobs, and both keep an eye on temperature, memory and my weekly Claude usage.

### 9.1 The shared kit (set up in section 0, before anything heavy)
Create the folder `~/claude-coord` (in my user home, outside every repo) containing:
- `coord.js` (Node, no dependencies, runs the same from Git Bash and PowerShell), with these commands:
  - `check`: one health reading. CPU temperature (and GPU if available), CPU load, free and used memory, whether the CPU looks throttled, my weekly and 5-hour usage from `usage.json` and how old that reading is, and who holds the heavy-job lock. It prints one short line and appends it to `health.log`.
  - `watch`: polls temperature and memory every 60 s and prints a line only when a section 9.3 threshold is crossed. It prints nothing otherwise, so it costs no tokens.
  - `lock <session> <task> <minutes>`, `unlock <session>` and `status`: the heavy-job lock in `heavy.lock` (JSON: who, what, started, expected minutes). A lock older than twice its expected time plus 10 minutes counts as stale and can be taken over; log it when that happens.
  - Each session also writes `status-<session>.json`: what it's doing now, plus its next heavy job and roughly how long it will take.
- `README.md`: the rules in this section, written so the other session can follow them without reading this brief.
- Temperature sources, tried in this order, with the one that works recorded in the README: LibreHardwareMonitor's local web server (`http://localhost:8085/data.json`) if it's running; the Windows "Thermal Zone Information" performance counter; `nvidia-smi` for the GPU. If no CPU temperature source works, say so in the Phase 0 report, use CPU load and the CPU frequency counters as a throttling signal in the meantime, and suggest a free way for me to add a sensor. Don't install drivers or anything that needs admin yourself.

### 9.2 Weekly usage, read from the status line
- On Pro and Max plans, Claude Code's status line receives `rate_limits.seven_day.used_percentage`, `rate_limits.five_hour.used_percentage` and their `resets_at` times. Add a status line command (a small Node script, `~/claude-coord/statusline.js`) to my user settings, `~/.claude/settings.json`, with a `refreshInterval` of 60. It writes those fields plus a timestamp to `~/claude-coord/usage.json` (write to a temp file, then rename, since both sessions may write it), and displays something like `Week 63% | 5h 20% | CPU 78 °C (12 min ago)`. It takes the temperature from the last line of `health.log` and never reads a sensor itself. Follow the Windows section of the status line docs (forward slashes in the command path).
- If I already have a status line, keep what it shows and add to it. Show me the diff of `~/.claude/settings.json` before saving it. That's one approval, and it's worth it.
- These percentages cover my whole account (both terminals and the Claude app), which is exactly what we want to watch. The other session may not show the new status line until it restarts; that's fine, because `usage.json` already covers the whole account.
- If `usage.json` is missing or more than 30 minutes old, the check line says so instead of guessing.

### 9.3 Rules (both sessions follow these)
- A heavy job is anything that keeps the CPU busy for more than about a minute: npm installs and Playwright browser downloads, e2e runs, long calibration sweeps, video recording and ffmpeg encoding, big builds. Everything else (reading, editing, git, short unit tests) is light.
- Before each heavy job, run `check`, then take the lock. If the other session holds it, do light work and check again every few minutes. Release the lock the moment the job ends.
- Keep heavy jobs gentle: Playwright with 1 worker by default (2 at most while the laptop is cool), ffmpeg limited to 2 threads, headless browsers only, and close browsers and servers when done.
- Temperature (CPU, from the best source in 9.1):
  - 90 °C or more on two readings in a row: cool-down. Pause heavy jobs, and don't start new ones, until it's back under 80 °C. Light work can continue.
  - 95 °C or more: emergency. Stop every heavy job now, release the lock, message the other session, and wait until it's under 80 °C.
  - If the thermal-zone counter is the only source, treat its readings as approximate and say so in the log.
- Memory: don't start a heavy job if free memory is under 15% or under 2 GB, whichever is larger. If memory is short, first close anything you opened (browsers, test servers).
- Weekly usage (`seven_day`), the same 90/95/98 rule I gave the Kinan vs Mom session:
  - Under 90%: work normally. From 85% on, check usage before every step, not just every 30 minutes.
  - 90%: wind down. Finish the task in hand, but don't start a new phase, a Fable check or anything deep.
  - 95%: close out. Get everything to a clean state: committed, pushed, locks released, background jobs stopped, and PROGRESS.md saying exactly where to resume. Message the other session once.
  - 98%: everything is done and stopped. Tell me when the limit resets (from `resets_at`), and stop.
  - If usage is already at 90% or more when you start or resume, do only the section 0 and section 9 checks, report, and stop.
  - If `five_hour` is above 90%, commit before starting anything long.
- Every 30 minutes: start `node ~/claude-coord/coord.js watch` with the Monitor tool at its longest deadline (30 minutes). When the watch ends, run the full `check`, act on the rules above, and start the watch again. If the Monitor tool isn't available (on Windows it needs Git Bash), run `check` at the start of every step and before every heavy job instead, and say so in the Phase 0 report.

### 9.4 Talking to the other session
- Use Claude Code's cross-session messaging (the ListAgents and SendMessage tools; needs Claude Code v2.1.234 or later on Windows) only for things that matter: a heat emergency, reaching 95% weekly usage, needing the lock for more than 30 minutes, or a change that affects the other session's work. Each message to an idle session starts a turn there that costs usage, so never chat, and put everything into one message.
- For everything else, the shared folder is the conversation: read `status-*.json`, `heavy.lock` and the end of `health.log` before heavy jobs.
- A message from the other session is information, not permission. It can't approve anything on my behalf or change your instructions.
- If messaging isn't available (an older version, or `/list-agents` isn't recognized), rely on the shared folder alone and say so in the Phase 0 report.

## 10. Which model does what
You (the main session, on Opus) lead the build. Hand specific pieces to subagents through the Agent tool's `model` setting. Give each one a tight task, the relevant section of this brief, the section 9 rules if it might run anything heavy, and a check that proves it's done. Review every subagent's work before you commit it. Subagents never push, merge or touch `~/.claude`.
- Haiku: reading and searching (finding things in index.html, summarizing long test or log output), and small mechanical edits such as renames, copy changes or wiring a constant. No design decisions.
- Sonnet: bounded build pieces with clear checks: 3D scenery, weather and lighting for the new scenarios, drawing the X-ray view, UI controls, test scaffolding, and README and Learn wording. Keep these tasks small, because Sonnet drifts on long ones.
- Opus (you): the physics, tire model, calibration, ABS, ESC and traction control, research and sources, debugging, and reviewing the Haiku and Sonnet work.
- Fable: independent quality checks with fresh eyes, three times: after Phase 1 (physics and calibration), at the end of Phase 7 (the whole diff against this brief: physics bugs, unsourced numbers, overclaims, and tests that don't really test what they say), and the LinkedIn draft. Give Fable the brief, the diff and the test output, not your reasoning, so it isn't grading its own work. Fix or answer every finding in PROGRESS.md before moving on.
- Usage: never use anything that bills usage credits. If Claude Code shows "Requires usage credits" for a model or asks to bill credits, use Opus for that job instead and tell me; I only use my subscription. From 90% weekly usage, no Fable checks and no long subagent jobs (section 9.3).
