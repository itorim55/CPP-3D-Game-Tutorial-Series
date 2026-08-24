'use strict';
// Camada de base de dados — usa o SQLite embutido do Node 22+ (node:sqlite).
// Zero dependências externas: não é preciso npm install.

const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'stats.db'));
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS players (
  steam_id     TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  first_seen   INTEGER NOT NULL,
  last_seen    INTEGER NOT NULL,
  playtime_s   INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS wipes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at INTEGER NOT NULL,
  map_seed   TEXT,
  map_size   INTEGER,
  label      TEXT
);

CREATE TABLE IF NOT EXISTS kills (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  ts          INTEGER NOT NULL,
  wipe_id     INTEGER NOT NULL REFERENCES wipes(id),
  attacker_id TEXT NOT NULL,
  victim_id   TEXT NOT NULL,
  weapon      TEXT,
  distance    REAL,
  headshot    INTEGER NOT NULL DEFAULT 0,
  bodypart    TEXT
);
CREATE INDEX IF NOT EXISTS idx_kills_wipe     ON kills(wipe_id);
CREATE INDEX IF NOT EXISTS idx_kills_attacker ON kills(attacker_id);
CREATE INDEX IF NOT EXISTS idx_kills_victim   ON kills(victim_id);
CREATE INDEX IF NOT EXISTS idx_kills_ts       ON kills(ts);

CREATE TABLE IF NOT EXISTS pve_deaths (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  ts        INTEGER NOT NULL,
  wipe_id   INTEGER NOT NULL REFERENCES wipes(id),
  victim_id TEXT NOT NULL,
  cause     TEXT
);

CREATE TABLE IF NOT EXISTS gather (
  wipe_id  INTEGER NOT NULL REFERENCES wipes(id),
  steam_id TEXT NOT NULL,
  resource TEXT NOT NULL,
  amount   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (wipe_id, steam_id, resource)
);

CREATE TABLE IF NOT EXISTS heartbeats (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  ts          INTEGER NOT NULL,
  players     INTEGER NOT NULL,
  max_players INTEGER NOT NULL,
  queued      INTEGER NOT NULL DEFAULT 0,
  joining     INTEGER NOT NULL DEFAULT 0,
  fps         REAL,
  entities    INTEGER
);
CREATE INDEX IF NOT EXISTS idx_heartbeats_ts ON heartbeats(ts);

