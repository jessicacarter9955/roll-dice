import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {WebSocket} from 'ws';

test('profile edits propagate to existing tables, chat and live spectators atomically', {timeout: 30000}, async t => {
  const dir = await mkdtemp(join(tmpdir(), 'street-circle-profile-'));
  const child = spawn(process.execPath, ['index.mjs'], {
    cwd: new URL('..', import.meta.url),
    env: {...process.env, PORT: '0', DATA_DIR: dir, NODE_ENV: 'development',
      ALLOW_GUESTS: 'true', TWILIO_ACCOUNT_SID: '', LIVEKIT_API_KEY: ''},
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const sockets = [];
  t.after(async () => {
    for (const ws of sockets) ws.terminate();
    if (child.exitCode === null && child.signalCode === null) {
      const ending = once(child, 'exit'); child.kill('SIGTERM'); await ending;
    }
    await rm(dir, {recursive: true, force: true});
  });
  const base = await new Promise((resolve, reject) => {
    let output = '';
    child.stdout.on('data', b => {
      output += b;
      const port = output.match(/http:\/\/localhost:(\d+)/)?.[1];
      if (port) resolve(`http://127.0.0.1:${port}`);
    });
    child.once('error', reject);
    child.once('exit', code => reject(new Error(`Server exited before ready: ${code}`)));
  });
  async function api(path, token, body, method = body === undefined ? 'GET' : 'POST') {
    const response = await fetch(base + '/api' + path, {
      method, headers: {'Content-Type': 'application/json', ...(token ? {Authorization: `Bearer ${token}`} : {})},
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return {status: response.status, data: await response.json()};
  }
  const owner = (await api('/auth/guest', null, {name:'ProfileOwner'})).data;
  const friend = (await api('/auth/guest', null, {name:'ProfileFriend'})).data;
  const watcher = (await api('/auth/guest', null, {name:'ProfileWatch'})).data;
  const created = (await api('/rooms', owner.token, {})).data;
  const id = created.id;
  await api('/rooms/join', friend.token, {code:created.inviteCode});
  await api('/rooms/join', watcher.token, {code:created.inviteCode, watch:true});
  await api(`/rooms/${id}/chat`, owner.token, {text:'A message before renaming'});
  assert.equal((await api(`/rooms/${id}/start`, owner.token, {})).status, 200);

  const socket = new WebSocket(base.replace('http:', 'ws:') + '/ws');
  sockets.push(socket);
  const messages = [];
  socket.on('message', raw => messages.push(JSON.parse(raw)));
  await once(socket, 'open');
  const ticket = (await api('/socket-ticket', watcher.token, {})).data.ticket;
  socket.send(JSON.stringify({ticket}));
  const until = async predicate => {
    for (let i = 0; i < 200; i++) {
      const found = messages.find(predicate);
      if (found) return found;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert.fail('The expected live room update did not arrive.');
  };
  await until(m => m.type === 'ready');

  const rejected = await api('/me', owner.token, {name:'ProfileFriend', bio:'Should roll back'}, 'PATCH');
  assert.equal(rejected.status, 400);
  assert.equal((await api('/me', owner.token)).data.name, 'ProfileOwner');
  assert.equal((await api(`/rooms/${id}`, friend.token)).data.players[0].name, 'ProfileOwner');

  const changed = await api('/me', owner.token, {
    name:'ProfileRenamed', bio:'Now synced everywhere', private:true,
  }, 'PATCH');
  assert.equal(changed.status, 200);
  assert.equal(changed.data.name, 'ProfileRenamed');
  const otherView = (await api(`/rooms/${id}`, friend.token)).data;
  assert.equal(otherView.name, "ProfileRenamed's circle");
  assert.equal(otherView.players[0].name, 'ProfileRenamed');
  assert.equal(otherView.game.players[0].name, 'ProfileRenamed');
  assert.equal(otherView.chat[0].name, 'ProfileRenamed');
  const spectatorView = (await api(`/rooms/${id}`, watcher.token)).data;
  assert.equal(spectatorView.game.players[0].name, 'ProfileRenamed');
  assert.equal(spectatorView.game.players[0].dice.length, 0);
  assert.equal((await api('/players?q=ProfileRenamed', friend.token)).data.length, 0);
  const update = await until(m => m.type === 'room' && m.room.players[0]?.name === 'ProfileRenamed');
  assert.equal(update.room.chat[0].name, 'ProfileRenamed');

  const crew = (await api('/crews', friend.token, {name:'Profile Crew'})).data;
  await api('/crews/join', owner.token, {code:crew.code});
  const members = (await api('/crews', friend.token)).data[0].members;
  assert.equal(members.find(m => m.id === owner.user.id).name, 'ProfileRenamed');
});
