import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
export function openStore(directory) {
  mkdirSync(directory, { recursive: true });
  const db = new DatabaseSync(resolve(directory, 'athens.sqlite'));
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
 CREATE TABLE IF NOT EXISTS metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,name TEXT NOT NULL COLLATE NOCASE UNIQUE,salt TEXT NOT NULL,hash TEXT NOT NULL,recovery TEXT);
 CREATE TABLE IF NOT EXISTS parcels(id TEXT PRIMARY KEY,owner TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,slot INTEGER NOT NULL UNIQUE,body TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,owner TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS history(id TEXT PRIMARY KEY,parcel TEXT NOT NULL REFERENCES parcels(id) ON DELETE CASCADE,actor TEXT NOT NULL,revision INTEGER NOT NULL,time TEXT NOT NULL,action TEXT NOT NULL,body TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS object_ids(id TEXT PRIMARY KEY,owner TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE);
 CREATE TABLE IF NOT EXISTS reports(id TEXT PRIMARY KEY,actor TEXT,subject TEXT NOT NULL,reason TEXT NOT NULL,time TEXT NOT NULL);
 INSERT OR IGNORE INTO metadata VALUES('schemaVersion','1');`);
  const tx = (fn) => {
    db.exec('BEGIN IMMEDIATE');
    try {
      const result = fn();
      db.exec('COMMIT');
      return result;
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  };
  const old = resolve(directory, 'world.json');
  if (existsSync(old) && !db.prepare("SELECT value FROM metadata WHERE key='legacyImported'").get())
    tx(() => {
      const legacy = JSON.parse(readFileSync(old, 'utf8'));
      for (const u of legacy.users)
        db.prepare('INSERT OR IGNORE INTO users(id,name,salt,hash) VALUES(?,?,?,?)').run(
          u.id,
          u.name,
          u.salt,
          u.hash,
        );
      for (const p of legacy.parcels)
        db.prepare('INSERT OR IGNORE INTO parcels VALUES(?,?,?,?)').run(
          p.id,
          p.owner,
          p.slot,
          JSON.stringify(p),
        );
      db.prepare("INSERT INTO metadata VALUES('legacyImported','true')").run();
    });
  tx(() => {
    for (const row of db.prepare('SELECT body FROM parcels').all()) {
      const p = JSON.parse(row.body);
      for (const o of p.objects) {
        const existing = db.prepare('SELECT owner FROM object_ids WHERE id=?').get(o.id);
        if (existing && existing.owner !== p.owner)
          throw Error(
            'Existing world contains conflicting object identifiers. Preserve the database and repair the migration.',
          );
        db.prepare('INSERT OR IGNORE INTO object_ids VALUES(?,?)').run(o.id, p.owner);
      }
    }
  });
  return { db, tx };
}
