# Alberta Winter Tire Challenge

A free 3D driving game about winter tires in Alberta. You drive fourteen real Alberta winter situations on the tires you have now, then drive the same ones again on winter tires and compare.

**Play it:** https://albertancoder.github.io/alberta-winter-tire-challenge/ (or open `index.html` in a browser).

## New: physics update (October 2026, work in progress)

It looks almost the same as before, but underneath it's a different game. The first version faked the driving: the car could only go where it was pointed and stopped in a straight line. Now:

- Each of the four tires has its own grip and can slide or lock on its own, so the car can fishtail, overcorrect and spin like on real ice.
- The physics runs 1,000 times a second, with grip calibrated to published tire tests ([PHYSICS.md](PHYSICS.md), [docs/CALIBRATION.md](docs/CALIBRATION.md)).
- ABS and stability control work like in a real car, and you can switch them off.
- Hazards appear exactly where a driver on winter tires could just stop, worked out with the full simulation, so every comparison is fair.
- New scenario: a spin on black ice under an Edmonton freeway overpass. After a run, an X-ray replay shows what each tire was doing.

**Video:** [media/ice-stop.mp4](media/ice-stop.mp4): same car, same speed, same braking at the same moment, only the tires changed. Winter tires stop 2.4 m behind the stopped traffic; all-season tires hit it at about 10 km/h.

| | |
|---|---|
| ![All-season tires on the shaded ice under the overpass](media/overpass-ice-allseason.png) | ![Results: same steering, same pedals, only the tires changed](media/overpass-results.png) |
| ![The new overpass spin scenario](media/overspin-glance-winter.png) | ![X-ray replay: grip used at each tire](media/overpass-xray.png) |

It's still a model, not a perfect copy of real driving, and it's being improved. The original version's pictures and video are below.

![Crosswalk on packed snow](media/crosswalk.jpg)

| | |
|---|---|
| ![Side-by-side replay](media/side-by-side.jpg) | ![Results with the physics check](media/results.jpg) |
| ![Bridge deck ice](media/bridge.jpg) | ![Moose at night](media/moose-night.jpg) |
| ![Kananaskis-style mountain climb](media/kananaskis.jpg) | ![Downhill curve with chevron signs](media/downhill-curve.jpg) |
| ![Elk in a mountain town at dusk](media/banff-elk.jpg) | |

Video: [media/winter-tire-challenge.mp4](media/winter-tire-challenge.mp4): a crosswalk, a bridge deck and a moose at night, each on all-season and then winter tires.

## The situations

| Where | Situation | Surface |
|---|---|---|
| Edmonton | Residential crosswalk, 40 km/h | Packed snow, −15 °C |
| Edmonton | Bridge deck ice (inspired by the High Level Bridge) | Dry approach, black ice on the deck, −6 °C |
| Edmonton | Downtown intersection (inspired by Jasper Avenue) | Dry road, polished ice at the intersection, −3 °C |
| Edmonton | Icy hill start, 6% (river valley) | Polished ice, −8 °C |
| Edmonton | Freeway on-ramp curve (inspired by Whitemud Drive) | Packed snow, −10 °C |
| Edmonton | Ice under the overpass (inspired by Anthony Henday Drive) | Dry freeway, black ice in the shade of the bridge |
| Calgary | Black ice at 100 km/h at night (inspired by Stoney Trail) | Black ice, −8 °C |
| Rural Alberta | Gravel range road with a deer at dusk | Snowy gravel (estimate), −12 °C |
| Foothills | Moose at night, 100 km/h | Packed snow, −18 °C |
| Highway 2 | Freezing rain, the car ahead spins out (inspired by the QEII) | Glaze ice, −1 °C (estimate) |
| Kananaskis | Winding climb (inspired by Highway 40) | Packed snow, 5% uphill |
| Icefields Parkway | Downhill curve | Packed snow, 7% downhill, −15 °C |
| Crowsnest Pass | Crash ahead on Highway 3, stopped traffic | Packed snow, 6% downhill |
| Banff | Elk in town at dusk | Packed snow, −10 °C |

Every situation runs on any of 7 vehicle types, with FWD, RWD, AWD or 4x4, and on winter, all-weather, all-season or summer tires.

Before each drive you can also choose the weather (clear, light snow, blowing snow, freezing rain), the time of day (day, dusk, night), tread wear (new, half worn, near the limit) and ABS on or off. ABS off shows why the old advice to never slam the brakes on an icy bridge made sense for older cars, and why with ABS you brake hard and steer.

## The law in Alberta

Alberta has no province-wide winter tire law. On the Icefields Parkway (Highway 93 North), Parks Canada requires winter-rated tires (M+S or the snowflake symbol) or chains from November 1 to late March. M+S all-seasons count as legal there, but the M+S marking has no snow or ice test behind it. Legal isn't the same as safe. Elsewhere, Québec requires winter tires with the snowflake symbol from December 1 to March 15, and BC requires winter-rated tires on many highways from October 1.

## Controls

| Key | Action |
|---|---|
| ↑ or W | Gas |
| ↓, S or Space | Brake |
| ← → or A D | Steer (tap, don't hold) |
| P or Esc | Pause |
| M | Sound on/off |
| R | Restart |

On a phone, use the on-screen ◀ ▶, BRAKE and GAS buttons, with the phone held sideways.

## How the physics works

- **Grip (μ) per tire and surface.** Packed snow and ice values come from braking distances in Tire Rack's 2026 all-weather vs. winter test (μ = v² ÷ 2gd). Other surfaces are estimates that keep the tested ratios between tires. The full table is in the game's Learn menu.
- **Temperature.** Ice is slipperiest near 0 °C (Tada et al., *Friction*, 2023). Snow grips better as it gets colder.
- **Friction circle.** Braking, steering and accelerating share one grip budget. ABS keeps steering available. On loose gravel, ABS stops about 27% longer (NHTSA).
- **Hills.** Deceleration = g(μ cos θ + sin θ), the exact form of the AASHTO stopping-distance formula.
- **Drive type.** Pulling force is limited by the weight on the driven wheels. Braking and cornering are the same for every drive type (UMTRI 2016, Consumer Reports).
- **Hazards** appear where a driver on winter tires reacting in 1.0 s stops 2.5 m short, so the comparison between tires is fair at any speed.
- **ABS off.** Locked wheels slide at a fraction of peak grip (lower on ice and pavement, slightly higher on loose snow and gravel) and can't steer. Estimates, informed by NHTSA and VTI ABS testing.
- **Weather.** Freezing rain turns every surface into glaze ice near 0 °C (an estimate). Light snow covers bare pavement. Blowing snow cuts visibility.

All sources are listed in the game under Learn → Sources.

## Honest limits

This is an educational physics model, not a guarantee of how any tire, car or road will behave. Places are stylized look-alikes. Snowy gravel grip is an estimate, because no published study has measured it. Glaze-ice grip and locked-wheel grip are also estimates. Crash statistics show smaller gains (about 5–6% fewer claims or victims) than braking tests do, because most winter days aren't icy.

An independent project. Not sponsored or endorsed by any government, tire company, retailer or insurer. Organizations are cited as sources only. Made by an Alberta driver in Edmonton.
