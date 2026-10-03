import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

export class Store {
  constructor(path) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS applications (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL, edition TEXT NOT NULL, username TEXT NOT NULL,
        answers TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'pending', created INTEGER NOT NULL,
        decided INTEGER, reviewer TEXT, reason TEXT, uuid TEXT, log_id TEXT,
        role_done INTEGER DEFAULT 0, dm_done INTEGER DEFAULT 0, notification_done INTEGER DEFAULT 0);
      CREATE UNIQUE INDEX IF NOT EXISTS active_user ON applications(user_id) WHERE state IN ('pending','approved','ready');
      CREATE UNIQUE INDEX IF NOT EXISTS active_account ON applications(edition,username COLLATE NOCASE) WHERE state IN ('pending','approved','ready');
      CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, unique_key TEXT UNIQUE NOT NULL, kind TEXT NOT NULL,
        payload TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'queued', lease TEXT, until INTEGER DEFAULT 0,
        attempts INTEGER DEFAULT 0, error TEXT, result TEXT);
      CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS drafts (user_id TEXT PRIMARY KEY, data TEXT NOT NULL, expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS verifications (user_id TEXT PRIMARY KEY, channel_id TEXT NOT NULL, code TEXT NOT NULL,
        expires INTEGER NOT NULL, next_check INTEGER DEFAULT 0);
      CREATE TABLE IF NOT EXISTS creators (user_id TEXT PRIMARY KEY, channel_id TEXT UNIQUE NOT NULL,
        uuid TEXT UNIQUE NOT NULL, minecraft_name TEXT NOT NULL, data TEXT NOT NULL, refreshed INTEGER DEFAULT 0,
        verified_at INTEGER NOT NULL, role_done INTEGER DEFAULT 0);
      CREATE TABLE IF NOT EXISTS videos (id TEXT PRIMARY KEY, channel_id TEXT NOT NULL, data TEXT NOT NULL,
        checked INTEGER NOT NULL, first_seen INTEGER NOT NULL, ended INTEGER DEFAULT 0);
      CREATE TABLE IF NOT EXISTS posts (key TEXT PRIMARY KEY, channel TEXT NOT NULL, body TEXT NOT NULL,
        message_id TEXT, attempts INTEGER DEFAULT 0, next_try INTEGER DEFAULT 0);
      CREATE TABLE IF NOT EXISTS quota (day TEXT PRIMARY KEY, used INTEGER NOT NULL);
    `);
  }
  one(sql, ...params) { return this.db.prepare(sql).get(...params); }
  all(sql, ...params) { return this.db.prepare(sql).all(...params); }
  run(sql, ...params) { return this.db.prepare(sql).run(...params); }
  transaction(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try { const r = fn(); this.db.exec('COMMIT'); return r; }
    catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }
  get(key, fallback = null) { const r = this.one('SELECT value FROM kv WHERE key=?', key); return r ? JSON.parse(r.value) : fallback; }
  set(key, value) { this.run('INSERT INTO kv VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', key, JSON.stringify(value)); }
  queue(key, kind, payload) {
    this.run('INSERT OR IGNORE INTO jobs(id,unique_key,kind,payload) VALUES (?,?,?,?)', randomUUID(), key, kind, JSON.stringify(payload));
  }
  lease(now = Date.now()) {
    return this.transaction(() => {
      const r = this.one("SELECT * FROM jobs WHERE (state='queued' AND until<=?) OR (state='leased' AND until<?) ORDER BY rowid LIMIT 1", now, now);
      if (!r) return null;
      const lease = randomUUID();
      this.run("UPDATE jobs SET state='leased',lease=?,until=?,attempts=attempts+1 WHERE id=?", lease, now + 180000, r.id);
      return { id: r.id, lease, kind: r.kind, payload: JSON.parse(r.payload) };
    });
  }
  ack(id, lease, success, result = {}, error = '', now = Date.now()) {
    return this.transaction(() => {
      const r = this.one("SELECT * FROM jobs WHERE id=? AND lease=? AND state='leased'", id, lease);
      if (!r) return false;
      const retryLimit = r.kind === 'whitelist' ? 60000 : 3600000;
      this.run('UPDATE jobs SET state=?,result=?,error=?,until=? WHERE id=?', success ? 'done' : 'queued', JSON.stringify(result), String(error).slice(0, 300), now + Math.min(retryLimit, 15000 * 2 ** Math.min(r.attempts, 8)), id);
      if (success && r.kind === 'whitelist') {
        const payload = JSON.parse(r.payload);
        if (!/^[0-9a-f-]{36}$/i.test(result.uuid || '')) throw new Error('Missing resolved player UUID');
        const existing = this.one("SELECT id FROM applications WHERE uuid=? AND id<>? AND state IN ('approved','ready')", result.uuid, payload.applicationId);
        if (existing) throw new Error('This Minecraft account is already assigned to another member');
        this.run("UPDATE applications SET state='ready',uuid=?,notification_done=0 WHERE id=? AND state='approved'", result.uuid, payload.applicationId);
      }
      return true;
    });
  }
  post(key, channel, body) {
    if (channel) this.run('INSERT OR IGNORE INTO posts(key,channel,body) VALUES (?,?,?)', key, channel, JSON.stringify(body));
  }
  close() { this.db.close(); }
}
