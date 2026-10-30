// Records the overpass-spin scenario for LinkedIn (brief 4.14): the SAME fixed input script on all-season and winter
// tires (ESC on, small SUV), in real time, plus screenshots (the glance, the ice, the X-ray replay), then encodes
// media/overpass-spin.mp4 with ffmpeg (2 threads, H.264). HEAVY JOB: take the ~/claude-coord lock first.
// The inputs are a plausible, moderate correction after the glance, not tuned for drama; the physics decides.
'use strict';
const path = require('path'), fs = require('fs'), {execFileSync} = require('child_process');
const {chromium} = require('playwright');
const ROOT = path.join(__dirname, '..'), OUT = path.join(ROOT, 'media'), TMP = path.join(ROOT, 'test-results', 'media');
const URL = require('url').pathToFileURL(path.join(ROOT, 'index.html')).href + '?test=1';
// Fixed input script (run time in s; the glance starts about 7.9 s in and lasts 1.1 s):
// a short steer back toward the lane centre, a smaller one to straighten, then hands steady
const INPUTS = [[0, {}], [9.3, {left:true}], [9.55, {}], [9.75, {right:true}], [9.95, {}]];
const TIRES = [['allseason', 'All-season tires'], ['winter', 'Winter tires']];

(async () => {
  fs.mkdirSync(OUT, {recursive:true}); fs.mkdirSync(TMP, {recursive:true});
  const browser = await chromium.launch({args:['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist']});
  const clips = [], results = [];
  for (const [tire, label] of TIRES){
    const ctx = await browser.newContext({viewport:{width:1280, height:720}, recordVideo:{dir:TMP, size:{width:1280, height:720}}});
    const page = await ctx.newPage(), errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(URL); await page.waitForFunction(() => !!window.WTTest);
    await page.evaluate(([t, tl]) => { WTTest.load('overspin', {tire:t, vehicle:'suv', esc:true, abs:true, tcs:true}); WTTest.timeline(tl); }, [tire, INPUTS]);
    await page.waitForTimeout(8300); await page.screenshot({path:path.join(OUT, 'overspin-glance-' + tire + '.png')});
    await page.waitForTimeout(2600); await page.screenshot({path:path.join(OUT, 'overspin-ice-' + tire + '.png')});
    await page.waitForFunction(() => WTTest.state().outcome, null, {timeout:40000});
    const st = await page.evaluate(() => WTTest.state());
    await page.waitForTimeout(2500);
    if (tire === 'winter'){
      await page.screenshot({path:path.join(OUT, 'results.png')});
      const xb = await page.$('#xrayBtn'); if (xb && await xb.isVisible()){ await xb.click(); await page.waitForTimeout(1500); await page.screenshot({path:path.join(OUT, 'xray.png')}); }
    }
    results.push({tire, outcome:st.outcome && st.outcome.text, safe:st.outcome && st.outcome.safe, errors});
    const v = page.video(); await ctx.close(); clips.push([await v.path(), label]);
  }
  await browser.close();
  console.log(JSON.stringify(results));
  // Encode: each clip gets its tire label, both get the comparison caption; then join and compress
  const parts = clips.map(([f, label], i) => {
    const o = path.join(TMP, 'part' + i + '.mp4');
    const txt = (t, y, size) => "drawtext=text='" + t + "':x=(w-text_w)/2:y=" + y + ":fontsize=" + size + ":fontcolor=white:box=1:boxcolor=black@0.55:boxborderw=12";
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-threads', '2', '-i', f, '-vf',
      [txt(label, 'h-150', 44), txt('Same steering, same pedals, only the tires changed.', 'h-80', 28)].join(','),
      '-r', '30', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '30', '-pix_fmt', 'yuv420p', '-an', o]);
    return o;
  });
  const list = path.join(TMP, 'list.txt'); fs.writeFileSync(list, parts.map(p => "file '" + p.replace(/\\/g, '/') + "'").join('\n'));
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-threads', '2', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', path.join(OUT, 'overpass-spin.mp4')]);
  console.log('wrote media/overpass-spin.mp4', fs.statSync(path.join(OUT, 'overpass-spin.mp4')).size, 'bytes');
})().catch(e => { console.error(e); process.exit(1); });
