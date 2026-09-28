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
async function fetchProduct(q){
 if(!q.url||!/^https:\/\/www\.pnp\.co\.za\//i.test(q.url))return{ok:false,error:'No verified pnp.co.za product URL'};
 const r=await fetch(q.url,{headers:{'user-agent':'FamilyRoy-Control-Centre/1.0 (+personal price monitor; low frequency)','accept':'text/html'}});
 if(!r.ok)return{ok:false,error:'HTTP '+r.status};
 const row=parseProductPage(await r.text(),q.url,q.conceptId);
 return row?{ok:true,row}:{ok:false,error:'Could not safely parse product page'};
}

let observations=[],errors=[];
for(const q of queries.filter(x=>x.retailer==='Pick n Pay')){
 try{let r=await fetchProduct(q);if(r.ok)observations.push(r.row);else errors.push({conceptId:q.conceptId,url:q.url,error:r.error})}
 catch(e){errors.push({conceptId:q.conceptId,url:q.url,error:String(e?.message||e)})}
}
const feed={version:1,generatedAt:now,status:queries.length?'refreshed':'awaiting-verified-product-urls',retailers:{picknpay:{status:observations.length?'refreshed':queries.length?'refresh-failed-or-no-safe-data':'awaiting-verified-product-urls',checkedAt:now,observations:observations.length,errors}},observations};
await fs.mkdir(new URL('../data/',import.meta.url),{recursive:true});
await fs.writeFile(feedPath,JSON.stringify(feed,null,2)+'\n');
console.log(`FamilyRoy PnP refresh: ${observations.length} observations, ${errors.length} errors. No inferred prices emitted.`);
