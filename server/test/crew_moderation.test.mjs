import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {randomBytes} from 'node:crypto';
import {mkdtemp, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {WebSocket} from 'ws';

async function launch(dataDir, adminToken) {
  const child = spawn(process.execPath, ['index.mjs'], {
    cwd: new URL('..', import.meta.url),
    env: {...process.env, PORT: '0', DATA_DIR: dataDir, ADMIN_TOKEN: adminToken,
      NODE_ENV: 'development', ALLOW_GUESTS: 'true', TWILIO_ACCOUNT_SID: '', LIVEKIT_API_KEY: ''},
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const base = await new Promise((resolve, reject) => {
    let output = '';
    child.stdout.on('data', chunk => {
      output += chunk;
      const port = output.match(/http:\/\/localhost:(\d+)/)?.[1];
      if (port) resolve(`http://127.0.0.1:${port}`);
    });
    child.once('error', reject);
    child.once('exit', code => reject(new Error(`Server exited early: ${code}; ${output}`)));
  });
  return {base, async close() {
    if (child.exitCode === null && child.signalCode === null) {
      const exiting = once(child, 'exit'); child.kill('SIGTERM'); await exiting;
    }
  }};
}

async function request(base, path, bearer, body, method = body === undefined ? 'GET' : 'POST', admin = false) {
  const response = await fetch(base + (admin ? '/admin/api' : '/api') + path, {
    method,
    headers: {'Content-Type': 'application/json', ...(bearer ? {Authorization: 'Bearer ' + bearer} : {})},
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(5000),
  });
  return {status: response.status, data: await response.json()};
}

test('crew ownership, transfer, member removal, code rotation and persistence', {timeout: 30000}, async t => {
  const dir = await mkdtemp(join(tmpdir(), 'street-circle-crews-'));
  const admin = randomBytes(32).toString('hex');
  let server = await launch(dir, admin);
  t.after(async () => { await server.close(); await rm(dir, {recursive: true, force: true}); });
  const people = [];
  for (const name of ['CrewOwnerE2E', 'CrewFriendE2E', 'CrewGuestE2E']) {
    const r = await request(server.base, '/auth/guest', null, {name});
    assert.equal(r.status, 200); people.push(r.data);
  }
  const [owner, friend, guest] = people;
  const created = await request(server.base, '/crews', owner.token, {name:'Golden Circle'});
  assert.equal(created.status, 200);
  const id = created.data.id, oldCode = created.data.code;
  assert.equal((await request(server.base, '/crews/join', friend.token, {code:oldCode})).status, 200);
  assert.equal((await request(server.base, '/crews/join', guest.token, {code:oldCode})).status, 200);
  const exportOwner = await request(server.base, '/me/export', owner.token);
  assert.equal(exportOwner.status, 200);
  assert.equal(exportOwner.data.profile.id, owner.user.id);
  assert.equal(exportOwner.data.crews[0].name, 'Golden Circle');
  assert.equal(exportOwner.data.profile.token, undefined);
  assert.equal((await request(server.base, '/crews/join', friend.token, {code:oldCode})).data.members.length, 3);
  assert.equal((await request(server.base, `/crews/${id}/rotate-code`, guest.token, {})).status, 403);
  assert.equal((await request(server.base, `/crews/${id}`, friend.token, undefined, 'DELETE')).status, 403);
  assert.equal((await request(server.base, `/crews/${id}/transfer`, owner.token, {userId:'stranger'})).status, 400);

  await server.close(); server = await launch(dir, admin);
  assert.equal((await request(server.base, '/crews', owner.token)).data[0].members.length, 3);
  assert.equal((await request(server.base, `/crews/${id}/transfer`, owner.token, {userId:friend.user.id})).status, 200);
  assert.equal((await request(server.base, `/crews/${id}/rotate-code`, owner.token, {})).status, 403);
  const rotated = await request(server.base, `/crews/${id}/rotate-code`, friend.token, {});
  assert.equal(rotated.status, 200); assert.notEqual(rotated.data.code, oldCode);
  assert.equal((await request(server.base, `/crews/${id}/remove-member`, friend.token, {userId:owner.user.id})).status, 200);
  assert.equal((await request(server.base, '/crews', owner.token)).data.length, 0);
  assert.equal((await request(server.base, '/crews/join', owner.token, {code:oldCode})).status, 404);
  assert.equal((await request(server.base, '/crews/join', owner.token, {code:rotated.data.code})).status, 200);
  assert.equal((await request(server.base, `/crews/${id}/leave`, friend.token, {})).data.ownerId, guest.user.id);
  assert.equal((await request(server.base, `/crews/${id}`, owner.token, undefined, 'DELETE')).status, 403);
  assert.equal((await request(server.base, `/crews/${id}`, guest.token, undefined, 'DELETE')).status, 200);
  assert.equal((await request(server.base, '/crews', owner.token)).data.length, 0);

  const solo = (await request(server.base, '/crews', owner.token, {name:'Solo Circle'})).data;
  assert.equal((await request(server.base, `/crews/${solo.id}/leave`, owner.token, {})).data.deleted, true);
  assert.equal((await request(server.base, `/crews/${solo.id}/leave`, owner.token, {})).status, 404);

  for (let n = 0; n < 10; n++) assert.equal((await request(server.base, '/crews', owner.token, {name:`Team ${n} Circle`})).status, 200);
  const extra = (await request(server.base, '/crews', guest.token, {name:'Extra Circle'})).data;
  assert.equal((await request(server.base, '/crews/join', owner.token, {code:extra.code})).status, 400);
});

test('moderator suspension revokes sessions, sockets and room participation with an audit trail', {timeout: 30000}, async t => {
  const dir = await mkdtemp(join(tmpdir(), 'street-circle-suspension-'));
  const admin = randomBytes(32).toString('hex');
  const server = await launch(dir, admin);
  const sockets = [];
  t.after(async () => { for (const ws of sockets) ws.terminate(); await server.close(); await rm(dir, {recursive: true, force: true}); });
  const owner = (await request(server.base, '/auth/guest', null, {name:'ModOwnerE2E'})).data;
  const target = (await request(server.base, '/auth/guest', null, {name:'ModTargetE2E'})).data;
  const room = (await request(server.base, '/rooms', owner.token, {ante:25})).data;
  assert.equal((await request(server.base, '/rooms/join', target.token, {code:room.inviteCode})).status, 200);
  assert.equal((await request(server.base, `/rooms/${room.id}/start`, owner.token, {})).status, 200);
  const ticket = (await request(server.base, '/socket-ticket', target.token, {})).data.ticket;
  const ws = new WebSocket(server.base.replace('http:', 'ws:') + '/ws'); sockets.push(ws);
  await once(ws, 'open');
  const ready = once(ws, 'message'); ws.send(JSON.stringify({ticket}));
  assert.equal(JSON.parse((await ready)[0]).type, 'ready');
  const report = await request(server.base, '/reports', owner.token, {userId:target.user.id,reason:'harassment',details:'Moderation test'});
  assert.equal(report.status, 201);
  const personalExport = await request(server.base, '/me/export', owner.token);
  assert.equal(personalExport.status, 200);
  assert.equal(personalExport.data.submittedReports.length, 1);
  assert.equal(personalExport.data.gameActivity[0].chat.length, 0);
  assert.equal(personalExport.data.gameActivity[0].ownGameEvents.length, 0);
  assert.equal((await request(server.base, '/me/export', null)).status, 401);
  assert.equal((await request(server.base, `/users/${target.user.id}/status`, target.token, {suspended:true,reason:'Repeated harassment'}, 'PATCH', true)).status, 401);
  assert.equal((await request(server.base, `/users/${target.user.id}/status`, admin, {suspended:true,reason:'short'}, 'PATCH', true)).status, 400);
  const closing = once(ws, 'close');
  const banned = await request(server.base, `/users/${target.user.id}/status`, admin, {suspended:true,reason:'Repeated harassment in the game'}, 'PATCH', true);
  assert.equal(banned.status, 200); assert.equal(banned.data.suspended, true);
  assert.equal((await closing)[0], 1008);
  assert.equal((await request(server.base, '/me', target.token)).status, 401);
  assert.equal((await request(server.base, `/rooms/${room.id}`, owner.token)).data.game.phase, 'finished');
  assert.equal((await request(server.base, '/me', owner.token)).data.coins, 1025);
  assert.equal((await request(server.base, '/reports', admin, undefined, 'GET', true)).data.reports[0].targetSuspended, 1);
  const inspected = await request(server.base, `/users/${target.user.id}`, admin, undefined, 'GET', true);
  assert.equal(inspected.data.user.suspended, true);
  assert.equal(inspected.data.actions[0].action, 'suspend');
  assert.equal((await request(server.base, `/users/${target.user.id}/status`, admin, {suspended:true,reason:'Again for no reason'}, 'PATCH', true)).status, 409);
  assert.equal((await request(server.base, `/users/${target.user.id}/status`, admin, {suspended:false,reason:'Appeal accepted after review'}, 'PATCH', true)).status, 200);
  assert.equal((await request(server.base, '/me', target.token)).status, 401); // Old tokens stay invalid.
  assert.deepEqual((await request(server.base, `/users/${target.user.id}`, admin, undefined, 'GET', true)).data.actions.map(x => x.action), ['restore','suspend']);
});
