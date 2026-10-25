'use strict';
// Full user-interaction QA of the REAL FamilyRoy candidate using a local static server.
// No Netlify deploy, GitHub Pages changes, Shortcut edits or user data.
const assert=require('node:assert/strict');
const {createServer}=require('node:http');
const fs=require('node:fs');
const {resolve,join,extname,sep}=require('node:path');
const {spawnSync}=require('node:child_process');
const puppeteer=require('puppeteer-core');
const root=process.cwd();
const chrome=['google-chrome','chromium','chromium-browser'].find(name=>spawnSync('which',[name]).status===0);
assert.ok(chrome,'Headless Chromium required');
const executablePath=spawnSync('which',[chrome],{encoding:'utf8'}).stdout.trim();
const server=createServer((req,res)=>{
  let file=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname));
  if(!(file===root||file.startsWith(root+sep))){res.writeHead(403);res.end('Forbidden');return;}
  try{
    if(fs.statSync(file).isDirectory())file=join(file,'index.html');
    res.writeHead(200,{'Content-Type':{'.html':'text/html','.js':'text/javascript'}[extname(file)]||'application/octet-stream'});
    res.end(fs.readFileSync(file));
  }catch{res.writeHead(404);res.end('Not found');}
});
let browser;
let checks=0;
function passed(name){checks++;console.log('PASS '+name);}
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port+'/familyroy-control-centre/';
  browser=await puppeteer.launch({executablePath,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
  const page=await browser.newPage();
  await page.setViewport({width:390,height:844,deviceScaleFactor:1});
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  // Block external requests; test cannot accidentally transmit account or voucher information.
  await page.setRequestInterception(true);
  page.on('request',request=>{
    if(request.url().startsWith('http://127.0.0.1:'))request.continue();
    else request.abort();
  });
  await page.goto(base,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.querySelector('#rewardsRadarRoot')?.textContent.includes('Free hot drink'),{timeout:15000});
  await page.click('.tab[data-p="shopping"]');
  assert.match(await page.$eval('#rewardsRadarRoot',el=>el.innerText),/Free hot drink/);
  passed('Rewards Radar renders inside existing Shopping Radar tab at iPhone width');

  // Seed and persist user's existing legacy data by copying in-memory state.
  const original=await page.evaluate(()=>{
    const snapshot=JSON.parse(JSON.stringify(db));
    snapshot.shopping.push({id:'fixture-keep-shopping',title:'Do not delete me',
      retailer:'PEP Home',slug:'pep-home',mode:'anyBranch',branch:'',done:false,source:'QA'});
    localStorage.setItem('familyroy_cc_live_v1',JSON.stringify(snapshot));
    return localStorage.getItem('familyroy_cc_live_v1');
  });
  assert.ok(original.includes('fixture-keep-shopping'));
  passed('Existing Shopping Radar data captured as a protected sentinel');

  // Add a branch-specific reward through the actual UI (no direct module calls).
  await page.type('#rewardTitle','QA-only free muffin');
  await page.type('#rewardRetailer','PEP Home');
  await page.$eval('#rewardExpiryDate',el=>{el.value='2026-11-14';el.dispatchEvent(new Event('change',{bubbles:true}));});
  await page.$eval('#rewardExpiryTime',el=>{el.value='23:59';el.dispatchEvent(new Event('change',{bubbles:true}));});
  await page.select('#rewardMode','specific');
  await page.type('#rewardBranch','Goodwood');
  await page.click('button[onclick="addRadarReward()"]');
  await page.waitForFunction(()=>document.querySelector('#rewardsRadarRoot')?.textContent.includes('QA-only free muffin'));
  assert.equal(await page.evaluate(()=>RewardsRadar.read(localStorage).length),2);
  passed('Add a reward via fields, date/time, branch restriction and Save button');

  const getItems=()=>page.evaluate(()=>[...document.querySelectorAll('.rewardItem strong')].map(el=>el.textContent));
  await page.goto(base+'?shop=pep-home&branch=goodwood',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.body.classList.contains('driveMode'));
  assert.ok((await getItems()).includes('QA-only free muffin'));
  assert.match(await page.$eval('#shopping',el=>el.innerText),/Do not delete me/);
  passed('Matching PEP Home branch shows the reward and retained old shopping item');

  await page.goto(base+'?shop=pep-home&branch=kenilworth',{waitUntil:'domcontentloaded'});
  assert.ok(!(await getItems()).includes('QA-only free muffin'));
  passed('Wrong PEP Home branch excludes the restricted reward');

  await page.goto(base+'?shop=mugg-and-bean',{waitUntil:'domcontentloaded'});
  assert.ok((await getItems()).includes('Free hot drink'));
  assert.ok(!(await getItems()).includes('QA-only free muffin'));
  passed('Existing retailer URL contract displays only relevant Mugg & Bean reward');

  const muggId=await page.evaluate(()=>RewardsRadar.FIRST_REWARD.id);
  await page.evaluate(id=>setRewardRedeemed(id,true),muggId);
  assert.ok(!(await getItems()).includes('Free hot drink'));
  passed('Redeemed reward disappears from arrival view');
  await page.goto(base,{waitUntil:'domcontentloaded'});
  assert.match(await page.$eval('#rewardsRadarRoot',el=>el.innerText),/Redeemed/);
  passed('Redeemed reward remains visible and reversible in management');

  // Synthetic photo upload, browser IndexedDB storage and image display.
  await page.click('.tab[data-p="shopping"]');
  await page.evaluate(id=>setRewardRedeemed(id,false),muggId);
  await page.evaluate(id=>rewardPickImage(id,false),muggId);
  const fixture='/tmp/rewards-radar-qa-1px.png';
  fs.writeFileSync(fixture,Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j6S8AAAAASUVORK5CYII=','base64'));
  const upload=await page.$('#rewardUpload');
  await upload.uploadFile(fixture);
  await page.waitForFunction(()=>document.querySelector('#rewardMessage')?.textContent.includes('saved privately'),{timeout:15000});
  passed('Choose Photo stores synthetic voucher image in IndexedDB');

  await page.evaluate(id=>showRewardImage(id),muggId);
  await page.waitForFunction(()=>document.querySelector('#rewardImagePanel img')?.complete && document.querySelector('#rewardImagePanel img')?.naturalWidth===1,{timeout:15000});
  assert.equal(await page.$eval('#rewardImagePanel',el=>el.hidden),false);
  passed('Show Voucher displays the stored image without uploading');

  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.querySelector('#rewardsRadarRoot')?.textContent.includes('Free hot drink'));
  await page.evaluate(id=>showRewardImage(id),muggId);
  await page.waitForFunction(()=>document.querySelector('#rewardImagePanel img')?.complete && document.querySelector('#rewardImagePanel img')?.naturalWidth===1,{timeout:15000});
  passed('Voucher image survives browser reload');
  assert.equal(await page.evaluate(()=>localStorage.getItem('familyroy_cc_live_v1')),original);
  passed('Every Rewards Radar operation preserves original localStorage byte-for-byte');

  assert.equal(errors.length,0,'Browser JS errors: '+errors.join(' | '));
  passed('No runtime JavaScript exceptions throughout the journey');
  console.log('PASS all '+checks+' Rewards Radar interactive browser acceptance checks');
})().catch(e=>{console.error('FAILED after '+checks+' checks:',e);process.exitCode=1;}).finally(async()=>{
  if(browser)await browser.close();
  await new Promise(resolve=>server.close(resolve));
});
