/* Shared by the browser and Node refresh worker. Unknown evidence fails closed. */
(function(root){
const normal=v=>String(v||'').toLowerCase().trim().replace(/\s+/g,' ');
const FLM='Food Lover’s Market';
function shoppingDate(at=new Date()){return new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Johannesburg',year:'numeric',month:'2-digit',day:'2-digit'}).format(at)}
function isoDate(s){if(!/^\d{4}-\d{2}-\d{2}$/.test(s||''))return false;let d=new Date(s+'T00:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===s}
function validate(o,{branch='',date=shoppingDate(),now=Date.now(),listing=null}={}){
 const fail=reason=>({ok:false,status:'Unverified for this store',reason});
 if(o.retailer!==FLM)return{ok:true,status:'Not subject to FLM gate'};
 if(!branch)return fail('Choose a branch for this trip');
 if(!isoDate(date)||!isoDate(o.validFrom)||!isoDate(o.validTo)||o.validFrom>o.validTo)return fail('Printed promotion dates including year required');
 if(date<o.validFrom||date>o.validTo)return fail('Promotion is outside the shopping date');
 const checked=Date.parse(o.checkedAt||'');
 if(!Number.isFinite(checked)||checked>now+60000||now-checked>36*3600000)return fail('Evidence needs refreshing');
 const e=o.promotionEvidence;
 if(!e||!['catalogue','shelf-photo'].includes(e.kind)||!e.artifactId||!e.page||!e.offerText||!e.scopeText||!e.datesText||!e.termsText||!e.reviewedAt)return fail('Actual offer, scope, dates and terms must be inspected');
 const reviewed=Date.parse(e.reviewedAt);if(!Number.isFinite(reviewed)||reviewed>now+60000||reviewed>checked+60000||now-reviewed>36*3600000)return fail('Source inspection is stale or invalid');
 if(e.kind==='catalogue'){
  try{let h=new URL(e.sourceUrl).hostname;if(!['foodloversmarket.co.za','www.foodloversmarket.co.za','cdn.foodloversmarket.co.za'].includes(h))return fail('Official catalogue provenance required')}catch{return fail('Catalogue source URL missing')}
 }else if(normal(e.observedBranch)!==normal(branch))return fail('Shelf photo belongs to another branch');
 const scope=e.scope||{};
 if(scope.exclusionsKnown!==true||!Array.isArray(scope.includedBranches)||!Array.isArray(scope.excludedBranches))return fail('Branch inclusion and exclusions must be explicit');
 if(!scope.includedBranches.some(b=>normal(b)===normal(branch))||scope.excludedBranches.some(b=>normal(b)===normal(branch)))return fail('This branch is not included in the offer');
 const product=e.product||{},name=o.name||listing?.displayName||'',quantity=o.netQuantity??listing?.netQuantity,unit=o.unit||listing?.unit;
 if(!product.brand||!product.variant||!product.name||normal(name)!==normal(product.name)||!(Number(quantity)>0)||Number(quantity)!==Number(product.netQuantity)||normal(unit)!==normal(product.unit))return fail('Exact product, variant and pack size required');
 if(e.validFrom!==o.validFrom||e.validTo!==o.validTo||!e.datesText.includes(o.validFrom.slice(0,4))||!e.datesText.includes(o.validTo.slice(0,4)))return fail('Dates must agree with the inspected advert');
 if(e.price!==Number(o.price)||!(e.price>0)||e.currency!=='ZAR'||typeof e.memberOnly!=='boolean'||e.memberOnly!==!!o.memberOnly)return fail('Price and loyalty terms must agree with the advert');
 const terms=e.terms||{},label=typeof o.promotion==='string'?o.promotion:o.promotion?.label||'';
 if(!['each','multibuy'].includes(terms.kind)||!(Number(terms.quantity)>=1)||normal(terms.label)!==normal(label))return fail('Offer mechanic must be explicit');
 if(terms.kind==='each'&&(Number(terms.quantity)!==1||label))return fail('Each price cannot be converted into a multibuy');
 if(terms.kind==='multibuy'&&(!label||Number(terms.quantity)<2||!Array.isArray(terms.participatingProducts)||!terms.participatingProducts.includes(product.name)))return fail('Multibuy quantity and eligible products required');
 if(terms.kind==='multibuy'){let m=label.match(/(?:any\s+|buy\s+)?(\d+)\s*(?:for|,|&|save|pay)/i);if(!m||Number(m[1])!==Number(terms.quantity))return fail('Multibuy label and quantity disagree')}
 if(e.conflict===true)return fail('Conflicting offer evidence needs review');
 return{ok:true,status:'Confirmed for '+branch,reason:''};
}
function preferShelfEvidence(rows,context){let local=rows.filter(o=>o.promotionEvidence?.kind==='shelf-photo'&&validate(o,context).ok);return rows.filter(o=>o.promotionEvidence?.kind==='shelf-photo'||!local.some(s=>normal(s.name||s.listing?.displayName)===normal(o.name||o.listing?.displayName)&&Number(s.netQuantity??s.listing?.netQuantity)===Number(o.netQuantity??o.listing?.netQuantity)&&normal(s.unit||s.listing?.unit)===normal(o.unit||o.listing?.unit)))}
function observationKey(o){return[o.retailer,o.conceptId,o.sku||o.barcode||o.url||o.name,o.name,o.netQuantity,o.unit,o.storeId||o.storeName||'',o.promotionEvidence?.scope?.includedBranches?.map(normal).sort().join(','),o.validFrom,o.validTo,o.promotionEvidence?.artifactId,String(o.checkedAt||'').slice(0,10)].join('|')}
function listingKey(o){return[o.sku||o.barcode||o.url||o.name,o.name,o.netQuantity,o.unit,o.storeId||o.storeName||'',o.promotionEvidence?.scope?.includedBranches?.map(normal).sort().join(','),o.validFrom,o.validTo,o.promotionEvidence?.artifactId].filter(v=>v!==undefined&&v!==null).join('|')}
root.FamilyRoyPromotionValidation={validate,preferShelfEvidence,observationKey,listingKey,shoppingDate};
})(globalThis);
