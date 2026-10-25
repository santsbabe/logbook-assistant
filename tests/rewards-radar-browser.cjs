'use strict';
// Real headless Chromium smoke of the existing non-deployed FamilyRoy Control Centre.
const assert=require('node:assert/strict');
const {createServer}=require('node:http');
const {readFileSync,statSync,mkdirSync}=require('node:fs');
const {resolve,join,extname,sep}=require('node:path');
const {spawnSync,execFile}=require('node:child_process');
const {promisify}=require('node:util');
const execute=promisify(execFile);
const root=process.cwd();
const browser=['google-chrome','chromium','chromium-browser'].find(c=>spawnSync('which',[c]).status===0);
assert.ok(browser,'Chromium/Chrome is required for Rewards Radar browser testing.');
const mime={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css'};
const server=createServer((req,res)=>{
 const p=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);
 let file=resolve(root,'.'+p);
 if(!file.startsWith(root+sep) && file!==root){res.writeHead(403);res.end('Forbidden');return;}
 try{if(statSync(file).isDirectory())file=join(file,'index.html');
 res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream'});res.end(readFileSync(file));
 }catch{res.writeHead(404);res.end('Not found');}
});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port+'/familyroy-control-centre/';
 mkdirSync('/tmp/familyroy-rewards-radar',{recursive:true});
 for(const t of [
  {name:'overview-phone',query:'',size:'390,844',contains:'Free hot drink'},
  {name:'pep-home-arrival',query:'?shop=pep-home',size:'390,844',contains:'Kitchen / pantry storage organisers'},
  {name:'overview-desktop',query:'',size:'1280,900',contains:'Free hot drink'}
 ]){
  const url=base+t.query,png='/tmp/familyroy-rewards-radar/'+t.name+'.png';
  const args=['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
   '--window-size='+t.size,'--virtual-time-budget=3500','--screenshot='+png,'--dump-dom',url];
  const {stdout}=await execute(browser,args,{timeout:45000,maxBuffer:24*1024*1024});
  const m=stdout.match(/<div id="rewardsRadarRoot"[^>]*>([\s\S]*?)<\/div>\s*<div id="rewardImagePanel"/);
  assert.ok(m,'Rewards root must render in browser');
  assert.match(m[1],/Rewards Radar/,'Rewards component did not run');
  if(t.query===''){
    assert.match(m[1],/Free hot drink/,'Seed not rendered in management view');
    assert.match(m[1],/Expires/);
  }else{
    assert.doesNotMatch(m[1],/Free hot drink/,'Unrelated Mugg reward shown at PEP Home');
    assert.match(stdout,/class="[^"]*driveMode/,'Retailer query did not enter drive mode');
  }
  assert.ok(statSync(png).size>7000,'Screenshot looks empty');
  console.log('PASS '+t.name+' rendered '+statSync(png).size+' byte screenshot');
 }
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>server.close());
