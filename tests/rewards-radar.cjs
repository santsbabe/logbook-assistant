'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const rr=require('../familyroy-control-centre/rewards-radar.js');
const html=fs.readFileSync(path.join(__dirname,'../familyroy-control-centre/index.html'),'utf8');
let checks=0;
function test(name,fn){fn();checks++;console.log('PASS '+name);}
function store(){const d=new Map([['familyroy_cc_live_v1','{"shopping":[{"id":"preserved","done":false}],"tasks":[{"id":"keep"}]}']]);
 return {getItem:k=>d.has(k)?d.get(k):null,setItem:(k,v)=>d.set(k,String(v)),hasItem:k=>d.has(k)};}
const current='2026-10-25T18:00:00+02:00';
const first=rr.FIRST_REWARD;

test('Mugg & Bean starter metadata and expiry correct',()=>{
 assert.equal(first.retailer,'Mugg & Bean');assert.equal(first.expiryAt,'2026-11-06T23:59:00+02:00');assert.equal(first.sourceUrl,'');
});
test('starter is visible but does not silently write local storage',()=>{
 const s=store();assert.equal(rr.read(s).length,1);assert.equal(s.hasItem(rr.STORAGE_KEY),false);
});
test('valid expiry time uses SAST offset',()=>{
 assert.equal(rr.parseExpiry('2026-11-06','23:59'),'2026-11-06T23:59:00+02:00');
});
test('invalid dates and clock times cannot be saved',()=>{
 for(const [d,t] of [['2026-02-30','12:00'],['2026-13-04','12:00'],['2026-11-06','25:00'],['2026-01-00','23:59']])
 assert.throws(()=>rr.parseExpiry(d,t));
});
test('expiry boundary is inclusive until end of expiry minute',()=>{
 const at=Date.parse(first.expiryAt);
 assert.equal(rr.status(first,at),'urgent');assert.equal(rr.status(first,at+1),'expired');
});
test('three-day and seven-day urgency thresholds',()=>{
 const at=Date.parse(first.expiryAt);
 assert.equal(rr.status(first,at-2*86400000),'urgent');
 assert.equal(rr.status(first,at-6*86400000),'soon');
 assert.equal(rr.status(first,at-10*86400000),'active');
});
test('redeemed takes precedence over other statuses',()=>{
 assert.equal(rr.status({...first,redeemed:true},Date.parse('2026-12-01T00:00:00+02:00')),'redeemed');
});
test('normalised retailer slug matches special characters',()=>{
 assert.equal(rr.slug('  Mugg & Bean  '),'mugg-and-bean');
});
test('specific branch requires matching retailer and matching branch',()=>{
 const x={...first,mode:'specific',branch:'Canal Walk'};
 assert.equal(rr.matches(x,'mugg-and-bean','canal-walk'),true);
 assert.equal(rr.matches(x,'mugg-and-bean','pinelands'),false);
 assert.equal(rr.matches(x,'mugg-and-bean',''),false);
 assert.equal(rr.matches(x,'pep-home','canal-walk'),false);
});
test('any-branch reward uses retailer-only filtering',()=>{
 assert.equal(rr.matches(first,'mugg-and-bean','anywhere'),true);
 assert.equal(rr.matches(first,'pep-home',''),false);
});
test('generic shopping route displays all outstanding rewards',()=>{
 const x={...first,id:'branch-only',mode:'specific',branch:'Canal Walk'};
 assert.deepEqual(rr.visible([first,x],'?shop=',Date.parse(current)).map(v=>v.id),['mugg-bean-hot-drink-2026','branch-only']);
});
test('location route excludes other retailers and ineligible branch',()=>{
 const second={...first,id:'pep',retailer:'PEP Home',slug:'pep-home'};
 const branchOnly={...first,id:'specific',mode:'specific',branch:'Canal Walk'};
 const v=rr.visible([first,second,branchOnly],'?shop=mugg-and-bean&branch=pinelands',Date.parse(current));
 assert.deepEqual(v.map(x=>x.id),[first.id]);
});
test('expired/redeemed excluded from quick view, retained in management',()=>{
 const expired={...first,id:'expired',expiryAt:'2026-01-01T23:59:00+02:00'};
 const used={...first,id:'used',redeemed:true};
 assert.deepEqual(rr.visible([first,expired,used],'?shop=',Date.parse(current)).map(x=>x.id),[first.id]);
 assert.equal(rr.visible([first,expired,used],'',Date.parse(current)).length,3);
});
test('saving a reward never modifies original Shopping Radar storage',()=>{
 const s=store(),original=s.getItem('familyroy_cc_live_v1');
 const id=rr.add(s,{title:'Free muffin',retailer:'PEP Home',date:'2026-11-10',time:'22:15',mode:'specific',branch:'Goodwood'});
 assert.ok(id.startsWith('reward-'));assert.equal(rr.read(s).length,2);
 assert.equal(s.getItem('familyroy_cc_live_v1'),original);
 rr.mark(s,id,true);assert.ok(rr.read(s).find(x=>x.id===id).redeemed);
 rr.mark(s,id,false);assert.equal(rr.read(s).find(x=>x.id===id).redeemed,false);
 rr.remove(s,id);assert.equal(rr.read(s).length,1);
 assert.equal(s.getItem('familyroy_cc_live_v1'),original);
});
test('deleting every reward does not restore starter metadata',()=>{
 const s=store();rr.save(s,[]);assert.deepEqual(rr.read(s),[]);
});
test('corrupt saved records fail closed instead of overwriting them',()=>{
 const s=store();s.setItem(rr.STORAGE_KEY,'{incomplete');
 assert.throws(()=>rr.read(s));assert.equal(s.getItem(rr.STORAGE_KEY),'{incomplete');
});
test('unsafe links and missing specific-branch information rejected',()=>{
 const s=store(),original=s.getItem('familyroy_cc_live_v1');
 const base={title:'Offer',retailer:'Store',date:'2026-11-07',time:'23:59',mode:'anyBranch'};
 assert.throws(()=>rr.add(s,{...base,sourceUrl:'javascript:alert(1)'}));
 assert.throws(()=>rr.add(s,{...base,mode:'specific',branch:''}));
 assert.equal(s.getItem('familyroy_cc_live_v1'),original);
});
test('live HTML includes rewards view, form, photo capture options and source',()=>{
 for(const id of ['rewardsRadarRoot','rewardImagePanel','rewardCamera','rewardUpload','rewardExpiryDate','rewardExpiryTime','rewardMessage']) {
   assert.ok(html.includes('id="'+id+'"'),id);
 }
 assert.ok(html.includes('<script src="./rewards-radar.js"></script>'));
 assert.ok(html.includes('if(window.renderRewardsRadar)window.renderRewardsRadar()'));
 assert.ok(html.includes('function toggleShopDone(id)'));
 assert.ok(html.includes("const KEY='familyroy_cc_live_v1'"));
});
test('inline original application JavaScript stays syntactically valid',()=>{
 const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(x=>x[1]);
 for (const source of scripts) new vm.Script(source);
});
test('browser module parses and uses safe text rendering',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../familyroy-control-centre/rewards-radar.js'),'utf8');
 new vm.Script(source);
 assert.ok(source.includes('escapeHtml(x.title)'));
 assert.ok(source.includes('escapeHtml(x.sourceUrl)'));
 assert.ok(source.includes("indexedDB.open(MEDIA_DB,1)"));
 assert.ok(!source.includes('fetch(') && !source.includes('XMLHttpRequest'));
});
console.log('Rewards Radar checks:',checks,'passed.');
