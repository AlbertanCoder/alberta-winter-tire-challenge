'use strict';
// Phase 2 end-to-end: every scenario x tire x ESC, driven by the scripted test driver through window.WTTest (?test=1).
const {test, expect} = require('playwright/test');
const fs = require('fs');
const path = require('path');
const {pathToFileURL} = require('url');

const URL = pathToFileURL(path.join(__dirname, '..', '..', 'index.html')).href + '?test=1';
const OUT = path.join(__dirname, '..', '..', 'test-results');
const SUMMARY = path.join(OUT, 'e2e-outcomes.json');
const TIRES = ['winter', 'allseason'];
const ESCS = [true, false];

// Scenario list, read from the page once (fresh load, no run needed)
let SCEN = [];
test.beforeAll(async ({browser}) => {
  const page = await browser.newPage();
  await page.goto(URL);
  await page.waitForFunction(() => window.WTTest && window.SCEN);
  SCEN = await page.evaluate(() => window.SCEN.map(s => ({id: s.id, kind: s.kind, hazard: s.hazard ? s.hazard.type : null})));
  await page.close();
  fs.mkdirSync(OUT, {recursive: true});
});

function record(project, row){
  let all = {};
  try { all = JSON.parse(fs.readFileSync(SUMMARY, 'utf8')); } catch (e) { /* first write */ }
  all[project] = all[project] || [];
  all[project] = all[project].filter(r => !(r.id === row.id && r.tire === row.tire && r.esc === row.esc));
  all[project].push(row);
  fs.mkdirSync(OUT, {recursive: true});
  fs.writeFileSync(SUMMARY, JSON.stringify(all, null, 2));
}

// Tests are generated from the page's scenario list, so list them at collection time from index.html's ids
const idsFromSource = (() => {
  const html = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8');
  const i = html.indexOf('const SCEN = [');
  const seg = html.slice(i, html.indexOf('\n];', i));
  return [...seg.matchAll(/^  \{id:'([a-z0-9_]+)'/gm)].map(m => m[1]);
})();

for (const id of idsFromSource){
  for (const tire of TIRES){
    for (const esc of ESCS){
      test(`${id} | ${tire} | ESC ${esc ? 'on' : 'off'}`, async ({page}, testInfo) => {
        const errors = [];
        page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
        page.on('pageerror', e => errors.push(String(e)));
        await page.goto(URL);
        await page.waitForFunction(() => window.WTTest && window.SCEN);
        const sc = SCEN.find(s => s.id === id);
        expect(sc, 'scenario ' + id + ' exists in the page').toBeTruthy();
        await page.evaluate(([id, tire, esc]) => window.WTTest.load(id, {tire, esc}), [id, tire, esc]);
        if (sc.kind === 'hill'){
          // wait for green (the signal turns green at about 1.5 s), then gas
          await page.evaluate(() => window.WTTest.timeline([[0, {}], [1.7, {gas: true}]]));
        } else {
          await page.evaluate(() => window.WTTest.driver('test'));
        }
        await page.evaluate(() => window.WTTest.fast(20));
        await page.waitForFunction(() => { const s = window.WTTest.state(); return s && s.outcome; }, null, {timeout: 60000});
        const st = await page.evaluate(() => window.WTTest.state());
        if (tire === 'winter' && esc){
          await page.screenshot({path: path.join(OUT, `${id}-${testInfo.project.name}.png`)});
        }
        record(testInfo.project.name, {id, tire, esc, kind: sc.kind, hazard: sc.hazard, safe: st.outcome.safe, text: st.outcome.text, short: st.outcome.short, t: st.t, v: st.v, errors});
        expect(errors, 'no console errors').toEqual([]);
        if (sc.hazard && sc.kind === 'stop' && tire === 'winter' && esc){
          expect(st.outcome.safe, `fairness: ${id} must be safe for the scripted driver (${st.outcome.text})`).toBe(true);
        }
      });
    }
  }
}
