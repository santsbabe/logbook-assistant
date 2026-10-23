'use strict';
/* Public entry-point privacy regression, uses only synthetic data. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const file=fs.readFileSync('familyroy-control-centre/index.html','utf8');
const scripts=[...file.matchAll(/<script(?:\\s[^>]*)?>([\\s\\S]*?)<\\/script>/gi)].map(m=>m[1]);
const source=scripts.find(s=>s.includes("const KEY='familyroy_cc_live_v1'"));
assert(source,'Production inline JavaScript not found');
new vm.Script(source,{filename:'control-centre-production-inline.js'});
assert(source.includes('const purchaseSeed=[];'),'No shopping purchase ledger may be hard-coded');
assert(source.includes('const seed=[];'),'No family task ledger may be hard-coded');
assert(!/\\b(?:OHC|OHS)\\s?\\d{6}\\s?\\d{3}\\b/i.test(file),'No government patient identifiers in frontend');
assert(!/\\b(?:ghp_|github_pat_|sb_secret_|sk_live_)[A-Za-z0-9_-]{12,}/.test(file),'No privileged secret keys in frontend');
const start=source.indexOf('function load(){'),stop=source.indexOf('let db=load();',start);
assert(start>0&&stop>start,'Stable local-data loader must exist');
const loader=source.slice(start,stop);
assert(!/\\bd\\.(?:tasks|events|purchases|priceWatches|shopping)\\.push\\s*\\(/.test(loader),'Loader must not silently inject hard-coded personal records');
const entryKey='familyroy_cc_live_v1';
function loadFrom(value){
  const sandbox={localStorage:{getItem:key=>{assert.equal(key,entryKey);return value===undefined?null:value}},out:null};
  vm.runInNewContext("const KEY='familyroy_cc_live_v1';\\n"+loader+"\\nout=load();",sandbox);
  return JSON.parse(JSON.stringify(sandbox.out));
}
const existing={tasks:[{id:'synthetic-1',title:'Synthetic existing family task',state:'Waiting'}],
   seen:['synthetic-email-id'],docs:{birth:true},shopping:[{id:'synthetic-item'}],
   purchases:[{id:'synthetic-purchase'}],events:[{id:'synthetic-event'}],custom:{keep:true}};
const read=loadFrom(JSON.stringify(existing));
for(const key of Object.keys(existing))assert.deepEqual(read[key],existing[key],'Preserve '+key+' from legacy device');
const clean=loadFrom(undefined);
for(const key of ['tasks','seen','shopping','events','purchases','priceWatches'])
  assert.deepEqual(clean[key],[],key+' starts empty when no device records exist');
assert(clean.docs && typeof clean.docs==='object','Safe defaults for dependent document status');
console.log('PASS: production syntax, no bundled ledgers, preserved existing browser records, empty new devices');
