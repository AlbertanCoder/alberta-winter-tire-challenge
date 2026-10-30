// Records the overpass-spin scenario for LinkedIn (brief 4.14): the SAME fixed input script on all-season and winter
// tires (ESC on, small SUV), in real time, plus screenshots (the glance, the ice, the X-ray replay), then encodes
// media/overpass-spin.mp4 with ffmpeg (2 threads, H.264). HEAVY JOB: take the ~/claude-coord lock first.
// The inputs: the fairness reference driver (steady lane keeping, js/fair.js rule) drives once on winter tires, hands off the
// wheel during the passenger glance, then corrects; its exact per-step steering and pedals are then replayed on both tires.
// Nothing is tuned for drama; the physics decides.
'use strict';
const path = require('path'), fs = require('fs'), {execFileSync} = require('child_process');
const {chromium} = require('playwright');
const ROOT = path.join(__dirname, '..'), OUT = path.join(ROOT, 'media'), TMP = path.join(ROOT, 'test-results', 'media');
const URL = require('url').pathToFileURL(path.join(ROOT, 'index.html')).href + '?test=1';
// With ESC on, both tires may come through (that's the honest default); the brief then adds the same inputs with ESC off
// MEDIA_SCEN picks the scenario (default the overpass spin); MEDIA_OUT the file in media/; MEDIA_ESC_OFF=0 skips the ESC-off pair
const SCEN_ID = process.env.MEDIA_SCEN || 'overspin', OUT_FILE = process.env.MEDIA_OUT || 'overpass-spin.mp4';
const TIRES_ALL = [['allseason', 'All-season tires', true], ['winter', 'Winter tires', true],
  ['allseason', 'All-season, older car without stability control', false], ['winter', 'Winter, older car without stability control', false]];
const TIRES = process.env.MEDIA_ESC_OFF === '0' ? TIRES_ALL.slice(0, 2) : TIRES_ALL;

(async () => {
  fs.mkdirSync(OUT, {recursive:true}); fs.mkdirSync(TMP, {recursive:true});
  const browser = await chromium.launch({args:['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist']});
  const clips = [], results = [];
  // The driving run that produces the inputs (no video, faster than real time)
  const src = await browser.newPage(); await src.goto(URL); await src.waitForFunction(() => !!window.WTTest);
  await src.evaluate((id) => { WTTest.load(id, {tire:'winter', vehicle:'suv', esc:true, abs:true, tcs:true}); WTTest.driver('test'); WTTest.fast(10); }, SCEN_ID);
  await src.waitForFunction(() => WTTest.state().outcome, null, {timeout:60000});
  const INPUTS = await src.evaluate(() => WTTest.inputs()); await src.close();
  console.log('recorded', INPUTS.length, 'input changes');
  for (const [tire, label, esc] of TIRES){
    const ctx = await browser.newContext({viewport:{width:1280, height:720}, recordVideo:{dir:TMP, size:{width:1280, height:720}}});
    const page = await ctx.newPage(), errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(URL); await page.waitForFunction(() => !!window.WTTest);
    await page.evaluate(([t, tl, e, id]) => { WTTest.load(id, {tire:t, vehicle:'suv', esc:e, abs:true, tcs:e}); WTTest.playInputs(tl); }, [tire, INPUTS, esc, SCEN_ID]);
    await page.waitForTimeout(8300); await page.screenshot({path:path.join(OUT, SCEN_ID + '-glance-' + tire + (esc ? '' : '-esc-off') + '.png')});
    await page.waitForTimeout(2600); await page.screenshot({path:path.join(OUT, SCEN_ID + '-ice-' + tire + (esc ? '' : '-esc-off') + '.png')});
    await page.waitForFunction(() => WTTest.state().outcome, null, {timeout:40000});
    const st = await page.evaluate(() => WTTest.state());
    await page.waitForTimeout(2500);
    if (tire === 'winter' && esc){
      await page.screenshot({path:path.join(OUT, SCEN_ID + '-results.png')});
      const xb = await page.$('#xrayBtn'); if (xb && await xb.isVisible()){ await xb.click(); await page.waitForTimeout(1500); await page.screenshot({path:path.join(OUT, SCEN_ID + '-xray.png')}); }
    }
    results.push({tire, esc, outcome:st.outcome && st.outcome.text, safe:st.outcome && st.outcome.safe, errors});
    const v = page.video(); await ctx.close(); clips.push([await v.path(), label]);
  }
  await browser.close();
  console.log(JSON.stringify(results));
  // Encode: each clip gets its tire label, both get the comparison caption; then join and compress
  const parts = clips.map(([f, label], i) => {
    const o = path.join(TMP, SCEN_ID + '-part' + i + '.mp4');
    const txt = (t, y, size) => "drawtext=text='" + t + "':x=(w-text_w)/2:y=" + y + ":fontsize=" + size + ":fontcolor=white:box=1:boxcolor=black@0.55:boxborderw=12";
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-threads', '2', '-i', f, '-vf',
      [txt(label, 'h-150', 44), txt('Same steering, same pedals, only the tires changed.', 'h-80', 28)].join(','),
      '-r', '30', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '30', '-pix_fmt', 'yuv420p', '-an', o]);
    return o;
  });
  const list = path.join(TMP, 'list.txt'); fs.writeFileSync(list, parts.map(p => "file '" + p.replace(/\\/g, '/') + "'").join('\n'));
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-threads', '2', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', path.join(OUT, OUT_FILE)]);
  console.log('wrote media/' + OUT_FILE, fs.statSync(path.join(OUT, OUT_FILE)).size, 'bytes');
})().catch(e => { console.error(e); process.exit(1); });
