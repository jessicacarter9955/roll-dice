import assert from "node:assert/strict";
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
const base="http://127.0.0.1:8123/";
mkdirSync("market32-screenshots",{recursive:true});
const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
const cases=[{name:"desktop",viewport:{width:1440,height:900},scale:1},{name:"mobile",viewport:{width:390,height:844},scale:1}];
try{
for(const test of cases){
 const context=await browser.newContext({viewport:test.viewport,deviceScaleFactor:test.scale});
 const page=await context.newPage();
 page.on("pageerror",e=>console.error("BROWSER ERROR",test.name,e.message));
 await page.goto(base,{waitUntil:"domcontentloaded",timeout:30000});
 await page.waitForSelector(".auth-card",{timeout:15000});
 await page.screenshot({path:"market32-screenshots/"+test.name+"-login.png",fullPage:true});
 await page.locator("#login-form button[type=submit]").click();
 await page.waitForSelector(".event-feature",{timeout:45000});
 assert.match(await page.locator(".headline h1").innerText(),/Dashboard/);
 assert.equal(await page.locator(".event-feature").count(),1);
 assert.equal(await page.locator(".data-table").count()>=1,true);
 await page.screenshot({path:"market32-screenshots/"+test.name+"-dashboard.png",fullPage:true});
 if(test.name==="mobile")await page.locator(".mobile-menu").click();
 await page.locator('.nav-item[data-page="events"]').click();
 await page.waitForSelector(".market-card",{timeout:40000});
 assert.equal(await page.locator(".market-card").count()>=4,true);
 await page.screenshot({path:"market32-screenshots/"+test.name+"-events.png",fullPage:true});
 if(test.name==="mobile")await page.locator(".mobile-menu").click();
 await page.locator('.nav-item[data-page="marketplace"]').click();
 await page.waitForSelector(".product-art",{timeout:40000});
 assert.equal(await page.locator(".product-art").count()>=8,true);
 console.log(test.name+" passed: dashboard, event marketplace real API content");
 await context.close();
}
}finally{await browser.close()}
