import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {once} from 'node:events';
import {mkdtemp, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {WebSocket} from 'ws';
import {TokenVerifier} from 'livekit-server-sdk';
import {backupDatabase, verifyDatabase} from '../tools/backup.mjs';

async function start(data, adminKey, override = {}) {
  const child = spawn(process.execPath, ['index.mjs'], {
    cwd: new URL('..', import.meta.url),
    env: {...process.env, PORT: '0', DATA_DIR: data, NODE_ENV: 'development',
      ALLOW_GUESTS: 'true', TWILIO_ACCOUNT_SID: '', LIVEKIT_API_KEY: '',
      ADMIN_TOKEN: adminKey, ...override},
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
    child.once('exit', code => reject(new Error(`API exited early (${code}).`)));
  });
  const close = async () => {
    if (!child.exitCode && child.signalCode === null) {
      const exited = once(child, 'exit'); child.kill('SIGTERM'); await exited;
    }
  };
  return {base, close};
}

async function api(base, path, token, body, method = body === undefined ? 'GET' : 'POST', admin = false) {
  const res = await fetch(base + (admin ? '/admin/api' : '/api') + path, {
    method,
    headers: {'Content-Type': 'application/json', ...(token ? {Authorization: `Bearer ${token}`} : {})},
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(5000),
  });
  return {status: res.status, data: await res.json()};
}

test('eight-player multiplayer, WebSocket sync, concurrency, moderation and durable backup/restore', {timeout: 45000}, async t => {
  const data = await mkdtemp(join(tmpdir(), 'street-circle-integration-'));
  const adminKey = randomBytes(32).toString('hex');
  let server = await start(data, adminKey);
  const sockets = [];
  t.after(async () => {
    for (const ws of sockets) ws.terminate();
    await server.close();
    await rm(data, {recursive: true, force: true});
  });
  const people = [];
  for (let i = 0; i < 9; i++) {
    const user = await api(server.base, '/auth/guest', null, {name: `Player${i}E2E`});
    assert.equal(user.status, 200); people.push(user.data);
  }
  const a = people[0];
  const health = await api(server.base, '/health');
  assert.equal(health.status, 200);
  const adminHtml = await fetch(server.base + '/admin/');
  assert.equal(adminHtml.status, 200);
  assert.match(await adminHtml.text(), /Street Circle · Reports/);
  assert.equal((await api(server.base, '/config')).data.video, false);
  assert.equal((await api(server.base, '/config')).data.sms, false);

  const created = await api(server.base, '/rooms', a.token, {name: 'Eight players', ante: 25, private: true, allowWatchers: true});
  const roomId = created.data.id;
  for (let i = 1; i < 8; i++) {
    const joined = await api(server.base, '/rooms/join', people[i].token, {code: created.data.inviteCode});
    assert.equal(joined.status, 200);
    assert.equal(joined.data.players.length, i+1);
  }
  assert.equal((await api(server.base, '/rooms/join', people[8].token, {code: created.data.inviteCode})).status, 400);
  assert.equal((await api(server.base, '/rooms', people[8].token)).data.length, 0);
  assert.equal((await api(server.base, `/rooms/${roomId}`, people[8].token)).status, 404);

  // Two authenticated clients receive live state; tickets cannot be replayed.
  async function connect(user) {
    const ticket = (await api(server.base, '/socket-ticket', user.token, {})).data.ticket;
    const socket = new WebSocket(server.base.replace('http:', 'ws:') + '/ws');
    sockets.push(socket);
    await once(socket, 'open');
    const ready = once(socket, 'message'); socket.send(JSON.stringify({ticket}));
    assert.equal(JSON.parse((await ready)[0]).type, 'ready');
    return socket;
  }
  const wsA = await connect(a);
  const wsB = await connect(people[1]);
  const watched = [];
  wsB.on('message', raw => watched.push(JSON.parse(raw.toString())));
  const started = await api(server.base, `/rooms/${roomId}/start`, a.token, {});
  assert.equal(started.status, 200);
  assert.equal(started.data.pot, 200);
  assert.equal(started.data.game.players.length, 8);
  assert.equal(started.data.game.players[0].dice.length, 5);
  assert.ok(started.data.game.players.slice(1).every(p => p.dice.length === 0));
  assert.equal((await api(server.base, '/me', a.token)).data.coins, 975);
  assert.equal((await api(server.base, `/rooms/${roomId}/start`, a.token, {})).status, 400);
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Missing WebSocket room broadcast')), 1500);
    const check = () => {
      if (watched.some(m => m.type === 'room' && m.room?.game?.phase === 'bidding')) {
        clearTimeout(timeout); resolve();
      } else setTimeout(check, 10);
    }; check();
  });
  const snapshot = watched.find(m => m.type === 'room' && m.room?.game?.phase === 'bidding').room;
  assert.ok(snapshot.game.players.every(p => p.id !== people[1].user.id || p.dice.length === 5));
  assert.ok(snapshot.game.players.filter(p => p.id !== people[1].user.id).every(p => p.dice.length === 0));

  // Racing requests with the same revision must be serialized: one accepted.
  const requests = await Promise.all([1, 2].map(n => api(server.base, `/rooms/${roomId}/action`, a.token, {
    requestId: `race-${n}`, revision: 0, action: {type:'bid',quantity:1,face:2},
  })));
  assert.deepEqual(requests.map(r => r.status).sort(), [200,409]);
  assert.equal((await api(server.base, `/rooms/${roomId}`, a.token)).data.game.revision, 1);
  assert.equal((await api(server.base, '/me', a.token)).data.coins, 975);
  const bCatch = await api(server.base, `/rooms/${roomId}/action`, people[1].token, {
    requestId:'b-catches', revision:1, action:{type:'catch'},
  });
  assert.equal(bCatch.status, 200);
  assert.equal(bCatch.data.game.revision, 2);
  assert.ok(['reveal','finished'].includes(bCatch.data.game.phase));
  assert.equal((await api(server.base, `/rooms/${roomId}/action`, people[1].token, {
    requestId:'b-catches', revision:1, action:{type:'catch'},
  })).status, 200);

  assert.equal((await api(server.base, '/reports', undefined, undefined, 'GET', true)).status, 401);
  const report = await api(server.base, '/reports', a.token, {userId:people[1].user.id,reason:'spam',details:'Sample report'});
  assert.equal(report.status, 201);
  const list = await api(server.base, '/reports?status=open', adminKey, undefined, 'GET', true);
  assert.equal(list.status, 200);
  assert.equal(list.data.count, 1);
  const id = list.data.reports[0].id;
  assert.equal((await api(server.base, `/reports/${id}`, adminKey, {status:'reviewed'}, 'PATCH', true)).status, 200);
  assert.equal((await api(server.base, '/reports?status=reviewed', adminKey, undefined, 'GET', true)).data.count, 1);
  assert.equal((await api(server.base, `/reports/${id}`, adminKey, {status:'delete'}, 'PATCH', true)).status, 400);

  // Small burst-load smoke check, not a substitute for a production soak test.
  const burst = await Promise.all(Array.from({length: 75}, () => api(server.base, `/rooms/${roomId}`, a.token)));
  assert.ok(burst.every(r => r.status === 200 && r.data.game.revision === 2));

  // Backup while the server is running (including WAL contents), then inspect a
  // detached copy. Never overwrite the active database during the restore drill.
  const original = join(data, 'street-circle.sqlite');
  const snapshotPath = join(data, 'offsite-simulation', 'snapshot.sqlite');
  const copied = backupDatabase(original, snapshotPath);
  assert.equal(copied.integrity, 'ok');
  assert.equal(copied.records.users, 9);
  assert.equal(copied.records.reports, 1);
  assert.deepEqual(verifyDatabase(snapshotPath), copied);
  assert.throws(() => backupDatabase(original, snapshotPath), /already exists/);

  wsA.terminate(); wsB.terminate();
  await server.close();
  server = await start(data, adminKey);
  const afterRestart = await api(server.base, `/rooms/${roomId}`, a.token);
  assert.equal(afterRestart.status, 200);
  assert.equal(afterRestart.data.game.revision, 2);
  const reconnected = await connect(a);
  assert.equal(reconnected.readyState, WebSocket.OPEN);
  assert.equal((await api(server.base, '/me', a.token)).data.coins, 975);
  assert.equal((await api(server.base, '/reports?status=reviewed', adminKey, undefined, 'GET', true)).data.count, 1);

  // Forfeiting the seven other players must pay out exactly once.
  for (let i = 1; i < 8; i++) assert.equal((await api(server.base, `/rooms/${roomId}/leave`, people[i].token, {})).status, 200);
  assert.equal((await api(server.base, `/rooms/${roomId}`, a.token)).data.game.phase, 'finished');
  assert.equal((await api(server.base, '/me', a.token)).data.coins, 1175);
  assert.equal((await api(server.base, `/rooms/${roomId}`, a.token)).data.game.phase, 'finished');
  assert.equal((await api(server.base, '/me', a.token)).data.coins, 1175);
});

