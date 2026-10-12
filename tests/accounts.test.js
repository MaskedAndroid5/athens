import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
test('private drafts, authoritative scenario isolation, history restore, recovery and deletion', async () => {
  const dir = await mkdtemp(tmpdir() + '/athens-account-');
  let child;
  async function start() {
    child = spawn('node', ['server/index.js'], {
      env: { ...process.env, ATHENS_DATA_DIR: dir, PORT: '3098' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    await new Promise((resolve, reject) => {
      child.stdout.once('data', resolve);
      child.once('error', reject);
      child.once('exit', (code) => reject(Error('Server exited ' + code)));
    });
  }
  async function stop() {
    const ended = new Promise((r) => child.once('exit', r));
    child.kill();
    await ended;
  }
  async function req(path, data, cookie, method = 'POST', headers = {}) {
    const r = await fetch('http://127.0.0.1:3098/api' + path, {
      method: data ? method : 'GET',
      headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}), ...headers },
      ...(data ? { body: JSON.stringify(data) } : {}),
    });
    return {
      status: r.status,
      data: await r.json(),
      cookie: r.headers.get('set-cookie')?.split(';')[0],
    };
  }
  try {
    await start();
    const a = await req('/auth', { name: 'Owner', password: 'owner-password-123', register: true });
    assert.equal(a.status, 200);
    assert.ok(a.data.recoveryCode);
    assert.equal(
      (await req('/auth', { name: 'owner', password: 'other-password', register: true })).status,
      409,
    );
    const claimed = await req('/parcels', {}, a.cookie),
      p = claimed.data.parcel;
    const objects = [
      { id: 'home', kind: 'home', position: [-4, 0], rotation: 0, scale: 1, connected: true },
      { id: 'solar', kind: 'solar', position: [4, 0], rotation: 0, scale: 1, connected: true },
      {
        id: 'resident',
        kind: 'resident',
        position: [0, 4],
        rotation: 0,
        scale: 1,
        connected: true,
      },
    ];
    await req(
      '/parcels/' + p.id,
      { objects, policy: 'equal', revision: 0, published: false },
      a.cookie,
      'PUT',
    );
    assert.equal((await req('/world')).data.parcels.length, 0);
    assert.equal((await req('/parcels/' + p.id + '/history')).status, 403);
    const s = await req('/scenarios', { objects, factor: 0.2, policy: 'equal' });
    assert.equal(s.data.baseline.used, 5);
    assert.ok(Math.abs(s.data.scenario.used - 2.4) < 1e-9);
    assert.equal((await req('/export', null, a.cookie)).data.parcel.revision, 1);
    assert.equal((await req('/scenarios', { objects, factor: 2, policy: 'equal' })).status, 400);
    const published = await req(
      '/parcels/' + p.id,
      { objects, policy: 'equal', revision: 1, published: true },
      a.cookie,
      'PUT',
    );
    assert.equal(published.data.parcel.revision, 2);
    assert.equal((await req('/world')).data.parcels[0].simulation.used, 5);
    assert.equal((await req('/world')).data.parcels[0].hash, undefined);
    const visitor = await req('/auth', {
      name: 'Visitor',
      password: 'visitor-password',
      register: true,
    });
    const v = (await req('/parcels', {}, visitor.cookie)).data.parcel;
    assert.equal(
      (
        await req(
          '/parcels/' + v.id,
          { objects, policy: 'equal', revision: 0, published: true },
          visitor.cookie,
          'PUT',
        )
      ).status,
      400,
    );
    assert.equal((await req('/export', null, a.cookie)).data.parcel.objects.length, 3);
    const restored = await req(
      '/parcels/' + p.id + '/restore',
      { revision: 2, targetRevision: 0 },
      a.cookie,
    );
    assert.equal(restored.data.parcel.revision, 3);
    assert.equal(restored.data.parcel.objects.length, 0);
    assert.equal(
      (await req('/parcels/' + p.id + '/history', null, a.cookie)).data.history.length,
      4,
    );
    assert.equal(
      (
        await req(
          '/reports',
          { subject: 'guest-id', reason: 'Repeated abusive messages.' },
          a.cookie,
        )
      ).status,
      200,
    );
    assert.equal(
      (await req('/parcels', {}, a.cookie, 'POST', { Origin: 'https://evil.example' })).status,
      403,
    );
    await stop();
    await start();
    assert.equal((await req('/session', null, a.cookie)).data.user.id, a.data.user.id);
    assert.equal(
      (
        await req('/recover', {
          name: 'Owner',
          recoveryCode: 'incorrect',
          password: 'replacement-password',
        })
      ).status,
      401,
    );
    const recovery = await req('/recover', {
      name: 'Owner',
      recoveryCode: a.data.recoveryCode,
      password: 'replacement-password',
    });
    assert.equal(recovery.status, 200);
    assert.equal((await req('/session', null, a.cookie)).data.user, null);
    assert.equal(
      (
        await req('/recover', {
          name: 'Owner',
          recoveryCode: a.data.recoveryCode,
          password: 'replacement-password',
        })
      ).status,
      401,
    );
    assert.equal(
      (await req('/account/delete', { password: 'wrong' }, recovery.cookie)).status,
      401,
    );
    assert.equal(
      (await req('/account/delete', { password: 'replacement-password' }, recovery.cookie)).status,
      200,
    );
    assert.equal((await req('/session', null, recovery.cookie)).data.user, null);
    assert.equal((await req('/export', null, recovery.cookie)).status, 401);
    assert.equal((await req('/world')).data.parcels.length, 0);
  } finally {
    if (child?.exitCode === null) await stop();
    await rm(dir, { recursive: true, force: true });
  }
});
