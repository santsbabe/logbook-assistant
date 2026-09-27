window.FamilyRoyPnP=(function(){
function text(v){return String(v||'').trim()}
function num(v){if(v===null||v===undefined||v==='')return null;let raw=String(v).replace(',','.').replace(/[^0-9.]/g,''),n=Number(raw);return raw&&Number.isFinite(n)?n:null}
function pack(name){let s=text(name),multi=s.match(/(\d+)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*(kg|g|l|ml)\b/i),m=multi||s.match(/(\d+(?:[.,]\d+)?)\s*(kg|g|l|ml)\b/i);if(!m)return{};let count=multi?Number(m[1]):1,q=Number(m[multi?2:1].replace(',','.')),u=m[multi?3:2].toLowerCase();if(u==='g'){q=q/1000;u='kg'}if(u==='ml'){q=q/1000;u='l'}return{netQuantity:q*count,unit:u,packCount:count}}
function packaging(name,description){let s=(text(name)+' '+text(description)).toLowerCase();if(/\bbox\b|boxed/.test(s))return'box';if(/\bbag\b|bagged/.test(s))return'bag';if(/punnet/.test(s))return'punnet';if(/tray/.test(s))return'tray';if(/bunch/.test(s))return'bunch';if(/loose/.test(s))return'loose';return'unknown'}
function diet(raw){let s=[raw.name,raw.description,raw.ingredients,(raw.lifestyle||[]).join(' ')].join(' ').toLowerCase();if(/\bvegan\b/.test(s))return'vegan';if(/\bvegetarian\b/.test(s))return'vegetarian';return'unknown'}
function adapt(raw){
 if(!raw||!raw.name)return null;
 let p=pack(raw.name),sku=text(raw.sku),barcode=text(raw.barcode);
 let listingId='pnp:'+ (sku||barcode||text(raw.url)||text(raw.name).toLowerCase().replace(/[^a-z0-9]+/g,'-'));
 let listing={id:listingId,retailer:'Pick n Pay',retailerSku:sku,gtin:/^\d{8,14}$/.test(barcode)?barcode:'',displayName:text(raw.name),canonicalName:text(raw.canonicalName||raw.name),packaging:packaging(raw.name,raw.description),netQuantity:p.netQuantity||null,unit:p.unit||'',diet:diet(raw),attributes:{brand:text(raw.brand),stock:text(raw.stock),packCount:p.packCount||1,promotionType:text(raw.promotionType),promotionValidFrom:text(raw.validFrom),promotionValidTo:text(raw.validTo)},sourceUrl:text(raw.url)};
 let price=num(raw.price),loyalty=num(raw.smartShopperPrice);
 let observation=(price!==null||loyalty!==null)?{listingId,price:price??loyalty,loyaltyPrice:loyalty,checkedAt:raw.checkedAt||new Date().toISOString(),source:'Pick n Pay public product page',url:text(raw.url)}:null;
 return{listing,observation};
}
function adaptMany(rows){let listings=[],observations=[];(rows||[]).forEach(r=>{let x=adapt(r);if(!x)return;listings.push(x.listing);if(x.observation)observations.push(x.observation)});return{listings,observations}}
return{adapt,adaptMany};
})();