import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { openStore } from '../server/store.js';
test('legacy import is idempotent and failed transactions do not leave partial state', () => {
  const dir = mkdtempSync(tmpdir() + '/athens-store-');
  writeFileSync(
    dir + '/world.json',
    JSON.stringify({
      users: [{ id: 'u', name: 'User', salt: 's', hash: 'h' }],
      parcels: [
        {
          id: 'p',
          owner: 'u',
          slot: 0,
          objects: [],
          revision: 0,
          policy: 'equal',
          published: false,
        },
      ],
    }),
  );
  let store;
  try {
    store = openStore(dir);
    assert.equal(store.db.prepare('SELECT count(*) AS n FROM parcels').get().n, 1);
    assert.throws(() =>
      store.tx(() => {
        store.db.prepare("UPDATE users SET name='Changed' WHERE id='u'").run();
        throw Error('simulated disk operation failure');
      }),
    );
    assert.equal(store.db.prepare("SELECT name FROM users WHERE id='u'").get().name, 'User');
    store.db.close();
    store = openStore(dir);
    assert.equal(store.db.prepare('SELECT count(*) AS n FROM users').get().n, 1);
    assert.equal(store.db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
  } finally {
    store?.db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('operator moderation preserves owner state and records separate authority', async () => {
  const { spawnSync } = await import('node:child_process');
  const dir = mkdtempSync(tmpdir() + '/athens-operator-');
  const { db } = openStore(dir);
  try {
    db.prepare('INSERT INTO users(id,name,salt,hash) VALUES(?,?,?,?)').run(
      'u',
      'Owner',
      'test-salt',
      'test-hash',
    );
    db.prepare('INSERT INTO parcels VALUES(?,?,?,?)').run(
      'p',
      'u',
      0,
      JSON.stringify({
        id: 'p',
        owner: 'u',
        slot: 0,
        objects: [],
        revision: 0,
        published: true,
        policy: 'equal',
      }),
    );
    const r = spawnSync('node', ['server/admin.js', 'unpublish', 'p'], {
      env: { ...process.env, ATHENS_DATA_DIR: dir },
      encoding: 'utf8',
    });
    assert.equal(r.status, 0, r.stderr);
    const p = JSON.parse(db.prepare('SELECT body FROM parcels').get().body);
    assert.equal(p.owner, 'u');
    assert.equal(p.published, false);
    assert.equal(p.revision, 1);
    assert.equal(db.prepare('SELECT actor FROM history').get().actor, 'local-operator');
    assert.equal(
      db
        .prepare(
          'SELECT count(*) AS n FROM history JOIN parcels ON parcels.id=history.parcel WHERE parcels.owner=?',
        )
        .get('u').n,
      1,
    );
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
