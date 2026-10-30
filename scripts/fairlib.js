// Shared helpers for scripts/fairness.js and test/fair.test.js. Node only.
// Reads the scenario list (SCEN) and car lengths (PROF) straight from index.html, so there is one source of truth.
'use strict';
const fs = require('fs'), path = require('path');
const {Grip, Phys, VEH, loadParams} = require('./simlib.js');
const Road = require(path.join(__dirname, '..', 'js', 'road.js'));
const Fair = require(path.join(__dirname, '..', 'js', 'fair.js'));

const HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
function slice(start){   // the bracketed literal that follows `start`
  const a = HTML.indexOf(start); if (a < 0) throw new Error('not found in index.html: ' + start);
  const open = HTML.indexOf(start.trim().slice(-1) === '[' ? '[' : '{', a); let d = 0;
  for (let i = open; i < HTML.length; i++){ const c = HTML[i]; if (c === '[' || c === '{') d++; else if (c === ']' || c === '}'){ d--; if (!d) return HTML.slice(open, i + 1); } }
  throw new Error('unbalanced: ' + start);
}
const SCEN = (0, eval)('(' + slice('const SCEN = [') + ')');
const PROF = (0, eval)('(' + slice('const PROF = {') + ')');
const VTYPE = (0, eval)('(' + slice('const VEH = {') + ')');
// The weathers that change the surface or temperature (index.html surfaceAt/runTemp); blowing snow only cuts visibility
const WEATHERS = ['clear', 'snow', 'frzrain'];
const weatherKey = w => w === 'blowing' ? 'clear' : (w || 'clear');
const DRIVES = ['fwd', 'rwd', 'awd', '4x4'];

function deps(){ const params = loadParams(); return {Phys, Road, grip:Grip.make(params.fixes), params, vehicles:VEH}; }
// Scenarios whose hazard placement uses warnDist (the stopping scenarios)
const FAIR_SCEN = SCEN.filter(s => s.kind === 'stop' && s.hazard);
function ctx(sc, vehicle, drive, weather, D){
  D = D || deps();
  return {D, sc, P:Road.buildPath(sc.path), Hs:sc.hazard.s,
    o:{vehicle, drive, weather, T:D.grip.runTemp(sc, weather), half:PROF[VTYPE[vehicle].type].L/2}};
}
// The legacy 1-D estimate, used only as the solver's first guess
function legacyWarn(c, v){
  return c.D.grip.stopRun('winter', c.sc, c.Hs - 60, v, {weather:c.o.weather, vehicle:c.o.vehicle, tread:'new', abs:true, rt:Fair.RT}).dist + Fair.MARGIN;
}
module.exports = {SCEN, PROF, VTYPE, WEATHERS, DRIVES, weatherKey, FAIR_SCEN, deps, ctx, legacyWarn, Fair, Road, Phys};
