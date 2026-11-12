import assert from 'node:assert/strict';
const API='https://ygrfqehiwhmkfczosuoo.supabase.co/functions/v1/market32-v2/api';
const PASS='market32demo!';
async function request(path,{method='GET',token,body}={}){
  const h={accept:'application/json'};if(token)h.authorization='Bearer '+token;
  if(body)h['content-type']='application/json';
  const r=await fetch(API+path,{method,headers:h,body:body?JSON.stringify(body):undefined});
  const d=await r.json().catch(()=>({error:'not JSON'}));
  assert.ok(r.ok,path+' returned '+r.status+' '+JSON.stringify(d).slice(0,240));return d;
}
const health=await request('/health');assert.equal(health.ok,true);console.log('✅ Supabase API responds');
const countries=await request('/counties');assert.equal(countries.counties.length,32);
const markets=await request('/markets');assert.ok(markets.markets.length>=32);
const products=await request('/products');assert.ok(products.products.length>=8);
console.log('✅',countries.counties.length,'counties,',markets.markets.length,'sample markets,',products.products.length,'products');
const tokens={};
for(const role of ['buyer','seller','organiser','admin']){
  const {token,user}=await request('/auth/login',{method:'POST',body:{username:role,password:PASS}});
  assert.equal(user.role,role);
  const m=await request('/me',{token});assert.equal(m.user.role,role);
  const d=await request('/dashboard',{token});assert.ok(d.stats);
  tokens[role]=token;
  console.log('✅ Role login, authenticated dashboard:',role);
}
const event=await request('/markets/'+encodeURIComponent(markets.markets[0].id));
assert.ok(event.stalls.length>=1);
console.log('✅ Numbered layout loads:',event.stalls.length,'stalls');
await request('/applications',{token:tokens.seller});
await request('/bookings',{token:tokens.buyer});
await request('/loyalty',{token:tokens.buyer});
await request('/seller/products',{token:tokens.seller});
await request('/organiser/markets',{token:tokens.organiser});
await request('/admin/users',{token:tokens.admin});
await request('/admin/payments',{token:tokens.admin});
console.log('✅ Buyer, seller, organiser and admin reads are all authorized');
console.log('✅ Read-only Market32 end-to-end smoke checks passed');
