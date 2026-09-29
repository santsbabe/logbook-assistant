import fs from 'node:fs/promises';

const feedPath=new URL('../data/price-feed.json',import.meta.url);
const queriesPath=new URL('../data/price-queries.json',import.meta.url);
let existing={version:1,generatedAt:null,status:'not-configured',retailers:{},observations:[]};
try{existing=JSON.parse(await fs.readFile(feedPath,'utf8'))}catch{}
let queries=[];
try{queries=JSON.parse(await fs.readFile(queriesPath,'utf8'))}catch{}

const now=new Date().toISOString();
const runId='price-refresh:'+now;
const parserVersion=4;
const PARSE_KEY=process.env.PARSE_API_KEY||''; // Optional experimental transport; absence never blocks first-party refresh.
const PNP_PARSE='https://api.parse.bot/scraper/b87810bc-903f-41b8-b38d-c5c911cab324';
const CHECKERS_PARSE='https://api.parse.bot/scraper/a7a3a4ba-dfb7-4476-9712-8753b2fb3140';
async function parseApi(base,endpoint,params={}){
 if(!PARSE_KEY)return{ok:false,error:'PARSE_API_KEY not configured'};
 let u=new URL(base+'/'+endpoint);for(const[k,v]of Object.entries(params))if(v!==undefined&&v!==null&&v!=='')u.searchParams.set(k,String(v));
 try{let r=await fetch(u,{headers:{'X-API-Key':PARSE_KEY,'Accept':'application/json'}});if(!r.ok)return{ok:false,error:'Parse API '+r.status};return{ok:true,data:await r.json()}}catch(e){return{ok:false,error:String(e?.message||e)}}
}
const clean=s=>String(s||'').replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/\s+/g,' ').trim();
const money=s=>{let m=String(s||'').match(/R\s*([0-9]+(?:[.,][0-9]{1,2})?)/i);return m?Number(m[1].replace(',','.')):null};
function isoDateText(v){
 let s=clean(v),m=s.match(/(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/);if(m)return m[3]+'-'+m[2].padStart(2,'0')+'-'+m[1].padStart(2,'0');
 let d=new Date(s);return Number.isFinite(d.getTime())?d.toISOString().slice(0,10):''
}
function packFromName(name){
 let s=clean(name),m=s.match(/(\d+(?:[.,]\d+)?)\s*(kg|g|l|ml)\b/i);if(!m)return{};
 let q=Number(m[1].replace(',','.')),u=m[2].toLowerCase();if(u==='g'){q/=1000;u='kg'}if(u==='ml'){q/=1000;u='l'}
 return{netQuantity:q,unit:u}
}
function parseProductPage(html,url,conceptId){
 const ld=jsonLd(html).find(x=>x?.['@type']==='Product')||{},offer=Array.isArray(ld.offers)?ld.offers[0]:ld.offers||{};
 const title=clean(ld.name||(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)||[])[1]||(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)||[])[1]).replace(/\s*\|\s*PnP.*$/i,'');
 const sku=clean(ld.sku||(html.match(/SKU[\s\S]{0,250}?([0-9]{12,18}_[A-Z]{2})/i)||[])[1]||(url.match(/\/p\/([^/?#]+)/)||[])[1]);
 const barcode=clean(ld.gtin13||ld.gtin||(html.match(/Barcode[\s\S]{0,200}?(\d{8,14})/i)||[])[1]);
 const promo=clean((html.match(/(Buy\s+\d+\s*,?\s*Pay\s+(?:For\s+)?\d+|(?:ANY\s+)?\d+\s+For\s+R\s*[0-9.,]+|Buy\s+\d+\s+Save\s+(?:R\s*)?[0-9.,]+%?)/i)||[])[1]);
 const valid=html.match(/Valid from\s+([^<]+?)\s+until\s+([^<]+)/i);
 let price=Number(offer.price),prices=[...html.matchAll(/R\s*([0-9]+(?:[.,][0-9]{2}))/gi)].map(m=>Number(m[1].replace(',','.')));
 if(!Number.isFinite(price))price=prices[prices.length-1];
 let smart=prices.length>1?prices[0]:null;
 if(!title||!sku||!Number.isFinite(price))return null;
 return{runId,parserVersion,confidence:'verified-first-party',conceptId,retailer:'Pick n Pay',name:title,sku,barcode,url,price,smartShopperPrice:smart,promotion:promo,...packFromName(title),validFrom:valid?isoDateText(valid[1]):'',validTo:valid?isoDateText(valid[2]):'',checkedAt:now};
}
function productLinks(html){
 let out=[],seen=new Set();
 for(const m of html.matchAll(/href=["']([^"']+\/p\/[0-9A-Za-z_-]+)[^"']*["']/gi)){let u=new URL(m[1],'https://www.pnp.co.za').href;if(!seen.has(u)){seen.add(u);out.push(u)}}
 return out
}
async function flmSpecialDocuments(){
 try{
  let r=await fetch('https://foodloversmarket.co.za/specials/',{headers:{'User-Agent':'FamilyRoyPriceMonitor/1.0'}});
  if(!r.ok)return[];
  let html=await r.text(),out=[];
  for(const m of html.matchAll(/https?:[^"' ]+\.pdf/gi)){let u=m[0].replaceAll('\\/','/');if(!out.includes(u))out.push(u)}
  return out.filter(u=>/wc|western/i.test(u))
 }catch{return[]}
}
async function checkersSearch(query){
 let r=await parseApi(CHECKERS_PARSE,'search_products',{query,page:0,limit:20});if(!r.ok)return r;
 return{ok:true,products:r.data?.products||r.data?.data?.products||[]}
}
function checkersApiRow(p,q){
 let cents=Number(p.priceWithoutDecimal),price=Number.isFinite(cents)?cents/100:Number(p.price);if(!Number.isFinite(price)||price<=0)return null;
 let name=clean(p.name),pack=packFromName(name);
 return{runId,parserVersion,confidence:'third-party-retailer-transport',transport:'parse.bot',conceptId:q.conceptId,retailer:'Checkers',name,sku:String(p.articleNumber||p.id||''),barcode:'',price,loyaltyPrice:null,currency:'ZAR',checkedAt:now,source:'checkers.co.za via Parse',url:'',region:'General Checkers catalogue',purpose:q.purpose||'shopping',promotionText:p.isOnPromotion?'Promotion flagged by retailer transport':'',...pack}
}
async function pnpStoreId(query){
 let r=await parseApi(PNP_PARSE,'get_stores',{query});if(!r.ok)return r;
 let stores=r.data?.stores||r.data?.data?.stores||[],best=stores[0];
 return best?{ok:true,storeId:best.storeId||best.store_id,name:best.storeName||best.name,address:best.storeAddress||best.address}:{ok:false,error:'PnP store not found: '+query}
}
function pnpApiRow(p,q,store){
 let price=Number(p?.price?.value??p?.price??p?.priceValue);if(!Number.isFinite(price)||price<=0)return null;
 let name=clean(p.name||p.productName),pack=packFromName(name),code=p.code||p.productCode||'';
 return{runId,parserVersion,confidence:'third-party-retailer-transport',transport:'parse.bot',conceptId:q.conceptId,retailer:'Pick n Pay',name,sku:String(code),barcode:'',price,loyaltyPrice:null,currency:'ZAR',checkedAt:now,source:'pnp.co.za via Parse',url:code?'https://www.pnp.co.za/p/'+code:'',region:'Store-specific',storeId:store.storeId,storeName:store.name,storeAddress:store.address,purpose:q.purpose||'shopping',...pack}
}
async function pnpStoreSearch(storeId,query){
 let r=await parseApi(PNP_PARSE,'search_store_products',{store_id:storeId,query,page:0,page_size:20});if(!r.ok)return r;
 return{ok:true,products:r.data?.products||r.data?.data?.products||[]}
}
async function discoverPnP(q){
 let term=encodeURIComponent(q.query||q.name||'');
 if(!term)return{urls:[],error:'Empty discovery query'};
 let urls=[
  'https://www.pnp.co.za/c/pnpbase?query='+term,
  'https://www.pnp.co.za/search/?text='+term,
  'https://www.pnp.co.za/search?text='+term
 ];
 for(const u of urls){
  try{let r=await fetch(u,{headers:{'user-agent':'FamilyRoy-Control-Centre/1.0 (+personal price monitor; low frequency)','accept':'text/html'}});
   if(!r.ok)continue;let links=productLinks(await r.text());if(links.length)return{urls:links.slice(0,12),source:u}
  }catch{}
 }
 return{urls:[],error:'No verified PnP product links discovered'}
}
async function fetchProduct(q){
 if(q.requireStoreSpecificPrice)return{ok:false,error:'Store-specific PnP evidence required; generic page price excluded'};
 if(!q.url||!/^https:\/\/www\.pnp\.co\.za\//i.test(q.url))return{ok:false,error:'No verified pnp.co.za product URL'};
 const r=await fetch(q.url,{headers:{'user-agent':'FamilyRoy-Control-Centre/1.0 (+personal price monitor; low frequency)','accept':'text/html'}});
 if(!r.ok)return{ok:false,error:'HTTP '+r.status};
 const row=parseProductPage(await r.text(),q.url,q.conceptId);
 return row?{ok:true,row}:{ok:false,error:'Could not safely parse product page'};
}


const HOSTS={
 'Pick n Pay':'www.pnp.co.za',
 'Woolworths':'www.woolworths.co.za',
 'Food Lover’s Market':'foodloversmarket.co.za',
 'Checkers':'specials.checkers.co.za'
};
async function fetchHtml(url,retailer){
 let host=HOSTS[retailer];if(!host||!url||new URL(url).hostname!==host)return{ok:false,error:'URL is not an approved first-party '+retailer+' host'};
 let r=await fetch(url,{headers:{'user-agent':'FamilyRoy-Control-Centre/1.0 (+personal price monitor; low frequency)','accept':'text/html'}});
 return r.ok?{ok:true,html:await r.text()}:{ok:false,error:'HTTP '+r.status}
}
function jsonLd(html){
 let rows=[];for(const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){try{let j=JSON.parse(m[1]);rows.push(...(Array.isArray(j)?j:[j]))}catch{}}
 return rows.flatMap(x=>x?.['@graph']||[x])
}
function parseWoolworths(html,url,conceptId){
 let ld=jsonLd(html).find(x=>x?.['@type']==='Product')||{},title=clean(ld.name||(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)||[])[1]||(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)||[])[1]);
 let code=clean((html.match(/Product code:\s*<[^>]*>?\s*([0-9]{5,14})/i)||[])[1]||(url.match(/A-(\d+)/)||[])[1]),offer=Array.isArray(ld.offers)?ld.offers[0]:ld.offers||{},price=Number(offer.price);
 if(!Number.isFinite(price)){let vals=[...html.matchAll(/R\s*([0-9]+(?:[.,][0-9]{2}))/gi)].map(m=>Number(m[1].replace(',','.')));price=vals[0]}
 if(!title||!code||!Number.isFinite(price))return null;
 return{runId,parserVersion,confidence:'verified-first-party',conceptId,retailer:'Woolworths',name:title,sku:code,barcode:'',url,price,...packFromName(title),checkedAt:now,source:'Woolworths first-party product page'}
}
function parseFLM(html,url,conceptId){
 let ld=jsonLd(html).find(x=>x?.['@type']==='Product')||{},title=clean(ld.name||(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)||[])[1]),offer=Array.isArray(ld.offers)?ld.offers[0]:ld.offers||{},price=Number(offer.price);
 if(!Number.isFinite(price)){let vals=[...html.matchAll(/R\s*([0-9]+(?:[.,][0-9]{2}))/gi)].map(m=>Number(m[1].replace(',','.')));price=vals[0]}
 if(!title||!Number.isFinite(price))return null;
 return{runId,parserVersion,confidence:'verified-first-party',conceptId,retailer:'Food Lover’s Market',name:title,sku:clean(ld.sku||''),barcode:clean(ld.gtin13||ld.gtin||''),url,price,...packFromName(title),promotion:clean((html.match(/(?:special|deal)[\s\S]{0,160}?(R\s*[0-9.,]+)/i)||[])[0]),checkedAt:now,source:'Food Lover’s Market first-party specials page'}
}
function parseCheckersSpecial(html,url,conceptId){
 let page=clean(html),valid=(page.match(/OFFERS VALID FROM\s+(.{0,60}?)\s+UNTIL\s+(.{0,60}?)(?:\.|PRICES APPLY)/i)||[]),region=(page.match(/PRICES APPLY TO\s+(.{0,300}?)(?:\.|SELECTED ITEMS|WHILE STOCKS)/i)||[])[1]||'';
 let q=queries.find(x=>x.url===url&&x.conceptId===conceptId)||{},needle=clean(q.query||q.name||''),candidates=[needle,...(q.queryTerms||[])].map(clean).filter(Boolean);
 if(!candidates.length)return null;
 let low=page.toLowerCase(),matched=candidates.find(t=>low.includes(t.toLowerCase()))||'',idx=matched?low.indexOf(matched.toLowerCase()):-1;if(idx<0)return null;
 let snippet=page.slice(Math.max(0,idx-180),idx+360),prices=[...snippet.matchAll(/R\s*([0-9]{1,4}(?:[.,][0-9]{2}))/gi)].map(m=>Number(m[1].replace(',','.'))).filter(n=>n>0);
 let price=prices[0];if(!Number.isFinite(price))return null;
 let promo=clean((snippet.match(/(BUY\s+ANY\s+\d+\s+&?\s*SAVE\s+\d+%|ANY\s+\d+\s+FOR\s+R?\s*[0-9.,]+|BUY\s+\d+\s+FOR\s+R?\s*[0-9.,]+|SAVE\s+R?\s*[0-9.,]+|WITH CARD)/i)||[])[1]);
 return{runId,parserVersion,confidence:'catalogue-text-match',conceptId,retailer:'Checkers',name:q.name||matched||q.query,sku:'',barcode:'',url,price,promotion:promo,memberOnly:/WITH CARD/i.test(snippet),validFrom:isoDateText(valid[1]||''),validTo:isoDateText(valid[2]||''),region:clean(region),checkedAt:now,source:'Checkers official Western Cape specials'}
}
const checkersBookCache=new Map();
async function fetchCheckersBook(url){
 if(checkersBookCache.has(url))return checkersBookCache.get(url);
 let base=url.replace(/index\.html$/,'').replace(/\/$/,'');let parts=[];for(let p=1;p<=25;p++){try{let u=base+'/'+p+'/',r=await fetchHtml(u,'Checkers');if(r.ok)parts.push(r.html)}catch{}}
 let html=parts.join('\n');checkersBookCache.set(url,html);return html
}
async function fetchFirstParty(q){
 let got=await fetchHtml(q.url,q.retailer);if(!got.ok)return got;
 let html=got.html;if(q.retailer==='Checkers'){let book=await fetchCheckersBook(q.url);if(book)html+='\n'+book}
 let row=q.retailer==='Woolworths'?parseWoolworths(html,q.url,q.conceptId):q.retailer==='Food Lover’s Market'?parseFLM(html,q.url,q.conceptId):q.retailer==='Checkers'?parseCheckersSpecial(html,q.url,q.conceptId):null;
 return row?{ok:true,row}:{ok:false,error:'Could not safely parse '+q.retailer+' first-party page'}
}
let observations=[],errors=[];
let pnpStores={};
if(PARSE_KEY){
 for(const label of ['Howard Centre, Pinelands','Rosmead, Claremont']){let r=await pnpStoreId(label);if(r.ok)pnpStores[label]=r}
}
for(const q of queries.filter(x=>x.retailer==='Pick n Pay')){
 if(PARSE_KEY&&q.query&&q.storePreference){
  let label=q.category==='liquor'?q.storePreference.liquorFallback:q.storePreference.default,store=pnpStores[label];
  if(store){let sr=await pnpStoreSearch(store.storeId,q.query);if(sr.ok){let rows=sr.products.map(p=>pnpApiRow(p,q,store)).filter(Boolean);observations.push(...rows.slice(0,5));if(rows.length)continue}}
 }
 try{
  let targets=q.url?[q.url]:[];
  if(!targets.length&&q.query){let d=await discoverPnP(q);targets=d.urls;if(!targets.length)errors.push({conceptId:q.conceptId,query:q.query,purpose:q.purpose||'shopping',nonBlocking:/acceptance/.test(q.purpose||''),error:d.error})}
  for(const url of targets){let r=await fetchProduct({...q,url});if(r.ok){r.row.purpose=q.purpose||'shopping';observations.push(r.row)}else errors.push({conceptId:q.conceptId,url,purpose:q.purpose||'shopping',nonBlocking:/acceptance/.test(q.purpose||''),error:r.error})}
 }catch(e){errors.push({conceptId:q.conceptId,url:q.url,query:q.query,purpose:q.purpose||'shopping',nonBlocking:/acceptance/.test(q.purpose||''),error:String(e?.message||e)})}
}
let retailerState={picknpay:{checkedAt:now,observations:observations.length,errors:[...errors]}};
for(const retailer of ['Woolworths','Food Lover’s Market','Checkers']){
 let ro=[],re=[];
 if(retailer==='Food Lover’s Market'){let docs=await flmSpecialDocuments();if(docs.length)re.push({conceptId:'flm-specials-discovery',purpose:'source-discovery',nonBlocking:true,error:'Official specials documents discovered: '+docs.length+'; parser not yet promoted to price feed'})}
 for(const q of queries.filter(x=>x.retailer===retailer)){
  if(retailer==='Checkers'&&PARSE_KEY&&q.query){let sr=await checkersSearch(q.query);if(sr.ok){let rows=sr.products.map(p=>checkersApiRow(p,q)).filter(Boolean);if(rows.length){for(const row of rows.slice(0,5)){observations.push(row);ro.push(row)}continue}}}
  if(!q.url){re.push({conceptId:q.conceptId,purpose:q.purpose||'shopping',nonBlocking:/acceptance/.test(q.purpose||''),error:'Discovery not yet verified for '+retailer});continue}
  try{let r=await fetchFirstParty(q);if(r.ok){r.row.purpose=q.purpose||'shopping';observations.push(r.row);ro.push(r.row)}else re.push({conceptId:q.conceptId,url:q.url,purpose:q.purpose||'shopping',nonBlocking:/acceptance/.test(q.purpose||''),error:r.error})}catch(e){re.push({conceptId:q.conceptId,url:q.url,purpose:q.purpose||'shopping',nonBlocking:/acceptance/.test(q.purpose||''),error:String(e?.message||e)})}
 }
 retailerState[retailer==='Woolworths'?'woolworths':retailer==='Checkers'?'checkers':'foodloversmarket']={status:ro.length?(re.some(e=>!e.nonBlocking)?'refreshed-partial':'refreshed'):queries.some(x=>x.retailer===retailer)?'refresh-failed-or-no-safe-data':'awaiting-verified-product-urls',checkedAt:now,observations:ro.length,errors:re};
 errors.push(...re)
}
retailerState.picknpay.status=retailerState.picknpay.observations?(retailerState.picknpay.errors.some(e=>!e.nonBlocking)?'refreshed-partial':'refreshed'):queries.some(x=>x.retailer==='Pick n Pay')?'refresh-failed-or-no-safe-data':'awaiting-verified-product-urls';
const validObservation=o=>o&&o.retailer&&o.conceptId&&Number.isFinite(Number(o.price))&&Number(o.price)>0&&o.checkedAt&&o.source;
observations=observations.filter(validObservation);
const obsKey=o=>[o.retailer||'',o.conceptId||'',o.url||'',o.sku||'',o.barcode||'',String(o.checkedAt||'').slice(0,10)].join('|');
let merged=new Map();
for(const old of (existing.observations||[])){let legacy={confidence:'verified-first-party',runId:existing.runId||'legacy-feed',parserVersion:existing.parserVersion||2,...old};merged.set(obsKey(legacy),legacy)}
for(const fresh of observations)merged.set(obsKey(fresh),fresh);
let cutoff=Date.now()-90*86400000;
observations=[...merged.values()].filter(o=>{let t=new Date(o.checkedAt||0).getTime();return Number.isFinite(t)&&t>=cutoff}).sort((a,b)=>String(b.checkedAt||'').localeCompare(String(a.checkedAt||'')));
const historySummary=Object.fromEntries(['Pick n Pay','Woolworths','Checkers','Food Lover’s Market'].map(r=>[r,{observations:observations.filter(o=>o.retailer===r).length,oldest:observations.filter(o=>o.retailer===r).map(o=>o.checkedAt).sort()[0]||null,newest:observations.filter(o=>o.retailer===r).map(o=>o.checkedAt).sort().at(-1)||null}]));
const runSummary={queries:queries.length,freshObservations:observations.filter(o=>o.runId===runId).length,blockingErrors:errors.filter(e=>!e.nonBlocking).length,acceptanceErrors:errors.filter(e=>e.nonBlocking).length};
const feed={version:3,runId,parserVersion,generatedAt:now,runSummary,historySummary,status:observations.length?(errors.some(e=>!e.nonBlocking)?'refreshed-partial':'refreshed'):queries.length?'refresh-failed-or-no-safe-data':'awaiting-verified-product-urls',retailers:retailerState,observations};
await fs.mkdir(new URL('../data/',import.meta.url),{recursive:true});
await fs.writeFile(feedPath,JSON.stringify(feed,null,2)+'\n');
console.log(`FamilyRoy retailer refresh: ${observations.length} observations, ${errors.length} errors. Provenance-labelled; no inferred prices emitted.`);
