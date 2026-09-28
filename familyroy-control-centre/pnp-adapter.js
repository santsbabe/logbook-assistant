window.FamilyRoyPnP=(function(){
function text(v){return String(v||'').trim()}
function num(v){if(v===null||v===undefined||v==='')return null;let raw=String(v).replace(',','.').replace(/[^0-9.]/g,''),n=Number(raw);return raw&&Number.isFinite(n)?n:null}
function pack(name){let s=text(name),multi=s.match(/(\d+)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*(kg|g|l|ml)\b/i),m=multi||s.match(/(\d+(?:[.,]\d+)?)\s*(kg|g|l|ml)\b/i);if(!m)return{};let count=multi?Number(m[1]):1,q=Number(m[multi?2:1].replace(',','.')),u=m[multi?3:2].toLowerCase();if(u==='g'){q=q/1000;u='kg'}if(u==='ml'){q=q/1000;u='l'}return{netQuantity:q*count,unit:u,packCount:count}}
function packaging(name,description){let s=(text(name)+' '+text(description)).toLowerCase();if(/\bbox\b|boxed/.test(s))return'box';if(/\bbag\b|bagged/.test(s))return'bag';if(/punnet/.test(s))return'punnet';if(/tray/.test(s))return'tray';if(/bunch/.test(s))return'bunch';if(/loose/.test(s))return'loose';return'unknown'}
function promotion(raw){
 let label=text(raw.promotion||raw.promotionLabel||raw.promotionType),u=label.toUpperCase(),m;
 let out={kind:'none',label,eligibleQuantity:1,memberOnly:!!raw.smartShopperOnly,discountPercent:null,discountAmount:null,bundlePrice:null,promotionGroupId:text(raw.promotionGroupId),participatingSkus:Array.isArray(raw.participatingSkus)?raw.participatingSkus.map(text).filter(Boolean):[],mixAndMatch:false};
 if((m=u.match(/(ANY\s+)?(\d+)\s+FOR\s+R?\s*([0-9]+(?:[.,][0-9]+)?)/))){out.kind='bundle-price';out.mixAndMatch=!!m[1];out.eligibleQuantity=Number(m[2]);out.bundlePrice=Number(m[3].replace(',','.'))}
 else if((m=u.match(/BUY\s+(\d+)\s*,?\s*PAY\s+(?:FOR\s+)?(\d+)/))){out.kind='buy-n-pay-m';out.eligibleQuantity=Number(m[1]);out.payQuantity=Number(m[2]);out.mixAndMatch=/ANY|ASSORTED/.test(u)}
 else if((m=u.match(/BUY\s+(\d+)\s*,?\s*SAVE\s+([0-9]+(?:[.,][0-9]+)?)%/))){out.kind='quantity-percent';out.eligibleQuantity=Number(m[1]);out.discountPercent=Number(m[2])}
 else if((m=u.match(/BUY\s+(\d+)\s*,?\s*SAVE\s+R?\s*([0-9]+(?:[.,][0-9]+)?)/))){out.kind='quantity-save';out.eligibleQuantity=Number(m[1]);out.discountAmount=Number(m[2].replace(',','.'))}
 else if((m=u.match(/ANY\s+(\d+)\s+SAVE\s+R?\s*([0-9]+(?:[.,][0-9]+)?)/))){out.kind='mix-save';out.mixAndMatch=true;out.eligibleQuantity=Number(m[1]);out.discountAmount=Number(m[2].replace(',','.'))}
 else if((m=u.match(/ANY\s+(\d+)\s+SAVE\s+([0-9]+(?:[.,][0-9]+)?)%/))){out.kind='mix-percent';out.mixAndMatch=true;out.eligibleQuantity=Number(m[1]);out.discountPercent=Number(m[2])}
 return out
}
function promotionGroupKey(p){return p?.promotionGroupId||''}
function canPoolPromotions(a,b,skuA='',skuB=''){if(!a?.mixAndMatch||!b?.mixAndMatch)return false;let ga=promotionGroupKey(a),gb=promotionGroupKey(b);if(ga&&gb)return ga===gb;if(ga||gb)return false;let as=new Set(a.participatingSkus||[]),bs=new Set(b.participatingSkus||[]);return !!(skuA&&skuB&&as.has(skuB)&&bs.has(skuA))}
function promotionMath(basePrice,promo,requestedQuantity=1){
 let base=num(basePrice),q=Math.max(1,Number(requestedQuantity)||1);
 if(base===null)return{eligible:false,reason:'Base price unavailable'};
 if(!promo||promo.kind==='none')return{eligible:true,quantity:q,total:base*q,effectiveUnitPrice:base};
 if(q<promo.eligibleQuantity)return{eligible:false,quantity:q,total:base*q,effectiveUnitPrice:base,reason:'Requires '+promo.eligibleQuantity+' items'};
 let groups=Math.floor(q/promo.eligibleQuantity),remainder=q%promo.eligibleQuantity,total;
 if(promo.kind==='bundle-price')total=groups*promo.bundlePrice+remainder*base;
 else if(['quantity-save','mix-save'].includes(promo.kind))total=base*q-groups*promo.discountAmount;
 else if(promo.kind==='buy-n-pay-m')total=base*remainder+(base*promo.payQuantity)*groups;
 else if(['quantity-percent','mix-percent'].includes(promo.kind))total=base*remainder+(base*promo.eligibleQuantity*(1-promo.discountPercent/100))*groups;
 else total=base*q;
 return{eligible:true,quantity:q,total:Math.max(0,total),effectiveUnitPrice:Math.max(0,total)/q,memberOnly:!!promo.memberOnly}
}
function diet(raw){let s=[raw.name,raw.description,raw.ingredients,(raw.lifestyle||[]).join(' ')].join(' ').toLowerCase();if(/\bvegan\b/.test(s))return'vegan';if(/\bvegetarian\b/.test(s))return'vegetarian';return'unknown'}
function adapt(raw){
 if(!raw||!raw.name)return null;
 let p=pack(raw.name),sku=text(raw.sku),barcode=text(raw.barcode);
 let listingId='pnp:'+ (sku||barcode||text(raw.url)||text(raw.name).toLowerCase().replace(/[^a-z0-9]+/g,'-'));
 let listing={id:listingId,retailer:'Pick n Pay',retailerSku:sku,gtin:/^\d{8,14}$/.test(barcode)?barcode:'',displayName:text(raw.name),canonicalName:text(raw.canonicalName||raw.name),packaging:packaging(raw.name,raw.description),netQuantity:p.netQuantity||null,unit:p.unit||'',diet:diet(raw),attributes:{brand:text(raw.brand),stock:text(raw.stock),packCount:p.packCount||1,promotionType:text(raw.promotionType),promotionValidFrom:text(raw.validFrom),promotionValidTo:text(raw.validTo)},sourceUrl:text(raw.url)};
 let price=num(raw.price),loyalty=num(raw.smartShopperPrice),promo=promotion(raw);if(loyalty!==null)promo.memberOnly=true;
 let observation=(price!==null||loyalty!==null)?{listingId,price:price??loyalty,loyaltyPrice:loyalty,promotion:promo,checkedAt:raw.checkedAt||new Date().toISOString(),source:'Pick n Pay public product page',url:text(raw.url)}:null;
 return{listing,observation};
}
function fromPublicProductPage(page={}){
 let name=text(page.name||page.title),sku=text(page.sku||page.code),barcode=text(page.barcode);
 return adapt({name,sku,barcode,brand:page.brand,description:page.description,price:page.regularPrice??page.price,smartShopperPrice:page.smartShopperPrice??page.promoPrice,promotion:page.promotion||page.promotionLabel,smartShopperOnly:!!page.smartShopperOnly,validFrom:page.validFrom,validTo:page.validTo,stock:page.stock||page.availability,url:page.url,checkedAt:page.checkedAt})
}
function ingestPayload(payload={}){
 let rows=Array.isArray(payload)?payload:(payload.products||payload.results||payload.items||[]);
 return adaptMany(rows.map(r=>({name:r.name||r.title,sku:r.sku||r.code,barcode:r.barcode||r.gtin,brand:r.brand,description:r.description,price:r.regularPrice??r.oldPrice??r.price,smartShopperPrice:r.smartShopperPrice??r.promoPrice??r.specialPrice,promotion:r.promotion||r.promotionLabel||r.promoText,smartShopperOnly:!!r.smartShopperOnly,validFrom:r.validFrom,validTo:r.validTo,stock:r.stock??r.available,url:r.url,checkedAt:r.checkedAt})))
}
function adaptMany(rows){let listings=[],observations=[];(rows||[]).forEach(r=>{let x=adapt(r);if(!x)return;listings.push(x.listing);if(x.observation)observations.push(x.observation)});return{listings,observations}}
return{adapt,adaptMany,fromPublicProductPage,ingestPayload,promotion,promotionMath,canPoolPromotions,promotionGroupKey};
})();