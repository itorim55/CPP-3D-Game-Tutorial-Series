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

-- tempo de jogo creditado por wipe (para peso de votos e stats por wipe)
CREATE TABLE IF NOT EXISTS playtime_wipe (
  wipe_id  INTEGER NOT NULL REFERENCES wipes(id),
  steam_id TEXT NOT NULL,
  seconds  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (wipe_id, steam_id)
);

-- moeda por tempo jogado ("gemas")
CREATE TABLE IF NOT EXISTS wallets (
  steam_id     TEXT PRIMARY KEY,
  gems         INTEGER NOT NULL DEFAULT 0,
  earned_total INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS store_items (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  cost        INTEGER NOT NULL,
  command     TEXT,
  active      INTEGER NOT NULL DEFAULT 1,
  sort        INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS redemptions (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  ts       INTEGER NOT NULL,
  steam_id TEXT NOT NULL,
  item_id  TEXT NOT NULL,
  cost     INTEGER NOT NULL,
  command  TEXT,
  status   TEXT NOT NULL DEFAULT 'pendente'  -- pendente|enviado|entregue|falhou
);

CREATE TABLE IF NOT EXISTS appeals (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  ts       INTEGER NOT NULL,
  steam_id TEXT NOT NULL,
  discord  TEXT,
  text     TEXT NOT NULL,
  status   TEXT NOT NULL DEFAULT 'pendente', -- pendente|em análise|aceite|recusado
  response TEXT
);

CREATE TABLE IF NOT EXISTS posts (
  id    INTEGER PRIMARY KEY AUTOINCREMENT,
  ts    INTEGER NOT NULL,
  title TEXT NOT NULL,
  body  TEXT NOT NULL
);

-- Overwatch comunitário: revisão de clips de suspeitos
CREATE TABLE IF NOT EXISTS ow_cases (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  ts       INTEGER NOT NULL,
  title    TEXT NOT NULL,
  clip_url TEXT NOT NULL,
  status   TEXT NOT NULL DEFAULT 'aberto',   -- aberto|fechado
  verdict  TEXT                              -- cheater|inocente|inconclusivo
);

CREATE TABLE IF NOT EXISTS ow_votes (
  case_id  INTEGER NOT NULL REFERENCES ow_cases(id),
  steam_id TEXT NOT NULL,
  vote     TEXT NOT NULL,                    -- cheat|clean|unsure
  PRIMARY KEY (case_id, steam_id)
);

-- votação de mapa (ronda gerida em server_info: map_round / map_vote_open)
CREATE TABLE IF NOT EXISTS map_options (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  round     INTEGER NOT NULL,
  label     TEXT NOT NULL,
  seed      TEXT,
  size      INTEGER,
  image_url TEXT
);

CREATE TABLE IF NOT EXISTS map_votes (
  round     INTEGER NOT NULL,
  steam_id  TEXT NOT NULL,
  option_id INTEGER NOT NULL,
  weight    INTEGER NOT NULL,
  PRIMARY KEY (round, steam_id)
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

function addPlaytime(steamId, seconds, wipeId = null) {
  const s = Math.max(0, seconds | 0);
  db.prepare('UPDATE players SET playtime_s = playtime_s + ? WHERE steam_id = ?').run(s, steamId);
  if (wipeId) {
    db.prepare(`
      INSERT INTO playtime_wipe (wipe_id, steam_id, seconds) VALUES (?, ?, ?)
      ON CONFLICT(wipe_id, steam_id) DO UPDATE SET seconds = seconds + excluded.seconds
    `).run(wipeId, steamId, s);
  }
}

// ---------- gemas (moeda por tempo jogado) ----------

function addGems(steamId, amount) {
  const a = Math.max(0, amount | 0);
  if (!a) return;
  db.prepare(`
    INSERT INTO wallets (steam_id, gems, earned_total) VALUES (?, ?, ?)
    ON CONFLICT(steam_id) DO UPDATE SET gems = gems + excluded.gems,
                                        earned_total = earned_total + excluded.earned_total
  `).run(steamId, a, a);
}

function getWallet(steamId) {
  return db.prepare('SELECT gems, earned_total FROM wallets WHERE steam_id = ?').get(steamId)
    || { gems: 0, earned_total: 0 };
}

function syncStoreItems(items) {
  const up = db.prepare(`
    INSERT INTO store_items (id, name, description, cost, command, active, sort)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET name = excluded.name, description = excluded.description,
      cost = excluded.cost, command = excluded.command, active = excluded.active, sort = excluded.sort
  `);
  const ids = [];
  items.forEach((it, i) => {
    up.run(it.id, it.name, it.description || null, it.cost | 0, it.command || null,
           it.active === false ? 0 : 1, i);
    ids.push(it.id);
  });
  // desativa itens que já não estão no ficheiro
  if (ids.length) {
    db.prepare(`UPDATE store_items SET active = 0
                WHERE id NOT IN (${ids.map(() => '?').join(',')})`).run(...ids);
  }
}

function listStore() {
  return db.prepare('SELECT id, name, description, cost FROM store_items WHERE active = 1 ORDER BY sort').all();
}

function redeem(steamId, itemId) {
  const item = db.prepare('SELECT * FROM store_items WHERE id = ? AND active = 1').get(itemId);
  if (!item) return { error: 'Item não encontrado.' };
  const w = getWallet(steamId);
  if (w.gems < item.cost) return { error: `Gemas insuficientes (tens ${w.gems}, precisas de ${item.cost}).` };
  db.prepare('UPDATE wallets SET gems = gems - ? WHERE steam_id = ?').run(item.cost, steamId);
  const command = item.command ? item.command.replaceAll('{steamid}', steamId) : null;
  db.prepare('INSERT INTO redemptions (ts, steam_id, item_id, cost, command) VALUES (?, ?, ?, ?, ?)')
    .run(now(), steamId, itemId, item.cost, command);
  return { ok: true, auto: !!command };
}

function myRedemptions(steamId) {
  return db.prepare(`
    SELECT r.ts, r.cost, r.status, s.name FROM redemptions r
    LEFT JOIN store_items s ON s.id = r.item_id
    WHERE r.steam_id = ? ORDER BY r.ts DESC LIMIT 30`).all(steamId);
}

function pendingPluginRedemptions() {
  const rows = db.prepare(`
    SELECT id, steam_id, command FROM redemptions
    WHERE status = 'pendente' AND command IS NOT NULL ORDER BY id LIMIT 20`).all();
  const mark = db.prepare("UPDATE redemptions SET status = 'enviado' WHERE id = ?");
  for (const r of rows) mark.run(r.id);
  return rows;
}

function completeRedemption(id, ok) {
  db.prepare('UPDATE redemptions SET status = ? WHERE id = ?')
    .run(ok ? 'entregue' : 'falhou', id | 0);
}

function listRedemptions() {
  return db.prepare(`
    SELECT r.*, s.name AS item_name, p.name AS player_name FROM redemptions r
    LEFT JOIN store_items s ON s.id = r.item_id
    LEFT JOIN players p ON p.steam_id = r.steam_id
    ORDER BY r.ts DESC LIMIT 100`).all();
}

function setRedemptionStatus(id, status) {
  db.prepare('UPDATE redemptions SET status = ? WHERE id = ?').run(status, id | 0);
}

// ---------- apelos de ban ----------

function addAppeal(steamId, discord, text) {
  const open = db.prepare(
    "SELECT COUNT(*) c FROM appeals WHERE steam_id = ? AND status IN ('pendente','em análise')").get(steamId);
  if (open.c > 0) return { error: 'Já tens um apelo em aberto. Aguarda a resposta.' };
  db.prepare('INSERT INTO appeals (ts, steam_id, discord, text) VALUES (?, ?, ?, ?)')
    .run(now(), steamId, discord || null, text);
  return { ok: true };
}

function myAppeals(steamId) {
  return db.prepare('SELECT ts, text, status, response FROM appeals WHERE steam_id = ? ORDER BY ts DESC LIMIT 10')
    .all(steamId);
}

function listAppeals() {
  return db.prepare(`
    SELECT a.*, p.name AS player_name FROM appeals a
    LEFT JOIN players p ON p.steam_id = a.steam_id
    ORDER BY a.ts DESC LIMIT 100`).all();
}

function setAppealStatus(id, status, response) {
  db.prepare('UPDATE appeals SET status = ?, response = COALESCE(?, response) WHERE id = ?')
    .run(status, response || null, id | 0);
}

// ---------- novidades / changelog ----------

function addPost(title, body) {
  db.prepare('INSERT INTO posts (ts, title, body) VALUES (?, ?, ?)').run(now(), title, body);
}

function listPosts(limit = 20) {
  return db.prepare('SELECT * FROM posts ORDER BY ts DESC LIMIT ?').all(limit);
}

function deletePost(id) {
  db.prepare('DELETE FROM posts WHERE id = ?').run(id | 0);
}

// ---------- Overwatch comunitário ----------

const OW_MIN_PLAYTIME_S = 5 * 3600;

function owTally(caseId) {
  const rows = db.prepare('SELECT vote, COUNT(*) n FROM ow_votes WHERE case_id = ? GROUP BY vote').all(caseId);
  const t = { cheat: 0, clean: 0, unsure: 0 };
  for (const r of rows) t[r.vote] = r.n;
  return t;
}

function listOwCases(steamId) {
  const cases = db.prepare('SELECT * FROM ow_cases ORDER BY ts DESC LIMIT 30').all();
  return cases.map((c) => {
    const myVote = steamId
      ? db.prepare('SELECT vote FROM ow_votes WHERE case_id = ? AND steam_id = ?').get(c.id, steamId)?.vote || null
      : null;
    // tally só é visível depois de votar (evita enviesar) ou quando o caso fecha
    const showTally = c.status === 'fechado' || !!myVote;
    return { ...c, myVote, tally: showTally ? owTally(c.id) : null };
  });
}

function voteOw(steamId, caseId, vote) {
  if (!['cheat', 'clean', 'unsure'].includes(vote)) return { error: 'Voto inválido.' };
  const c = db.prepare('SELECT status FROM ow_cases WHERE id = ?').get(caseId | 0);
  if (!c) return { error: 'Caso não encontrado.' };
  if (c.status !== 'aberto') return { error: 'Este caso já está fechado.' };
  const p = db.prepare('SELECT playtime_s FROM players WHERE steam_id = ?').get(steamId);
  if (!p || p.playtime_s < OW_MIN_PLAYTIME_S) {
    return { error: 'Precisas de pelo menos 5 h de jogo no servidor para votar no Overwatch.' };
  }
  db.prepare(`
    INSERT INTO ow_votes (case_id, steam_id, vote) VALUES (?, ?, ?)
    ON CONFLICT(case_id, steam_id) DO UPDATE SET vote = excluded.vote
  `).run(caseId | 0, steamId, vote);
  return { ok: true, tally: owTally(caseId | 0) };
}

function addOwCase(title, clipUrl) {
  db.prepare('INSERT INTO ow_cases (ts, title, clip_url) VALUES (?, ?, ?)').run(now(), title, clipUrl);
}

function closeOwCase(id, verdict) {
  db.prepare("UPDATE ow_cases SET status = 'fechado', verdict = ? WHERE id = ?").run(verdict, id | 0);
}

function listOwCasesAdmin() {
  return db.prepare('SELECT * FROM ow_cases ORDER BY ts DESC LIMIT 50').all()
    .map((c) => ({ ...c, tally: owTally(c.id) }));
}

// ---------- votação de mapa ----------

function mapRound() { return parseInt(getInfo('map_round') || '1', 10); }
function mapVoteOpen() { return getInfo('map_vote_open') === '1'; }

function previousWipeId() {
  const rows = db.prepare('SELECT id FROM wipes ORDER BY started_at DESC LIMIT 2').all();
  return rows.length > 1 ? rows[1].id : null;
}

/** Peso do voto: 1 base + 1 por cada 10 h jogadas na wipe anterior (máx. 5). */
function voteWeight(steamId) {
  const prev = previousWipeId();
  if (!prev) return 1;
  const r = db.prepare('SELECT seconds FROM playtime_wipe WHERE wipe_id = ? AND steam_id = ?').get(prev, steamId);
  const hours = (r?.seconds || 0) / 3600;
  return 1 + Math.min(4, Math.floor(hours / 10));
}

function mapState(steamId) {
  const round = mapRound();
  const options = db.prepare('SELECT * FROM map_options WHERE round = ? ORDER BY id').all(round);
  const tallies = db.prepare(`
    SELECT option_id, SUM(weight) total, COUNT(*) voters FROM map_votes WHERE round = ? GROUP BY option_id`).all(round);
  const byOption = Object.fromEntries(tallies.map((t) => [t.option_id, t]));
  const myVote = steamId
    ? db.prepare('SELECT option_id FROM map_votes WHERE round = ? AND steam_id = ?').get(round, steamId)?.option_id || null
    : null;
  return {
    round, open: mapVoteOpen(),
    myVote, myWeight: steamId ? voteWeight(steamId) : null,
    options: options.map((o) => ({
      ...o, votes: byOption[o.id]?.total || 0, voters: byOption[o.id]?.voters || 0,
    })),
  };
}

function castMapVote(steamId, optionId) {
  if (!mapVoteOpen()) return { error: 'A votação está fechada.' };
  const round = mapRound();
  const opt = db.prepare('SELECT id FROM map_options WHERE id = ? AND round = ?').get(optionId | 0, round);
  if (!opt) return { error: 'Opção inválida.' };
  db.prepare(`
    INSERT INTO map_votes (round, steam_id, option_id, weight) VALUES (?, ?, ?, ?)
    ON CONFLICT(round, steam_id) DO UPDATE SET option_id = excluded.option_id, weight = excluded.weight
  `).run(round, steamId, optionId | 0, voteWeight(steamId));
  return { ok: true };
}

function mapAdmin(action, data) {
  switch (action) {
    case 'add':
      db.prepare('INSERT INTO map_options (round, label, seed, size, image_url) VALUES (?, ?, ?, ?, ?)')
        .run(mapRound(), data.label, data.seed || null, data.size | 0 || null, data.imageUrl || null);
      return { ok: true };
    case 'open': setInfo('map_vote_open', '1'); return { ok: true };
    case 'close': setInfo('map_vote_open', '0'); return { ok: true };
    case 'new_round':
      setInfo('map_round', String(mapRound() + 1));
      setInfo('map_vote_open', '0');
      return { ok: true };
    default: return { error: 'Ação desconhecida.' };
  }
}

// ---------- wipes ----------

function listWipes() {
  return db.prepare('SELECT id, started_at, label, map_seed, map_size FROM wipes ORDER BY started_at DESC LIMIT 24').all();
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

/** wipeId: número = essa wipe; null = todas as wipes (sempre). */
function leaderboard(by = 'kills', wipeId = undefined, limit = 50) {
  const order = LEADERBOARD_SORTS[by] || LEADERBOARD_SORTS.kills;
  if (wipeId === undefined) wipeId = currentWipe().id;
  // Numa wipe específica, as horas mostradas e o filtro de atividade são DESSA
  // wipe (senão a leaderboard de uma wipe nova mostrava toda a gente antiga).
  const filter = wipeId ? 'AND k.wipe_id = ?' : '';
  const playtimeCol = wipeId ? 'COALESCE(pw.seconds, 0)' : 'p.playtime_s';
  const playtimeJoin = wipeId
    ? 'LEFT JOIN playtime_wipe pw ON pw.steam_id = p.steam_id AND pw.wipe_id = ?'
    : '';
  const params = wipeId ? [wipeId, wipeId, wipeId, limit] : [limit];
  return db.prepare(`
    SELECT p.steam_id, p.name, ${playtimeCol} AS playtime_s,
      COALESCE(ka.kills, 0)  AS kills,
      COALESCE(ka.headshots, 0) AS headshots,
      COALESCE(ka.best_distance, 0) AS best_distance,
      COALESCE(vd.deaths, 0) AS deaths,
      ROUND(CAST(COALESCE(ka.kills,0) AS REAL) / MAX(COALESCE(vd.deaths,0), 1), 2) AS kd
    FROM players p
    LEFT JOIN (
      SELECT attacker_id, COUNT(*) kills, SUM(headshot) headshots, MAX(distance) best_distance
      FROM kills k WHERE 1=1 ${filter}
      GROUP BY attacker_id
    ) ka ON ka.attacker_id = p.steam_id
    LEFT JOIN (
      SELECT victim_id, COUNT(*) deaths
      FROM kills k WHERE 1=1 ${filter}
      GROUP BY victim_id
    ) vd ON vd.victim_id = p.steam_id
    ${playtimeJoin}
    WHERE COALESCE(ka.kills,0) + COALESCE(vd.deaths,0) > 0 OR ${playtimeCol} > 0
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
      brandAccent: getInfo('brand_accent') || 'RUST',
      brandRest: getInfo('brand_rest') || '',
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
  // gemas e loja
  addGems, getWallet, syncStoreItems, listStore, redeem, myRedemptions,
  pendingPluginRedemptions, completeRedemption, listRedemptions, setRedemptionStatus,
  // apelos
  addAppeal, myAppeals, listAppeals, setAppealStatus,
  // novidades
  addPost, listPosts, deletePost,
  // overwatch
  listOwCases, voteOw, addOwCase, closeOwCase, listOwCasesAdmin,
  // votação de mapa
  mapState, castMapVote, mapAdmin, voteWeight,
  // wipes
  listWipes, previousWipeId,
};
