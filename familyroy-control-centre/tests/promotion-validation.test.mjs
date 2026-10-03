import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import '../promotion-validation.js';
const V=globalThis.FamilyRoyPromotionValidation;
const now=Date.parse('2026-10-03T12:00:00Z');
const context={branch:'N1 City',date:'2026-10-03',now};
function fixture(){return {retailer:'Food Lover’s Market',conceptId:'salticrax',name:'Bakers Salticrax crackers assorted 200g',netQuantity:.2,unit:'kg',price:26.99,memberOnly:false,promotion:'',validFrom:'2026-09-21',validTo:'2026-10-04',checkedAt:'2026-10-03T11:00:00Z',confidence:'verified-first-party',promotionEvidence:{kind:'shelf-photo',artifactId:'salticrax-store-photo',page:'image 1',reviewedAt:'2026-10-03T11:00:00Z',observedBranch:'N1 City',offerText:'BAKERS SALTICRAX CRACKERS ASSORTED 200G R26.99 each',scopeText:'N1 City supplied by shopper trip context',datesText:'VALID MON 21 SEP – SUN 4 OCT 2026',termsText:'R26.99 each',validFrom:'2026-09-21',validTo:'2026-10-04',price:26.99,currency:'ZAR',memberOnly:false,scope:{includedBranches:['N1 City'],excludedBranches:[],exclusionsKnown:true},product:{brand:'Bakers',variant:'assorted',name:'Bakers Salticrax crackers assorted 200g',netQuantity:.2,unit:'kg'},terms:{kind:'each',quantity:1,label:''}}}}
test('Salticrax photo is each 200g at R26.99 on the trip date',()=>assert.equal(V.validate(fixture(),context).ok,true));
const negatives={
 'wrong 400g pack':o=>o.netQuantity=.4,
 'wrong price':o=>o.price=14,
 'invented multibuy':o=>o.promotion='ANY 2 FOR R28',
 'expired year':o=>{o.validFrom='2025-09-21';o.validTo='2025-10-04'},
 'future offer':o=>o.validFrom='2026-10-04',
 'missing dates':o=>delete o.validTo,
 'invalid date':o=>o.validFrom='2026-09-31',
 'missing pack':o=>delete o.netQuantity,
 'generic first party label without evidence':o=>delete o.promotionEvidence,
 'unknown exclusions':o=>o.promotionEvidence.scope.exclusionsKnown=false,
 'excluded branch':o=>o.promotionEvidence.scope.excludedBranches=['N1 City'],
 'wrong branch':o=>o.promotionEvidence.scope.includedBranches=['Bothasig'],
 'other branch photo':o=>o.promotionEvidence.observedBranch='Bothasig',
 'conflict':o=>o.promotionEvidence.conflict=true,
 'no printed year':o=>o.promotionEvidence.datesText='21 Sep to 4 Oct',
 'old inspected source freshly timestamped':o=>o.promotionEvidence.reviewedAt='2025-10-03T11:00:00Z',
 'stale evidence':o=>o.checkedAt='2026-10-01T00:00:00Z',
 'future check':o=>o.checkedAt='2026-10-05T00:00:00Z',
 'loyalty mismatch':o=>o.memberOnly=true,
 'unrelated search catalogue':o=>{o.promotionEvidence.kind='catalogue';o.promotionEvidence.sourceUrl='https://za-specials.com/offer.pdf'}
};
for(const [name,change] of Object.entries(negatives))test(name,()=>{let o=fixture();change(o);assert.equal(V.validate(o,context).ok,false)});
test('no chosen branch fails closed',()=>assert.equal(V.validate(fixture(),{...context,branch:''}).ok,false));
test('expiry is inclusive in South African time',()=>{assert.equal(V.validate(fixture(),{...context,date:'2026-10-04'}).ok,true);assert.equal(V.validate(fixture(),{...context,date:'2026-10-05'}).ok,false);assert.equal(V.shoppingDate(new Date('2026-10-04T22:05:00Z')),'2026-10-05')});
test('cache separates pack, branch, year and evidence',()=>{let o=fixture();for(const change of [x=>x.netQuantity=.4,x=>x.promotionEvidence.scope.includedBranches=['Bothasig'],x=>x.validTo='2025-10-04',x=>x.promotionEvidence.artifactId='other']){let other=structuredClone(o);change(other);assert.notEqual(V.observationKey(o),V.observationKey(other));assert.notEqual(V.listingKey(o),V.listingKey(other))}});
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
function browser(){let sandbox={FamilyRoyPromotionValidation:V,Date:class extends Date{constructor(...args){super(...(args.length?args:['2026-10-03T12:00:00Z']))}static now(){return now}},window:{},document:{getElementById(){return null}},db:{branches:[{retailer:'Food Lover’s Market',name:'N1 City',dayContext:'planned',dayContextDate:'2026-10-03'}],retailerListings:[],priceObservations:[]},save(){},renderShoppingComparisons(){},renderBasketComparison(){},console};vm.createContext(sandbox);vm.runInContext(html.slice(html.indexOf('function localDateKey'),html.indexOf('function seedShoppingConcepts')),sandbox);return sandbox}
test('consumer rejects unsafe offers from price and multibuy paths',()=>{let b=browser(),o=fixture();o.promotionEvidence.scope.excludedBranches=['N1 City'];b.o=o;vm.runInContext("if(offerIsUsableNow(o))throw Error('unsafe offer');if(valueOpportunity(o,{quantity:'1'}))throw Error('unsafe opportunity')",b);assert.match(html,/filter\(o=>o.retailer===retailer&&offerIsUsableNow\(o\)\)\.forEach\(o=>\{let p=o.promotion,g=/)});
test('ingestion preserves proof, dates, promotion and confidence through persistence',()=>{let b=browser(),o=fixture();o.listingId='salticrax-n1';o.id='observation';b.db.retailerListings=[{id:o.listingId,retailer:o.retailer,displayName:o.name,canonicalName:'Salticrax',netQuantity:.2,unit:'kg'}];b.o=o;vm.runInContext(html.slice(html.indexOf('function ingestPriceObservations'),html.indexOf('function renderShopping(){')),b);vm.runInContext('ingestPriceObservations([o])',b);let saved=b.db.priceObservations[0];assert.equal(saved.validTo,o.validTo);assert.equal(saved.confidence,o.confidence);assert.deepEqual(saved.promotionEvidence,o.promotionEvidence);assert.equal(V.validate(saved,context).ok,true)});
test('multiple planned branches cannot borrow a regional price',()=>{let b=browser();b.db.branches.push({...b.db.branches[0],name:'Bothasig'});b.o=fixture();assert.equal(vm.runInContext('offerIsUsableNow(o)',b),false)});
test('unsafe generic FLM parser does not emit a price',()=>{let worker=fs.readFileSync(new URL('../scripts/refresh-prices.mjs',import.meta.url),'utf8'),sandbox={};vm.createContext(sandbox);vm.runInContext(worker.slice(worker.indexOf('function parseFLM'),worker.indexOf('function parseCheckersSpecial')),sandbox);assert.equal(sandbox.parseFLM('<h1>Salticrax</h1><p>Provita R74.99</p>','https://foodloversmarket.co.za/specials/','salticrax'),null)});
test('verified official catalogue may apply to an explicitly included branch',()=>{let o=fixture();o.promotionEvidence.kind='catalogue';o.promotionEvidence.sourceUrl='https://cdn.foodloversmarket.co.za/current-wc.pdf';assert.equal(V.validate(o,context).ok,true)});
test('multibuy needs the exact quantity and participating product',()=>{let o=fixture();o.promotion='ANY 2 FOR R50';o.promotionEvidence.terms={kind:'multibuy',quantity:2,label:o.promotion,participatingProducts:[o.name]};assert.equal(V.validate(o,context).ok,true);o.promotionEvidence.terms.quantity=3;assert.equal(V.validate(o,context).ok,false);o.promotionEvidence.terms.quantity=2;o.promotionEvidence.terms.participatingProducts=['Provita'];assert.equal(V.validate(o,context).ok,false)});
test('shelf correction overrides only matching product pack at chosen branch',()=>{let shelf=fixture(),cat=structuredClone(shelf);cat.price=25;cat.promotionEvidence.kind='catalogue';cat.promotionEvidence.sourceUrl='https://cdn.foodloversmarket.co.za/wc.pdf';cat.promotionEvidence.price=25;cat.promotionEvidence.artifactId='catalogue';let other=structuredClone(cat);other.name='Provita 500g';other.netQuantity=.5;assert.deepEqual(V.preferShelfEvidence([cat,shelf,other],context),[shelf,other]);assert.equal(V.preferShelfEvidence([cat,shelf],{...context,branch:'Bothasig'}).length,2)});
test('non FLM prices preserve existing consumer eligibility rules',()=>assert.equal(V.validate({retailer:'Woolworths'},{}).ok,true));
