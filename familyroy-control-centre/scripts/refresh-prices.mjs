import fs from 'node:fs/promises';
const feedPath=new URL('../data/price-feed.json',import.meta.url);
let existing={version:1,generatedAt:null,status:'not-configured',retailers:{},observations:[]};
try{existing=JSON.parse(await fs.readFile(feedPath,'utf8'))}catch{}
const generatedAt=new Date().toISOString();
const feed={...existing,version:1,generatedAt,status:'ready-for-retailer-fetch',retailers:{...(existing.retailers||{}),picknpay:{status:'adapter-ready-fetch-not-configured',checkedAt:generatedAt}},observations:Array.isArray(existing.observations)?existing.observations:[]};
await fs.mkdir(new URL('../data/',import.meta.url),{recursive:true});
await fs.writeFile(feedPath,JSON.stringify(feed,null,2)+'\n');
console.log('FamilyRoy feed refreshed safely: no retailer data fabricated.');
