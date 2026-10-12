import { openStore } from './store.js';
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
const { db, tx } = openStore(resolve(process.env.ATHENS_DATA_DIR || '.data'));
try {
  const [command, arg] = process.argv.slice(2);
  if (command === 'reports')
    console.log(
      JSON.stringify(
        db.prepare('SELECT * FROM reports ORDER BY time DESC LIMIT 100').all(),
        null,
        2,
      ),
    );
  else if (command === 'integrity') {
    const result = db.prepare('PRAGMA integrity_check').get();
    console.log(result.integrity_check);
    if (result.integrity_check !== 'ok') process.exitCode = 1;
  } else if (command === 'backup') {
    if (!arg) throw Error('Provide a new backup filename.');
    db.prepare('VACUUM INTO ?').run(resolve(arg));
    console.log('Consistent database backup saved.');
  } else if (command === 'unpublish') {
    const row = db.prepare('SELECT * FROM parcels WHERE id=?').get(arg);
    if (!row) throw Error('Parcel not found.');
    const p = JSON.parse(row.body);
    p.published = false;
    p.revision++;
    tx(() => {
      db.prepare('UPDATE parcels SET body=? WHERE id=?').run(JSON.stringify(p), p.id);
      db.prepare('INSERT INTO history VALUES(?,?,?,?,?,?,?)').run(
        crypto.randomUUID(),
        p.id,
        'local-operator',
        p.revision,
        new Date().toISOString(),
        'operator-unpublish',
        JSON.stringify(p),
      );
    });
    console.log(
      'Parcel unpublished; preserved in owner history. Restart the server to refresh existing connected clients.',
    );
  } else
    throw Error(
      'Usage: node server/admin.js reports | integrity | backup <new-file> | unpublish <parcel-id>',
    );
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  db.close();
}
