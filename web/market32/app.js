
/* Market32 · LocalStalls-inspired full platform · staging. No real charges without Stripe TEST secrets. */
(function(){
"use strict";
const ROOT="https://ygrfqehiwhmkfczosuoo.supabase.co/functions/v1/market32-v2/api";
const $=(s,scope=document)=>scope.querySelector(s);
const $$=(s,scope=document)=>Array.from(scope.querySelectorAll(s));
const esc=(v)=>String(v==null?"":v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const n=(v)=>Number(v)||0;
const euro=(c)=>new Intl.NumberFormat("en-IE",{style:"currency",currency:"EUR"}).format(n(c)/100);
const dt=(s)=>s?new Date(String(s).length===10?s+"T12:00:00":s).toLocaleDateString("en-IE",{day:"numeric",month:"short",year:"numeric"}):"—";
const when=(s)=>s?new Date(s).toLocaleString("en-IE",{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"}):"";
const badge=(v)=>'<span class="badge '+esc(v)+'">'+esc((v||"pending").replace("_"," ").toUpperCase())+"</span>";
const icon=(name,size=17)=>'<i data-lucide="'+esc(name)+'" style="width:'+size+'px;height:'+size+'px"></i>';
const avatar=(name)=>'<div class="avatar">'+esc((name||"M").split(/\s+/).map(s=>s[0]||"").slice(0,2).join("").toUpperCase())+"</div>";
const first=(s)=>String(s||"").split(" ")[0];
const S={token:sessionStorage.getItem("m32v2_token")||"",me:null,tab:"dashboard",register:false,viewMarket:null,market:null,selectedStall:null,editLayout:false,county:"",q:"",shopq:"",products:[],markets:[],counties:[],config:{},dash:null,applications:[],bookings:[],orders:[],entries:[],ownProducts:[],messages:[],loyalty:null,organiserMarkets:[],payments:[],users:[],activeChat:null,modal:null,map:null,mapTimer:null,loginErr:"",report:"Payments",pendingTab:"applications"};
const demoPassword="market32demo!";
function toast(message,bad=false){let t=$("#toast");t.className="toast"+(bad?" bad":"");t.textContent=message;t.hidden=false;clearTimeout(window._toastT);window._toastT=setTimeout(()=>t.hidden=true,4200)}
async function api(path,opts={}){
 const method=opts.method||"GET",headers={Accept:"application/json"};
 if(S.token)headers.Authorization="Bearer "+S.token;
 let body=undefined;
 if(opts.binary){body=opts.binary;headers["content-type"]=opts.binary.type||"application/octet-stream"}
 else if(opts.body!==undefined){body=JSON.stringify(opts.body);headers["content-type"]="application/json"}
 let r;
 try{r=await fetch(ROOT+path,{method,headers,body,cache:"no-store"})}catch(e){throw Error("Network unavailable. Check your internet connection.")}
 let d;try{d=await r.json()}catch(e){throw Error("Unexpected backend response ("+r.status+")")}
 if(!r.ok)throw Error(d.error||d.message||"Request failed "+r.status);
 return d;
}
async function publicRefresh(){
 const r=await Promise.all([api("/markets"),api("/products"),api("/counties"),api("/config")]);
 S.markets=r[0].markets||[];S.products=r[1].products||[];S.counties=r[2].counties||[];S.config=r[3]||{};
}
async function init(){
 try{await publicRefresh();if(S.token){try{const r=await api("/me");S.me=r.user}catch(e){S.token="";sessionStorage.removeItem("m32v2_token")}}if(S.me)await page("dashboard");else render()}
 catch(e){$("#app").innerHTML='<div class="login-bg"><div class="panel pad"><h2>Market32 cannot connect</h2><p>'+esc(e.message)+'</p><button class="btn" id="retry">Retry</button></div></div>';$("#retry").onclick=init}
}
function me(){return S.me||{role:"guest",full_name:"Guest"}}
function can(...roles){return me().role==="admin"||roles.includes(me().role)}
function isOwnerMarket(m){return !!S.me&&(S.me.role==="admin"||m.organiser_id===S.me.id)}
const NAV=[
 ["dashboard","Dashboard","layout-dashboard"],
 ["explore","Explore Ireland","map-pinned"],
 ["events","Events","calendar-days","organiser"],
 ["applications","Stall Applications","clipboard-check","seller,organiser"],
 ["bookings","Bookings & Tickets","ticket-check"],
 ["shop","Marketplace","store"],
 ["seller","My Listings","package","seller"],
 ["inbox","Messages","mail"],
 ["loyalty","Loyalty Rewards","gift"],
 ["payments","Payments","wallet"],
 ["scan","QR Check-in","scan-line","organiser"],
 ["users","Users & Team","users","organiser"],
 ["settings","Settings","settings"],
 ["profile","My Profile","circle-user-round"]
];
function renderLogin(){
 const fields=S.register?
  '<label>Full name</label><input id="authFull" placeholder="Your name" required minlength="2"><label>Email</label><input id="authEmail" type="email" placeholder="you@example.ie" required><label>County</label><select id="authCounty">'+countyOptions("Dublin")+'</select>':'';
 return '<div class="login-bg"><div class="login-wrapper"><div class="login-art"><div><div class="logo" style="padding:0">'+icon("map-pin",29)+' Local<span style="color:#68f4b3">Stalls</span></div><h1>Every market.<br>One beautiful<br>place.</h1><p>Explore all 32 Irish counties, book a numbered stall, discover independent makers and manage your local market.</p></div><div><span class="badge" style="background:#dcfbe9">MARKET32 · IRELAND</span><p>Sample events, sample products, sandbox transactions. No real money changes hands.</p></div><div class="glow"></div></div><div class="login-body"><div class="subtle">WELCOME TO LOCALSTALLS / MARKET32</div><h2>'+(S.register?"Create an account":"Sign in to your workspace")+'</h2><p>'+(S.register?"Start as a buyer. You can activate seller tools afterwards.":"Choose a demo role to explore all areas, or use your registered account.")+'</p><form id="authForm" data-form="'+(S.register?"register":"login")+'">'+fields+'<label>Username</label><input id="authUser" name="username" placeholder="Username" value="buyer" required><label>Password</label><input type="password" id="authPass" name="password" placeholder="Your password" required minlength="'+(S.register?10:1)+'" value="'+(S.register?"":demoPassword)+'"><div style="margin-top:20px"><button class="btn full" type="submit">'+(S.register?"Create account":"Sign in to Market32")+' '+icon("arrow-right")+'</button></div></form><div style="display:flex;justify-content:space-between;align-items:center;margin-top:16px"><button class="btn ghost" data-act="auth-switch">'+(S.register?"← Back to login":"Create a new account")+'</button><span class="badge pending">STAGING ONLY</span></div>'+(!S.register?'<p style="margin:18px 0 8px;font-weight:700;color:#546674">Quick demo accounts</p><div class="demo-users">'+["buyer","seller","organiser","admin"].map(x=>'<button data-act="demo-role" data-role="'+x+'">'+esc(x)+'</button>').join("")+'</div><p class="footnote">Demo password for every role: <b>'+demoPassword+'</b>. Public demo accounts are not production identities.</p>':'')+(S.loginErr?'<div class="errorline">'+esc(S.loginErr)+'</div>':"")+'</div></div></div>';
}
function shell(content){
 const role=me().role;
 const navigation=NAV.filter(x=>!x[3]||x[3].split(",").includes(role)||role==="admin");
 const nav=navigation.map(x=>'<button class="navlink '+(S.tab===x[0]?"active":"")+'" data-act="nav" data-tab="'+x[0]+'">'+icon(x[2],17)+'<span>'+x[1]+'</span>'+(x[0]==="applications"&&S.applications.filter(a=>a.status==="pending").length?'<span class="navbadge">'+S.applications.filter(a=>a.status==="pending").length+'</span>':"")+'</button>').join("");
 return '<div class="shell"><aside id="sidebar" class="sidebar"><div class="logo"><span class="logopin">'+icon("map-pin",24)+'</span><span>Local<span style="color:#51d690">Stalls</span></span></div><div class="smallcap">YOUR WORKSPACE</div><div class="sidegroup">'+nav+'</div><div class="sidefoot"><button class="sideprofile" data-act="nav" data-tab="profile">'+avatar(me().full_name)+'<span><strong>'+esc(me().full_name)+'</strong><small>'+esc(role.toUpperCase())+' · My account</small></span>'+icon("chevron-right",16)+'</button><button class="navlink" style="margin-top:10px" data-act="logout">'+icon("log-out")+' Sign out</button></div></aside><main class="main"><header class="topbar"><button class="roundicon menu-mobile" data-act="menu">'+icon("menu",22)+'</button><div class="search">'+icon("search",22)+'<input id="globalSearch" placeholder="Search markets, counties or products (↵)" aria-label="Global search"></div><div class="topactions"><button class="roundicon" title="Rewards" data-act="nav" data-tab="loyalty">'+icon("gift",20)+'</button><button class="roundicon" title="Messages" data-act="nav" data-tab="inbox">'+icon("mail",20)+'</button><button class="roundicon notification" title="Recent activity" data-act="nav" data-tab="dashboard">'+icon("bell",20)+'</button><div class="top-user">'+avatar(me().full_name)+'<div><b>'+esc(me().full_name)+'</b><span>'+esc(role[0].toUpperCase()+role.slice(1))+'</span></div></div></div></header><div id="pagecontent">'+content+'</div><footer style="padding:30px 0;color:#aaafb9;font-size:11px;display:flex;justify-content:space-between;gap:10px"><span>© Market32 · LocalStalls staging · '+new Date().getFullYear()+'</span><span>All markets and items in this environment are sample data. Stripe live payments are disabled.</span></footer></main></div>';
}
function heading(title,subtitle,button="",buttonIcon="plus"){return '<div class="page-header"><div><div class="breadcrumb">MARKET32 / '+esc(me().role.toUpperCase())+' WORKSPACE</div><h1>'+esc(title)+'</h1><div class="subtle">'+esc(subtitle)+'</div></div>'+(button?'<button class="btn" data-act="'+button+'">'+icon(buttonIcon)+' '+(button==="new-market"?"Create Event":button==="new-product"?"Add Product":button==="new-stall"?"Add Stall":"New")+'</button>':"")+'</div>'}
function noData(msg,ico="inbox"){return '<div class="empty">'+icon(ico,26)+'<div>'+esc(msg)+'</div></div>'}
function status(s){return badge(s)}
function table(cols,rows){return '<div class="tablewrap"><table><thead><tr>'+cols.map(x=>'<th>'+x+'</th>').join("")+'</tr></thead><tbody>'+rows.join("")+'</tbody></table></div>'}
function summaryBoxes(stats,market){
 const isorg=can("organiser");
 const bcount=n(stats.bookings),total=n(stats.stalls);
 const ratio=total?Math.round(n(stats.confirmed)/total*100):0;
 const days=market?Math.max(0,Math.ceil((new Date(market.event_date+"T09:00:00").getTime()-Date.now())/86400000)):0;
 const label=isorg?"Next Event - "+(market?dt(market.event_date):"Create your first event"):"Your Market32 activity";
 const content=isorg?'<div class="herostatrow"><div><b>'+ratio+'%</b> Stalls confirmed</div><div><b>'+n(stats.bookings)+'</b> Stall bookings</div><div><b>'+n(stats.pending_applications)+'</b> Pending applications</div><div><b>'+days+'</b> Days to go</div></div>':'<div class="herostatrow"><div><b>'+n(stats.orders)+'</b> Marketplace orders</div><div><b>'+n(stats.bookings)+'</b> Stall bookings</div><div><b>'+n(stats.points)+'</b> Loyalty points</div><div><b>'+n(stats.products)+'</b> My listings</div></div>';
 return '<div class="gridstats"><div class="eventbanner"><h3>'+esc(label)+'</h3><p>'+esc(market?market.title:"Everything you need for your local markets")+'</p>'+content+'</div><div class="panel chartcard"><h3>Sales value · Staging</h3><small>Confirmed test transactions (not real income)</small><svg class="chartline" viewBox="0 0 320 75" preserveAspectRatio="none"><defs><linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b7ecd0" stop-opacity=".78"/><stop offset="1" stop-color="#b7ecd0" stop-opacity=".03"/></linearGradient></defs><path d="M0 54 C50 84 74 24 128 32 S211 65 250 31 S291 44 320 16 L320 75 L0 75Z" fill="url(#chartFill)"/><path d="M0 54 C50 84 74 24 128 32 S211 65 250 31 S291 44 320 16" fill="none" stroke="#00ad61" stroke-width="2"/></svg><strong>'+euro(stats.revenue_cents)+'</strong><small class="change">Test data only</small></div><div class="panel bookingcard"><div class="stat-icon">'+icon("calendar-check",23)+'</div><h3>Bookings</h3><small>Your workspace</small><strong>'+bcount+'</strong><span class="stat-chip">'+n(stats.confirmed)+' confirmed</span></div></div>';
}
function pendingTable(){
 const apps=S.applications||[],b=S.bookings||[],p=S.payments||[];
 let rows=[];
 if(S.pendingTab==="applications")rows=apps.filter(x=>x.status==="pending").map(x=>'<tr><td class="tdtitle">'+esc(x.seller_name||"Vendor")+' <small>Submitted '+dt(x.created_at)+'</small></td><td>'+esc(x.category)+'</td><td>'+esc(marketName(x.market_id))+'</td><td>'+status(x.status)+'</td><td><div class="tableactions">'+(can("organiser")?'<button class="btn sm" data-act="review-app" data-id="'+x.id+'" data-status="approved">Approve</button><button class="btn sm red" data-act="review-app" data-id="'+x.id+'" data-status="rejected">Reject</button>':"—")+'</div></td></tr>');
 else if(S.pendingTab==="bookings")rows=b.filter(x=>x.status==="held").map(x=>'<tr><td class="tdtitle">'+esc(x.stall_id)+'</td><td>'+esc(marketName(x.market_id))+'</td><td>'+euro(x.price_cents)+'</td><td>'+status(x.status)+'</td><td><button class="btn sm secondary" data-act="open-booking" data-id="'+x.id+'">View</button></td></tr>');
 else rows=p.filter(x=>x.status==="pending").slice(0,20).map(x=>'<tr><td class="tdtitle">'+esc(x.kind)+' #'+esc(x.id.slice(0,8))+'</td><td>'+esc(x.market_id||x.product_id||"—")+'</td><td>'+euro(x.amount_cents)+'</td><td>'+status(x.status)+'</td><td>—</td></tr>');
 const labels=[["applications","Stall Applications"],["bookings","Pending Bookings"],["payments","Pending Payments"]];
 return '<section class="panel"><div class="panelhead"><div><h3>Pending Summary</h3><small>Items requiring attention</small></div><button class="btn sm ghost" data-act="nav" data-tab="'+(S.pendingTab==="applications"?"applications":S.pendingTab==="bookings"?"bookings":"payments")+'">View all</button></div><div class="tabs">'+labels.map(x=>'<button class="tab '+(S.pendingTab===x[0]?"active":"")+'" data-act="pending-tab" data-tab="'+x[0]+'">'+x[1]+'</button>').join("")+'</div>'+table(["REQUEST","CATEGORY / MARKET","DETAIL","STATUS","ACTION"],rows.length?rows:['<tr><td colspan="5">'+noData("No pending items")+'</td></tr>'])+'</section>';
}
function activity(){const x=S.dash?.recent_activity||[];return '<section class="panel"><div class="panelhead"><div><h3>Recent Activity</h3><small>Platform audit trail</small></div>'+icon("list-filter",18)+'</div><div class="activity">'+(x.length?x.slice(0,7).map(a=>'<div class="activityrow"><span class="activitydot"></span><div><h4>'+esc(a.category.replace("-"," ").toUpperCase())+'</h4><p>'+esc(a.text)+'</p><time>'+esc(when(a.created_at))+'</time></div></div>').join(""):noData("No recorded activity yet"))+'</div></section>'}
function reports(){
 const list=S.dash?.orders||[],vals=Array(9).fill(0);
 list.forEach(o=>{const k=new Date(o.created_at).getUTCMonth();vals[k%9]+=["paid","demo_paid"].includes(o.status)?o.subtotal_cents:0});
 const max=Math.max(1000,...vals);
 return '<section class="panel reports"><div><h3 class="chart-title">Reports</h3><div class="subtle">High-level transaction summaries · sample data</div><div class="reportopts">'+[["Payments","wallet"],["Bookings","calendar-check"],["Applications","clipboard-list"]].map(x=>'<button class="reportopt '+(S.report===x[0]?"active":"")+'" data-act="report" data-kind="'+x[0]+'">'+icon(x[1],25)+x[0]+'</button>').join("")+'</div></div><div><div class="bargraph">'+vals.map((v,i)=>'<div class="colbar"><b>'+((v/100)>0?(v/100).toFixed(0):"0")+'</b><div class="bar" style="height:'+Math.max(3,(v/max)*115)+'px"></div><small>'+["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep"][i]+'</small></div>').join("")+'</div><div class="subtle" style="margin-top:10px">Charts reflect stored sample transactions, not fabricated real revenue.</div></div></section>';
}
function dashboard(){
 const a=S.dash||{stats:{}},stats=a.stats||{},market=(a.markets||[])[0]||S.markets[0];
 return heading("Dashboard","Welcome back, "+first(me().full_name)+". Here is what's happening with your markets.")+summaryBoxes(stats,market)+'<div class="two-col">'+pendingTable()+activity()+'</div>'+reports();
}
function countyOptions(selected){return '<option value="">All 32 counties</option>'+S.counties.map(x=>'<option value="'+esc(x)+'" '+(selected===x?"selected":"")+'>'+esc(x)+'</option>').join("")}
const covers=["https://images.unsplash.com/photo-1488459716781-31db52582fe9?w=1000&q=85","https://images.unsplash.com/photo-1500534623283-312aade485b7?w=1000&q=85","https://images.unsplash.com/photo-1472396961693-142e6e269027?w=1000&q=85","https://images.unsplash.com/photo-1498804103079-a6351b050096?w=1000&q=85"];
function marketPhoto(m){const idx=Math.max(0,S.markets.findIndex(x=>x.id===m.id));return m.cover_url&&m.cover_url.startsWith("https://")?m.cover_url:covers[idx%covers.length]}
function marketName(id){return S.markets.find(x=>x.id===id)?.title||id||"—"}
function marketCard(m,i){return '<article class="market-card"><img alt="'+esc(m.title)+'" loading="lazy" src="'+esc(marketPhoto(m))+'"><div class="body"><span class="badge">'+esc(m.kind||"Market")+'</span><h3>'+esc(m.title)+'</h3><p>'+esc((m.description||"Independent local market").slice(0,110))+'</p><div class="minir">'+icon("map-pin",13)+esc(m.city)+', '+esc(m.county)+'</div><div class="minir">'+icon("calendar",13)+dt(m.event_date)+' · '+esc(String(m.start_time).slice(0,5))+'–'+esc(String(m.end_time).slice(0,5))+'</div><div class="foot"><div><span class="subtle">Entry</span><br><strong>'+euro(m.entry_fee_cents)+'</strong></div><button class="btn sm" data-act="open-market" data-id="'+esc(m.id)+'">View Stalls '+icon("arrow-right",15)+'</button></div></div></article>'}
function explore(){
 const list=S.markets.filter(m=>(!S.county||m.county===S.county)&&(!S.q||[m.title,m.county,m.city,m.kind,m.description].join(" ").toLowerCase().includes(S.q.toLowerCase())));
 return heading("Explore Ireland","Browse markets and car boot sales across all 32 counties.")+'<div class="filters"><select id="countyFilter" aria-label="County">'+countyOptions(S.county)+'</select><input class="textinput" id="marketFilter" placeholder="Search events, towns or types…" value="'+esc(S.q)+'"><span class="badge">'+list.length+' sample events</span></div><div class="split"><div class="section-grid" style="grid-template-columns:repeat(2,minmax(0,1fr))">'+(list.length?list.map(marketCard).join(""):noData("No markets for these filters","map"))+'</div><div class="panel pad"><div class="panelhead" style="padding:0 0 17px"><h3>Discover on the map</h3><span class="badge">Ireland</span></div><div id="irelandMap" class="map"></div><p class="subtle">The 32 counties are searchable. Event locations and dates are illustrative staging records.</p></div></div>';
}
function marketPage(){
 const r=S.market;if(!r)return noData("Select a market in Explore");const m=r.market,stalls=r.stalls||[],privileged=isOwnerMarket(m);
 const selected=stalls.find(x=>x.id===S.selectedStall),bookable=selected&&!selected.taken&&!selected.disabled;
 const layout=stalls.map(s=>'<button title="'+esc(s.code)+'" class="stall '+(s.taken||s.disabled?"taken ":"")+(S.selectedStall===s.id?"selected ":"")+(S.editLayout?"editor":"")+'" style="left:'+n(s.x)+'%;top:'+n(s.y)+'%;width:'+n(s.w)+'%;height:'+n(s.h)+'%" data-act="'+(S.editLayout?"layout-stall":"select-stall")+'" data-id="'+esc(s.id)+'">'+esc(s.code)+'</button>').join("");
 return '<button class="btn secondary sm" data-act="nav" data-tab="explore">'+icon("arrow-left",15)+' Back to Ireland</button><div class="marketbanner" style="margin-top:18px"><img src="'+esc(marketPhoto(m))+'" alt="'+esc(m.title)+'"><div class="title">'+esc(m.title)+'<small>'+esc(m.county)+' · '+dt(m.event_date)+' · '+esc(String(m.start_time).slice(0,5))+' to '+esc(String(m.end_time).slice(0,5))+'</small></div></div><div class="page-header"><div><h1>Interactive Stall Layout</h1><span class="subtle">'+stalls.length+' numbered stalls · Click to reserve · 10 minute hold · '+euro(1000)+' standard fee</span></div>'+(privileged?'<div class="inline"><button class="btn secondary" data-act="toggle-editor">'+icon("move",17)+' '+(S.editLayout?"Finish Editing":"Edit Layout")+'</button><button class="btn" data-act="new-stall">'+icon("plus")+' Add Stall</button></div>':"")+'</div><div class="splitthird"><div class="panel pad"><div style="text-align:center;font-size:10px;letter-spacing:2px;color:#9aa6a4;border-bottom:1px solid #edf0ed;padding-bottom:15px;margin-bottom:12px">MARKET ENTRANCE · STALL FLOOR PLAN</div><div class="floor" id="stallFloor">'+layout+'</div><div class="floorlegend"><span><i></i>Available</span><span><i class="taken"></i>Reserved</span><span><i class="selected"></i>Selected</span></div>'+(S.editLayout?'<div class="notice">Editor mode: drag an individual stall to reposition it. Changes are saved to Supabase when you release. Disable a stall in its settings.</div>':"")+'</div><div class="stack"><div class="panel summarycard"><h3>Booking summary</h3><div class="subtle">'+esc(m.title)+' · '+esc(m.county)+'</div><div class="summaryline"><span>Selected stall</span><b>'+esc(selected?.code||"Not selected")+'</b></div><div class="summaryline"><span>Stall fee</span><b>'+euro(selected?.price_cents??1000)+'</b></div><div class="summaryline"><span>Event date</span><b style="font-size:12px">'+dt(m.event_date)+'</b></div><div style="margin-top:18px"><button class="btn full" data-act="hold-stall" '+(!bookable?"disabled":"")+'>'+icon("ticket-check")+' Hold selected stall</button></div><p class="subtle" style="margin-top:15px;line-height:1.6">Holding a stall is free. Use the no-money sandbox demo to validate the full booking/QR flow, or connect Stripe Test Mode later.</p></div><div class="panel pad"><h3 style="margin:0 0 8px">Market entry ticket</h3><div class="subtle">Entry fee '+euro(m.entry_fee_cents)+'</div><button class="btn secondary full" style="margin-top:16px" data-act="buy-entry" data-id="'+esc(m.id)+'">Reserve Entry '+icon("arrow-right")+'</button>'+(can("seller")?'<button class="btn secondary full" style="margin-top:9px" data-act="apply" data-id="'+esc(m.id)+'">Apply as a seller</button>':"")+'</div>'+(privileged?'<div class="panel pad"><h3 style="margin-top:0">Organiser controls</h3><button class="btn secondary full" data-act="edit-market" data-id="'+esc(m.id)+'">Edit event</button><button class="btn secondary full" style="margin-top:8px" data-act="scan-open">Scan a ticket</button></div>':"")+'</div></div>';
}
function shop(){const list=S.products.filter(p=>!S.shopq||[p.title,p.category,p.description,p.seller_name].join(" ").toLowerCase().includes(S.shopq.toLowerCase()));return heading("The Marketplace","Buy, sell and connect with independent makers across Ireland.",can("seller")?"new-product":"")+ '<div class="filters"><input class="textinput" id="productFilter" value="'+esc(S.shopq)+'" placeholder="Search products, makers and categories…"><span class="badge">'+list.length+' active listings</span></div><div class="section-grid">'+(list.length?list.map(p=>'<article class="product-card">'+(p.photo_url?'<img loading="lazy" src="'+esc(p.photo_url)+'" alt="'+esc(p.title)+'">':'<div class="imagefallback">'+icon("shopping-bag",46)+'</div>')+'<div class="body"><span class="badge">'+esc(p.category)+'</span><h3>'+esc(p.title)+'</h3><p class="subtle" style="height:32px;overflow:hidden">'+esc((p.description||"Hand-picked local find").slice(0,95))+'</p><div class="sellerbar">'+icon("user-round",14)+' '+esc(p.seller_name||"Local Seller")+'</div><div class="price">'+euro(p.price_cents)+'</div><div class="subtle" style="margin-top:6px">'+p.stock+' available</div><div class="actions"><button class="btn secondary sm" data-act="chat-product" data-id="'+p.id+'" data-seller="'+p.seller_id+'">'+icon("message-circle",15)+' Message</button><button class="btn sm" data-act="buy-product" data-id="'+p.id+'" '+(p.stock===0||p.seller_id===me().id?"disabled":"")+'>'+icon("shopping-bag",14)+' Buy</button></div></div></article>').join(""):noData("No products found","package"))+'</div>'}
function bookings(){
 const b=S.bookings||[],entries=S.entries||[];
 return heading("Bookings & Tickets","Stall reservations, entry tickets and digital QR confirmations.")+'<div class="stack"><div class="panel"><div class="panelhead"><h3>Stall bookings</h3><button class="btn sm secondary" data-act="nav" data-tab="explore">Browse Markets</button></div>'+table(["Stall","Market","Price","Status","Booked","Actions"],b.length?b.map(x=>'<tr><td class="tdtitle">'+esc(x.stall_id)+'</td><td>'+esc(marketName(x.market_id))+'</td><td>'+euro(x.price_cents)+'</td><td>'+badge(x.status)+'</td><td>'+dt(x.created_at)+'</td><td><div class="tableactions">'+(["held"].includes(x.status)&&x.user_id===me().id?'<button class="btn sm" data-act="checkout-open" data-kind="booking" data-id="'+x.id+'">Checkout</button>':"")+(['demo_paid','paid'].includes(x.status)?'<button class="btn sm secondary" data-act="ticket" data-kind="booking" data-id="'+x.id+'">View QR</button>':"")+(['held','demo_paid'].includes(x.status)&&x.user_id===me().id?'<button class="btn sm red" data-act="cancel" data-kind="booking" data-id="'+x.id+'">Cancel</button>':"")+'</div></td></tr>'):['<tr><td colspan="6">'+noData("No stall bookings yet","ticket")+'</td></tr>'])+'</div><div class="panel"><div class="panelhead"><h3>Market entry tickets</h3></div>'+table(["Market","Entry fee","Status","Date","Actions"],entries.length?entries.map(x=>'<tr><td class="tdtitle">'+esc(marketName(x.market_id))+'</td><td>'+euro(x.price_cents)+'</td><td>'+badge(x.status)+'</td><td>'+dt(x.created_at)+'</td><td><div class="tableactions">'+(x.status==="pending"?'<button class="btn sm" data-act="checkout-open" data-kind="entry" data-id="'+x.id+'">Pay</button>':"")+(['paid','demo_paid'].includes(x.status)?'<button class="btn sm secondary" data-act="ticket" data-kind="entry" data-id="'+x.id+'">QR Ticket</button>':"")+'</div></td></tr>'):['<tr><td colspan="5">'+noData("No entry tickets yet")+'</td></tr>'])+'</div></div>'
}
function seller(){
 if(!can("seller"))return noData("Activate your seller profile in Settings","store");
 const products=S.ownProducts||[];
 return heading("My Listings","Manage photographs, products, inventory and prices.","new-product")+'<div class="panel">'+table(["Product","Category","Price","Stock","Status","Manage"],products.length?products.map(p=>'<tr><td><div class="userrow">'+(p.photo_url?'<img src="'+esc(p.photo_url)+'" alt="" style="width:54px;height:50px;border-radius:7px">':'<div style="width:54px">'+icon("package")+'</div>')+'<div class="tdtitle">'+esc(p.title)+'<small>'+esc((p.description||"").slice(0,90))+'</small></div></div></td><td>'+esc(p.category)+'</td><td>'+euro(p.price_cents)+'</td><td>'+p.stock+'</td><td>'+badge(p.is_active?"active":"archived")+'</td><td><div class="tableactions"><button class="btn sm secondary" data-act="edit-product" data-id="'+p.id+'">Edit</button><button class="btn sm red" data-act="archive-product" data-id="'+p.id+'">Archive</button></div></td></tr>'):['<tr><td colspan="6">'+noData("No products yet. Start by publishing your first listing.")+'</td></tr>'])+'</div>'
}
function organiser(){
 return heading("Events","Create markets, set dates and entry fees, manage stall layouts.","new-market")+'<div class="panel">'+table(["Event","County","Date & hours","Entry","Published","Actions"],(S.organiserMarkets||[]).map(m=>'<tr><td class="tdtitle">'+esc(m.title)+'<small>'+esc(m.address)+'</small></td><td>'+esc(m.county)+'</td><td>'+dt(m.event_date)+'<small>'+esc(String(m.start_time).slice(0,5))+'–'+esc(String(m.end_time).slice(0,5))+'</small></td><td>'+euro(m.entry_fee_cents)+'</td><td>'+badge(m.published?"published":"draft")+'</td><td><div class="tableactions"><button class="btn sm secondary" data-act="open-market" data-id="'+esc(m.id)+'">Layout</button><button class="btn sm" data-act="edit-market" data-id="'+esc(m.id)+'">Edit</button></div></td></tr>'))+'</div>'
}
function applications(){
 const rows=S.applications||[];
 return heading("Stall Applications","Sellers apply for events; organisers approve or reject requests.")+'<div class="panel">'+table(["Market","Category","Note","Status","Submitted","Action"],rows.length?rows.map(a=>'<tr><td class="tdtitle">'+esc(marketName(a.market_id))+'</td><td>'+esc(a.category)+'</td><td>'+esc(a.note||"—").slice(0,120)+'</td><td>'+badge(a.status)+'</td><td>'+dt(a.created_at)+'</td><td><div class="tableactions">'+(can("organiser")&&a.status==="pending"?'<button class="btn sm" data-act="review-app" data-status="approved" data-id="'+a.id+'">Approve</button><button class="btn sm red" data-act="review-app" data-status="rejected" data-id="'+a.id+'">Reject</button>':"—")+'</div></td></tr>'):['<tr><td colspan="6">'+noData("No stall applications yet","clipboard-check")+'</td></tr>'])+'</div>'+((can("seller"))?'<p class="subtle" style="margin-top:17px">Select a market in Explore Ireland to submit a new stall application.</p>':"")
}
function orders(){
 const rows=S.orders||[];
 return '<section class="panel"><div class="panelhead"><h3>Purchase & Sales History</h3><span class="badge">'+rows.length+' records</span></div>'+table(["Order ID","Product","Quantity","Amount","Status","Date","Actions"],rows.length?rows.map(o=>'<tr><td class="tdtitle">'+esc(o.id.slice(0,8))+'</td><td>'+esc(S.products.find(p=>p.id===o.product_id)?.title||o.product_id.slice(0,8))+'</td><td>'+o.quantity+'</td><td>'+euro(o.subtotal_cents)+'</td><td>'+badge(o.status)+'</td><td>'+dt(o.created_at)+'</td><td><div class="tableactions">'+(o.buyer_id===me().id&&o.status==="pending"?'<button class="btn sm" data-act="checkout-open" data-kind="order" data-id="'+o.id+'">Pay</button>':"")+(o.buyer_id===me().id&&o.status==="pending"?'<button class="btn sm red" data-act="cancel" data-kind="order" data-id="'+o.id+'">Cancel</button>':"")+'</div></td></tr>'):['<tr><td colspan="7">'+noData("No purchase or sale history yet")+'</td></tr>'])+'</section>';
}
function loyalty(){
 const l=S.loyalty||{points:0,ledger:[],card:"—"};
 return heading("Loyalty Rewards","Earn points buying and selling. Redeem them towards purchases, stalls and entry fees.")+'<div class="split"><div class="card-balance"><h3>Your digital loyalty card</h3><strong>'+n(l.points)+' <span style="font-size:17px">pts</span></strong><small>'+esc(l.card)+'</small><p style="font-size:11px;color:#d8f9e7">1 point = €0.01 towards qualifying sample checkout. Points accrue after confirmed payments.</p></div><div class="panel pad"><h3>How rewards work</h3><p class="subtle" style="line-height:2">Earn <b>1 point for every €1 spent</b> when buying, booking a stall or purchasing entry. Sellers earn <b>1 point per €1 sold</b>. Redeem points on eligible checkouts. Refunds reverse earned and redeemed points.</p><button class="btn secondary" data-act="nav" data-tab="shop">Browse Products</button></div></div><section class="panel" style="margin-top:18px"><div class="panelhead"><h3>Points Ledger</h3></div>'+table(["Reason","Reference","Date","Points"],(l.ledger||[]).length?l.ledger.map(x=>'<tr><td class="tdtitle">'+esc(x.reason)+'</td><td><small>'+esc(x.reference)+'</small></td><td>'+dt(x.created_at)+'</td><td><strong style="color:'+(x.delta>=0?"#008d55":"#c05757")+'">'+(x.delta>=0?"+":"")+x.delta+'</strong></td></tr>'):['<tr><td colspan="4">'+noData("No loyalty transactions yet. Complete a sandbox purchase to see points.")+'</td></tr>'])+'</section>'
}
function inbox(){
 const list=S.messages||[],groups=new Map();
 list.forEach(m=>{const other=m.sender_id===me().id?m.recipient_id:m.sender_id;if(!groups.has(other))groups.set(other,[]);groups.get(other).push(m)});
 const ids=Array.from(groups.keys());if(!S.activeChat||!groups.has(S.activeChat))S.activeChat=ids[0]||null;
 const thread=groups.get(S.activeChat)||[];
 return heading("Messages","Real buyer–seller messaging stored in Supabase.")+'<section class="panel msg-layout"><aside class="msg-aside">'+(ids.length?ids.map((id,i)=>'<button class="msg-item '+(S.activeChat===id?"active":"")+'" data-act="open-chat" data-id="'+id+'">'+avatar("U "+String(i+1))+'<div><b>Contact '+esc(id.slice(0,7))+'</b><div class="subtle">'+groups.get(id).length+' messages</div></div></button>').join(""):noData("No conversations yet"))+'</aside><div class="msg-list"><div class="panelhead"><h3>'+(S.activeChat?"Conversation with "+esc(S.activeChat.slice(0,8)):"Choose a conversation")+'</h3></div><div class="msg-thread">'+(thread.length?thread.map(m=>'<div class="bubble '+(m.sender_id===me().id?"mine":"")+'">'+esc(m.body)+'<time>'+esc(when(m.created_at))+'</time></div>').join(""):noData("Message a seller from a product listing to begin."))+'</div>'+(S.activeChat?'<form class="msg-compose" data-form="message"><input type="hidden" name="recipient_id" value="'+S.activeChat+'"><input class="textinput" name="body" maxlength="2000" required placeholder="Write your message…"><button class="btn">'+icon("send",17)+' Send</button></form>':"")+'</div></section>'
}
function payments(){
 if(me().role==="admin"){
 const rows=S.payments||[];
 return heading("Payments & Refunds","All staging transactions. Stripe is disabled until test secrets are configured.")+'<div class="notice">Sandbox settlements are marked DEMO PAID and do not transfer money. Only Stripe TEST keys will enable real test checkout; no live keys are accepted.</div><section class="panel">'+table(["Kind","Reference","Amount","Status","Date","Action"],rows.length?rows.map(p=>'<tr><td class="tdtitle">'+esc(p.kind)+'</td><td>'+esc(p.id.slice(0,8))+'</td><td>'+euro(p.amount_cents)+'</td><td>'+badge(p.status)+'</td><td>'+dt(p.created_at)+'</td><td>'+(['demo_paid','paid'].includes(p.status)?'<button class="btn sm red" data-act="admin-refund" data-kind="'+p.kind+'" data-id="'+p.id+'">Refund</button>':"—")+'</td></tr>'):['<tr><td colspan="6">'+noData("No transactions")+'</td></tr>'])+'</section><section class="panel" style="margin-top:17px"><div class="panelhead"><h3>Loyalty Audit</h3><button class="btn sm secondary" data-act="loyalty-audit">View balances & transactions</button></div><p class="subtle" style="padding:0 22px 15px">Review points earned, redeemed and reversed by every account.</p></section>';
 }
 return heading("Payments & Order History","Review your transactions and sales.")+orders();
}
function users(){
 if(me().role==="organiser")return heading("Team & Organiser","Your account can manage event inventory, applications, bookings and check-ins.")+'<div class="panel pad"><h3>Team permissions</h3><p class="subtle">Only platform administrators can assign organiser roles. Contact the admin to add additional organisers.</p></div>';
 if(!can("admin"))return noData("Only admin can manage accounts");
 return heading("Users & Team","Manage all accounts, roles, and access.")+'<section class="panel">'+table(["User","Email","Role","County","Joined","Status","Controls"],S.users.map(x=>'<tr><td><div class="userrow">'+avatar(x.full_name)+'<div class="tdtitle">'+esc(x.full_name)+'<small>@'+esc(x.username)+'</small></div></div></td><td>'+esc(x.email)+'</td><td>'+badge(x.role)+'</td><td>'+esc(x.county)+'</td><td>'+dt(x.created_at)+'</td><td>'+badge(x.is_active?"active":"disabled")+'</td><td><button class="btn sm secondary" data-act="admin-user" data-id="'+x.id+'">Edit</button></td></tr>'))+'</section>'
}
function scan(){return heading("QR Check-in","Scan or paste digital entry and stall QR tickets. Single-use validation is enforced.")+'<div class="splitthird"><div class="panel pad"><h3>Validate a ticket</h3><p class="subtle">Only the owning organiser or platform administrator can check in a ticket.</p><form data-form="scan" class="formgrid"><label class="wide">QR code or token<input class="textinput" name="token" id="scanValue" placeholder="M32:booking:…" required></label><button class="btn wide">Validate & Check in</button></form><button style="margin-top:14px" class="btn secondary" data-act="open-scanner">'+icon("camera")+' Use Camera</button><video id="scanVideo" autoplay playsinline muted style="display:none;width:100%;margin-top:15px;border-radius:8px"></video></div><div class="panel pad"><h3>Check-in rules</h3><p class="subtle" style="line-height:2">A QR ticket must be associated with a paid or DEMO PAID booking or entry. Tickets can be used once only. Already-scanned tokens are rejected in the backend. Demo tickets are visibly labelled SAMPLE.</p></div></div>'}
function settings(){return heading("Settings","Configure your staging environment and account.")+'<div class="split"><div class="panel pad"><h3>Payment integration</h3><p class="subtle">Stripe TEST mode: '+(S.config.stripe_test_ready?"Configured":"Not configured")+'</p><div class="notice">Do not paste secret keys into this site. Add Stripe test secrets in Supabase Edge Function secrets. No live charges are allowed.</div><div class="stack"><a class="btn secondary" target="_blank" rel="noopener" href="https://dashboard.stripe.com/test/apikeys">Stripe TEST API Keys '+icon("external-link")+'</a><a class="btn secondary" target="_blank" rel="noopener" href="https://supabase.com/dashboard/project/ygrfqehiwhmkfczosuoo/settings/functions">Supabase Function Secrets '+icon("external-link")+'</a><a class="btn secondary" target="_blank" rel="noopener" href="https://dashboard.stripe.com/test/webhooks">Stripe TEST Webhooks '+icon("external-link")+'</a><div class="subtle">Webhook endpoint: https://ygrfqehiwhmkfczosuoo.supabase.co/functions/v1/market32-v2/api/stripe/webhook</div></div></div><div class="panel pad"><h3>Environment</h3><p class="subtle" style="line-height:2">Supabase · EU West 1<br>Full 32-county mock database<br>Application status: staging<br>Money movement: disabled until Stripe TEST configured<br>Role access: server-enforced</p><button class="btn secondary" data-act="refresh">Refresh all data</button></div></div>'}
function profile(){return heading("My Profile","Manage your membership card and personal details.")+'<div class="split"><div class="panel pad"><div class="inline">'+avatar(me().full_name)+'<div><h3 style="margin:0">'+esc(me().full_name)+'</h3><span class="badge">'+esc(me().role)+'</span></div></div><form class="formgrid" style="margin-top:20px" data-form="profile"><label>Full name<input class="textinput" name="full_name" value="'+esc(me().full_name)+'" required></label><label>County<select name="county">'+countyOptions(me().county)+'</select></label><label>City<input class="textinput" name="city" value="'+esc(me().city)+'"></label><label class="wide">Bio<textarea name="bio">'+esc(me().bio)+'</textarea></label><button class="btn wide">Save profile</button></form></div><div class="panel pad"><h3>Account overview</h3><div class="summaryline"><span>Username</span><b>@'+esc(me().username)+'</b></div><div class="summaryline"><span>Role</span><b>'+esc(me().role)+'</b></div><div class="summaryline"><span>Digital loyalty card</span><b>M32-'+esc(me().id.slice(0,8).toUpperCase())+'</b></div>'+(me().role==="buyer"?'<button class="btn full" style="margin-top:19px" data-act="become-seller">Enable Seller Account</button>':"")+'</div></div>'}
function render(){
 if(!S.me)$("#app").innerHTML=renderLogin();else{
 let body;
 switch(S.tab){case"dashboard":body=dashboard();break;case"explore":body=explore();break;case"market":body=marketPage();break;case"events":body=organiser();break;case"applications":body=applications();break;case"bookings":body=bookings();break;case"shop":body=shop();break;case"seller":body=seller();break;case"inbox":body=inbox();break;case"loyalty":body=loyalty();break;case"payments":body=payments();break;case"users":body=users();break;case"scan":body=scan();break;case"settings":body=settings();break;case"profile":body=profile();break;default:body=dashboard()}
 $("#app").innerHTML=shell(body);
 if(S.tab==="explore")setTimeout(mapInit,90);
 if(S.tab==="market"&&S.editLayout)setTimeout(attachDrag,0);
 }
 icons();$("#modalLayer").innerHTML=S.modal||"";icons();
}
function icons(){if(window.lucide&&typeof window.lucide.createIcons==="function")window.lucide.createIcons()}
function mapInit(){
 const el=$("#irelandMap");if(!el||!window.L)return;
 if(S.map){try{S.map.remove()}catch(e){}S.map=null}
 S.map=L.map(el,{scrollWheelZoom:false}).setView([53.45,-7.45],7);
 L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{attribution:"© OpenStreetMap",maxZoom:18}).addTo(S.map);
 S.markets.filter(m=>!S.county||m.county===S.county).filter(m=>!S.q||[m.title,m.county,m.city,m.kind].join(" ").toLowerCase().includes(S.q.toLowerCase())).forEach(m=>{
 if(!Number.isFinite(Number(m.lat))||!Number.isFinite(Number(m.lng)))return;
 const mk=L.marker([Number(m.lat),Number(m.lng)]).addTo(S.map).bindPopup("<b>"+esc(m.title)+"</b><br>"+esc(m.county)+"<br><button style='border:0;color:#008e4c;cursor:pointer' data-map-market='"+esc(m.id)+"'>View stalls →</button>");
 mk.on("popupopen",()=>{const b=$("[data-map-market]",mk.getPopup().getElement());if(b)b.onclick=()=>openMarket(m.id)});
 });
 setTimeout(()=>S.map&&S.map.invalidateSize(),200);
}
async function page(tab){
 S.tab=tab;S.editLayout=false;S.selectedStall=null;
 try{
 if(tab==="dashboard"){const [d,a,b]=await Promise.all([api("/dashboard"),api("/applications"),api("/bookings")]);S.dash=d;S.applications=a.applications||[];S.bookings=b.bookings||[];if(can("admin"))S.payments=(await api("/admin/payments")).payments||[];}
 if(tab==="bookings"){const [b,e]=await Promise.all([api("/bookings"),api("/entries")]);S.bookings=b.bookings||[];S.entries=e.entries||[]}
 if(tab==="seller"){S.ownProducts=(await api("/seller/products")).products||[]}
 if(tab==="events"){S.organiserMarkets=(await api("/organiser/markets")).markets||[]}
 if(tab==="applications"){S.applications=(await api("/applications")).applications||[]}
 if(tab==="inbox"){S.messages=(await api("/messages")).messages||[]}
 if(tab==="loyalty"){S.loyalty=await api("/loyalty")}
 if(tab==="payments"){if(can("admin"))S.payments=(await api("/admin/payments")).payments||[];else S.orders=(await api("/orders")).orders||[]}
 if(tab==="users"&&can("admin"))S.users=(await api("/admin/users")).users||[];
 }catch(e){toast(e.message,true)}
 render();window.scrollTo(0,0);
}
async function openMarket(id){try{const r=await api("/markets/"+encodeURIComponent(id));S.market=r;S.viewMarket=id;S.selectedStall=null;S.editLayout=false;S.tab="market";render();window.scrollTo(0,0)}catch(e){toast(e.message,true)}}
function modal(title,body){S.modal='<div class="modalback" data-act="close-modal"><div class="modal" data-no-close="1"><div class="modalhead"><h2>'+title+'</h2><button class="roundicon" data-act="close-modal">'+icon("x",20)+'</button></div><div class="modalbody">'+body+'</div></div></div>';$("#modalLayer").innerHTML=S.modal;icons()}
function closeModal(){S.modal=null;$("#modalLayer").innerHTML=""}
function formVal(f){const v={};new FormData(f).forEach((x,k)=>{if(!(x instanceof File))v[k]=x});return v}
function marketForm(m){
 const d=m||{},c=S.counties;
 modal(m?"Edit Market Event":"Create New Market Event",'<form data-form="event" data-id="'+esc(d.id||"")+'" class="formgrid"><label class="wide">Event name<input class="textinput" name="title" required value="'+esc(d.title||"")+'"></label><label>County<select name="county">'+countyOptions(d.county||"Dublin")+'</select></label><label>Town / City<input class="textinput" name="city" required value="'+esc(d.city||"Dublin")+'"></label><label class="wide">Address<input class="textinput" name="address" required value="'+esc(d.address||"")+'"></label><label>Date<input type="date" name="event_date" required value="'+esc(d.event_date||new Date(Date.now()+86400000*8).toISOString().slice(0,10))+'"></label><label>Event type<select name="kind">'+["car-boot","farmers","traditional","craft","flea"].map(x=>'<option value="'+x+'" '+(d.kind===x?"selected":"")+'>'+x+'</option>').join("")+'</select></label><label>Opening time<input type="time" name="start_time" required value="'+esc(String(d.start_time||"09:00").slice(0,5))+'"></label><label>Closing time<input type="time" name="end_time" required value="'+esc(String(d.end_time||"16:00").slice(0,5))+'"></label><label>Entry fee (€)<input type="number" name="entry_eur" step="0.01" min="0" value="'+n(d.entry_fee_cents)/100+'"></label><label>Latitude<input type="number" name="lat" step="any" value="'+(d.lat||53.35)+'"></label><label>Longitude<input type="number" name="lng" step="any" value="'+(d.lng||-6.26)+'"></label><label class="wide">Description<textarea name="description">'+esc(d.description||"")+'</textarea></label><label class="wide">Cover image URL<input class="textinput" name="cover_url" value="'+esc(d.cover_url||"")+'"></label><button class="btn wide">Save Event</button></form>');
}
function productForm(p){
 const d=p||{};
 modal(p?"Edit Marketplace Listing":"Create Product Listing",'<form class="formgrid" data-form="product" data-id="'+esc(d.id||"")+'"><label class="wide">Product name<input class="textinput" name="title" required minlength="3" value="'+esc(d.title||"")+'"></label><label>Category<input class="textinput" name="category" value="'+esc(d.category||"Crafts")+'"></label><label>Price (€)<input type="number" name="price_eur" min=".50" step=".01" required value="'+(n(d.price_cents)/100||15)+'"></label><label>Quantity available<input type="number" name="stock" min="0" required value="'+(d.stock??1)+'"></label><label>Market<select name="market_id"><option value="">Not tied to an event</option>'+S.markets.map(m=>'<option value="'+esc(m.id)+'" '+(d.market_id===m.id?"selected":"")+'>'+esc(m.title)+'</option>').join("")+'</select></label><label class="wide">Upload product photograph (JPG/PNG/WEBP, 5MB)<input type="file" id="productPhoto" accept="image/jpeg,image/png,image/webp"></label><label class="wide">Image URL (optional)<input class="textinput" name="photo_url" value="'+esc(d.photo_url||"")+'"></label><label class="wide">Description<textarea name="description">'+esc(d.description||"")+'</textarea></label><button class="btn wide">Save Product</button></form>');
}
function appForm(mid){modal("Apply for a Stall",'<form data-form="application" class="formgrid"><label class="wide">Market<select name="market_id">'+S.markets.map(m=>'<option value="'+esc(m.id)+'" '+(m.id===mid?"selected":"")+'>'+esc(m.title)+'</option>').join("")+'</select></label><label class="wide">Products / Category<input class="textinput" name="category" required placeholder="e.g. Vintage jewellery"></label><label class="wide">Message to organiser<textarea name="note" placeholder="What will you be selling?"></textarea></label><button class="btn wide">Submit Application</button></form>')}
function stallForm(st){
 const x=st||{},isedit=Boolean(st);
 modal(isedit?"Edit Stall "+esc(x.code):"Add Numbered Stall",'<form class="formgrid" data-form="stall" data-id="'+esc(x.id||"")+'"><label>Stall code<input class="textinput" name="code" required pattern="[A-Za-z][0-9]{2,3}" value="'+esc(x.code||"D01")+'"></label><label>Stall fee (€)<input type="number" name="price_eur" step=".01" min="0" value="'+(n(x.price_cents)/100||10)+'"></label>'+["x","y","w","h"].map(k=>'<label>'+k.toUpperCase()+' (%)<input type="number" min="0" max="100" step=".5" name="'+k+'" value="'+(x[k]??(k==="w"?10:k==="h"?12:25))+'"></label>').join("")+(isedit?'<label class="wide"><input name="disabled" type="checkbox" '+(x.disabled?"checked":"")+'> Disable this stall</label>':"")+'<button class="btn wide">Save Stall</button></form>');
}
function paymentModal(kind,record){
 const price=n(kind==="order"?record.subtotal_cents:record.price_cents),points=n(record.points_spent),id=record.id;
 modal("Checkout · "+esc(kind),'<div class="summaryline"><span>Subtotal</span><b>'+euro(price)+'</b></div><div class="summaryline"><span>Loyalty selected</span><b>-'+euro(points)+'</b></div><div class="summaryline"><span>Amount due</span><b>'+euro(Math.max(0,price-points))+'</b></div><div class="notice">This is a STAGING platform with mock events. Demo settlement charges nothing. Stripe Checkout is enabled only with Stripe TEST keys.</div><div class="stack" style="margin-top:19px"><button class="btn gold full" data-act="demo-pay" data-kind="'+kind+'" data-id="'+id+'">'+icon("check-circle")+' Complete SANDBOX payment (no charge)</button><button class="btn full" data-act="stripe-pay" data-kind="'+kind+'" data-id="'+id+'" '+(!S.config.stripe_test_ready?"disabled":"")+'>'+icon("credit-card")+' Pay with Stripe TEST Mode</button>'+(kind==="booking"?'<button class="btn secondary full" data-act="booking-points" data-id="'+id+'">Apply loyalty points</button>':"")+'</div>');
}
function ticketModal(t){
 const label=t.sample?"DEMO / SAMPLE TICKET · NO REAL ENTRY":"Confirmed Ticket";
 modal("Digital QR Confirmation",'<div style="text-align:center"><span class="badge '+(t.sample?"pending":"")+'">'+label+'</span><h3 style="font:700 23px Outfit">'+esc(marketName(t.market_id))+'</h3><p class="subtle">Ticket for '+esc(t.kind)+' · '+(t.stall_id?"Stall "+esc(t.stall_id):"Market entry")+'</p><div id="qrCanvas" style="margin:24px auto;width:208px;height:208px;display:grid;place-items:center;border:1px solid #e2e8ec;border-radius:11px"></div><div style="background:#f4f7f6;padding:12px;border-radius:8px;font:11px monospace;overflow-wrap:anywhere">'+esc(t.token)+'</div><p class="subtle" style="margin-top:13px">'+(t.checked_in_at?"Already checked in":"Show to the event organiser for one-time validation")+'</p></div>');
 if(window.QRCode)new QRCode($("#qrCanvas"),{text:t.token,width:170,height:170,colorDark:"#184536",colorLight:"#fff",correctLevel:QRCode.CorrectLevel.M});
 else $("#qrCanvas").textContent="QR library unavailable — use the token below.";
}
function adminUserForm(u){modal("Account Permissions",'<div class="subtle">'+esc(u.full_name)+" · @"+esc(u.username)+'</div><form class="formgrid" data-form="admin-user" data-id="'+u.id+'" style="margin-top:18px"><label class="wide">Role<select name="role">'+["buyer","seller","organiser","admin"].map(x=>'<option value="'+x+'" '+(x===u.role?"selected":"")+'>'+x+'</option>').join("")+'</select></label><label class="wide"><input type="checkbox" name="is_active" '+(u.is_active?"checked":"")+'> Active account</label><button class="btn wide">Save Permissions</button></form>')}
async function refreshTab(){try{await publicRefresh();if(S.me){S.me=(await api("/me")).user;await page(S.tab)}else render()}catch(e){toast(e.message,true)}}
async function fulfill(kind,id,type){
 try{const r=await api("/"+(kind==="booking"?"bookings":kind==="order"?"orders":"entries")+"/"+id+"/"+(type==="demo"?"demo-pay":"checkout"),{method:"POST"});
 if(type==="demo"){toast("SANDBOX "+kind+" confirmed. No money was charged.");closeModal();await publicRefresh();await page(kind==="order"?"payments":"bookings")}
 else if(r.url){location.href=r.url}
 }catch(e){toast(e.message,true)}
}
async function perform(action,node){
 const id=node.dataset.id,kind=node.dataset.kind;
 try{
 switch(action){
 case"nav":closeModal();await page(node.dataset.tab);$("#sidebar")?.classList.remove("open");break;
 case"menu":$("#sidebar")?.classList.toggle("open");break;
 case"logout":S.me=null;S.token="";sessionStorage.removeItem("m32v2_token");S.tab="dashboard";render();break;
 case"auth-switch":S.register=!S.register;S.loginErr="";render();break;
 case"demo-role":$("#authUser").value=node.dataset.role;$("#authPass").value=demoPassword;$("#authPass").focus();break;
 case"close-modal":closeModal();break;
 case"refresh":await refreshTab();toast("Data refreshed from Supabase");break;
 case"open-market":closeModal();await openMarket(id);break;
 case"select-stall":if(S.editLayout)break;S.selectedStall=id;render();break;
 case"toggle-editor":S.editLayout=!S.editLayout;render();break;
 case"layout-stall":if(S.editLayout){const st=S.market.stalls.find(x=>x.id===id);if(st)stallForm(st)}break;
 case"hold-stall":if(!S.selectedStall)return;const h=await api("/bookings/hold",{method:"POST",body:{stall_id:S.selectedStall}});toast("Stall held for 10 minutes");S.selectedStall=null;await openMarket(S.viewMarket);paymentModal("booking",h.booking);break;
 case"checkout-open":{const list=kind==="order"?S.orders:kind==="booking"?S.bookings:S.entries;let r=list.find(x=>x.id===id);if(!r){const path=kind==="order"?"/orders":kind==="entry"?"/entries":"/bookings";r=(await api(path))[kind==="order"?"orders":kind==="entry"?"entries":"bookings"].find(x=>x.id===id)}if(r)paymentModal(kind,r);break;}
 case"demo-pay":await fulfill(kind,id,"demo");break;
 case"stripe-pay":await fulfill(kind,id,"stripe");break;
 case"cancel":{if(!confirm("Cancel this unpaid or sandbox reservation?"))break;await api("/"+(kind==="booking"?"bookings":kind==="order"?"orders":"entries")+"/"+id+"/cancel",{method:"POST"});toast("Cancellation saved");await refreshTab();break;}
 case"buy-entry":{const m=S.markets.find(x=>x.id===id),points=await api("/loyalty");modal("Market Entry · "+esc(m?.title||""),'<form class="formgrid" data-form="entry" data-id="'+esc(id)+'"><div class="wide summaryline"><span>Entry fee</span><b>'+euro(m?.entry_fee_cents||0)+'</b></div><label class="wide">Use loyalty points (available '+points.points+')<input type="number" name="points" value="0" min="0" max="'+Math.min(points.points,m?.entry_fee_cents||0)+'"></label><div class="wide notice">1 point = €0.01. Test checkout or demo settlement follows; no real money is charged in demo.</div><button class="btn wide">Reserve Entry Ticket</button></form>');break;}
 case"ticket":ticketModal(await api("/tickets/"+kind+"/"+id));break;
 case"new-market":marketForm();break;
 case"edit-market":marketForm(S.markets.find(x=>x.id===id));break;
 case"new-product":productForm();break;
 case"edit-product":productForm(S.ownProducts.find(x=>x.id===id));break;
 case"archive-product":if(confirm("Archive this listing?")){await api("/seller/products/"+id,{method:"DELETE"});toast("Listing archived");await refreshTab()}break;
 case"new-stall":stallForm(null);break;
 case"apply":appForm(id);break;
 case"review-app":await api("/applications/"+id,{method:"PATCH",body:{status:node.dataset.status}});toast("Application "+node.dataset.status);await refreshTab();break;
 case"pending-tab":S.pendingTab=node.dataset.tab;render();break;
 case"report":S.report=node.dataset.kind;render();break;
 case"buy-product":{const product=S.products.find(x=>x.id===id);if(!product)break;modal("Buy "+esc(product.title),'<form data-form="order" data-id="'+id+'" class="formgrid"><label>Quantity<input type="number" name="quantity" min="1" max="'+product.stock+'" value="1" required></label><label>Loyalty points to redeem<input type="number" name="points" min="0" max="'+product.price_cents+'" value="0"></label><div class="wide notice">Your order reserves stock for 15 minutes. Checkout will be in DEMO or Stripe TEST Mode.</div><button class="btn wide">Continue to checkout</button></form>');break;}
 case"chat-product":S.activeChat=node.dataset.seller;modal("Message Seller",'<form data-form="contact" class="formgrid"><input type="hidden" name="recipient_id" value="'+esc(node.dataset.seller)+'"><input type="hidden" name="product_id" value="'+id+'"><label class="wide">Message<textarea name="body" required maxlength="2000" placeholder="Hi! Is this item still available?"></textarea></label><button class="btn wide">Send Message</button></form>');break;
 case"open-chat":S.activeChat=id;render();break;
 case"admin-user":adminUserForm(S.users.find(x=>x.id===id));break;
 case"loyalty-audit":{const report=await api("/admin/loyalty");modal("Platform Loyalty Audit",'<div class="subtle">Total ledger records: '+report.ledger.length+'</div>'+table(["User","Reason","Points","Date"],report.ledger.slice(0,80).map(x=>'<tr><td>'+esc(x.user_name)+'</td><td>'+esc(x.reason)+'</td><td><b>'+(x.delta>=0?"+":"")+x.delta+'</b></td><td>'+dt(x.created_at)+'</td></tr>')));break;}
 case"admin-refund":if(confirm("Refund this "+kind+" transaction? In Stripe TEST mode this may issue a TEST refund.")){await api("/admin/refunds/"+kind+"/"+id,{method:"POST"});toast("Refund processed");await refreshTab()}break;
 case"become-seller":{const r=await api("/me/become-seller",{method:"POST"});S.me=r.user;toast("Seller tools enabled");await page("seller");break;}
 case"open-scanner":await scanner();break;
 case"scan-open":await page("scan");break;
 case"booking-points":{const l=await api("/loyalty");modal("Redeem Stall Loyalty",'<form data-form="booking-points" data-id="'+id+'" class="formgrid"><div class="wide">Available points: <strong>'+l.points+'</strong> (1 pt = €0.01)</div><label class="wide">Points to redeem<input type="number" name="points" min="0" max="'+Math.min(l.points,1000)+'" value="0"></label><button class="btn wide">Apply Points</button></form>');break;}
 default:break;
 }
 }catch(e){toast(e.message,true)}
}
async function scanner(){
 const el=$("#scanVideo");if(!el){toast("Open QR Check-in first",true);return}
 if(!window.BarcodeDetector||!navigator.mediaDevices?.getUserMedia){toast("Camera scanner unavailable in this browser. Paste the QR token.",true);return}
 try{const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:"environment"}});el.srcObject=stream;el.style.display="block";await el.play();const d=new BarcodeDetector({formats:["qr_code"]});let attempts=0;
 async function tick(){if(!$("#scanVideo")||attempts++>140){stream.getTracks().forEach(t=>t.stop());return}try{const r=await d.detect(el);if(r.length){$("#scanValue").value=r[0].rawValue;stream.getTracks().forEach(t=>t.stop());el.style.display="none";toast("QR read. Validate the ticket to check in.");return}}catch(e){}setTimeout(tick,300)}tick()
 }catch(e){toast("Cannot use camera: "+e.message,true)}
}
function attachDrag(){
 const floor=$("#stallFloor");if(!floor)return;
 $$(".stall.editor",floor).forEach(st=>{
  st.addEventListener("pointerdown",e=>{
   if(e.button!==0)return;e.preventDefault();const id=st.dataset.id,box=floor.getBoundingClientRect(),sx=e.clientX,sy=e.clientY,ox=parseFloat(st.style.left)||0,oy=parseFloat(st.style.top)||0;
   st.classList.add("dragging");st.setPointerCapture(e.pointerId);let moved=false;
   const move=v=>{const dx=(v.clientX-sx)/box.width*100,dy=(v.clientY-sy)/box.height*100;if(Math.abs(dx)>1||Math.abs(dy)>1)moved=true;st.style.left=Math.max(0,Math.min(100-n(st.style.width.replace("%","")),ox+dx))+"%";st.style.top=Math.max(0,Math.min(100-n(st.style.height.replace("%","")),oy+dy))+"%"};
   const up=async v=>{st.removeEventListener("pointermove",move);st.removeEventListener("pointerup",up);st.classList.remove("dragging");if(!moved){const o=S.market.stalls.find(x=>x.id===id);if(o)stallForm(o);return}try{const r=await api("/organiser/stalls/"+encodeURIComponent(id),{method:"PATCH",body:{x:parseFloat(st.style.left),y:parseFloat(st.style.top)}});const idx=S.market.stalls.findIndex(x=>x.id===id);if(idx>=0)S.market.stalls[idx]=r.stall;toast("Stall position saved to Supabase")}catch(e){toast(e.message,true);await openMarket(S.viewMarket)}};
   st.addEventListener("pointermove",move);st.addEventListener("pointerup",up);
  });
 });
}
document.addEventListener("click",e=>{const a=e.target.closest("[data-act]");if(a){if(a.dataset.act==="close-modal"&&e.target!==a&&!e.target.closest("button[data-act=close-modal]"))return;perform(a.dataset.act,a)}});
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&S.modal)closeModal()});
document.addEventListener("change",e=>{if(e.target.id==="countyFilter"){S.county=e.target.value;render()}});
document.addEventListener("input",e=>{if(e.target.id==="marketFilter"){S.q=e.target.value;const pos=e.target.selectionStart;render();const el=$("#marketFilter");if(el){el.focus();el.setSelectionRange(pos,pos)}}else if(e.target.id==="productFilter"){S.shopq=e.target.value;const pos=e.target.selectionStart;render();const el=$("#productFilter");if(el){el.focus();el.setSelectionRange(pos,pos)}}});
document.addEventListener("keydown",e=>{if(e.key==="Enter"&&e.target.id==="globalSearch"){e.preventDefault();S.q=e.target.value;page("explore")}});
document.addEventListener("submit",async e=>{
 const f=e.target.closest("form[data-form]");if(!f)return;e.preventDefault();const type=f.dataset.form,b=formVal(f);const btn=$("button[type=submit],button:not([type])",f);if(btn)btn.disabled=true;
 try{
 if(type==="login"||type==="register"){const result=await api("/auth/"+type,{method:"POST",body:{username:$("#authUser").value,password:$("#authPass").value,email:$("#authEmail")?.value,county:$("#authCounty")?.value,full_name:$("#authFull")?.value}});S.token=result.token;sessionStorage.setItem("m32v2_token",S.token);S.me=result.user;S.loginErr="";await page("dashboard")}
 else if(type==="event"){const d={title:b.title,county:b.county,city:b.city,address:b.address,event_date:b.event_date,start_time:b.start_time,end_time:b.end_time,kind:b.kind,entry_fee_cents:Math.round(Number(b.entry_eur)*100),lat:Number(b.lat),lng:Number(b.lng),description:b.description,cover_url:b.cover_url};const id=f.dataset.id;await api("/organiser/markets"+(id?"/"+id:""),{method:id?"PATCH":"POST",body:d});toast(id?"Event updated":"New market created");closeModal();await publicRefresh();await page("events")}
 else if(type==="product"){let url=b.photo_url||"";const file=$("#productPhoto")?.files[0];if(file&&file.size){const r=await api("/seller/photo",{method:"POST",binary:file});url=r.url}const payload={title:b.title,category:b.category,price_cents:Math.round(Number(b.price_eur)*100),stock:Number(b.stock),market_id:b.market_id||null,description:b.description,photo_url:url};const id=f.dataset.id;await api("/seller/products"+(id?"/"+id:""),{method:id?"PATCH":"POST",body:payload});toast(id?"Product updated":"Product published");closeModal();await publicRefresh();await page("seller")}
 else if(type==="stall"){const d={code:b.code,price_cents:Math.round(Number(b.price_eur)*100),x:n(b.x),y:n(b.y),w:n(b.w),h:n(b.h)};if(f.dataset.id){d.disabled=f.querySelector('[name="disabled"]')?.checked||false;await api("/organiser/stalls/"+f.dataset.id,{method:"PATCH",body:d})}else await api("/organiser/markets/"+S.viewMarket+"/stalls",{method:"POST",body:d});toast("Stall layout saved");closeModal();await openMarket(S.viewMarket)}
 else if(type==="application"){await api("/applications",{method:"POST",body:b});toast("Stall application submitted");closeModal();await page("applications")}
 else if(type==="order"){const r=await api("/orders",{method:"POST",body:{product_id:f.dataset.id,quantity:Number(b.quantity),points:Number(b.points)}});toast("Order created · stock reserved");closeModal();paymentModal("order",r.order)}
 else if(type==="entry"){const r=await api("/entries",{method:"POST",body:{market_id:f.dataset.id,points:Number(b.points)}});closeModal();if(r.entry.status==="paid"){toast("Free entry ticket created");await page("bookings")}else paymentModal("entry",r.entry)}
 else if(type==="message"||type==="contact"){await api("/messages",{method:"POST",body:b});toast("Message delivered");closeModal();await page("inbox")}
 else if(type==="profile"){const r=await api("/me",{method:"PATCH",body:b});S.me=r.user;toast("Profile saved");await page("profile")}
 else if(type==="admin-user"){await api("/admin/users/"+f.dataset.id,{method:"PATCH",body:{role:b.role,is_active:!!f.querySelector('[name="is_active"]')?.checked}});toast("Account permissions updated");closeModal();await page("users")}
 else if(type==="scan"){const r=await api("/tickets/scan",{method:"POST",body:b});toast("Ticket validated"+(r.sample?" (SAMPLE demo)":""));f.reset()}
 else if(type==="booking-points"){const r=await api("/bookings/"+f.dataset.id+"/points",{method:"PATCH",body:{points:Number(b.points)}});toast("Points applied");paymentModal("booking",r.booking)}
 }catch(err){S.loginErr=err.message;toast(err.message,true);if(type==="login"||type==="register")render()}
 finally{if(btn)btn.disabled=false}
});
window.addEventListener("unhandledrejection",e=>toast("Error: "+String(e.reason?.message||e.reason),true));
init();
})();
