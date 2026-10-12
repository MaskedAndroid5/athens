import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { WebSocket } from 'ws';
test('account persistence, authorization, conflict detection and shared-room updates', async () => {
  const dir = await mkdtemp(tmpdir() + '/athens-test-');
  let process;
  const sockets = [];
  async function start() {
    process = spawn('node', ['server/index.js'], {
      env: { ...globalThis.process.env, ATHENS_DATA_DIR: dir, PORT: '3099' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    await new Promise((resolve, reject) => {
      process.stdout.once('data', resolve);
      process.once('error', reject);
      process.once('exit', (c) => reject(Error('Server exited ' + c)));
    });
  }
  async function request(path, body, cookie, method = 'POST') {
    const r = await fetch('http://127.0.0.1:3099/api' + path, {
      method: body ? method : 'GET',
      headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return {
      status: r.status,
      data: await r.json(),
      cookie: r.headers.get('set-cookie')?.split(';')[0],
    };
  }
  async function stop() {
    const done = new Promise((r) => process.once('exit', r));
    process.kill();
    await done;
  }
  try {
    await start();
    const a = await request('/auth', {
      name: 'Builder',
      password: 'strong-password-a',
      register: true,
    });
    const b = await request('/auth', {
      name: 'Visitor',
      password: 'strong-password-b',
      register: true,
    });
    assert.equal(a.status, 200);
    const p = await request('/parcels', {}, a.cookie);
    const obj = {
      id: 'solar-one',
      kind: 'solar',
      position: [0, 0],
      rotation: 0,
      scale: 1,
      connected: true,
    };
    assert.equal(
      (
        await request(
          '/parcels/' + p.data.parcel.id,
          { objects: [obj], policy: 'equal', revision: 0 },
          b.cookie,
          'PUT',
        )
      ).status,
      403,
    );
    const ws = new WebSocket('ws://127.0.0.1:3099/room');
    sockets.push(ws);
    await new Promise((r) => ws.once('open', r));
    const update = new Promise((resolve) =>
      ws.on('message', (v) => {
        const m = JSON.parse(v);
        if (m.type === 'world' && m.parcels.some((p) => p.objects.length === 1)) resolve(m);
      }),
    );
    assert.equal(
      (
        await request(
          '/parcels/' + p.data.parcel.id,
          { objects: [obj], policy: 'equal', revision: 0, published: true },
          a.cookie,
          'PUT',
        )
      ).status,
      200,
    );
    await Promise.race([
      update,
      new Promise((_, reject) => setTimeout(() => reject(Error('No shared world update')), 2000)),
    ]);
    assert.equal(
      (
        await request(
          '/parcels/' + p.data.parcel.id,
          { objects: [], policy: 'equal', revision: 0 },
          a.cookie,
          'PUT',
        )
      ).status,
      409,
    );
    ws.close();
    await new Promise((r) => ws.once('close', r));
    await stop();
    await start();
    const login = await request('/auth', {
      name: 'Builder',
      password: 'strong-password-a',
      register: false,
    });
    const loaded = await request('/parcels', {}, login.cookie);
    assert.equal(loaded.data.parcel.objects[0].id, 'solar-one');
    assert.equal(loaded.data.parcel.revision, 1);
    assert.equal((await request('/parcels', {})).status, 401);
  } finally {
    for (const ws of sockets) ws.terminate();
    if (process?.exitCode === null) await stop();
    await rm(dir, { recursive: true, force: true });
  }
});
