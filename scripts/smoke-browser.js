// Browser smoke check for Phase 2 (heavy job: take the ~/claude-coord lock first). Opens index.html from disk in
// headless Chromium, drives two scenarios with the keyboard, and prints console errors, speed and the result.
'use strict';
const path = require('path');
const {chromium} = require('playwright');
(async () => {
  const browser = await chromium.launch({headless:true});
  const page = await browser.newPage({viewport:{width:1280, height:720}});
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto('file://' + path.join(__dirname, '..', 'index.html').replace(/\\/g, '/'));
  await page.waitForTimeout(1500);
  const spd = () => page.$eval('#spd', e => e.textContent);
  for (const [name, idx, plan] of [['Residential crosswalk (brake test)', 0, 'brake'], ['Icy hill start', 3, 'gas']]){
    await page.click('#startBtn').catch(() => {});
    await page.evaluate(() => document.getElementById('ovMap').hidden || null);
    const cards = await page.$$('.scen'); await cards[idx].click();
    await page.click('#goBtn'); await page.waitForTimeout(1500);
    const s0 = await spd();
    if (plan === 'brake'){ await page.keyboard.down('Space'); await page.waitForTimeout(4000); await page.keyboard.up('Space'); }
    else { await page.waitForTimeout(1500); await page.keyboard.down('ArrowUp'); await page.waitForTimeout(6000); await page.keyboard.up('ArrowUp'); }
    const s1 = await spd(), banner = await page.$eval('#banner', e => e.textContent), tag = await page.$eval('#slipTag', e => e.textContent);
    console.log(`${name}: speed ${s0} -> ${s1} km/h, tag "${tag}", banner "${banner}"`);
    await page.waitForTimeout(2500);
    const res = await page.$eval('#ovResult', e => e.hidden ? '(no result yet)' : document.getElementById('resTitle').textContent);
    console.log(`  result: ${res}`);
    await page.evaluate(() => { const b = [...document.querySelectorAll('#resBtns button')].find(x => /Map/.test(x.textContent)); if (b) b.click(); });
    await page.waitForTimeout(500);
  }
  console.log(errors.length ? 'CONSOLE ERRORS:\n' + errors.join('\n') : 'no console errors');
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})();
