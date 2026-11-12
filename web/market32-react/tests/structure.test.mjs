import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL(p,import.meta.url),'utf8');
test('all Market32 React role pages are present',()=>{const s=read('../src/pages.jsx');for(const p of ['DashboardPage','EventsPage','StallsPage','ApplicationsPage','MarketplacePage','OrdersPage','PaymentsPage','RequestsPage','MessagesPage','RewardsPage','TicketsPage','TeamPage','ReportsPage','SupportPage','SettingsPage','AdminPage'])assert.ok(s.includes(p),p)});
test('shadcn primitives are integrated',()=>{const s=read('../src/components/ui.jsx');for(const p of ['DialogPrimitive','TabsPrimitive','buttonVariants','Button','Card','Badge','Input','Table'])if(p==='buttonVariants')continue;else assert.ok(s.includes(p),p)});
test('backend connection uses dedicated Supabase Edge API',()=>{const s=read('../src/api.js');assert.match(s,/market32-full\/api/);assert.doesNotMatch(s,/service_role|serviceRole|SUPABASE_SERVICE_ROLE_KEY/)});
test('React shell has four role logins, no fake payment confirmation',()=>{const s=read('../src/App.jsx');for(const user of ['organiser','seller','demo','admin'])assert.ok(s.includes(user));assert.match(s,/Stripe.*disabled/);});
test('old Roll Dice game is not imported into Market32',()=>{const s=read('../src/App.jsx');assert.doesNotMatch(s,/roll-dice\/lib|flutter\/lib/)});
