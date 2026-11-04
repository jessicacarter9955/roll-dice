import express from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { WebSocketServer, WebSocket } from 'ws';
import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomUUID, randomInt, createHash, timingSafeEqual } from 'node:crypto';
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
CREATE TABLE IF NOT EXISTS moderation_actions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, action TEXT NOT NULL, reason TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS reports (id TEXT PRIMARY KEY, reporter_id TEXT NOT NULL, target_id TEXT NOT NULL, room_id TEXT, reason TEXT NOT NULL, details TEXT NOT NULL, created_at INTEGER NOT NULL);`);
// Existing databases created before moderation shipped need a non-destructive migration.
const reportColumns = new Set(db.prepare('PRAGMA table_info(reports)').all().map(c => c.name));
if (!reportColumns.has('status')) db.exec("ALTER TABLE reports ADD COLUMN status TEXT NOT NULL DEFAULT 'open'");
if (!reportColumns.has('reviewed_at')) db.exec('ALTER TABLE reports ADD COLUMN reviewed_at INTEGER');
db.exec('CREATE INDEX IF NOT EXISTS reports_by_created ON reports(created_at DESC)');
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
  if (user.suspended) fail('This account is suspended. Contact support.', 403);
  const token = randomBytes(32).toString('base64url');
  db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(hash(token), user.id, Date.now() + 30 * 86400000);
  return { token, user: me(user) };
}
function authToken(token) {
  if (!token || token.length > 100) fail('Please sign in.', 401);
  const row = db.prepare('SELECT user_id FROM sessions WHERE hash=? AND expires>?').get(hash(token), Date.now());
  if (!row) fail('Your session has expired. Please sign in again.', 401);
  const user = getUser(row.user_id);
  if (user.suspended) fail('This account is suspended. Contact support.', 403);
  return user;
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
// Moderator access is separate from user sessions and is disabled unless a
// secret is configured. This portal intentionally does not store the key.
const adminToken = process.env.ADMIN_TOKEN || '';
const adminLimit = rateLimit({windowMs: 60000, limit: 40, standardHeaders: 'draft-8', legacyHeaders: false});
app.use('/admin/api', adminLimit, (req, res, next) => {
  const supplied = req.headers.authorization?.replace(/^Bearer /, '') || '';
  if (!adminToken || adminToken.length < 32 || !supplied ||
      !timingSafeEqual(Buffer.from(hash(supplied), 'hex'), Buffer.from(hash(adminToken), 'hex')))
    return res.status(401).json({error: 'Moderator access is not configured or the key is invalid.'});
  next();
});
app.get('/admin/api/reports', (req, res) => {
  const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 50));
  const offset = Math.min(5000, Math.max(0, Number.parseInt(req.query.offset, 10) || 0));
  const status = req.query.status === 'reviewed' ? 'reviewed' : req.query.status === 'open' ? 'open' : null;
  const rows = db.prepare(`SELECT id, reporter_id AS reporterId, target_id AS targetId,
    room_id AS roomId, reason, details, created_at AS createdAt,
    status, reviewed_at AS reviewedAt,
    (SELECT json_extract(data, '$.suspended') FROM users WHERE users.id=reports.target_id) AS targetSuspended
    FROM reports
    WHERE (? IS NULL OR status=?) ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .all(status, status, limit, offset);
  res.json({reports: rows, count: db.prepare('SELECT COUNT(*) AS n FROM reports WHERE (? IS NULL OR status=?)').get(status,status).n});
});
app.patch('/admin/api/reports/:id', (req, res) => {
  if (!['open','reviewed'].includes(req.body.status)) fail('Invalid review status.');
  const result = db.prepare('UPDATE reports SET status=?, reviewed_at=? WHERE id=?')
    .run(req.body.status, req.body.status === 'reviewed' ? Date.now() : null, req.params.id);
  if (result.changes !== 1) fail('Report not found.', 404);
  res.json({ok: true});
});
app.get('/admin/api/users/:id', (req, res) => {
  const user = getUser(req.params.id);
  const actions = db.prepare('SELECT action, reason, created_at AS createdAt FROM moderation_actions WHERE user_id=? ORDER BY created_at DESC LIMIT 30').all(user.id);
  res.json({user: {...publicUser(user), suspended: !!user.suspended}, actions});
});
app.patch('/admin/api/users/:id/status', async (req, res) => {
  if (typeof req.body?.suspended !== 'boolean' || typeof req.body.reason !== 'string' ||
      req.body.reason.trim().length < 8 || req.body.reason.length > 300)
    fail('A suspension decision and a reason of 8–300 characters are required.');
  const user = getUser(req.params.id);
  const suspended = req.body.suspended;
  if (!!user.suspended === suspended) fail('The account is already in that state.', 409);
  user.suspended = suspended;
  db.exec('BEGIN IMMEDIATE');
  try {
    saveUser(user);
    db.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id);
    db.prepare('INSERT INTO moderation_actions VALUES (?,?,?,?,?)').run(uid(), user.id, suspended ? 'suspend' : 'restore', req.body.reason.trim(), Date.now());
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  if (suspended) {
    for (const [key, grant] of tickets) if (grant.id === user.id) tickets.delete(key);
    for (const ws of connections.get(user.id) || []) ws.close(1008, 'Account suspended');
    const affected = [];
    for (const room of rooms.values()) {
      if (!inRoom(room, user)) continue;
      mutate(room, () => {
        if (room.game) forfeit(room.game, user.id);
        room.players = room.players.filter(p => p.id !== user.id);
        room.watchers = room.watchers.filter(id => id !== user.id);
        if (room.hostId === user.id) room.hostId = room.players.find(p => !p.bot)?.id || '';
      });
      affected.push(room.id);
    }
    await Promise.all(affected.map(roomId => kickVideo(roomId, user.id)));
  }
  res.json({ok: true, suspended});
});
// The Flutter/WebGL client needs a different resource policy; the moderator
// portal is isolated with a strict, non-inline Content Security Policy.
app.use('/admin', helmet.contentSecurityPolicy({directives: {
  defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'"],
  connectSrc: ["'self'"], objectSrc: ["'none'"], baseUri: ["'none'"],
  frameAncestors: ["'none'"], formAction: ["'self'"],
}}));
app.use('/admin', express.static(resolve(root, 'server/admin'), {index: 'index.html', maxAge: 0}));
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
app.get('/api/me/export', (req, res) => {
  // Export only the requesting person's information. Never include session
  // secrets, other players' unrevealed dice or complete private-room snapshots.
  const id = req.user.id;
  const membership = db.prepare('SELECT data FROM crews').all()
    .map(row => JSON.parse(row.data)).filter(c => c.members.includes(id))
    .map(c => ({id: c.id, name: c.name, owner: c.ownerId === id, code: c.code}));
  const played = [...rooms.values()].filter(r =>
    r.players.some(p => p.id === id) || r.game?.players.some(p => p.id === id))
    .map(r => ({id: r.id, name: r.name, createdOrUpdatedAt: r.updatedAt,
      chat: r.chat.filter(m => m.userId === id),
      ownGameEvents: (r.game?.history || []).filter(e => e.playerId === id)}));
  const reports = db.prepare(`SELECT id, target_id AS targetId, room_id AS roomId, reason,
    details, created_at AS createdAt, status FROM reports WHERE reporter_id=? ORDER BY created_at DESC`).all(id);
  res.setHeader('Cache-Control', 'no-store');
  res.json({exportedAt: new Date().toISOString(), profile: req.user, crews: membership,
    gameActivity: played, submittedReports: reports});
});
// Shared game results remain usable by the other participants, but the
// departing person's identifier and display name are de-identified. Chat
// authored by that person is removed rather than retained under an alias.
function redactGameIdentity(value, id, name, alias, key = '') {
  if (Array.isArray(value)) return value.map(v => redactGameIdentity(v, id, name, alias));
  if (value && typeof value === 'object') return Object.fromEntries(
    Object.entries(value).map(([k, v]) => [k, redactGameIdentity(v, id, name, alias, k)]));
  if (value === id) return alias;
  if ((key === 'name' || key === 'loserName') && value === name) return 'Deleted player';
  return value;
}
app.post('/api/me/delete', async (req, res) => {
  if (req.body?.confirmation !== 'DELETE MY ACCOUNT')
    fail('Enter DELETE MY ACCOUNT to permanently delete your account.');
  const {id, name} = req.user;
  const affected = [];
  for (const room of rooms.values()) {
    if (!JSON.stringify(room).includes(id)) continue;
    const alias = `deleted-${uid()}`; // Do not link the same ex-member across tables.
    mutate(room, () => {
      if (room.game) forfeit(room.game, id);
      room.players = room.players.filter(p => p.id !== id);
      room.watchers = room.watchers.filter(userId => userId !== id);
      room.chat = room.chat.filter(message => message.userId !== id);
      room.rematch = room.rematch.filter(userId => userId !== id);
      room.requests = room.requests.filter(request => !request.startsWith(`${id}:`));
      if (room.hostId === id) room.hostId = room.players.find(p => !p.bot)?.id || '';
      if (room.name === `${name}'s circle`) room.name = 'Former host circle';
      if (room.game) room.game = redactGameIdentity(room.game, id, name, alias);
    });
    affected.push(room.id);
  }
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const row of db.prepare('SELECT id, data FROM crews').all()) {
      const crew = JSON.parse(row.data);
      if (!crew.members.includes(id)) continue;
      crew.members = crew.members.filter(member => member !== id);
      if (!crew.members.length) db.prepare('DELETE FROM crews WHERE id=?').run(crew.id);
      else {
        if (crew.ownerId === id) crew.ownerId = crew.members[0];
        db.prepare('UPDATE crews SET data=? WHERE id=?').run(JSON.stringify(crew), crew.id);
      }
    }
    for (const row of db.prepare('SELECT data FROM users WHERE id!=?').all(id)) {
      const other = JSON.parse(row.data);
      if (other.blocked.includes(id)) {
        other.blocked = other.blocked.filter(blockedId => blockedId !== id);
        saveUser(other);
      }
    }
    db.prepare('DELETE FROM reports WHERE reporter_id=? OR target_id=?').run(id, id);
    db.prepare('DELETE FROM moderation_actions WHERE user_id=?').run(id);
    db.prepare('DELETE FROM sessions WHERE user_id=?').run(id);
    db.prepare('DELETE FROM users WHERE id=?').run(id);
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  for (const [key, grant] of tickets) if (grant.id === id) tickets.delete(key);
  for (const ws of connections.get(id) || []) ws.close(1008, 'Account deleted');
  await Promise.all(affected.map(roomId => kickVideo(roomId, id)));
  res.setHeader('Cache-Control', 'no-store');
  res.json({ok: true, deleted: true});
});
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
  db.prepare('INSERT INTO reports (id, reporter_id, target_id, room_id, reason, details, created_at) VALUES (?,?,?,?,?,?,?)')
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
  if (crew.members.includes(req.user.id)) return res.json(crew);
  const memberCount = db.prepare('SELECT data FROM crews').all().filter(r => JSON.parse(r.data).members.includes(req.user.id)).length;
  if (memberCount >= 10) fail('You can belong to at most ten crews.');
  if (crew.members.length >= 50) fail('This crew is full.');
  if (crew.members.some(id => blocked(getUser(id), req.user))) fail('This crew is unavailable because of a block.', 403);
  crew.members = [...new Set([...crew.members, req.user.id])];
  db.prepare('UPDATE crews SET data=? WHERE id=?').run(JSON.stringify(crew), crew.id); res.json(crew);
});
function managedCrew(req, ownerOnly = false) {
  const row = db.prepare('SELECT data FROM crews WHERE id=?').get(req.params.id);
  if (!row) fail('Crew not found.', 404);
  const crew = JSON.parse(row.data);
  if (!crew.members.includes(req.user.id)) fail('You are not a member of this crew.', 403);
  if (ownerOnly && crew.ownerId !== req.user.id) fail('Only the crew owner may do this.', 403);
  return crew;
}
app.post('/api/crews/:id/leave', (req, res) => {
  const crew = managedCrew(req);
  crew.members = crew.members.filter(id => id !== req.user.id);
  if (!crew.members.length) {
    db.prepare('DELETE FROM crews WHERE id=?').run(crew.id);
    return res.json({ok: true, deleted: true});
  }
  if (crew.ownerId === req.user.id) crew.ownerId = crew.members[0];
  db.prepare('UPDATE crews SET data=? WHERE id=?').run(JSON.stringify(crew), crew.id);
  res.json({ok: true, deleted: false, ownerId: crew.ownerId});
});
app.delete('/api/crews/:id', (req, res) => {
  const crew = managedCrew(req, true);
  db.prepare('DELETE FROM crews WHERE id=?').run(crew.id);
  res.json({ok: true});
});
app.post('/api/crews/:id/rotate-code', (req, res) => {
  const crew = managedCrew(req, true);
  crew.code = code();
  db.prepare('UPDATE crews SET code=?, data=? WHERE id=?').run(crew.code, JSON.stringify(crew), crew.id);
  res.json(crew);
});
app.post('/api/crews/:id/transfer', (req, res) => {
  const crew = managedCrew(req, true);
  if (req.body.userId === req.user.id || !crew.members.includes(req.body.userId)) fail('Choose another crew member to become the owner.');
  crew.ownerId = req.body.userId;
  db.prepare('UPDATE crews SET data=? WHERE id=?').run(JSON.stringify(crew), crew.id);
  res.json(crew);
});
app.post('/api/crews/:id/remove-member', (req, res) => {
  const crew = managedCrew(req, true);
  if (req.body.userId === req.user.id || !crew.members.includes(req.body.userId)) fail('Choose another crew member to remove.');
  crew.members = crew.members.filter(id => id !== req.body.userId);
  db.prepare('UPDATE crews SET data=? WHERE id=?').run(JSON.stringify(crew), crew.id);
  res.json(crew);
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
      if (getUser(grant.id).suspended) return ws.close(1008, 'Account suspended');
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
