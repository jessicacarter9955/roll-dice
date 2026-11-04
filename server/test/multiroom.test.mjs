import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {WebSocket} from 'ws';

async function start(dir) {
  const child = spawn(process.execPath, ['index.mjs'], {
    cwd:new URL('..',import.meta.url),
    env:{...process.env,DATA_DIR:dir,PORT:'0',NODE_ENV:'development',
      ALLOW_GUESTS:'true',TWILIO_ACCOUNT_SID:'',LIVEKIT_API_KEY:''},
    stdio:['ignore','pipe','pipe'],
  });
  const base = await new Promise((resolve,reject) => {
    let output = '';
    child.stdout.on('data', bytes => {
      output += bytes;
      const port = output.match(/http:\/\/localhost:(\d+)/)?.[1];
      if (port) resolve(`http://127.0.0.1:${port}`);
    });
    child.once('error',reject);
    child.once('exit',code=>reject(new Error(`API exited early: ${code}`)));
  });
  return {base,async close() {
    if (child.exitCode === null && child.signalCode === null) {
      const done=once(child,'exit'); child.kill('SIGTERM'); await done;
    }
  }};
}

async function api(base,path,token,body) {
  const response=await fetch(base+'/api'+path,{
    method:body===undefined?'GET':'POST',
    headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},
    body:body===undefined?undefined:JSON.stringify(body),
    signal:AbortSignal.timeout(5000),
  });
  return {status:response.status,data:await response.json()};
}

async function eventually(predicate) {
  const deadline=Date.now()+2000;
  while (Date.now()<deadline) {
    if (predicate()) return;
    await new Promise(resolve=>setTimeout(resolve,20));
  }
  assert.fail('Timed out waiting for a room presence broadcast.');
}

test('sixteen real WebSockets across two eight-seat tables are isolated and settle independently', {timeout:30000}, async t => {
  const dir=await mkdtemp(join(tmpdir(),'street-circle-multiroom-'));
  const server=await start(dir);
  const sockets=[];
  t.after(async()=>{for(const ws of sockets)ws.terminate();await server.close();await rm(dir,{recursive:true,force:true});});
  const people=[];
  for(let i=0;i<16;i++) {
    const r=await api(server.base,'/auth/guest',null,{name:`MultiRoomE2E${i}`});
    assert.equal(r.status,200);people.push(r.data);
  }
  const tables=[];
  for(let n=0;n<2;n++) {
    const group=people.slice(n*8,n*8+8);
    const created=await api(server.base,'/rooms',group[0].token,{name:`Table ${n+1}`,ante:25});
    assert.equal(created.status,200);
    for(const person of group.slice(1))
      assert.equal((await api(server.base,'/rooms/join',person.token,{code:created.data.inviteCode})).status,200);
    tables.push({room:created.data,group});
  }

  const messages=Array.from({length:16},()=>[]);
  for(let i=0;i<16;i++) {
    const ticket=(await api(server.base,'/socket-ticket',people[i].token,{})).data.ticket;
    const ws=new WebSocket(server.base.replace('http:','ws:')+'/ws');sockets.push(ws);
    ws.on('message',raw=>messages[i].push(JSON.parse(raw.toString())));
    await once(ws,'open');
    const ready=once(ws,'message');ws.send(JSON.stringify({ticket}));
    assert.equal(JSON.parse((await ready)[0]).type,'ready');
  }
  for(let i=0;i<16;i++) {
    const expected=tables[Math.floor(i/8)].room.id;
    assert.ok(messages[i].filter(m=>m.type==='room').every(m=>m.room.id===expected));
    messages[i].length=0;
  }

  // Presence must update even in the waiting lobby, where the game timer is idle.
  const offline=sockets[1];
  const offlineWait=once(offline,'close');offline.close();await offlineWait;
  await eventually(()=>messages[0].some(m=>m.type==='room' &&
    m.room.players.some(p=>p.id===people[1].user.id && p.online===false)));
  assert.ok(messages[8].every(m=>m.type!=='room' || m.room.id===tables[1].room.id)); // No cross-table presence leakage.

  const starts=await Promise.all(tables.map(({room,group})=>api(server.base,`/rooms/${room.id}/start`,group[0].token,{})));
  assert.deepEqual(starts.map(s=>s.status),[200,200]);
  assert.deepEqual(starts.map(s=>s.data.pot),[200,200]);
  for(let i=0;i<16;i++)
    assert.ok(messages[i].filter(m=>m.type==='room').every(m=>m.room.id===tables[Math.floor(i/8)].room.id));
  for(const {room,group} of tables)
    for(const person of group.slice(1))
      assert.equal((await api(server.base,`/rooms/${room.id}/leave`,person.token,{})).status,200);

  for(const {room,group} of tables) {
    const state=await api(server.base,`/rooms/${room.id}`,group[0].token);
    assert.equal(state.data.game.phase,'finished');
    assert.equal(state.data.game.winner,group[0].user.id);
    assert.equal((await api(server.base,'/me',group[0].token)).data.coins,1175);
    assert.equal((await api(server.base,'/me',group[1].token)).data.coins,975);
  }
});
