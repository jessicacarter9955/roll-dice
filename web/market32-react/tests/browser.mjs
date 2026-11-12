import assert from 'node:assert/strict';import {chromium} from 'playwright';import {mkdirSync} from 'node:fs';
const base='http://127.0.0.1:4173/';mkdirSync('market32-shadcn-screens',{recursive:true});
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
let passed=0;
try{for(const v of [{name:'desktop',width:1440,height:900},{name:'mobile',width:390,height:844}]){
 const ctx=await browser.newContext({viewport:{width:v.width,height:v.height},deviceScaleFactor:1});
 const page=await ctx.newPage();let errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base,{waitUntil:'domcontentloaded',timeout:40000});
 await page.getByText('Welcome to Market32').waitFor({timeout:20000});
 await page.screenshot({path:'market32-shadcn-screens/'+v.name+'-login.png',fullPage:true});
 await page.getByRole('button',{name:'Enter the dashboard'}).click();
 await page.getByText('Overview dashboard').waitFor({timeout:40000});
 await page.locator('.bg-hero').first().waitFor({timeout:10000});
 assert.ok(await page.getByText('Pending summary').count()>0,'summary visible');
 const bounds=await page.locator('.app-bg').first().boundingBox();assert.ok(bounds&&Math.abs(bounds.x)<=2&&bounds.width>=v.width-2,'Full-bleed dashboard expected; got '+JSON.stringify(bounds));const fonts=await page.evaluate(()=>({body:getComputedStyle(document.body).fontFamily,heading:getComputedStyle(document.querySelector('h1')).fontFamily}));assert.match(fonts.body,/Plus Jakarta Sans/);assert.match(fonts.heading,/Sora/);
 await page.screenshot({path:'market32-shadcn-screens/'+v.name+'-dashboard.png',fullPage:true});if(v.name==='mobile'){const sw=await page.evaluate(()=>document.documentElement.scrollWidth);assert.ok(sw<=v.width+2,'dashboard horizontally overflows: '+sw+'px vs '+v.width+'px')}
 if(v.name==='mobile')await page.locator('header button').first().click();
 await page.locator('aside').getByRole('button',{name:'Events',exact:true}).click();
 await page.getByText('Explore events').waitFor({timeout:20000});const editorial=await page.locator('.market-editorial').evaluate(n=>getComputedStyle(n).backgroundImage);assert.ok(editorial.includes('unsplash'),'Events hero displays editorial photography');
 await page.getByText('Upcoming markets').waitFor({timeout:15000});
 assert.ok(await page.getByRole('button',{name:/View stalls/}).count()>=8,'sample markets rendered');
 await page.screenshot({path:'market32-shadcn-screens/'+v.name+'-events.png',fullPage:true});if(v.name==='mobile'){const sw=await page.evaluate(()=>document.documentElement.scrollWidth);assert.ok(sw<=v.width+2,'events horizontally overflow: '+sw+'px')}
 if(v.name==='mobile')await page.locator('header button').first().click();
 await page.locator('aside').getByRole('button',{name:'Marketplace',exact:true}).click();
 await page.getByText('Independent marketplace').waitFor({timeout:20000});
 await page.locator('img[alt]').first().waitFor({timeout:20000});assert.ok(await page.locator('img[alt]').count()>=8,'sample marketplace products rendered');
 await page.screenshot({path:'market32-shadcn-screens/'+v.name+'-marketplace.png',fullPage:true});if(v.name==='mobile'){const sw=await page.evaluate(()=>document.documentElement.scrollWidth);assert.ok(sw<=v.width+2,'marketplace horizontally overflows: '+sw+'px')}
 assert.deepEqual(errors,[], 'No unhandled browser errors');
 await ctx.close();passed++;
 }console.log('Market32 Shadcn browser QA passed: '+passed+' viewports');
}finally{await browser.close()}
