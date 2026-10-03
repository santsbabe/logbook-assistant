import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.FAMILYROY_PLAYWRIGHT_MODULE||'playwright');
test('local browser branch gate, display and reload persistence',async()=>{
 const root=path.resolve('familyroy-control-centre');
 const server=http.createServer(async(req,res)=>{try{let target=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!target.startsWith(root+path.sep)&&target!==root){res.writeHead(403);res.end();return}if(target===root||target.endsWith(path.sep))target=path.join(target,'index.html');let body=await fs.readFile(target);res.setHeader('Content-Type',target.endsWith('.js')?'application/javascript':target.endsWith('.json')?'application/json':'text/html');res.end(body)}catch{res.writeHead(404);res.end()}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 let browser;
 try{
 browser=await chromium.launch({headless:true});let page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://**/*',r=>r.abort());await page.route('**/data/price-feed.json?*',r=>r.fulfill({json:{generatedAt:'test-empty-feed',status:'test',observations:[]}}));
 await page.clock.install({time:new Date('2026-10-03T12:00:00Z')});
 await page.goto('http://127.0.0.1:'+server.address().port+'/index.html?tab=shopping');
 let source=await fs.readFile('familyroy-control-centre/tests/promotion-validation.test.mjs','utf8');let fixture=vm.runInNewContext('('+source.slice(source.indexOf('function fixture()'),source.indexOf("test('Salticrax"))+')')();
 await page.evaluate(o=>{db.shopping=[{id:'test-salticrax',title:'Salticrax',productConceptId:'salticrax',diet:'default',quantity:'1'}];db.productConcepts=[{id:'salticrax',name:o.name,diet:'default',packagingRule:'irrelevant'}];db.retailerListings=[{id:'test-salticrax-listing',retailer:o.retailer,displayName:o.name,canonicalName:o.name,netQuantity:.2,unit:'kg',diet:'unknown'}];o.listingId='test-salticrax-listing';o.id='test-salticrax-price';db.branches.forEach(b=>{b.dayContext='';b.dayContextDate=''});ingestPriceObservations([o]);renderShopping()},fixture);
 assert.equal(await page.evaluate(()=>offerIsUsableNow(db.priceObservations.find(o=>o.id==='test-salticrax-price'))),false);
 assert.match(await page.locator('#shoppingComparisons').innerText(),/Unverified for this store/);
 await page.locator('#branchRegistry .branchBox').filter({hasText:'N1 City'}).getByRole('button',{name:'Already going',exact:true}).click();
 assert.equal(await page.evaluate(()=>offerIsUsableNow(db.priceObservations.find(o=>o.id==='test-salticrax-price'))),true);
 assert.doesNotMatch(await page.locator('#shoppingComparisons').innerText(),/Unverified for this store/);
 await page.reload();assert.equal(await page.evaluate(()=>offerIsUsableNow(db.priceObservations.find(o=>o.id==='test-salticrax-price'))),true);
 await page.evaluate(()=>{let o=db.priceObservations.find(o=>o.id==='test-salticrax-price');o.netQuantity=.4;save();renderShopping()});
 assert.match(await page.locator('#shoppingComparisons').innerText(),/Unverified for this store/);
 assert.equal(await page.evaluate(()=>basketChoice(db.shopping[0],'Food Lover’s Market')),null);
 await page.reload();assert.match(await page.locator('#shoppingComparisons').innerText(),/Unverified for this store/);
 assert.deepEqual(errors,[]);
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve))}
});
