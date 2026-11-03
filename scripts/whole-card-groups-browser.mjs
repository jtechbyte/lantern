import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';

export async function verifyWholeCardGroups(page,width,height){
 const directory='artifacts/whole-card-groups';mkdirSync(directory,{recursive:true});
 const track=page.locator('.latest-track'),next=page.getByRole('button',{name:'Next titles',exact:true}),previous=page.getByRole('button',{name:'Previous titles',exact:true});
 const settle=async()=>{await page.clock.runFor(700);await page.waitForTimeout(60);};
 async function inspect(){
  const state=await track.evaluate(t=>{
   const bounds=t.getBoundingClientRect();const visible=[],partial=[];
   const rail=t.parentElement.getBoundingClientRect(),style=getComputedStyle(t),card=t.firstElementChild.getBoundingClientRect();
   const buttons=[...t.parentElement.querySelectorAll('.latest-arrow')];
   const centers=[(rail.left+bounds.left+parseFloat(style.paddingLeft))/2,(bounds.right-parseFloat(style.paddingRight)+rail.right)/2];
   const alignment=buttons.map((b,i)=>{const r=b.getBoundingClientRect(),svg=b.querySelector('svg').getBoundingClientRect();return {x:Math.abs(r.left+r.width/2-centers[i]),y:Math.abs(r.top+r.height/2-card.top-card.height/2),iconX:Math.abs(svg.left+svg.width/2-r.left-r.width/2),iconY:Math.abs(svg.top+svg.height/2-r.top-r.height/2),clear:i?r.left>=bounds.right:r.right<=bounds.left};});
   for(const [index,c] of [...t.children].entries()){
    const r=c.getBoundingClientRect();if(r.right>bounds.left+1&&r.left<bounds.right-1){
     if(r.left<bounds.left-1||r.right>bounds.right+1)partial.push(index);else visible.push(index);
     for(const e of c.querySelectorAll('strong,.latest-card-meta span,.latest-badge')){const a=e.getBoundingClientRect();if(a.left<bounds.left-1||a.right>bounds.right+1)partial.push(index);}
    }
   }
   return {visible,partial,alignment,scroll:t.scrollLeft,total:t.children.length};
  });
  assert.ok(state.alignment.every(a=>a.x<1&&a.y<1&&a.iconX<1&&a.iconY<1&&a.clear),JSON.stringify(state.alignment));
  assert.deepEqual(state.partial,[],JSON.stringify({width,height,...state}));assert.ok(state.visible.length);return state;
 }
 for(const [filter,count] of [['All',12],['TV Shows',8]]){
  await page.getByRole('button',{name:filter,exact:true}).click();await settle();await page.waitForFunction(n=>document.querySelectorAll('.latest-track .latest-media-card').length===n,count);await settle();
  assert.equal((await inspect()).visible[0],0,'A changed filter starts at the first whole group');
  const label=filter==='All'?'all':'tv',seen=new Set(),starts=[];let group=0;
  for(;;){const state=await inspect();starts.push(state.visible[0]);state.visible.forEach(i=>seen.add(i));await page.screenshot({path:`${directory}/${label}-${width}x${height}-group-${group}.png`});if(await next.isDisabled())break;await next.click();await settle();assert.ok(++group<12);}
  assert.equal(seen.size,count,'Every item reached as a whole card');
  assert.ok((await inspect()).visible.includes(count-1));
  const reverse=[];while(await previous.isEnabled()){await previous.click();await settle();reverse.push((await inspect()).visible[0]);}
  assert.deepEqual(reverse,starts.slice(0,-1).reverse(),'Backward arrows revisit the same aligned groups');
  assert.ok((await inspect()).visible.includes(0));
  await next.hover();const before=await next.boundingBox();
  assert.equal(await next.evaluate(e=>getComputedStyle(e).borderTopColor),'rgb(255, 191, 63)');
  assert.equal(await next.evaluate(e=>getComputedStyle(e).boxShadow),'none');
  await page.mouse.move(0,0);await next.focus();await page.keyboard.press('Tab');await page.keyboard.press('Shift+Tab');
  assert.equal(await next.evaluate(e=>getComputedStyle(e).outlineOffset),'-4px');assert.deepEqual(await next.boundingBox(),before);
  await page.screenshot({path:`${directory}/${label}-${width}x${height}-arrow-focus.png`});
  assert.equal(await previous.evaluate(e=>getComputedStyle(e).pointerEvents),'none');
  for(let i=0;i<count;i++){
   await page.mouse.move(0,0);
   if(!i){await track.focus();await page.keyboard.press('Tab');}else await page.keyboard.press('ArrowRight');await settle();
   assert.equal(await track.locator('.latest-media-card').nth(i).evaluate(e=>e===document.activeElement),true);assert.ok((await inspect()).visible.includes(i));
   if([0,Math.floor(count/2),count-1].includes(i)){
    const card=track.locator('.latest-media-card').nth(i);
    await page.screenshot({path:`${directory}/${label}-${width}x${height}-card-${i}-focus.png`});
    const focus=await card.evaluate(e=>{const s=getComputedStyle(e),ring=getComputedStyle(e,'::after');return {outline:ring.borderTopStyle,width:ring.borderTopWidth,offset:ring.top,transform:s.transform,filter:s.filter};});
    assert.equal(focus.outline,'solid');assert.equal(focus.width,'2px');assert.equal(focus.offset,'1px');assert.equal(focus.transform,'none');assert.equal(focus.filter,'none');
    await page.evaluate(()=>document.activeElement.blur());await card.hover();await settle();
    assert.equal(await card.evaluate(e=>getComputedStyle(e).boxShadow),'none');assert.equal(await card.evaluate(e=>getComputedStyle(e).borderTopColor),'rgb(255, 191, 63)');
    await page.screenshot({path:`${directory}/${label}-${width}x${height}-card-${i}-hover.png`});
    await card.click();await page.locator('dialog[aria-label="Indexed title details"]').waitFor({state:'visible'});assert.equal(await card.getAttribute('aria-expanded'),'true');assert.equal(await card.evaluate(e=>getComputedStyle(e).boxShadow),'none');assert.equal(await card.evaluate(e=>getComputedStyle(e).borderTopColor),'rgb(255, 191, 63)');
    await page.screenshot({path:`${directory}/${label}-${width}x${height}-card-${i}-selected.png`});
    await page.keyboard.press('Escape');await settle();assert.equal(await card.getAttribute('aria-expanded'),'false');await card.focus();
   }
  }
  await page.keyboard.press('Home');await settle();assert.ok((await inspect()).visible.includes(0));await page.keyboard.press('End');await settle();assert.ok((await inspect()).visible.includes(count-1));
 }
 await page.getByRole('button',{name:'All',exact:true}).click();await settle();await page.waitForFunction(()=>document.querySelectorAll('.latest-track .latest-media-card').length===12);await settle();
 console.log('PASS whole-card groups, all/TV arrows, keyboard traversal and first/middle/last highlights',width,height);
}
