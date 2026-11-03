import express from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { WebSocketServer, WebSocket } from 'ws';
import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomUUID, randomInt, createHash } from 'node:crypto';
import { mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { createGame, command, viewGame, forfeit, botAction, GameError } from './engine.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const production = process.env.NODE_ENV === 'production';
const allowGuests = !production && process.env.ALLOW_GUESTS !== 'false';
const smsReady = ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_VERIFY_SERVICE_SID'].every(k => process.env[k]);
const videoReady = ['LIVEKIT_URL', 'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET'].every(k => process.env[k]);
const mediaService = videoReady ? new RoomServiceClient(
  process.env.LIVEKIT_URL.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:'),
  process.env.LIVEKIT_API_KEY,
  process.env.LIVEKIT_API_SECRET,
) : null;
const origin = process.env.PUBLIC_ORIGIN || 'http://localhost:8787';
if (production && !process.env.PUBLIC_ORIGIN?.startsWith('https://')) throw new Error('Production requires an HTTPS PUBLIC_ORIGIN.');
const dataDir = resolve(process.env.DATA_DIR || resolve(root, 'server/data'));
mkdirSync(dataDir, { recursive: true });
const db = new DatabaseSync(resolve(dataDir, 'street-circle.sqlite'));
db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, phone TEXT UNIQUE, username TEXT UNIQUE COLLATE NOCASE, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS rooms (id TEXT PRIMARY KEY, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS crews (id TEXT PRIMARY KEY, code TEXT UNIQUE, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS reports (id TEXT PRIMARY KEY, reporter_id TEXT NOT NULL, target_id TEXT NOT NULL, room_id TEXT, reason TEXT NOT NULL, details TEXT NOT NULL, created_at INTEGER NOT NULL);`);
const hash = s => createHash('sha256').update(s).digest('hex');
const roll = () => randomInt(1, 7);
const uid = () => randomUUID();
const code = () => randomBytes(4).toString('hex').toUpperCase();
const day = () => new Date().toISOString().slice(0, 10);
const fail = (msg, status = 400) => { const e = new Error(msg); e.status = status; throw e; };
const getUser = id => {
  const row = db.prepare('SELECT data FROM users WHERE id=?').get(id);
  if (!row) fail('Account not found.', 401);
  return JSON.parse(row.data);
};
function saveUser(user) {
  db.prepare('UPDATE users SET username=?, data=? WHERE id=?').run(user.name, JSON.stringify(user), user.id);
}
function usage(user) {
  if (user.day !== day()) { user.day = day(); user.seconds = 0; }
  return user.seconds;
}
function publicUser(user) {
  return { id: user.id, name: user.name, bio: user.bio, color: user.color, private: user.private };
}
function me(user) { usage(user); const { phone, ...safe } = user; return safe; }
function newUser(name, phone = null) {
  const user = { id: uid(), phone, name, bio: '', color: randomInt(0, 6), coins: 1000, private: false, blocked: [], dailyMinutes: 120, reminderMinutes: 30, day: day(), seconds: 0, createdAt: Date.now() };
  try { db.prepare('INSERT INTO users VALUES (?,?,?,?)').run(user.id, phone, name, JSON.stringify(user)); }
  catch (e) { if (e.errcode === 2067 || e.message?.startsWith('UNIQUE constraint failed')) fail('That username is taken.'); throw e; }
  return user;
}
const validName = name => typeof name === 'string' && /^[a-zA-Z0-9_]{3,20}$/.test(name);
const validPhone = phone => typeof phone === 'string' && /^\+[1-9]\d{7,14}$/.test(phone);
function session(user) {
  const token = randomBytes(32).toString('base64url');
  db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(hash(token), user.id, Date.now() + 30 * 86400000);
  return { token, user: me(user) };
}
function authToken(token) {
  if (!token || token.length > 100) fail('Please sign in.', 401);
  const row = db.prepare('SELECT user_id FROM sessions WHERE hash=? AND expires>?').get(hash(token), Date.now());
  if (!row) fail('Your session has expired. Please sign in again.', 401);
  return getUser(row.user_id);
}
const rooms = new Map(db.prepare('SELECT data FROM rooms').all().map(r => { const room = JSON.parse(r.data); return [room.id, room]; }));
for (const room of rooms.values()) {
  if (room.game?.phase !== 'finished' && room.game) room.game.deadline = Date.now() + 45000;
  for (const p of room.players) p.lastSeen = Date.now();
}
const persist = room => db.prepare('INSERT OR REPLACE INTO rooms VALUES (?,?)').run(room.id, JSON.stringify(room));
const connections = new Map();
const tickets = new Map();
function blocked(a, b) { return a.blocked.includes(b.id) || b.blocked.includes(a.id); }
function canEnter(room, user) {
  if (room.players.some(p => !p.bot && blocked(user, getUser(p.id)))) fail('This table is unavailable because of a block or privacy setting.', 403);
}
function inRoom(room, user) { return room.players.some(p => p.id === user.id) || room.watchers.includes(user.id); }
function roomView(room, user) {
  return {
    ...room, inviteCode: inRoom(room, user) ? room.inviteCode : null,
    game: viewGame(room.game, user.id),
    players: room.players.map(p => ({ id: p.id, name: p.name, bot: p.bot, online: !!p.bot || [...(connections.get(p.id) || [])].some(ws => ws.readyState === WebSocket.OPEN), color: p.color })),
    watchers: room.watchers.length,
    chat: room.chat.filter(m => !user.blocked.includes(m.userId)).slice(-60),
  };
}
function notifyUser(id, message) {
  for (const ws of connections.get(id) || []) if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
}
// A participant who leaves/gets blocked must lose live camera access too.
// revokeTokenTs also invalidates an already issued join token (not just the
// currently connected media socket). Failures are logged, never hidden.
async function kickVideo(roomId, userId) {
  if (!mediaService) return;
  try {
    await mediaService.removeParticipant(roomId, userId, {
      revokeTokenTs: BigInt(Math.floor(Date.now() / 1000)),
    });
  } catch (e) {
    if (!/not found|does not exist/i.test(e.message || ''))
      console.error('LiveKit revocation failed:', roomId, e.message);
  }
}
function broadcast(room) {
  for (const id of new Set([...room.players.filter(p => !p.bot).map(p => p.id), ...room.watchers])) {
    try { notifyUser(id, { type: 'room', room: roomView(room, getUser(id)) }); } catch { /* deleted account */ }
  }
}
function settle(room) {
  if (room.settled || room.game?.phase !== 'finished') return;
  room.settled = true;
  const winner = room.players.find(p => p.id === room.game.winner);
  if (winner && !winner.bot) { const user = getUser(winner.id); user.coins += room.pot; saveUser(user); notifyUser(user.id, { type: 'me', user: me(user) }); }
}
// All coin transfers and the resulting table snapshot commit in the same SQLite transaction.
function mutate(room, fn) {
  const previous = structuredClone(room);
  db.exec('BEGIN IMMEDIATE');
  try { fn(); settle(room); room.updatedAt = Date.now(); persist(room); db.exec('COMMIT'); }
  catch (e) { db.exec('ROLLBACK'); rooms.set(room.id, previous); throw e; }
  broadcast(room);
}
const app = express();
app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use((req, res, next) => {
  if (req.headers.origin && req.headers.origin !== origin) {
    // Flutter's development server is loopback only. Production stays exact-origin.
    if (production || !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(req.headers.origin)) return res.status(403).json({ error: 'Origin not allowed.' });
  }
  if (req.headers.origin) { res.setHeader('Access-Control-Allow-Origin', req.headers.origin); res.setHeader('Vary', 'Origin'); }
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.use(express.json({ limit: '16kb' }));
app.use('/api', rateLimit({ windowMs: 60000, limit: 240, standardHeaders: 'draft-8', legacyHeaders: false }));
const authLimit = rateLimit({ windowMs: 3600000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false });
app.get('/api/config', (req, res) => res.json({ mode: allowGuests ? 'review' : 'production', allowGuests, sms: smsReady, video: videoReady, smartDice: false, rules: 'liars-dice-v1' }));
app.get('/api/health', (req, res) => res.json({ ok: true, version: '0.1.0' }));
app.post('/api/auth/guest', authLimit, (req, res) => {
  if (!allowGuests) fail('Practice accounts are disabled on this server.', 403);
  if (!validName(req.body.name)) fail('Use 3–20 letters, numbers or underscores.');
  res.json(session(newUser(req.body.name)));
});
async function twilio(path, body) {
  const response = await fetch(`https://verify.twilio.com/v2/Services/${process.env.TWILIO_VERIFY_SERVICE_SID}/${path}`, {
    method: 'POST', headers: { Authorization: `Basic ${Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body), signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) fail('SMS provider could not complete this request. Please try again later.', 502);
  return response.json();
}
const smsCooldown = new Map();
app.post('/api/auth/sms', authLimit, async (req, res) => {
  if (!smsReady) fail('Phone sign-in needs a configured Twilio Verify service.', 503);
  if (!validPhone(req.body.phone) || req.body.consent !== true) fail('Enter an international phone number and accept SMS verification.');
  const key = hash(req.body.phone);
  if ((smsCooldown.get(key) || 0) > Date.now() - 60000) fail('Wait one minute before requesting another code.', 429);
  smsCooldown.set(key, Date.now());
  await twilio('Verifications', { To: req.body.phone, Channel: 'sms' });
  res.json({ sent: true });
});
app.post('/api/auth/verify', authLimit, async (req, res) => {
  if (!smsReady) fail('SMS verification is not configured.', 503);
  const { phone, code: pin, name } = req.body;
  if (!validPhone(phone) || typeof pin !== 'string' || !/^\d{4,10}$/.test(pin)) fail('Enter a valid phone number and verification code.');
  const existing = db.prepare('SELECT id FROM users WHERE phone=?').get(phone);
  if (!existing && !validName(name)) fail('Choose a username using 3–20 letters, numbers or underscores.');
  const result = await twilio('VerificationCheck', { To: phone, Code: pin });
  if (result.status !== 'approved') fail('That verification code is incorrect or expired.', 401);
  res.json(session(existing ? getUser(existing.id) : newUser(name, phone)));
});
app.use('/api', (req, res, next) => {
  req.user = authToken(req.headers.authorization?.replace(/^Bearer /, ''));
  next();
});
app.get('/api/me', (req, res) => res.json(me(req.user)));
app.post('/api/auth/logout', (req, res) => { db.prepare('DELETE FROM sessions WHERE hash=?').run(hash(req.headers.authorization.replace(/^Bearer /, ''))); res.json({ ok: true }); });
app.patch('/api/me', (req, res) => {
  const user = req.user;
  if (req.body.name !== undefined) { if (!validName(req.body.name)) fail('Invalid username.'); user.name = req.body.name; }
  if (req.body.bio !== undefined) { if (typeof req.body.bio !== 'string' || req.body.bio.length > 160) fail('Bio must be 160 characters or fewer.'); user.bio = req.body.bio; }
  if (req.body.private !== undefined) user.private = req.body.private === true;
  for (const [key, min, max] of [['dailyMinutes', 5, 240], ['reminderMinutes', 5, 60]]) {
    if (req.body[key] !== undefined) { if (!Number.isInteger(req.body[key]) || req.body[key] < min || req.body[key] > max) fail(`Invalid ${key}.`); user[key] = req.body[key]; }
  }
  try { saveUser(user); } catch (e) { if (e.errcode === 2067 || e.message?.startsWith('UNIQUE constraint failed')) fail('That username is taken.'); throw e; }
  res.json(me(user));
});
app.get('/api/players', (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.slice(0, 20).toLowerCase() : '';
  const list = db.prepare('SELECT data FROM users LIMIT 5000').all().map(r => JSON.parse(r.data)).filter(u => !u.private && u.id !== req.user.id && !blocked(u, req.user) && u.name.toLowerCase().includes(q));
  res.json(list.slice(0, 30).map(publicUser));
});
app.post('/api/blocks/:id', async (req, res) => {
  if (req.params.id === req.user.id) fail('You cannot block yourself.');
  getUser(req.params.id);
  const u = req.user;
  if (req.body.blocked !== false) u.blocked = [...new Set([...u.blocked, req.params.id])];
  else u.blocked = u.blocked.filter(id => id !== req.params.id);
  saveUser(u);
  if (req.body.blocked !== false) {
    const shared = [...rooms.values()].filter(r =>
      inRoom(r, req.user) && inRoom(r, {id: req.params.id}));
    await Promise.all(shared.flatMap(r => [
      kickVideo(r.id, req.user.id), kickVideo(r.id, req.params.id),
    ]));
  }
  res.json(me(u));
});
app.post('/api/reports', (req, res) => {
  const { userId, roomId = null, reason, details = '' } = req.body;
  if (typeof userId !== 'string' || userId === req.user.id ||
      !['harassment', 'spam', 'inappropriate-video', 'cheating', 'other'].includes(reason) ||
      typeof details !== 'string' || details.length > 1000 ||
      (roomId !== null && (typeof roomId !== 'string' || roomId.length > 80)))
    fail('Select another player, a reason and up to 1,000 detail characters.');
  getUser(userId);
  const recent = db.prepare('SELECT COUNT(*) AS n FROM reports WHERE reporter_id=? AND created_at>?')
    .get(req.user.id, Date.now() - 86400000).n;
  if (recent >= 10) fail('Daily report limit reached.', 429);
  db.prepare('INSERT INTO reports VALUES (?,?,?,?,?,?,?)')
    .run(uid(), req.user.id, userId, roomId, reason, details.trim(), Date.now());
  res.status(201).json({ received: true });
});
app.get('/api/rooms', (req, res) => res.json([...rooms.values()].filter(r => !r.private && Date.now() - r.updatedAt < 86400000 && !r.players.some(p => !p.bot && blocked(req.user, getUser(p.id))))
  .map(r => ({ id: r.id, name: r.name, players: r.players.length, watchers: r.watchers.length, ante: r.ante, phase: r.game?.phase || 'waiting' }))));
app.post('/api/rooms', (req, res) => {
  if ([...rooms.values()].some(r => r.players.some(p => p.id === req.user.id) && r.game && r.game.phase !== 'finished')) fail('Finish or leave your current match first.');
  const { name = `${req.user.name}'s circle`, ante = 50, private: isPrivate = false, allowWatchers = true } = req.body;
  if (typeof name !== 'string' || name.trim().length < 3 || name.length > 40 || ![0, 10, 25, 50, 100].includes(ante)) fail('Invalid table name or entry amount.');
  const room = { id: uid(), inviteCode: code(), name: name.trim(), hostId: req.user.id, private: !!isPrivate, allowWatchers: !!allowWatchers, ante, pot: 0, settled: false, players: [{ ...publicUser(req.user), lastSeen: Date.now() }], watchers: [], game: null, chat: [], rematch: [], requests: [], updatedAt: Date.now() };
  rooms.set(room.id, room); persist(room); res.json(roomView(room, req.user));
});
app.post('/api/rooms/join', (req, res) => {
  const room = [...rooms.values()].find(r => r.inviteCode === String(req.body.code || '').toUpperCase() || (!r.private && r.id === req.body.id));
  if (!room) fail('Table not found. Check the invite code.', 404);
  canEnter(room, req.user);
  const seated = room.players.some(p => p.id === req.user.id);
  if (!seated && !room.watchers.includes(req.user.id)) mutate(room, () => {
    if (req.body.watch) {
      if (!room.allowWatchers) fail('This table does not allow watchers.', 403);
      if (room.watchers.length >= 100) fail('The watcher limit has been reached.');
      room.watchers.push(req.user.id);
    } else {
      if (room.game && room.game.phase !== 'finished') fail('The match has started. Join as a watcher instead.');
      if (room.players.length >= 8) fail('This table already has eight players.');
      room.players.push({ ...publicUser(req.user), lastSeen: Date.now() });
    }
  });
  res.json(roomView(room, req.user));
});
function tableFor(req) {
  const room = rooms.get(req.params.id);
  if (!room || !inRoom(room, req.user)) fail('Table not found. Join with an invite first.', 404);
  canEnter(room, req.user); return room;
}
app.get('/api/rooms/:id', (req, res) => res.json(roomView(tableFor(req), req.user)));
app.post('/api/rooms/:id/start', (req, res) => {
  const room = tableFor(req);
  if (room.hostId !== req.user.id) fail('Only the host can start this table.', 403);
  mutate(room, () => {
    if (room.game && room.game.phase !== 'finished') fail('A match is already running.');
    if (room.players.length < 2) fail('Invite another player or add a practice opponent.');
    if (room.game && !room.players.filter(p => !p.bot).every(p => room.rematch.includes(p.id))) fail('All players must accept the rematch.');
    for (const p of room.players.filter(p => !p.bot)) {
      if ([...rooms.values()].some(other => other.id !== room.id && other.game && other.game.phase !== 'finished' && other.game.players.some(q => q.id === p.id && q.count > 0))) fail(`${p.name} is already playing at another table.`);
      const user = getUser(p.id);
      if (usage(user) >= user.dailyMinutes * 60) fail(`${user.name} has reached their daily play limit.`);
      if (user.coins < room.ante) fail(`${user.name} does not have enough free coins.`);
      user.coins -= room.ante; saveUser(user);
    }
    room.pot = room.ante * room.players.length; room.settled = false; room.rematch = []; room.requests = [];
    for (const p of room.players) p.lastSeen = Date.now();
    room.game = createGame(room.players, roll);
  });
  for (const p of room.players.filter(p => !p.bot)) notifyUser(p.id, { type: 'me', user: me(getUser(p.id)) });
  res.json(roomView(room, req.user));
});
app.post('/api/rooms/:id/bot', (req, res) => {
  if (!allowGuests) fail('Practice opponents are disabled on the production server.', 403);
  const room = tableFor(req);
  if (room.hostId !== req.user.id || room.game || room.players.length >= 8) fail('Practice opponents can only be added by the host before a match.');
  mutate(room, () => { const n = room.players.filter(p => p.bot).length; room.players.push({ id: `bot-${uid()}`, name: ['Maya', 'Rio', 'Jules', 'Noah', 'Ash', 'Sam', 'Kai'][n], bot: true, color: (n + 1) % 6 }); });
  res.json(roomView(room, req.user));
});
app.post('/api/rooms/:id/action', (req, res) => {
  const room = tableFor(req);
  if (!room.game) fail('The match has not started.');
  const { requestId, revision, action } = req.body;
  if (typeof requestId !== 'string' || requestId.length > 80 || !action || typeof action !== 'object') fail('Invalid action.');
  if (room.requests.includes(`${req.user.id}:${requestId}`)) return res.json(roomView(room, req.user));
  if (revision !== room.game.revision) fail('The table has changed. Please try again.', 409);
  if (usage(req.user) >= req.user.dailyMinutes * 60) fail('You have reached your daily play limit.', 403);
  mutate(room, () => {
    command(room.game, req.user.id, action, roll);
    room.requests.push(`${req.user.id}:${requestId}`); room.requests = room.requests.slice(-256);
  });
  res.json(roomView(room, req.user));
});
app.post('/api/rooms/:id/chat', (req, res) => {
  const room = tableFor(req);
  const text = req.body.text;
  if (typeof text !== 'string' || !text.trim() || text.length > 300) fail('Messages must be 1–300 characters.');
  const recent = room.chat.filter(m => m.userId === req.user.id && m.at > Date.now() - 5000);
  if (recent.length >= 5) fail('Please slow down.', 429);
  mutate(room, () => { room.chat.push({ id: uid(), userId: req.user.id, name: req.user.name, text: text.trim(), at: Date.now(), reaction: req.body.reaction === true }); room.chat = room.chat.slice(-100); });
  res.json({ ok: true });
});
app.post('/api/rooms/:id/rematch', (req, res) => {
  const room = tableFor(req);
  if (!room.players.some(p => p.id === req.user.id) || room.game?.phase !== 'finished') fail('Players may request a rematch after the match ends.');
  mutate(room, () => { room.rematch = [...new Set([...room.rematch, req.user.id])]; });
  res.json(roomView(room, req.user));
});
app.post('/api/rooms/:id/leave', async (req, res) => {
  const room = tableFor(req);
  mutate(room, () => {
    if (room.game) forfeit(room.game, req.user.id);
    room.players = room.players.filter(p => p.id !== req.user.id); room.watchers = room.watchers.filter(id => id !== req.user.id);
    if (room.hostId === req.user.id) room.hostId = room.players.find(p => !p.bot)?.id || '';
  });
  await kickVideo(room.id, req.user.id);
  res.json({ ok: true });
});
app.post('/api/rooms/:id/video-token', async (req, res) => {
  const room = tableFor(req);
  if (!videoReady) fail('Live video needs your LiveKit project credentials. No video connection has been started.', 503);
  const player = room.players.some(p => p.id === req.user.id && !p.bot);
  const token = new AccessToken(process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET, { identity: req.user.id, name: req.user.name, ttl: '10m' });
  token.addGrant({ room: room.id, roomJoin: true, canPublish: player, canPublishData: false, canSubscribe: true });
  res.json({ url: process.env.LIVEKIT_URL, token: await token.toJwt(), canPublish: player });
});
app.get('/api/crews', (req, res) => res.json(db.prepare('SELECT data FROM crews').all().map(r => JSON.parse(r.data)).filter(c => c.members.includes(req.user.id)).map(c => ({ ...c, members: c.members.map(id => publicUser(getUser(id))) }))));
app.post('/api/crews', (req, res) => {
  const name = req.body.name;
  if (typeof name !== 'string' || name.trim().length < 3 || name.length > 32) fail('Crew names must be 3–32 characters.');
  const count = db.prepare('SELECT data FROM crews').all().filter(r => JSON.parse(r.data).members.includes(req.user.id)).length;
  if (count >= 10) fail('You can belong to at most ten crews.');
  const crew = { id: uid(), name: name.trim(), code: code(), ownerId: req.user.id, members: [req.user.id] };
  db.prepare('INSERT INTO crews VALUES (?,?,?)').run(crew.id, crew.code, JSON.stringify(crew)); res.json(crew);
});
app.post('/api/crews/join', (req, res) => {
  const row = db.prepare('SELECT data FROM crews WHERE code=?').get(String(req.body.code || '').toUpperCase());
  if (!row) fail('Crew invite not found.', 404);
  const crew = JSON.parse(row.data);
  if (crew.members.length >= 50) fail('This crew is full.');
  if (crew.members.some(id => blocked(getUser(id), req.user))) fail('This crew is unavailable because of a block.', 403);
  crew.members = [...new Set([...crew.members, req.user.id])];
  db.prepare('UPDATE crews SET data=? WHERE id=?').run(JSON.stringify(crew), crew.id); res.json(crew);
});
app.post('/api/socket-ticket', (req, res) => { const ticket = randomBytes(24).toString('base64url'); tickets.set(ticket, { id: req.user.id, expires: Date.now() + 30000 }); res.json({ ticket }); });

const builtWeb = resolve(root, 'build/web');
if (existsSync(builtWeb)) app.use(express.static(builtWeb, { maxAge: 0 }));
app.use((req, res) => res.status(404).json({ error: 'Route not found.' }));
app.use((e, req, res, next) => {
  if (!e.status && !(e instanceof GameError)) console.error('Request failed:', e.message);
  res.status(e.status || (e instanceof GameError ? 400 : 500)).json({ error: e.status || e instanceof GameError ? e.message : 'The server could not complete that request.' });
});
const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 2048 });
wss.on('connection', (ws, request) => {
  const socketOrigin = request.headers.origin;
  if (socketOrigin && socketOrigin !== origin && (production || !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(socketOrigin))) return ws.close(1008, 'Origin not allowed');
  const timeout = setTimeout(() => ws.close(1008, 'Authentication required'), 5000);
  ws.on('error', () => {});
  ws.once('message', raw => {
    try {
      const { ticket } = JSON.parse(raw);
      const grant = tickets.get(ticket); tickets.delete(ticket);
      if (!grant || grant.expires < Date.now()) return ws.close(1008, 'Invalid ticket');
      clearTimeout(timeout); ws.userId = grant.id; ws.isAlive = true;
      if (!connections.has(grant.id)) connections.set(grant.id, new Set());
      connections.get(grant.id).add(ws);
      ws.on('pong', () => { ws.isAlive = true; });
      ws.send(JSON.stringify({ type: 'ready' }));
      for (const room of rooms.values()) if (inRoom(room, { id: grant.id })) broadcast(room);
    } catch { ws.close(1008, 'Invalid authentication'); }
  });
  ws.on('close', () => {
    clearTimeout(timeout);
    if (ws.userId) { connections.get(ws.userId)?.delete(ws); if (!connections.get(ws.userId)?.size) connections.delete(ws.userId); }
  });
});
let ticks = 0;
const timer = setInterval(() => {
  ticks++;
  const now = Date.now();
  for (const [key, grant] of tickets) if (grant.expires < now) tickets.delete(key);
  if (ticks % 30 === 0) for (const ws of wss.clients) { if (ws.isAlive === false) ws.terminate(); else { ws.isAlive = false; ws.ping(); } }
  for (const room of rooms.values()) {
    if (!room.game || room.game.phase === 'finished') continue;
    try {
      // Persist usage and state together every tick, so restart cannot reset a cap or refund a bet.
      mutate(room, () => {
        for (const p of room.players.filter(p => !p.bot)) {
          if (connections.get(p.id)?.size) p.lastSeen = now;
          const player = room.game.players.find(q => q.id === p.id);
          if (player?.count > 0) {
            const user = getUser(p.id); usage(user); user.seconds++; saveUser(user);
            if (user.seconds >= user.dailyMinutes * 60 || now - p.lastSeen > 60000) forfeit(room.game, p.id, now);
          }
        }
        const game = room.game;
        if (game.phase === 'finished') return;
        const current = game.players[game.turn];
        if (game.phase === 'reveal' && now > game.deadline) command(game, current.id, { type: 'next' }, roll, now);
        else if (game.phase === 'bidding' && ((current.bot && now > game.deadline - 42500) || now > game.deadline)) {
          command(game, current.id, current.bot ? botAction(game, roll) : game.bid ? { type: 'catch' } : { type: 'bid', quantity: 1, face: roll() }, roll, now);
        }
      });
    } catch (e) { console.error('Table tick failed:', room.id, e.message); }
  }
}, 1000);
const port = Number(process.env.PORT || 8787);
server.listen(port, process.env.HOST || (production ? '0.0.0.0' : '127.0.0.1'), () => console.log(`Street Circle listening at http://localhost:${server.address().port} (${allowGuests ? 'local review accounts enabled' : 'SMS accounts only'})`));
function shutdown() {
  clearInterval(timer);
  for (const ws of wss.clients) ws.close(1001, 'Server restarting');
  server.close(() => { db.close(); process.exit(0); });
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
