import fs from 'node:fs/promises';

const feedPath=new URL('../data/price-feed.json',import.meta.url);
const queriesPath=new URL('../data/price-queries.json',import.meta.url);
let existing={version:1,generatedAt:null,status:'not-configured',retailers:{},observations:[]};
try{existing=JSON.parse(await fs.readFile(feedPath,'utf8'))}catch{}
let queries=[];
try{queries=JSON.parse(await fs.readFile(queriesPath,'utf8'))}catch{}

const now=new Date().toISOString();
const clean=s=>String(s||'').replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/\s+/g,' ').trim();
const money=s=>{let m=String(s||'').match(/R\s*([0-9]+(?:[.,][0-9]{1,2})?)/i);return m?Number(m[1].replace(',','.')):null};
function parseProductPage(html,url,conceptId){
 const title=clean((html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)||[])[1]||(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)||[])[1]).replace(/\s*\|\s*PnP.*$/i,'');
 const sku=clean((html.match(/SKU[\s\S]{0,250}?([0-9]{12,18}_[A-Z]{2})/i)||[])[1]);
 const barcode=clean((html.match(/Barcode[\s\S]{0,200}?(\d{8,14})/i)||[])[1]);
 const promo=(clean((html.match(/(Buy\s+\d+\s*,?\s*Pay\s+(?:For\s+)?\d+|(?:ANY\s+)?\d+\s+For\s+R\s*[0-9.,]+|Buy\s+\d+\s+Save\s+(?:R\s*)?[0-9.,]+%?)/i)||[])[1]));
 const valid=html.match(/Valid from\s+([^<]+?)\s+until\s+([^<]+)/i);
 const prices=[...html.matchAll(/R\s*([0-9]+(?:[.,][0-9]{2}))/gi)].map(m=>Number(m[1].replace(',','.')));
 if(!title||(!sku&&!barcode)||!prices.length)return null;
 let regular=prices[prices.length-1],smart=null;
 if(prices.length>1)smart=prices[0];
 return{conceptId,retailer:'Pick n Pay',name:title,sku,barcode,url,price:regular,smartShopperPrice:smart,promotion:promo,validFrom:valid?clean(valid[1]):'',validTo:valid?clean(valid[2]):'',checkedAt:now};
}
function productLinks(html){
 let out=[],seen=new Set();
 for(const m of html.matchAll(/href=["']([^"']+\/p\/[0-9A-Za-z_-]+)[^"']*["']/gi)){let u=new URL(m[1],'https://www.pnp.co.za').href;if(!seen.has(u)){seen.add(u);out.push(u)}}
 return out
}
async function discoverPnP(q){
 let term=encodeURIComponent(q.query||q.name||'');
 if(!term)return{urls:[],error:'Empty discovery query'};
 let urls=[
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
 return{conceptId,retailer:'Woolworths',name:title,sku:code,barcode:'',url,price,checkedAt:now,source:'Woolworths first-party product page'}
}
function parseFLM(html,url,conceptId){
 let ld=jsonLd(html).find(x=>x?.['@type']==='Product')||{},title=clean(ld.name||(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)||[])[1]),offer=Array.isArray(ld.offers)?ld.offers[0]:ld.offers||{},price=Number(offer.price);
 if(!Number.isFinite(price)){let vals=[...html.matchAll(/R\s*([0-9]+(?:[.,][0-9]{2}))/gi)].map(m=>Number(m[1].replace(',','.')));price=vals[0]}
 if(!title||!Number.isFinite(price))return null;
 return{conceptId,retailer:'Food Lover’s Market',name:title,sku:clean(ld.sku||''),barcode:clean(ld.gtin13||ld.gtin||''),url,price,promotion:clean((html.match(/(?:special|deal)[\s\S]{0,160}?(R\s*[0-9.,]+)/i)||[])[0]),checkedAt:now,source:'Food Lover’s Market first-party specials page'}
}
function parseCheckersSpecial(html,url,conceptId){
 let page=clean(html),valid=(page.match(/OFFERS VALID FROM\s+(.{0,60}?)\s+UNTIL\s+(.{0,60}?)(?:\.|PRICES APPLY)/i)||[]),region=(page.match(/PRICES APPLY TO\s+(.{0,300}?)(?:\.|SELECTED ITEMS|WHILE STOCKS)/i)||[])[1]||'';
 let q=queries.find(x=>x.url===url&&x.conceptId===conceptId)||{},needle=clean(q.query||q.name||'');
 if(!needle)return null;
 let terms=needle.toLowerCase().split(/\s+/).filter(x=>x.length>2),idx=page.toLowerCase().indexOf(needle.toLowerCase());
 if(idx<0&&terms.length)idx=page.toLowerCase().indexOf(terms[0]);if(idx<0)return null;
 let snippet=page.slice(Math.max(0,idx-180),idx+360),prices=[...snippet.matchAll(/(?:ANY\s+\d+\s+FOR\s+)?R?\s*([0-9]{1,4}(?:[.,][0-9]{2}))/gi)].map(m=>Number(m[1].replace(',','.'))).filter(n=>n>0);
 let price=prices[0];if(!Number.isFinite(price))return null;
 let promo=clean((snippet.match(/(BUY\s+ANY\s+\d+\s+&?\s*SAVE\s+\d+%|ANY\s+\d+\s+FOR\s+R?\s*[0-9.,]+|BUY\s+\d+\s+FOR\s+R?\s*[0-9.,]+|SAVE\s+R?\s*[0-9.,]+|WITH CARD)/i)||[])[1]);
 return{conceptId,retailer:'Checkers',name:q.name||q.query,sku:'',barcode:'',url,price,promotion:promo,memberOnly:/WITH CARD/i.test(snippet),validFrom:clean(valid[1]||''),validTo:clean(valid[2]||''),region:clean(region),checkedAt:now,source:'Checkers official Western Cape specials'}
}
async function fetchFirstParty(q){
 let got=await fetchHtml(q.url,q.retailer);if(!got.ok)return got;
 let row=q.retailer==='Woolworths'?parseWoolworths(got.html,q.url,q.conceptId):q.retailer==='Food Lover’s Market'?parseFLM(got.html,q.url,q.conceptId):q.retailer==='Checkers'?parseCheckersSpecial(got.html,q.url,q.conceptId):null;
 return row?{ok:true,row}:{ok:false,error:'Could not safely parse '+q.retailer+' first-party page'}
}
let observations=[],errors=[];
for(const q of queries.filter(x=>x.retailer==='Pick n Pay')){
 try{
  let targets=q.url?[q.url]:[];
  if(!targets.length&&q.query){let d=await discoverPnP(q);targets=d.urls;if(!targets.length)errors.push({conceptId:q.conceptId,query:q.query,error:d.error})}
  for(const url of targets){let r=await fetchProduct({...q,url});if(r.ok)observations.push(r.row);else errors.push({conceptId:q.conceptId,url,error:r.error})}
 }catch(e){errors.push({conceptId:q.conceptId,url:q.url,query:q.query,error:String(e?.message||e)})}
}
let retailerState={picknpay:{checkedAt:now,observations:observations.length,errors:[...errors]}};
for(const retailer of ['Woolworths','Food Lover’s Market','Checkers']){
 let ro=[],re=[];
 for(const q of queries.filter(x=>x.retailer===retailer)){
  if(!q.url){re.push({conceptId:q.conceptId,error:'Discovery not yet verified for '+retailer});continue}
  try{let r=await fetchFirstParty(q);if(r.ok){observations.push(r.row);ro.push(r.row)}else re.push({conceptId:q.conceptId,url:q.url,error:r.error})}catch(e){re.push({conceptId:q.conceptId,url:q.url,error:String(e?.message||e)})}
 }
 retailerState[retailer==='Woolworths'?'woolworths':retailer==='Checkers'?'checkers':'foodloversmarket']={status:ro.length?'refreshed':queries.some(x=>x.retailer===retailer)?'refresh-failed-or-no-safe-data':'awaiting-verified-product-urls',checkedAt:now,observations:ro.length,errors:re};
 errors.push(...re)
}
retailerState.picknpay.status=retailerState.picknpay.observations?'refreshed':queries.some(x=>x.retailer==='Pick n Pay')?'refresh-failed-or-no-safe-data':'awaiting-verified-product-urls';
const feed={version:2,generatedAt:now,status:queries.length?'refreshed':'awaiting-verified-product-urls',retailers:retailerState,observations};
await fs.mkdir(new URL('../data/',import.meta.url),{recursive:true});
await fs.writeFile(feedPath,JSON.stringify(feed,null,2)+'\n');
console.log(`FamilyRoy retailer refresh: ${observations.length} observations, ${errors.length} errors. First-party only; no inferred prices emitted.`);