CREATE TABLE IF NOT EXISTS server_info (
  key   TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS applications (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  ts           INTEGER NOT NULL,
  name         TEXT NOT NULL,
  steam_id     TEXT NOT NULL,
  discord      TEXT NOT NULL,
  age          INTEGER,
  hours_played INTEGER,
  timezone     TEXT,
  availability TEXT,
  experience   TEXT,
  motivation   TEXT,
  scenario1    TEXT,
  scenario2    TEXT,
  scenario3    TEXT,
  status       TEXT NOT NULL DEFAULT 'pendente',
  ip           TEXT
);

CREATE TABLE IF NOT EXISTS staff (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  name     TEXT NOT NULL,
  role     TEXT NOT NULL,
  steam_id TEXT,
  since    INTEGER,
  blurb    TEXT,
  active   INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS bans (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  ts         INTEGER NOT NULL,
  steam_name TEXT NOT NULL,
  reason     TEXT NOT NULL,
  staff_name TEXT NOT NULL,
  evidence   TEXT
);
`);

// ---------- helpers ----------

function now() { return Math.floor(Date.now() / 1000); }

function currentWipe() {
  let w = db.prepare('SELECT * FROM wipes ORDER BY started_at DESC LIMIT 1').get();
  if (!w) {
    db.prepare('INSERT INTO wipes (started_at, label) VALUES (?, ?)').run(now(), 'Wipe inicial');
    w = db.prepare('SELECT * FROM wipes ORDER BY started_at DESC LIMIT 1').get();
  }
  return w;
}

function upsertPlayer(steamId, name, ts) {
  db.prepare(`
    INSERT INTO players (steam_id, name, first_seen, last_seen)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(steam_id) DO UPDATE SET name = excluded.name, last_seen = excluded.last_seen
  `).run(steamId, name || 'Desconhecido', ts, ts);
}

function addPlaytime(steamId, seconds) {
  db.prepare('UPDATE players SET playtime_s = playtime_s + ? WHERE steam_id = ?')
    .run(Math.max(0, seconds | 0), steamId);
}

function recordKill(e, wipeId) {
  recordKill.stmt ??= db.prepare(`
    INSERT INTO kills (ts, wipe_id, attacker_id, victim_id, weapon, distance, headshot, bodypart)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  recordKill.stmt.run(e.ts, wipeId, e.attackerId, e.victimId,
    e.weapon || null, e.distance ?? null, e.headshot ? 1 : 0, e.bodypart || null);
}

function recordPveDeath(e, wipeId) {
  recordPveDeath.stmt ??= db.prepare(
    'INSERT INTO pve_deaths (ts, wipe_id, victim_id, cause) VALUES (?, ?, ?, ?)');
  recordPveDeath.stmt.run(e.ts, wipeId, e.victimId, e.cause || null);
}

function recordGather(wipeId, steamId, resource, amount) {
  recordGather.stmt ??= db.prepare(`
    INSERT INTO gather (wipe_id, steam_id, resource, amount) VALUES (?, ?, ?, ?)
    ON CONFLICT(wipe_id, steam_id, resource) DO UPDATE SET amount = amount + excluded.amount
  `);
  recordGather.stmt.run(wipeId, steamId, resource, amount | 0);
}

function recordHeartbeat(h) {
  db.prepare(`
    INSERT INTO heartbeats (ts, players, max_players, queued, joining, fps, entities)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(now(), h.players | 0, h.maxPlayers | 0, h.queued | 0, h.joining | 0,
         h.fps ?? null, h.entities ?? null);
  // manter só ~30 dias de histórico
  db.prepare('DELETE FROM heartbeats WHERE ts < ?').run(now() - 30 * 86400);
}

function setInfo(key, value) {
  db.prepare(`
    INSERT INTO server_info (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, String(value));
}

function getInfo(key) {
  const r = db.prepare('SELECT value FROM server_info WHERE key = ?').get(key);
  return r ? r.value : null;
}

// ---------- consultas públicas ----------

const LEADERBOARD_SORTS = {
  kills:     'kills DESC',
  deaths:    'deaths DESC',
  kd:        'kd DESC, kills DESC',
  headshots: 'headshots DESC',
  distance:  'best_distance DESC',
  playtime:  'playtime_s DESC',
};

function leaderboard(by = 'kills', wipeOnly = true, limit = 50) {
  const order = LEADERBOARD_SORTS[by] || LEADERBOARD_SORTS.kills;
  const wipe = currentWipe();
  const wipeFilterK = wipeOnly ? 'AND k.wipe_id = ?' : '';
  const params = wipeOnly ? [wipe.id, wipe.id, limit] : [limit];
  return db.prepare(`
    SELECT p.steam_id, p.name, p.playtime_s,
      COALESCE(ka.kills, 0)  AS kills,
      COALESCE(ka.headshots, 0) AS headshots,
      COALESCE(ka.best_distance, 0) AS best_distance,
      COALESCE(vd.deaths, 0) AS deaths,
      ROUND(CAST(COALESCE(ka.kills,0) AS REAL) / MAX(COALESCE(vd.deaths,0), 1), 2) AS kd
    FROM players p
    LEFT JOIN (
      SELECT attacker_id, COUNT(*) kills, SUM(headshot) headshots, MAX(distance) best_distance
      FROM kills k WHERE 1=1 ${wipeOnly ? 'AND k.wipe_id = ?' : ''}
      GROUP BY attacker_id
    ) ka ON ka.attacker_id = p.steam_id
    LEFT JOIN (
      SELECT victim_id, COUNT(*) deaths
      FROM kills k WHERE 1=1 ${wipeFilterK}
      GROUP BY victim_id
    ) vd ON vd.victim_id = p.steam_id
    WHERE COALESCE(ka.kills,0) + COALESCE(vd.deaths,0) > 0 OR p.playtime_s > 0
    ORDER BY ${order}
    LIMIT ?
  `).all(...params);
}

function playerProfile(steamId) {
  const p = db.prepare('SELECT * FROM players WHERE steam_id = ?').get(steamId);
  if (!p) return null;
  const wipe = currentWipe();

  const agg = (wipeId) => {
    const cond = wipeId ? 'AND wipe_id = ?' : '';
    const args = wipeId ? [steamId, wipeId] : [steamId];
    const k = db.prepare(`
      SELECT COUNT(*) kills, COALESCE(SUM(headshot),0) headshots,
             COALESCE(MAX(distance),0) best_distance
      FROM kills WHERE attacker_id = ? ${cond}`).get(...args);
    const d = db.prepare(`SELECT COUNT(*) deaths FROM kills WHERE victim_id = ? ${cond}`).get(...args);
    const pve = db.prepare(`SELECT COUNT(*) pve FROM pve_deaths WHERE victim_id = ? ${cond}`).get(...args);
    return {
      kills: k.kills, headshots: k.headshots, bestDistance: k.best_distance,
      deaths: d.deaths, pveDeaths: pve.pve,
      kd: Math.round((k.kills / Math.max(d.deaths, 1)) * 100) / 100,
      hsRate: k.kills ? Math.round((k.headshots / k.kills) * 100) : 0,
    };
  };

  const weapons = db.prepare(`
    SELECT weapon, COUNT(*) kills FROM kills
    WHERE attacker_id = ? AND wipe_id = ? AND weapon IS NOT NULL
    GROUP BY weapon ORDER BY kills DESC LIMIT 8`).all(steamId, wipe.id);

  const victims = db.prepare(`
    SELECT p.name, k.victim_id AS steam_id, COUNT(*) n FROM kills k
    LEFT JOIN players p ON p.steam_id = k.victim_id
    WHERE k.attacker_id = ? AND k.wipe_id = ?
    GROUP BY k.victim_id ORDER BY n DESC LIMIT 5`).all(steamId, wipe.id);

  const nemesis = db.prepare(`
    SELECT p.name, k.attacker_id AS steam_id, COUNT(*) n FROM kills k
    LEFT JOIN players p ON p.steam_id = k.attacker_id
    WHERE k.victim_id = ? AND k.wipe_id = ?
    GROUP BY k.attacker_id ORDER BY n DESC LIMIT 5`).all(steamId, wipe.id);

  const gatherRows = db.prepare(`
    SELECT resource, amount FROM gather WHERE steam_id = ? AND wipe_id = ?
    ORDER BY amount DESC`).all(steamId, wipe.id);

  const recent = db.prepare(`
    SELECT k.ts, k.weapon, k.distance, k.headshot,
           k.attacker_id, k.victim_id, pa.name attacker_name, pv.name victim_name
    FROM kills k
    LEFT JOIN players pa ON pa.steam_id = k.attacker_id
    LEFT JOIN players pv ON pv.steam_id = k.victim_id
    WHERE k.attacker_id = ? OR k.victim_id = ?
    ORDER BY k.ts DESC LIMIT 20`).all(steamId, steamId);

  return {
    steamId: p.steam_id, name: p.name,
    firstSeen: p.first_seen, lastSeen: p.last_seen, playtimeS: p.playtime_s,
    wipe: agg(wipe.id), allTime: agg(null),
    weapons, victims, nemesis, gather: gatherRows, recent,
  };
}

function killfeed(limit = 50) {
  return db.prepare(`
    SELECT k.ts, k.weapon, k.distance, k.headshot, k.bodypart,
           k.attacker_id, k.victim_id, pa.name attacker_name, pv.name victim_name
    FROM kills k
    LEFT JOIN players pa ON pa.steam_id = k.attacker_id
    LEFT JOIN players pv ON pv.steam_id = k.victim_id
    ORDER BY k.ts DESC LIMIT ?`).all(Math.min(limit, 200));
}

function searchPlayers(q, limit = 20) {
  return db.prepare(`
    SELECT steam_id, name, last_seen, playtime_s FROM players
    WHERE name LIKE ? ORDER BY last_seen DESC LIMIT ?`).all(`%${q}%`, limit);
}

function status() {
  const hb = db.prepare('SELECT * FROM heartbeats ORDER BY ts DESC LIMIT 1').get() || null;
  const wipe = currentWipe();
  const history = db.prepare(`
    SELECT (ts / 3600) * 3600 AS hour, MAX(players) players
    FROM heartbeats WHERE ts > ? GROUP BY hour ORDER BY hour`).all(now() - 48 * 3600);
  const totals = db.prepare('SELECT COUNT(*) c FROM kills WHERE wipe_id = ?').get(wipe.id);
  const playersTotal = db.prepare('SELECT COUNT(*) c FROM players').get();
  return {
    online: hb && (now() - hb.ts) < 180,
    heartbeat: hb,
    wipe: { id: wipe.id, startedAt: wipe.started_at, mapSeed: wipe.map_seed, mapSize: wipe.map_size, label: wipe.label },
    nextWipe: getInfo('next_wipe'),
    killsThisWipe: totals.c,
    playersKnown: playersTotal.c,
    history,
    info: {
      name: getInfo('server_name'), ip: getInfo('server_ip'),
      map: getInfo('map'), discord: getInfo('discord'),
    },
  };
}

function staffList() {
  return db.prepare('SELECT id, name, role, since, blurb FROM staff WHERE active = 1 ORDER BY id').all();
}

function banList(limit = 50) {
  return db.prepare('SELECT ts, steam_name, reason, staff_name, evidence FROM bans ORDER BY ts DESC LIMIT ?').all(limit);
}

function banStats() {
  const month = now() - 30 * 86400;
  const total = db.prepare('SELECT COUNT(*) c FROM bans').get().c;
  const recent = db.prepare('SELECT COUNT(*) c FROM bans WHERE ts > ?').get(month).c;
  const byStaff = db.prepare(`
    SELECT staff_name, COUNT(*) n FROM bans WHERE ts > ? GROUP BY staff_name ORDER BY n DESC`).all(month);
  return { total, last30d: recent, byStaff };
}

function addApplication(a, ip) {
  db.prepare(`
    INSERT INTO applications
      (ts, name, steam_id, discord, age, hours_played, timezone, availability,
       experience, motivation, scenario1, scenario2, scenario3, ip)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(now(), a.name, a.steamId, a.discord, a.age ?? null, a.hoursPlayed ?? null,
         a.timezone || null, a.availability || null, a.experience || null,
         a.motivation || null, a.scenario1 || null, a.scenario2 || null, a.scenario3 || null,
         ip || null);
}

function recentApplicationFromIp(ip, windowS) {
  if (!ip) return false;
  const r = db.prepare('SELECT COUNT(*) c FROM applications WHERE ip = ? AND ts > ?')
    .get(ip, now() - windowS);
  return r.c > 0;
}

function listApplications() {
  return db.prepare('SELECT * FROM applications ORDER BY ts DESC LIMIT 200').all();
}

function setApplicationStatus(id, statusVal) {
  db.prepare('UPDATE applications SET status = ? WHERE id = ?').run(statusVal, id | 0);
}

function startWipe({ mapSeed, mapSize, label }) {
  db.prepare('INSERT INTO wipes (started_at, map_seed, map_size, label) VALUES (?, ?, ?, ?)')
    .run(now(), mapSeed || null, mapSize || null, label || null);
  return currentWipe();
}

module.exports = {
  db, now, currentWipe, upsertPlayer, addPlaytime, recordKill, recordPveDeath,
  recordGather, recordHeartbeat, setInfo, getInfo, leaderboard, playerProfile,
  killfeed, searchPlayers, status, staffList, banList, banStats,
  addApplication, recentApplicationFromIp, listApplications, setApplicationStatus, startWipe,
};
