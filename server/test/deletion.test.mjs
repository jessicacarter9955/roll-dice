import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {randomBytes} from 'node:crypto';
import {mkdtemp, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {DatabaseSync} from 'node:sqlite';
import {WebSocket} from 'ws';

async function launch(dir) {
  const child = spawn(process.execPath, ['index.mjs'], {
    cwd: new URL('..', import.meta.url),
    env: {...process.env, DATA_DIR: dir, PORT: '0', NODE_ENV: 'development',
      ALLOW_GUESTS: 'true', TWILIO_ACCOUNT_SID: '', LIVEKIT_API_KEY: ''},
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const base = await new Promise((resolve, reject) => {
    let output = '';
    child.stdout.on('data', bytes => {
      output += bytes;
      const port = output.match(/http:\/\/localhost:(\d+)/)?.[1];
      if (port) resolve(`http://127.0.0.1:${port}`);
    });
    child.once('error', reject);
    child.once('exit', code => reject(new Error(`Server exited: ${code}; ${output}`)));
  });
  return {base, async close() {
    if (child.exitCode === null && child.signalCode === null) {
      const done = once(child, 'exit'); child.kill('SIGTERM'); await done;
    }
  }};
}

async function api(base, path, token, body, method = body === undefined ? 'GET' : 'POST') {
  const r = await fetch(base + '/api' + path, {
    method,
    headers: {'Content-Type': 'application/json', ...(token ? {Authorization: `Bearer ${token}`} : {})},
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(5000),
  });
  return {status: r.status, data: await r.json()};
}

test('self-service account deletion revokes live access, settles coins and anonymizes retained game history', {timeout: 30000}, async t => {
  const dir = await mkdtemp(join(tmpdir(), 'street-circle-delete-'));
  let server = await launch(dir);
  const sockets = [];
  t.after(async () => {
    for (const ws of sockets) ws.terminate();
    await server.close();
    await rm(dir, {recursive: true, force: true});
  });
  const owner = (await api(server.base, '/auth/guest', null, {name:'DeleteOwnerE2E'})).data;
  const friend = (await api(server.base, '/auth/guest', null, {name:'DeleteFriendE2E'})).data;
  const crew = (await api(server.base, '/crews', owner.token, {name:'Friends Circle'})).data;
  assert.equal((await api(server.base, '/crews/join', friend.token, {code:crew.code})).status, 200);
  const room = (await api(server.base, '/rooms', owner.token, {ante:25})).data;
  assert.equal((await api(server.base, '/rooms/join', friend.token, {code:room.inviteCode})).status, 200);
  assert.equal((await api(server.base, `/rooms/${room.id}/start`, owner.token, {})).status, 200);
  assert.equal((await api(server.base, `/rooms/${room.id}/action`, owner.token,
    {requestId:'delete-history',revision:0,action:{type:'bid',quantity:1,face:2}})).status, 200);
  assert.equal((await api(server.base, '/blocks/' + owner.user.id, friend.token, {blocked:true})).status, 200);
  assert.equal((await api(server.base, '/reports', owner.token,
    {userId:friend.user.id,reason:'spam',details:'Deletion test'})).status, 201);
  assert.equal((await api(server.base, '/reports', friend.token,
    {userId:owner.user.id,reason:'spam',details:'Deletion test'})).status, 201);

  const ticket = (await api(server.base, '/socket-ticket', owner.token, {})).data.ticket;
  const ws = new WebSocket(server.base.replace('http:', 'ws:') + '/ws'); sockets.push(ws);
  await once(ws, 'open');
  const ready = once(ws, 'message'); ws.send(JSON.stringify({ticket}));
  assert.equal(JSON.parse((await ready)[0]).type, 'ready');

  assert.equal((await api(server.base, '/me/delete', owner.token, {confirmation:'DELETE'})).status, 400);
  const closing = once(ws, 'close');
  const deleted = await api(server.base, '/me/delete', owner.token, {confirmation:'DELETE MY ACCOUNT'});
  assert.deepEqual(deleted, {status:200, data:{ok:true,deleted:true}});
  assert.equal((await closing)[0], 1008);
  assert.equal((await api(server.base, '/me', owner.token)).status, 401);
  assert.equal((await api(server.base, '/me/export', owner.token)).status, 401);
  assert.equal((await api(server.base, '/me/delete', owner.token, {confirmation:'DELETE MY ACCOUNT'})).status, 401);
  assert.equal((await api(server.base, '/me', friend.token)).data.coins, 1025);
  assert.deepEqual((await api(server.base, '/me', friend.token)).data.blocked, []);
  const crews = (await api(server.base, '/crews', friend.token)).data;
  assert.equal(crews.length, 1);
  assert.equal(crews[0].ownerId, friend.user.id);
  assert.deepEqual(crews[0].members.map(p => p.id), [friend.user.id]);
  const remaining = (await api(server.base, `/rooms/${room.id}`, friend.token)).data;
  assert.equal(remaining.game.phase, 'finished');
  assert.equal(remaining.game.winner, friend.user.id);
  assert.equal(remaining.players.length, 1);
  assert.ok(remaining.game.history.some(item => item.name === 'Deleted player'));
  assert.equal(JSON.stringify(remaining).includes(owner.user.id), false);
  assert.equal(JSON.stringify(remaining).includes(owner.user.name), false);

  await server.close(); server = await launch(dir);
  assert.equal((await api(server.base, '/me', friend.token)).data.coins, 1025);
  assert.equal((await api(server.base, '/crews', friend.token)).data[0].ownerId, friend.user.id);
  assert.equal(JSON.stringify((await api(server.base, `/rooms/${room.id}`, friend.token)).data).includes(owner.user.id), false);
  const db = new DatabaseSync(join(dir, 'street-circle.sqlite'));
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM users WHERE id=?').get(owner.user.id).n, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM sessions WHERE user_id=?').get(owner.user.id).n, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM reports WHERE reporter_id=? OR target_id=?').get(owner.user.id,owner.user.id).n, 0);
  db.close();
  assert.equal((await api(server.base, '/auth/guest', null, {name:'DeleteOwnerE2E'})).status, 200);
});
