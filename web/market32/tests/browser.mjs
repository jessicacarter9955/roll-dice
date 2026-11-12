import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const OUT='artifacts/market32';
await fs.mkdir(OUT,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const web='http://127.0.0.1:8090/';
let passed=0;
async function role(name,viewport,widthLabel){
 const ctx=await browser.newContext({viewport,deviceScaleFactor:1});
 const page=await ctx.newPage();
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(web,{waitUntil:'domcontentloaded',timeout:60000});
 await page.waitForSelector('#authForm',{timeout:30000});
 await page.locator('#authUser').fill(name);
 await page.locator('#authPass').fill('market32demo!');
 await page.locator('#authForm button[type=submit]').click();
 await page.waitForTimeout(2000);
 console.log('Browser login diagnostic',name,{errors:errors.slice(0,5),errText:await page.locator('.errorline').allTextContents(),body:(await page.locator('body').innerText()).slice(0,500)});
 await page.screenshot({path:OUT+'/'+name+'-'+widthLabel+'-prelogin-check.png',fullPage:false});
 await page.waitForSelector('.sidebar .navlink[data-tab=dashboard]',{timeout:18000});
 await page.waitForSelector('.eventbanner',{timeout:30000});
 await page.screenshot({path:OUT+'/'+name+'-'+widthLabel+'-dashboard.png',fullPage:true,animations:'disabled'});
 if(name==='organiser'){
   await page.locator('button.navlink[data-tab=events]').click();
   await page.waitForSelector('button[data-act=edit-market]',{timeout:30000});
   await page.screenshot({path:OUT+'/organiser-events.png',fullPage:true,animations:'disabled'});
   await page.locator('button[data-act=open-market]').first().click();
   await page.waitForSelector('#stallFloor .stall',{timeout:30000});
   await page.screenshot({path:OUT+'/organiser-floorplan.png',fullPage:true,animations:'disabled'});
 }
 if(name==='seller'){
   await page.locator('button.navlink[data-tab=seller]').click();
   await page.waitForSelector('button[data-act=new-product]',{timeout:30000});
   await page.screenshot({path:OUT+'/seller-listings.png',fullPage:true,animations:'disabled'});
 }
 if(name==='buyer'){
   await page.locator('button.navlink[data-tab=shop]').click();
   await page.waitForSelector('.product-card',{timeout:30000});
   await page.screenshot({path:OUT+'/buyer-marketplace.png',fullPage:true,animations:'disabled'});
   await page.locator('button.navlink[data-tab=explore]').click();
   await page.waitForSelector('.market-card',{timeout:30000});
   await page.screenshot({path:OUT+'/buyer-map.png',fullPage:true,animations:'disabled'});
 }
 if(name==='admin'){
   await page.locator('button.navlink[data-tab=users]').click();
   await page.waitForSelector('button[data-act=admin-user]',{timeout:30000});
   await page.screenshot({path:OUT+'/admin-users.png',fullPage:true,animations:'disabled'});
   await page.locator('button.navlink[data-tab=payments]').click();
   await page.waitForSelector('button[data-act=loyalty-audit]',{timeout:30000});
   await page.screenshot({path:OUT+'/admin-payments.png',fullPage:true,animations:'disabled'});
 }
 assert.deepEqual(errors,[],name+' browser runtime errors: '+JSON.stringify(errors));
 await ctx.close();passed++;
 console.log('✅',name,'desktop/mobile UI routes rendered without browser JavaScript errors');
}
try{
 await role('buyer',{width:1440,height:900},'desktop');
 await role('seller',{width:1440,height:900},'desktop');
 await role('organiser',{width:1440,height:900},'desktop');
 await role('admin',{width:1440,height:900},'desktop');
 await role('buyer',{width:390,height:844},'mobile');
 console.log('✅',passed,'authenticated browser sessions and role views verified');
}finally{await browser.close()}
