import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const api="https://ygrfqehiwhmkfczosuoo.supabase.co/functions/v1/market32-full/api/";
const html=readFileSync("web/market32/index.html","utf8");
const css=readFileSync("web/market32/full.css","utf8");
const js=readFileSync("web/market32/full.js","utf8");
assert.match(html,/full\.css/);
assert.match(html,/full\.js/);
assert.match(css,/\.sidebar/);
assert.match(css,/\.kpi-row/);
assert.match(js,/dashboardPage/);
assert.match(js,/stallsPage/);
assert.match(js,/messagesPage/);
const call=async(path,token,method="GET",body)=>{
 const res=await fetch(api+path,{method,headers:{"accept":"application/json",...(token?{Authorization:"Bearer "+token}:{}),...(body?{"content-type":"application/json"}:{})},body:body?JSON.stringify(body):undefined});
 let json;try{json=await res.json()}catch{throw Error("Non-JSON API response at "+path)}
 return {status:res.status,json};
};
const health=await call("health");
assert.equal(health.status,200);
assert.equal(health.json.ok,true);
const roles={demo:"buyer",seller:"seller",organiser:"organiser",admin:"admin"};
const tokens={};
for(const [username,role] of Object.entries(roles)){
 const login=await call("login",null,"POST",{username,password:"market32demo!"});
 assert.equal(login.status,200,username+" login failed: "+JSON.stringify(login.json));
 tokens[username]=login.json.token;
 const me=await call("me",tokens[username]);
 assert.equal(me.status,200);
 assert.equal(me.json.role,role);
 console.log("Verified role",username,role);
}
let r=await call("markets",tokens.demo);assert.equal(r.status,200);assert.equal(r.json.markets.length>=4,true);
let id=r.json.markets[0].id;
r=await call("stalls?market="+encodeURIComponent(id),tokens.demo);assert.equal(r.status,200);assert.equal(r.json.stalls.length>=12,true);
r=await call("dashboard",tokens.organiser);assert.equal(r.status,200);assert.equal(typeof r.json.stats.market_count,"number");
r=await call("applications",tokens.organiser);assert.equal(r.status,200);assert.ok(Array.isArray(r.json.applications));
r=await call("listings",tokens.seller);assert.equal(r.status,200);assert.ok(Array.isArray(r.json.listings));
r=await call("conversations",tokens.demo);assert.equal(r.status,200);
r=await call("loyalty",tokens.demo);assert.equal(r.status,200);assert.equal(typeof r.json.balance,"number");
r=await call("tickets",tokens.admin);assert.equal(r.status,200);
r=await call("team",tokens.organiser);assert.equal(r.status,200);
r=await call("team",tokens.demo);assert.equal(r.status,403);
r=await call("profile",tokens.demo);assert.equal(r.status,404);
console.log("Market32 public preview API and UI source smoke tests passed");
