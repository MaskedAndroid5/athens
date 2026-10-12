import express from 'express';
import { WebSocketServer } from 'ws';
import { randomUUID, randomBytes, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import { openStore } from './store.js';
import { validateObjects, canModify } from './model.js';
import { simulate } from '../src/simulation.js';
const hashPassword = promisify(scrypt),
  digest = (s) => createHash('sha256').update(s).digest('hex');
const { db, tx } = openStore(resolve(process.env.ATHENS_DATA_DIR || '.data'));
const app = express(),
  limits = new Map();
app.use(express.json({ limit: '128kb' }));
app.use('/api', (req, res, next) => {
  if (req.headers.origin && new URL(req.headers.origin).host !== req.headers.host)
    return res.status(403).json({ error: 'Cross-origin request rejected.' });
  const key = req.ip,
    now = Date.now();
  let l = limits.get(key);
  if (!l || now - l.start > 60000) {
    l = { start: now, n: 0, auth: 0 };
    limits.set(key, l);
  }
  if (++l.n > 240 || (['/auth', '/recover', '/account/delete'].includes(req.path) && ++l.auth > 20))
    return res.status(429).json({ error: 'Too many requests. Try again in a minute.' });
  next();
});
function user(req) {
  const token = req.headers.cookie
    ?.split(/;\s*/)
    .find((v) => v.startsWith('athens='))
    ?.slice(7);
  if (!token) return null;
  return db
    .prepare(
      'SELECT users.* FROM sessions JOIN users ON users.id=sessions.owner WHERE token=? AND expires>?',
    )
    .get(digest(token), Date.now());
}
const publicUser = (u) => ({ id: u.id, name: u.name });
const parcelRow = (r) => (r ? JSON.parse(r.body) : null);
const parcel = (id) => parcelRow(db.prepare('SELECT body FROM parcels WHERE id=?').get(id));
const own = (u) => parcelRow(db.prepare('SELECT body FROM parcels WHERE owner=?').get(u.id));
const clock = () => Math.floor(Date.now() / 1000);
function world() {
  return db
    .prepare(
      'SELECT parcels.body,users.name FROM parcels JOIN users ON users.id=parcels.owner ORDER BY slot',
    )
    .all()
    .map((r) => ({ ...JSON.parse(r.body), ownerName: r.name }))
    .filter((p) => p.published)
    .map((p) => ({ ...p, simulation: simulate(p.objects, 1, p.policy) }));
}
function requireUser(req, res) {
  const u = user(req);
  if (!u) res.status(401).json({ error: 'Sign in to manage persistent creations.' });
  return u;
}
function cookie(res, token) {
  res.cookie('athens', token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 86400000,
  });
}
function session(res, u) {
  const token = randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(digest(token), u.id, Date.now() + 86400000);
  cookie(res, token);
}
function record(p, action) {
  for (const o of p.objects) {
    const existing = db.prepare('SELECT owner FROM object_ids WHERE id=?').get(o.id);
    if (existing && existing.owner !== p.owner)
      throw Error('An object identifier belongs to another account. Copy as new objects.');
    db.prepare('INSERT OR IGNORE INTO object_ids VALUES(?,?)').run(o.id, p.owner);
  }
  db.prepare('UPDATE parcels SET body=? WHERE id=?').run(JSON.stringify(p), p.id);
  db.prepare('INSERT INTO history VALUES(?,?,?,?,?,?,?)').run(
    randomUUID(),
    p.id,
    p.owner,
    p.revision,
    new Date().toISOString(),
    action,
    JSON.stringify(p),
  );
}
app.get('/api/session', (req, res) => res.json({ user: user(req) ? publicUser(user(req)) : null }));
app.post('/api/auth', async (req, res, next) => {
  try {
    const { name, password, register } = req.body;
    if (
      typeof name !== 'string' ||
      !/^[a-zA-Z0-9_ -]{3,24}$/.test(name) ||
      typeof password !== 'string' ||
      password.length < 10 ||
      password.length > 128
    )
      return res
        .status(400)
        .json({ error: 'Use a 3–24 character name and a password of 10–128 characters.' });
    let u = db.prepare('SELECT * FROM users WHERE name=? COLLATE NOCASE').get(name),
      recoveryCode;
    if (register) {
      if (u) return res.status(409).json({ error: 'That name is already registered.' });
      const salt = randomBytes(16).toString('hex');
      const hash = (await hashPassword(password, salt, 64)).toString('hex');
      recoveryCode = randomBytes(24).toString('hex');
      u = { id: randomUUID(), name, salt, hash };
      try {
        db.prepare('INSERT INTO users VALUES(?,?,?,?,?)').run(
          u.id,
          name,
          salt,
          hash,
          digest(recoveryCode),
        );
      } catch {
        return res.status(409).json({ error: 'That name is already registered.' });
      }
    } else {
      const salt = u?.salt || 'dummy-auth-salt';
      const hash = await hashPassword(password, salt, 64);
      if (!u || !timingSafeEqual(Buffer.from(u.hash, 'hex'), hash))
        return res.status(401).json({ error: 'Name or password is incorrect.' });
    }
    session(res, u);
    res.json({ user: publicUser(u), ...(recoveryCode ? { recoveryCode } : {}) });
  } catch (e) {
    next(e);
  }
});
app.post('/api/recover', async (req, res, next) => {
  try {
    const { name, recoveryCode, password } = req.body;
    if (
      typeof name !== 'string' ||
      typeof recoveryCode !== 'string' ||
      typeof password !== 'string' ||
      password.length < 10 ||
      password.length > 128
    )
      return res
        .status(400)
        .json({ error: 'Supply name, recovery code and a new password of 10–128 characters.' });
    const u = db.prepare('SELECT * FROM users WHERE name=? COLLATE NOCASE').get(name);
    if (!u?.recovery || digest(recoveryCode) !== u.recovery)
      return res.status(401).json({ error: 'Recovery details are incorrect.' });
    const salt = randomBytes(16).toString('hex'),
      hash = (await hashPassword(password, salt, 64)).toString('hex'),
      replacement = randomBytes(24).toString('hex');
    tx(() => {
      db.prepare('UPDATE users SET salt=?,hash=?,recovery=? WHERE id=?').run(
        salt,
        hash,
        digest(replacement),
        u.id,
      );
      db.prepare('DELETE FROM sessions WHERE owner=?').run(u.id);
    });
    session(res, u);
    res.json({ user: publicUser(u), recoveryCode: replacement });
  } catch (e) {
    next(e);
  }
});
app.post('/api/logout', (req, res) => {
  const token = req.headers.cookie
    ?.split(/;\s*/)
    .find((v) => v.startsWith('athens='))
    ?.slice(7);
  if (token) db.prepare('DELETE FROM sessions WHERE token=?').run(digest(token));
  res.clearCookie('athens');
  res.json({ ok: true });
});
app.get('/api/export', (req, res) => {
  const u = requireUser(req, res);
  if (!u) return;
  res.json({
    modelVersion: 1,
    user: publicUser(u),
    parcel: own(u),
    history: db
      .prepare(
        'SELECT history.revision,history.time,history.action,history.body FROM history JOIN parcels ON parcels.id=history.parcel WHERE parcels.owner=? ORDER BY history.revision',
      )
      .all(u.id)
      .map((r) => ({ ...r, body: JSON.parse(r.body) })),
  });
});
app.post('/api/account/delete', async (req, res, next) => {
  try {
    const u = requireUser(req, res);
    if (!u) return;
    const password = req.body.password;
    if (
      typeof password !== 'string' ||
      password.length > 128 ||
      !timingSafeEqual(await hashPassword(password, u.salt, 64), Buffer.from(u.hash, 'hex'))
    )
      return res.status(401).json({ error: 'Confirm your password to delete the account.' });
    tx(() => {
      db.prepare('DELETE FROM reports WHERE actor=?').run(u.id);
      db.prepare('DELETE FROM users WHERE id=?').run(u.id);
    });
    res.clearCookie('athens');
    broadcast();
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});
app.get('/api/world', (req, res) => res.json({ modelVersion: 1, tick: clock(), parcels: world() }));
app.post('/api/parcels', (req, res) => {
  const u = requireUser(req, res);
  if (!u) return;
  let p = own(u);
  if (!p) {
    const slots = new Set(
      db
        .prepare('SELECT slot FROM parcels')
        .all()
        .map((r) => r.slot),
    );
    let slot = 0;
    while (slots.has(slot)) slot++;
    if (slot >= 16)
      return res.status(409).json({ error: 'This shared instance has 16 occupied parcels.' });
    p = {
      id: randomUUID(),
      owner: u.id,
      objects: [],
      revision: 0,
      published: false,
      policy: 'equal',
      slot,
    };
    tx(() => {
      db.prepare('INSERT INTO parcels VALUES(?,?,?,?)').run(p.id, u.id, slot, JSON.stringify(p));
      record(p, 'claim');
    });
    broadcast();
  }
  res.json({ parcel: p });
});
app.put('/api/parcels/:id', (req, res) => {
  const p = parcel(req.params.id);
  if (!p) return res.status(404).json({ error: 'Parcel not found.' });
  if (!canModify(p, user(req)))
    return res.status(403).json({ error: 'Only the parcel owner can modify this settlement.' });
  if (req.body.revision !== p.revision)
    return res
      .status(409)
      .json({ error: 'The parcel changed in another session. Reload before saving.' });
  try {
    const objects = validateObjects(req.body.objects);
    if (!['equal', 'priority'].includes(req.body.policy)) throw Error('Invalid allocation rule.');
    const next = {
      ...p,
      objects,
      policy: req.body.policy,
      published: req.body.published === true,
      revision: p.revision + 1,
    };
    tx(() => record(next, next.published ? 'publish' : 'save'));
    broadcast();
    res.json({ parcel: next, simulation: simulate(objects, 1, next.policy) });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
app.get('/api/parcels/:id/history', (req, res) => {
  const p = parcel(req.params.id);
  if (!p || !canModify(p, user(req)))
    return res.status(403).json({ error: 'Only the owner can access parcel history.' });
  res.json({
    history: db
      .prepare(
        'SELECT revision,time,action FROM history WHERE parcel=? ORDER BY revision DESC LIMIT 30',
      )
      .all(p.id),
  });
});
app.post('/api/parcels/:id/restore', (req, res) => {
  const p = parcel(req.params.id);
  if (!p || !canModify(p, user(req)))
    return res.status(403).json({ error: 'Only the owner can restore this parcel.' });
  if (req.body.revision !== p.revision)
    return res.status(409).json({ error: 'Reload the current revision first.' });
  const snapshot = db
    .prepare('SELECT body FROM history WHERE parcel=? AND revision=?')
    .get(p.id, req.body.targetRevision);
  if (!snapshot) return res.status(404).json({ error: 'Snapshot not found.' });
  const next = { ...JSON.parse(snapshot.body), revision: p.revision + 1 };
  tx(() => record(next, 'restore'));
  broadcast();
  res.json({ parcel: next });
});
app.post('/api/scenarios', (req, res) => {
  try {
    const objects = validateObjects(req.body.objects),
      factor = req.body.factor,
      policy = req.body.policy;
    if (
      !Number.isFinite(factor) ||
      factor < 0 ||
      factor > 1 ||
      !['equal', 'priority'].includes(policy)
    )
      throw Error('Invalid scenario parameters.');
    res.json({
      modelVersion: 1,
      seed: 0,
      tick: clock(),
      assumptions: { energyAvailability: factor, allocation: policy, intervalSeconds: 1 },
      baseline: simulate(objects, 1, policy),
      scenario: simulate(objects, factor, policy),
    });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
app.post('/api/reports', (req, res) => {
  const u = requireUser(req, res);
  if (!u) return;
  const { subject, reason } = req.body;
  if (
    typeof subject !== 'string' ||
    subject.length > 80 ||
    typeof reason !== 'string' ||
    reason.length < 5 ||
    reason.length > 1000
  )
    return res.status(400).json({ error: 'Include a subject and a reason (5–1000 characters).' });
  db.prepare('INSERT INTO reports VALUES(?,?,?,?,?)').run(
    randomUUID(),
    u.id,
    subject,
    reason,
    new Date().toISOString(),
  );
  res.json({ ok: true });
});
app.use(express.static('dist'));
app.get('/', (req, res) => res.sendFile(resolve('dist/index.html')));
app.use((err, req, res, next) => {
  console.error(err.message);
  res.status(err.status || 500).json({
    error:
      err.status === 400
        ? 'Invalid JSON request.'
        : 'The operation failed. Your last committed state is preserved.',
  });
});
const server = app.listen(Number(process.env.PORT || 3001), '0.0.0.0', () =>
  console.log('Athens server ready'),
);
const wss = new WebSocketServer({ server, path: '/room', maxPayload: 2048 }),
  peers = new Map();
function send(ws, data) {
  if (ws.readyState === 1) ws.send(JSON.stringify(data));
}
function broadcast() {
  const data = { type: 'world', parcels: world(), tick: clock() };
  for (const ws of peers.keys()) send(ws, data);
}
function presence() {
  const participants = [...peers.values()].map(({ last, ...p }) => p);
  for (const ws of peers.keys()) send(ws, { type: 'presence', participants });
}
wss.on('connection', (ws, req) => {
  try {
    if (req.headers.origin && new URL(req.headers.origin).host !== req.headers.host) {
      ws.close(1008, 'Origin rejected');
      return;
    }
  } catch {
    ws.close(1008);
    return;
  }
  if (peers.size >= 24) {
    ws.close(1013, 'Room full');
    return;
  }
  const u = user(req),
    id = randomUUID();
  peers.set(ws, {
    id,
    account: u?.id || null,
    name: u?.name || 'Guest',
    position: [0, 24],
    last: Date.now(),
  });
  send(ws, { type: 'welcome', id });
  send(ws, { type: 'world', parcels: world(), tick: clock() });
  presence();
  let last = 0,
    lastChat = 0;
  ws.on('message', (data) => {
    if (Date.now() - last < 80) return;
    last = Date.now();
    try {
      const m = JSON.parse(data),
        p = peers.get(ws);
      if (
        m.type === 'move' &&
        Array.isArray(m.position) &&
        m.position.length === 2 &&
        m.position.every((n) => Number.isFinite(n) && Math.abs(n) <= 220)
      ) {
        p.position = m.position;
        if (!p.account && typeof m.name === 'string') p.name = m.name.slice(0, 24) || 'Guest';
        p.last = Date.now();
        presence();
      } else if (m.type === 'chat' && Date.now() - lastChat <= 2000) {
        send(ws, { type: 'error', message: 'Wait two seconds between room messages.' });
      } else if (
        m.type === 'chat' &&
        typeof m.text === 'string' &&
        m.text.trim() &&
        m.text.length <= 300 &&
        Date.now() - lastChat > 2000
      ) {
        lastChat = Date.now();
        for (const peer of peers.keys())
          send(peer, {
            type: 'chat',
            id,
            account: p.account,
            name: p.name,
            text: m.text.trim(),
            time: Date.now(),
          });
      }
    } catch {}
  });
  ws.on('close', () => {
    peers.delete(ws);
    presence();
  });
  ws.on('error', () => {});
});
const heartbeat = setInterval(() => {
  for (const ws of peers.keys()) {
    if (ws.isAlive === false) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
  for (const ws of peers.keys()) send(ws, { type: 'tick', tick: clock() });
  db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now());
}, 1000);
wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => (ws.isAlive = true));
});
function shutdown() {
  clearInterval(heartbeat);
  for (const ws of wss.clients) ws.terminate();
  server.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
