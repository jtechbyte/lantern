import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

// Run under xvfb-run on Linux. These are browser shortcuts, not CSS zoom or
// emulated viewport resizing. Credentials stay in memory and are never logged.
export async function verifyBrowserZoom({base,admin}) {
  const browser=await chromium.launch({headless:false,args:['--window-size=1366,900']});
  try {
    const context=await browser.newContext({viewport:null});const page=await context.newPage();
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/*',route=>route.request().url().startsWith(base)?route.continue():route.abort());
    await page.goto(base);await page.locator('#admin-token').fill(admin);await page.locator('#admin-token').press('Enter');
    await page.locator('#panel-overview').waitFor({state:'visible'});await page.bringToFront();
    const windows=execFileSync('xdotool',['search','--onlyvisible','--name','Lantern'],{encoding:'utf8'}).trim().split(/\s+/);
    assert.ok(windows.length);execFileSync('xdotool',['windowfocus','--sync',windows[0]]);
    const key=async keys=>{execFileSync('xdotool',['key','--clearmodifiers',keys]);await page.waitForTimeout(250);};
    await key('ctrl+0');const baseline=await page.evaluate(()=>({width:innerWidth,dpr:devicePixelRatio}));
    const results=[];mkdirSync('artifacts/zoom',{recursive:true});
    for(const [percent,presses] of [[125,2],[150,3],[200,5]]){
      await key('ctrl+0');for(let i=0;i<presses;i++)await key('ctrl+plus');
      const actual=await page.evaluate(()=>({width:innerWidth,height:innerHeight,dpr:devicePixelRatio,scrollWidth:document.documentElement.scrollWidth}));
      assert.ok(Math.abs(actual.dpr/baseline.dpr-percent/100)<.02,`Actual browser zoom ${percent}%: ${JSON.stringify(actual)}`);
      assert.ok(Math.abs(actual.width*percent/100-baseline.width)<3,'Zoom changes the CSS viewport');
      assert.ok(actual.scrollWidth<=actual.width,'No horizontal page overflow');
      // Visit every section and reveal every visible control without activation.
      let controls=0;
      for(const tab of await page.locator('.dashboard-nav [role=tab]').all()){
        await tab.click();await page.waitForTimeout(100);
        for(const control of await page.locator('.tab-panel:visible button:visible,.tab-panel:visible input:visible,.tab-panel:visible select:visible,.tab-panel:visible textarea:visible,.tab-panel:visible a:visible,.dashboard-actions button:visible,.dashboard-actions a:visible').all()){
          await control.scrollIntoViewIfNeeded();
          assert.ok(await control.evaluate(e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1&&r.top>=0&&r.bottom<=innerHeight+1;}),'Control reachable at browser zoom');controls++;
        }
      }
      await page.locator('#tab-overview').click();await page.evaluate(()=>scrollTo(0,0));
      // Capture the actual X window: CDP screenshots crop incorrectly at native zoom.
      execFileSync('scrot',['--focused',`artifacts/zoom/overview-${percent}-window.png`]);
      await page.locator('.dashboard-actions .save').scrollIntoViewIfNeeded();
      execFileSync('scrot',['--focused',`artifacts/zoom/actions-${percent}-window.png`]);
      results.push({percent,...actual,controls});console.log('PASS actual browser zoom',JSON.stringify(results.at(-1)));
    }
    assert.deepEqual(errors,[]);writeFileSync('artifacts/zoom/results.json',JSON.stringify({baseline,results},null,2));
  } finally {await browser.close();}
}