test('LiveKit grants are scoped to a real room: seated players publish, watchers only subscribe', {timeout: 15000}, async t => {
  const data = await mkdtemp(join(tmpdir(), 'street-circle-video-'));
  const key = 'street-circle-integration-key';
  const secret = randomBytes(32).toString('hex');
  const server = await start(data, randomBytes(32).toString('hex'), {
    LIVEKIT_URL: 'ws://127.0.0.1:7880', LIVEKIT_API_KEY: key, LIVEKIT_API_SECRET: secret,
  });
  t.after(async () => {await server.close(); await rm(data,{recursive:true,force:true});});
  const host = (await api(server.base, '/auth/guest', null, {name:'VideoHost'})).data;
  const watcher = (await api(server.base, '/auth/guest', null, {name:'VideoViewer'})).data;
  const stranger = (await api(server.base, '/auth/guest', null, {name:'VideoOther'})).data;
  const room = (await api(server.base, '/rooms', host.token, {name:'Video test table'})).data;
  assert.equal((await api(server.base, '/rooms/join', watcher.token, {code:room.inviteCode,watch:true})).status, 200);
  assert.equal((await api(server.base, `/rooms/${room.id}/video-token`, stranger.token, {})).status, 404);
  const verifier = new TokenVerifier(key,secret);
  const hostToken = await api(server.base, `/rooms/${room.id}/video-token`, host.token, {});
  const watcherToken = await api(server.base, `/rooms/${room.id}/video-token`, watcher.token, {});
  assert.equal(hostToken.status, 200); assert.equal(watcherToken.status, 200);
  const hostClaims = await verifier.verify(hostToken.data.token);
  const watcherClaims = await verifier.verify(watcherToken.data.token);
  assert.equal(hostClaims.sub, host.user.id);
  assert.equal(hostClaims.video.room, room.id);
  assert.equal(hostClaims.video.canPublish, true);
  assert.equal(watcherClaims.sub, watcher.user.id);
  assert.equal(watcherClaims.video.room, room.id);
  assert.equal(watcherClaims.video.canPublish, false);
  assert.equal(watcherClaims.video.canSubscribe, true);
  assert.ok(hostClaims.exp - hostClaims.nbf <= 600);
});
