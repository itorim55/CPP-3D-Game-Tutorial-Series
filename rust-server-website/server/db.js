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
  status       TEXT NOT NULL DEFAULT 'pending',
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
  status   TEXT NOT NULL DEFAULT 'pending'  -- pending|sent|delivered|failed
);

CREATE TABLE IF NOT EXISTS appeals (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  ts       INTEGER NOT NULL,
  steam_id TEXT NOT NULL,
  discord  TEXT,
  text     TEXT NOT NULL,
  status   TEXT NOT NULL DEFAULT 'pending', -- pending|reviewing|accepted|rejected
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
  status   TEXT NOT NULL DEFAULT 'open',     -- open|closed
  verdict  TEXT                              -- cheater|innocent|inconclusive
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

-- registo de tempo de jogo com timestamp (para leaderboards por janela: hora/dia/semana/mês)
CREATE TABLE IF NOT EXISTS playtime_log (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  ts       INTEGER NOT NULL,
  steam_id TEXT NOT NULL,
  seconds  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_playtime_log_ts ON playtime_log(ts);

-- equipas nativas do Rust (snapshot enviado pelo plugin)
CREATE TABLE IF NOT EXISTS teams (
  wipe_id    INTEGER NOT NULL,
  team_id    TEXT NOT NULL,
  leader_id  TEXT NOT NULL,
  members    TEXT NOT NULL,        -- JSON: ["7656...", ...]
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (wipe_id, team_id)
);

-- ranking Elo sazonal (reset por wipe)
CREATE TABLE IF NOT EXISTS elo (
  wipe_id  INTEGER NOT NULL,
  steam_id TEXT NOT NULL,
  rating   REAL NOT NULL DEFAULT 1000,
  games    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (wipe_id, steam_id)
);

-- eventos do mapa: Patrol Heli / Bradley abatidos, crates hackeadas
CREATE TABLE IF NOT EXISTS map_events (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  ts       INTEGER NOT NULL,
  wipe_id  INTEGER NOT NULL,
  kind     TEXT NOT NULL,          -- heli | bradley | crate
  steam_id TEXT NOT NULL,
  pos_x    REAL,
  pos_z    REAL
);
CREATE INDEX IF NOT EXISTS idx_map_events_wipe ON map_events(wipe_id, kind);

-- eventos de raid: estruturas/portas destruídas por jogadores
CREATE TABLE IF NOT EXISTS raid_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  ts          INTEGER NOT NULL,
  wipe_id     INTEGER NOT NULL,
  attacker_id TEXT NOT NULL,
  entity      TEXT,
  grade       TEXT,
  weapon      TEXT,
  pos_x       REAL,
  pos_z       REAL
);
CREATE INDEX IF NOT EXISTS idx_raid_events_wipe ON raid_events(wipe_id, ts);
`);

// migrações idempotentes para bases de dados já existentes
for (const sql of [
  'ALTER TABLE kills ADD COLUMN pos_x REAL',
  'ALTER TABLE kills ADD COLUMN pos_z REAL',
  'ALTER TABLE players ADD COLUMN avatar TEXT',
  'ALTER TABLE players ADD COLUMN avatar_ts INTEGER',
  'ALTER TABLE ow_cases ADD COLUMN clip_file TEXT',
]) { try { db.exec(sql); } catch { /* coluna já existe */ } }

// ---------- helpers ----------

function now() { return Math.floor(Date.now() / 1000); }

function currentWipe() {
  let w = db.prepare('SELECT * FROM wipes ORDER BY started_at DESC LIMIT 1').get();
  if (!w) {
    db.prepare('INSERT INTO wipes (started_at, label) VALUES (?, ?)').run(now(), 'First wipe');
    w = db.prepare('SELECT * FROM wipes ORDER BY started_at DESC LIMIT 1').get();
  }
  return w;
}

function upsertPlayer(steamId, name, ts) {
  // Se o evento não trouxer nome, não apagar o nome real já conhecido — só
  // atualizar last_seen. O parâmetro :name é null quando ausente.
  upsertPlayer.stmt ??= db.prepare(`
    INSERT INTO players (steam_id, name, first_seen, last_seen)
    VALUES ($id, COALESCE($name, 'Unknown'), $ts, $ts)
    ON CONFLICT(steam_id) DO UPDATE SET
      name = COALESCE($name, players.name),
      last_seen = $ts
  `);
  upsertPlayer.stmt.run({ id: steamId, name: name || null, ts });
}

// Utilizador que entrou pelo site sem nunca ter jogado: registo mínimo.
// Nunca toca em last_seen de quem já existe nem substitui nomes do jogo
// ('Unknown' é a única exceção — aí o nome Steam é melhor que nada).
function ensureWebPlayer(steamId, name) {
  db.prepare(`
    INSERT INTO players (steam_id, name, first_seen, last_seen)
    VALUES ($id, COALESCE($name, 'Unknown'), $ts, $ts)
    ON CONFLICT(steam_id) DO UPDATE SET
      name = CASE WHEN players.name = 'Unknown'
                  THEN COALESCE($name, players.name) ELSE players.name END
  `).run({ id: steamId, name: name || null, ts: now() });
}

// Cache de avatares Steam (preenchida por server/steam.js).
function avatarInfo(steamId) {
  return db.prepare('SELECT avatar, avatar_ts FROM players WHERE steam_id = ?').get(steamId) || null;
}
function setAvatar(steamId, url) {
  db.prepare('UPDATE players SET avatar = ?, avatar_ts = ? WHERE steam_id = ?')
    .run(url || null, now(), steamId);
}

function addPlaytime(steamId, seconds, wipeId = null) {
  const s = Math.max(0, seconds | 0);
  if (!s) return;
  db.prepare('UPDATE players SET playtime_s = playtime_s + ? WHERE steam_id = ?').run(s, steamId);
  if (wipeId) {
    db.prepare(`
      INSERT INTO playtime_wipe (wipe_id, steam_id, seconds) VALUES (?, ?, ?)
      ON CONFLICT(wipe_id, steam_id) DO UPDATE SET seconds = seconds + excluded.seconds
    `).run(wipeId, steamId, s);
  }
  db.prepare('INSERT INTO playtime_log (ts, steam_id, seconds) VALUES (?, ?, ?)').run(now(), steamId, s);
  // manter 90 dias de registo detalhado (as janelas máximas são 30 dias)
  if (Math.random() < 0.01) db.prepare('DELETE FROM playtime_log WHERE ts < ?').run(now() - 90 * 86400);
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
  if (!item) return { error: 'Item not found.' };
  const w = getWallet(steamId);
  if (w.gems < item.cost) return { error: `Not enough gems (you have ${w.gems}, you need ${item.cost}).` };
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
    WHERE status = 'pending' AND command IS NOT NULL ORDER BY id LIMIT 20`).all();
  const mark = db.prepare("UPDATE redemptions SET status = 'sent' WHERE id = ?");
  for (const r of rows) mark.run(r.id);
  return rows;
}

function completeRedemption(id, ok) {
  db.prepare('UPDATE redemptions SET status = ? WHERE id = ?')
    .run(ok ? 'delivered' : 'failed', id | 0);
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
    "SELECT COUNT(*) c FROM appeals WHERE steam_id = ? AND status IN ('pending','reviewing')").get(steamId);
  if (open.c > 0) return { error: 'You already have an open appeal. Please wait for the reply.' };
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
    const showTally = c.status === 'closed' || !!myVote;
    return { ...c, myVote, tally: showTally ? owTally(c.id) : null };
  });
}

function voteOw(steamId, caseId, vote) {
  if (!['cheat', 'clean', 'unsure'].includes(vote)) return { error: 'Invalid vote.' };
  const c = db.prepare('SELECT status FROM ow_cases WHERE id = ?').get(caseId | 0);
  if (!c) return { error: 'Case not found.' };
  if (c.status !== 'open') return { error: 'This case is already closed.' };
  const p = db.prepare('SELECT playtime_s FROM players WHERE steam_id = ?').get(steamId);
  if (!p || p.playtime_s < OW_MIN_PLAYTIME_S) {
    return { error: 'You need at least 5 h of playtime on the server to vote on Overwatch.' };
  }
  db.prepare(`
    INSERT INTO ow_votes (case_id, steam_id, vote) VALUES (?, ?, ?)
    ON CONFLICT(case_id, steam_id) DO UPDATE SET vote = excluded.vote
  `).run(caseId | 0, steamId, vote);
  return { ok: true, tally: owTally(caseId | 0) };
}

function addOwCase(title, clipUrl, clipFile = null) {
  // clip_url é NOT NULL no esquema original — string vazia quando só há ficheiro
  db.prepare('INSERT INTO ow_cases (ts, title, clip_url, clip_file) VALUES (?, ?, ?, ?)')
    .run(now(), title, clipUrl || '', clipFile);
}

function closeOwCase(id, verdict) {
  // Devolve o clip alojado (se existir) para o chamador o apagar do disco;
  // a referência sai já da BD para nunca ficar um <video> morto na página.
  const row = db.prepare('SELECT clip_file FROM ow_cases WHERE id = ?').get(id | 0);
  db.prepare("UPDATE ow_cases SET status = 'closed', verdict = ?, clip_file = NULL WHERE id = ?")
    .run(verdict, id | 0);
  return row?.clip_file || null;
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
  if (!mapVoteOpen()) return { error: 'Voting is closed.' };
  const round = mapRound();
  const opt = db.prepare('SELECT id FROM map_options WHERE id = ? AND round = ?').get(optionId | 0, round);
  if (!opt) return { error: 'Invalid option.' };
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
    default: return { error: 'Unknown action.' };
  }
}

// ---------- equipas (nativas do Rust, snapshot do plugin) ----------

function updateTeams(wipeId, teamsArr) {
  const up = db.prepare(`
    INSERT INTO teams (wipe_id, team_id, leader_id, members, updated_at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(wipe_id, team_id) DO UPDATE SET
      leader_id = excluded.leader_id, members = excluded.members, updated_at = excluded.updated_at
  `);
  // O snapshot do plugin é autoritário: aplicar os upserts e apagar as equipas
  // desta wipe que já não existem (dissolvidas/reformadas) numa transação, para
  // não deixar equipas-fantasma no leaderboard nem no perfil.
  const tx = db.prepare('BEGIN'), commit = db.prepare('COMMIT'), rollback = db.prepare('ROLLBACK');
  tx.run();
  try {
    const kept = [];
    for (const t of teamsArr.slice(0, 200)) {
      if (!t.id || !Array.isArray(t.members) || t.members.length < 2) continue;
      const id = String(t.id);
      up.run(wipeId, id, String(t.leader || t.members[0]),
             JSON.stringify(t.members.map(String).slice(0, 12)), now());
      kept.push(id);
    }
    if (kept.length) {
      db.prepare(`DELETE FROM teams WHERE wipe_id = ?
                  AND team_id NOT IN (${kept.map(() => '?').join(',')})`).run(wipeId, ...kept);
    } else {
      db.prepare('DELETE FROM teams WHERE wipe_id = ?').run(wipeId);
    }
    commit.run();
  } catch (e) {
    rollback.run();
    throw e;
  }
}

function teamLeaderboard(wipeId, limit = 25) {
  const teams = db.prepare('SELECT * FROM teams WHERE wipe_id = ? AND updated_at > ?')
    .all(wipeId, now() - 7 * 86400);
  if (!teams.length) return [];

  const kills = new Map(), deaths = new Map();
  for (const r of db.prepare('SELECT attacker_id id, COUNT(*) n FROM kills WHERE wipe_id = ? GROUP BY attacker_id').all(wipeId))
    kills.set(r.id, r.n);
  for (const r of db.prepare('SELECT victim_id id, COUNT(*) n FROM kills WHERE wipe_id = ? GROUP BY victim_id').all(wipeId))
    deaths.set(r.id, r.n);
  const names = new Map();
  for (const r of db.prepare('SELECT steam_id, name FROM players').all()) names.set(r.steam_id, r.name);

  return teams.map((t) => {
    const members = JSON.parse(t.members);
    const k = members.reduce((s, m) => s + (kills.get(m) || 0), 0);
    const d = members.reduce((s, m) => s + (deaths.get(m) || 0), 0);
    return {
      teamId: t.team_id,
      leader: names.get(t.leader_id) || t.leader_id,
      members: members.map((m) => ({ steamId: m, name: names.get(m) || m })),
      size: members.length,
      kills: k, deaths: d,
      kd: Math.round((k / Math.max(d, 1)) * 100) / 100,
    };
  }).filter((t) => t.kills + t.deaths > 0)
    .sort((a, b) => b.kills - a.kills)
    .slice(0, limit);
}

function playerTeam(wipeId, steamId) {
  // mais recente primeiro (defesa em profundidade contra registos obsoletos)
  const teams = db.prepare('SELECT * FROM teams WHERE wipe_id = ? ORDER BY updated_at DESC').all(wipeId);
  for (const t of teams) {
    const members = JSON.parse(t.members);
    if (members.includes(steamId)) {
      const names = members.map((m) =>
        db.prepare('SELECT name FROM players WHERE steam_id = ?').get(m)?.name || m);
      return { leaderId: t.leader_id, members, names };
    }
  }
  return null;
}

// ---------- conquistas / badges ----------

function achievements(steamId, wipeId) {
  const out = [];
  const add = (icon, name, desc) => out.push({ icon, name, desc });

  const w = db.prepare(`
    SELECT COUNT(*) kills, COALESCE(SUM(headshot),0) hs, COALESCE(MAX(distance),0) dist
    FROM kills WHERE attacker_id = ? AND wipe_id = ?`).get(steamId, wipeId);
  const wd = db.prepare('SELECT COUNT(*) n FROM kills WHERE victim_id = ? AND wipe_id = ?').get(steamId, wipeId);
  const all = db.prepare('SELECT COUNT(*) kills, COALESCE(MAX(distance),0) dist FROM kills WHERE attacker_id = ?').get(steamId);
  const p = db.prepare('SELECT playtime_s FROM players WHERE steam_id = ?').get(steamId);
  const pw = db.prepare('SELECT seconds FROM playtime_wipe WHERE wipe_id = ? AND steam_id = ?').get(wipeId, steamId);

  if (all.kills >= 1) add('🩸', 'First Blood', 'Got their first kill on the server');
  if (all.dist >= 300) add('🎯', 'Elite Sniper', `Kill at ${Math.round(all.dist)} m`);
  if (w.kills >= 100) add('💀', 'Machine', '100+ kills in one wipe');
  if (w.hs >= 50) add('🎖️', 'Headhunter', '50+ headshots in one wipe');
  if (wd.n >= 100) add('🧲', 'Bullet Magnet', '100+ deaths in one wipe (a hero)');

  const burst = db.prepare(`
    SELECT COUNT(*) n FROM kills WHERE attacker_id = ?
    GROUP BY ts / 3600 ORDER BY n DESC LIMIT 1`).get(steamId);
  if (burst && burst.n >= 5) add('🔥', 'On Fire', `${burst.n} kills in a single hour`);

  const night = db.prepare(`
    SELECT COUNT(*) n FROM kills WHERE attacker_id = ? AND ((ts % 86400) / 3600) BETWEEN 0 AND 5`).get(steamId);
  if (night.n >= 10) add('🦉', 'Night Owl', '10+ kills in the small hours');

  const gatherRows = db.prepare('SELECT resource, amount FROM gather WHERE steam_id = ? AND wipe_id = ?').all(steamId, wipeId);
  const g = Object.fromEntries(gatherRows.map((r) => [r.resource, r.amount]));
  if ((g['wood'] || 0) >= 100000) add('🌲', 'Lumberjack', '100k+ wood in one wipe');
  if ((g['stone'] || 0) >= 100000) add('⛏️', 'Miner', '100k+ stone in one wipe');
  if ((g['sulfur.ore'] || 0) >= 50000) add('💥', 'Sulfur King', '50k+ sulfur in one wipe');

  if ((p?.playtime_s || 0) >= 100 * 3600) add('🏆', 'Veteran', '100+ hours on the server');
  if ((pw?.seconds || 0) >= 10 * 3600 && wd.n === 0) add('👻', 'Untouchable', '10h+ this wipe without a PVP death');

  const demolished = raidStats(steamId, wipeId);
  if (demolished >= 50) add('🧨', 'Demolition Man', `${demolished} structures destroyed this wipe`);

  const me = playerMapEvents(steamId, wipeId);
  if ((me.heli || 0) >= 3) add('🚁', 'Heli Hunter', `${me.heli} Patrol Helis downed this wipe`);
  if ((me.bradley || 0) >= 3) add('🛡️', 'Tank Buster', `${me.bradley} Bradleys destroyed this wipe`);
  if ((me.crate || 0) >= 5) add('📦', 'Fast Hands', `${me.crate} crates hacked this wipe`);

  const streak = playerStreak(steamId, wipeId);
  if (streak >= 10) add('⚡', 'Rampage', `${streak} kills without dying (ongoing!)`);

  const supporter = db.prepare(`
    SELECT COUNT(*) n FROM redemptions WHERE steam_id = ? AND item_id = 'site-badge'
    AND status != 'failed'`).get(steamId);
  if (supporter.n > 0) add('💎', 'Supporter', 'Redeemed the supporter badge in the store');

  return out;
}

// ---------- catálogo de conquistas (página /conquistas) ----------

// Inverso do achievements(): para cada badge, quem o desbloqueou.
// Cada consulta é um GROUP BY simples — nada de calcular por jogador a pedido.
function achievementsCatalog(wipeId) {
  const H = 24; // máximo de detentores devolvidos por badge
  const rows = (sql, ...args) => db.prepare(sql).all(...args, H);
  const shape = (r, detail) => ({
    steamId: r.steam_id, name: r.name, avatar: r.avatar,
    detail: detail ? detail(r.v) : null,
  });
  const out = [];
  const add = (icon, name, desc, list, detail) =>
    out.push({ icon, name, desc, holders: list.map((r) => shape(r, detail)) });

  const KJ = 'JOIN players p ON p.steam_id = x.steam_id';
  const fmt = (n) => n.toLocaleString('en-GB');

  add('🩸', 'First Blood', 'Get your first kill on the server', rows(`
    SELECT x.steam_id, p.name, p.avatar, x.v FROM (
      SELECT attacker_id steam_id, COUNT(*) v FROM kills GROUP BY attacker_id
    ) x ${KJ} ORDER BY x.v DESC LIMIT ?`), (v) => `${fmt(v)} kills`);

  add('🎯', 'Elite Sniper', 'Land a kill from 300 m or further', rows(`
    SELECT x.steam_id, p.name, p.avatar, x.v FROM (
      SELECT attacker_id steam_id, MAX(distance) v FROM kills GROUP BY attacker_id HAVING v >= 300
    ) x ${KJ} ORDER BY x.v DESC LIMIT ?`), (v) => `${Math.round(v)} m`);

  add('💀', 'Machine', '100+ kills in one wipe', rows(`
    SELECT x.steam_id, p.name, p.avatar, x.v FROM (
      SELECT attacker_id steam_id, COUNT(*) v FROM kills WHERE wipe_id = ? GROUP BY attacker_id HAVING v >= 100
    ) x ${KJ} ORDER BY x.v DESC LIMIT ?`, wipeId), (v) => `${fmt(v)} kills`);

  add('🎖️', 'Headhunter', '50+ headshots in one wipe', rows(`
    SELECT x.steam_id, p.name, p.avatar, x.v FROM (
      SELECT attacker_id steam_id, COALESCE(SUM(headshot),0) v FROM kills WHERE wipe_id = ?
      GROUP BY attacker_id HAVING v >= 50
    ) x ${KJ} ORDER BY x.v DESC LIMIT ?`, wipeId), (v) => `${fmt(v)} HS`);

  add('🧲', 'Bullet Magnet', '100+ deaths in one wipe (a hero)', rows(`
    SELECT x.steam_id, p.name, p.avatar, x.v FROM (
      SELECT victim_id steam_id, COUNT(*) v FROM kills WHERE wipe_id = ? GROUP BY victim_id HAVING v >= 100
    ) x ${KJ} ORDER BY x.v DESC LIMIT ?`, wipeId), (v) => `${fmt(v)} deaths`);

  add('🔥', 'On Fire', '5+ kills inside a single hour', rows(`
    SELECT x.steam_id, p.name, p.avatar, x.v FROM (
      SELECT steam_id, MAX(n) v FROM (
        SELECT attacker_id steam_id, COUNT(*) n FROM kills GROUP BY attacker_id, ts / 3600
      ) GROUP BY steam_id HAVING v >= 5
    ) x ${KJ} ORDER BY x.v DESC LIMIT ?`), (v) => `${v} in one hour`);

  add('🦉', 'Night Owl', '10+ kills in the small hours (00–06)', rows(`
    SELECT x.steam_id, p.name, p.avatar, x.v FROM (
      SELECT attacker_id steam_id, COUNT(*) v FROM kills
      WHERE ((ts % 86400) / 3600) BETWEEN 0 AND 5 GROUP BY attacker_id HAVING v >= 10
    ) x ${KJ} ORDER BY x.v DESC LIMIT ?`), (v) => `${fmt(v)} night kills`);

  const gatherBadge = (icon, name, desc, resource, min, unit) =>
    add(icon, name, desc, rows(`
      SELECT x.steam_id, p.name, p.avatar, x.v FROM (
        SELECT steam_id, amount v FROM gather WHERE wipe_id = ? AND resource = ? AND amount >= ?
      ) x ${KJ} ORDER BY x.v DESC LIMIT ?`, wipeId, resource, min), (v) => `${fmt(v)} ${unit}`);
  gatherBadge('🌲', 'Lumberjack', '100k+ wood in one wipe', 'wood', 100000, 'wood');
  gatherBadge('⛏️', 'Miner', '100k+ stone in one wipe', 'stone', 100000, 'stone');
  gatherBadge('💥', 'Sulfur King', '50k+ sulfur in one wipe', 'sulfur.ore', 50000, 'sulfur');

  add('🏆', 'Veteran', '100+ hours on the server', rows(`
    SELECT steam_id, name, avatar, playtime_s v FROM players
    WHERE playtime_s >= ${100 * 3600} ORDER BY v DESC LIMIT ?`), (v) => `${Math.round(v / 3600)} h`);

  add('👻', 'Untouchable', '10h+ this wipe without a PVP death', rows(`
    SELECT x.steam_id, p.name, p.avatar, x.v FROM (
      SELECT pw.steam_id, pw.seconds v FROM playtime_wipe pw
      WHERE pw.wipe_id = ? AND pw.seconds >= ${10 * 3600}
        AND NOT EXISTS (SELECT 1 FROM kills k WHERE k.victim_id = pw.steam_id AND k.wipe_id = pw.wipe_id)
    ) x ${KJ} ORDER BY x.v DESC LIMIT ?`, wipeId), (v) => `${Math.round(v / 3600)} h`);

  add('🧨', 'Demolition Man', '50+ structures destroyed this wipe', rows(`
    SELECT x.steam_id, p.name, p.avatar, x.v FROM (
      SELECT attacker_id steam_id, COUNT(*) v FROM raid_events WHERE wipe_id = ?
      GROUP BY attacker_id HAVING v >= 50
    ) x ${KJ} ORDER BY x.v DESC LIMIT ?`, wipeId), (v) => `${fmt(v)} structures`);

  const eventBadge = (icon, name, desc, kind, min, unit) =>
    add(icon, name, desc, rows(`
      SELECT x.steam_id, p.name, p.avatar, x.v FROM (
        SELECT steam_id, COUNT(*) v FROM map_events WHERE wipe_id = ? AND kind = ?
        GROUP BY steam_id HAVING v >= ?
      ) x ${KJ} ORDER BY x.v DESC LIMIT ?`, wipeId, kind, min), (v) => `${v} ${unit}`);
  eventBadge('🚁', 'Heli Hunter', '3+ Patrol Helicopters downed this wipe', 'heli', 3, 'helis');
  eventBadge('🛡️', 'Tank Buster', '3+ Bradleys destroyed this wipe', 'bradley', 3, 'Bradleys');
  eventBadge('📦', 'Fast Hands', '5+ locked crates hacked this wipe', 'crate', 5, 'crates');

  add('⚡', 'Rampage', '10+ kills without dying (ongoing)', currentStreaks(wipeId, 10, H)
    .map((r) => ({ steam_id: r.steam_id, name: r.name, avatar: r.avatar, v: r.streak })),
    (v) => `${v} streak`);

  add('💎', 'Supporter', 'Redeemed the supporter badge in the store', rows(`
    SELECT x.steam_id, p.name, p.avatar, x.v FROM (
      SELECT steam_id, COUNT(*) v FROM redemptions
      WHERE item_id = 'site-badge' AND status != 'failed' GROUP BY steam_id
    ) x ${KJ} ORDER BY x.v DESC LIMIT ?`), null);

  return out;
}

// ---------- heatmap de mortes ----------

function deathHeatmap(wipeId, limit = 5000) {
  const wipe = db.prepare('SELECT map_size FROM wipes WHERE id = ?').get(wipeId);
  const points = db.prepare(`
    SELECT pos_x x, pos_z z FROM kills
    WHERE wipe_id = ? AND pos_x IS NOT NULL ORDER BY ts DESC LIMIT ?`).all(wipeId, limit);
  return { mapSize: wipe?.map_size || null, points };
}

// ---------- resumo de fim de wipe ----------

function wipeSummary(wipeId) {
  const wipe = db.prepare('SELECT * FROM wipes WHERE id = ?').get(wipeId);
  if (!wipe) return null;
  const one = (sql, ...args) => db.prepare(sql).get(...args) || null;

  const topKiller = one(`
    SELECT p.name, p.steam_id, COUNT(*) n FROM kills k JOIN players p ON p.steam_id = k.attacker_id
    WHERE k.wipe_id = ? GROUP BY k.attacker_id ORDER BY n DESC LIMIT 1`, wipeId);
  const longestKill = one(`
    SELECT p.name, p.steam_id, k.distance, k.weapon FROM kills k JOIN players p ON p.steam_id = k.attacker_id
    WHERE k.wipe_id = ? AND k.distance IS NOT NULL ORDER BY k.distance DESC LIMIT 1`, wipeId);
  const topHeadshots = one(`
    SELECT p.name, p.steam_id, SUM(headshot) n FROM kills k JOIN players p ON p.steam_id = k.attacker_id
    WHERE k.wipe_id = ? GROUP BY k.attacker_id ORDER BY n DESC LIMIT 1`, wipeId);
  const topDeaths = one(`
    SELECT p.name, p.steam_id, COUNT(*) n FROM kills k JOIN players p ON p.steam_id = k.victim_id
    WHERE k.wipe_id = ? GROUP BY k.victim_id ORDER BY n DESC LIMIT 1`, wipeId);
  const topFarmer = one(`
    SELECT p.name, p.steam_id, SUM(g.amount) n FROM gather g JOIN players p ON p.steam_id = g.steam_id
    WHERE g.wipe_id = ? GROUP BY g.steam_id ORDER BY n DESC LIMIT 1`, wipeId);
  const topHours = one(`
    SELECT p.name, p.steam_id, pw.seconds FROM playtime_wipe pw JOIN players p ON p.steam_id = pw.steam_id
    WHERE pw.wipe_id = ? ORDER BY pw.seconds DESC LIMIT 1`, wipeId);
  const topElo = eloLeaderboard(wipeId, 1)[0] || null;
  const topHeli = one(`
    SELECT p.name, m.steam_id, COUNT(*) n FROM map_events m JOIN players p ON p.steam_id = m.steam_id
    WHERE m.wipe_id = ? AND m.kind = 'heli' GROUP BY m.steam_id ORDER BY n DESC LIMIT 1`, wipeId);
  const totals = one(`
    SELECT COUNT(*) kills, COUNT(DISTINCT attacker_id) killers FROM kills WHERE wipe_id = ?`, wipeId);

  return {
    wipe: { id: wipe.id, label: wipe.label, startedAt: wipe.started_at, mapSeed: wipe.map_seed, mapSize: wipe.map_size },
    totals, topKiller, longestKill, topHeadshots, topDeaths, topFarmer, topHours, topElo, topHeli,
  };
}

// ---------- bans (gestão pelo admin) ----------

function addBan({ steamName, reason, staffName, evidence }) {
  db.prepare('INSERT INTO bans (ts, steam_name, reason, staff_name, evidence) VALUES (?, ?, ?, ?, ?)')
    .run(now(), steamName, reason, staffName, evidence || null);
}

function deleteBan(id) {
  db.prepare('DELETE FROM bans WHERE id = ?').run(id | 0);
}

function listBansAdmin() {
  return db.prepare('SELECT * FROM bans ORDER BY ts DESC LIMIT 200').all();
}

// ---------- raids ----------

function recordRaidEvent(e, wipeId) {
  recordRaidEvent.stmt ??= db.prepare(`
    INSERT INTO raid_events (ts, wipe_id, attacker_id, entity, grade, weapon, pos_x, pos_z)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  recordRaidEvent.stmt.run(e.ts, wipeId, e.attackerId, e.entity || null, e.grade || null,
    e.weapon || null, e.posX ?? null, e.posZ ?? null);
}

const GRID_CELL = 146.3; // tamanho de um quadrado da grelha do Rust, em metros

function gridLabel(x, z, mapSize) {
  if (x == null || z == null || !mapSize) return null;
  const half = mapSize / 2;
  const col = Math.floor((x + half) / GRID_CELL);
  const row = Math.floor((half - z) / GRID_CELL);
  if (col < 0 || row < 0) return null;
  // colunas: A..Z, AA, AB... (como no jogo)
  const letters = col < 26 ? String.fromCharCode(65 + col)
    : String.fromCharCode(64 + Math.floor(col / 26)) + String.fromCharCode(65 + (col % 26));
  return `${letters}${row}`;
}

/**
 * Agrupa eventos de raid em "raids": eventos a menos de 15 min e ~100 m
 * uns dos outros pertencem ao mesmo raid. Devolve os maiores raids da wipe.
 */
function raidList(wipeId, limit = 20) {
  const wipe = db.prepare('SELECT map_size FROM wipes WHERE id = ?').get(wipeId);
  const events = db.prepare(`
    SELECT ts, attacker_id, entity, weapon, pos_x, pos_z FROM raid_events
    WHERE wipe_id = ? ORDER BY ts LIMIT 20000`).all(wipeId);
  if (!events.length) return [];

  const clusters = [];
  for (const e of events) {
    let target = null;
    for (const c of clusters) {
      if (e.ts - c.lastTs > 15 * 60) continue;
      if (e.pos_x != null && c.cx != null) {
        const dx = e.pos_x - c.cx, dz = e.pos_z - c.cz;
        if (dx * dx + dz * dz > 100 * 100) continue;
      }
      target = c;
      break;
    }
    if (!target) {
      target = { firstTs: e.ts, lastTs: e.ts, cx: e.pos_x, cz: e.pos_z, count: 0, attackers: new Map(), weapons: new Map() };
      clusters.push(target);
    }
    target.lastTs = e.ts;
    target.count++;
    if (e.pos_x != null) {
      // centróide incremental
      target.cx = target.cx == null ? e.pos_x : target.cx + (e.pos_x - target.cx) / target.count;
      target.cz = target.cz == null ? e.pos_z : target.cz + (e.pos_z - target.cz) / target.count;
    }
    target.attackers.set(e.attacker_id, (target.attackers.get(e.attacker_id) || 0) + 1);
    if (e.weapon) target.weapons.set(e.weapon, (target.weapons.get(e.weapon) || 0) + 1);
  }

  const names = new Map();
  for (const r of db.prepare('SELECT steam_id, name FROM players').all()) names.set(r.steam_id, r.name);

  return clusters
    .filter((c) => c.count >= 3) // 1-2 paredes não é um raid, é vandalismo
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
    .map((c) => ({
      ts: c.firstTs,
      durationS: c.lastTs - c.firstTs,
      destroyed: c.count,
      grid: gridLabel(c.cx, c.cz, wipe?.map_size),
      raiders: [...c.attackers.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)
        .map(([id, n]) => ({ steamId: id, name: names.get(id) || id, destroyed: n })),
      weapons: [...c.weapons.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([w]) => w),
    }));
}

function raidStats(steamId, wipeId) {
  return db.prepare('SELECT COUNT(*) n FROM raid_events WHERE attacker_id = ? AND wipe_id = ?')
    .get(steamId, wipeId).n;
}

// ---------- eventos do mapa (heli/bradley/crates) ----------

const MAP_EVENT_KINDS = ['heli', 'bradley', 'crate'];

function recordMapEvent(e, wipeId) {
  if (!MAP_EVENT_KINDS.includes(e.kind)) return;
  recordMapEvent.stmt ??= db.prepare(`
    INSERT INTO map_events (ts, wipe_id, kind, steam_id, pos_x, pos_z) VALUES (?, ?, ?, ?, ?, ?)`);
  recordMapEvent.stmt.run(e.ts, wipeId, e.kind, e.steamId, e.posX ?? null, e.posZ ?? null);
}

function mapEventLeaders(wipeId, limit = 5) {
  const out = { totals: {} };
  for (const kind of MAP_EVENT_KINDS) {
    out[kind] = db.prepare(`
      SELECT m.steam_id, p.name, COUNT(*) n FROM map_events m
      LEFT JOIN players p ON p.steam_id = m.steam_id
      WHERE m.wipe_id = ? AND m.kind = ?
      GROUP BY m.steam_id ORDER BY n DESC LIMIT ?`).all(wipeId, kind, limit);
    out.totals[kind] = db.prepare(
      'SELECT COUNT(*) n FROM map_events WHERE wipe_id = ? AND kind = ?').get(wipeId, kind).n;
  }
  return out;
}

function playerMapEvents(steamId, wipeId) {
  const rows = db.prepare(`
    SELECT kind, COUNT(*) n FROM map_events WHERE steam_id = ? AND wipe_id = ? GROUP BY kind`)
    .all(steamId, wipeId);
  return Object.fromEntries(rows.map((r) => [r.kind, r.n]));
}

// ---------- kill streaks ----------

/** Streaks atuais (kills desde a última morte PVP), jogadores vistos nas últimas 24 h. */
function currentStreaks(wipeId, min = 3, limit = 10) {
  return db.prepare(`
    SELECT k.attacker_id AS steam_id, p.name, p.avatar, COUNT(*) AS streak, MAX(k.ts) AS last_kill
    FROM kills k
    JOIN players p ON p.steam_id = k.attacker_id
    WHERE k.wipe_id = ?
      AND p.last_seen > ?
      AND k.ts > COALESCE(
        (SELECT MAX(d.ts) FROM kills d WHERE d.victim_id = k.attacker_id AND d.wipe_id = k.wipe_id), 0)
    GROUP BY k.attacker_id
    HAVING streak >= ?
    ORDER BY streak DESC
    LIMIT ?
  `).all(wipeId, now() - 86400, min, limit);
}

function playerStreak(steamId, wipeId) {
  const r = db.prepare(`
    SELECT COUNT(*) n FROM kills k
    WHERE k.wipe_id = ? AND k.attacker_id = ?
      AND k.ts > COALESCE(
        (SELECT MAX(d.ts) FROM kills d WHERE d.victim_id = ? AND d.wipe_id = ?), 0)
  `).get(wipeId, steamId, steamId, wipeId);
  return r.n;
}

// ---------- comparador de jogadores ----------

function comparePlayers(idA, idB) {
  const wipe = currentWipe();
  const side = (steamId) => {
    const p = db.prepare('SELECT * FROM players WHERE steam_id = ?').get(steamId);
    if (!p) return null;
    const k = db.prepare(`
      SELECT COUNT(*) kills, COALESCE(SUM(headshot),0) hs, COALESCE(MAX(distance),0) dist
      FROM kills WHERE attacker_id = ? AND wipe_id = ?`).get(steamId, wipe.id);
    const d = db.prepare('SELECT COUNT(*) n FROM kills WHERE victim_id = ? AND wipe_id = ?').get(steamId, wipe.id);
    const ka = db.prepare('SELECT COUNT(*) n FROM kills WHERE attacker_id = ?').get(steamId);
    const da = db.prepare('SELECT COUNT(*) n FROM kills WHERE victim_id = ?').get(steamId);
    const pw = db.prepare('SELECT seconds FROM playtime_wipe WHERE wipe_id = ? AND steam_id = ?').get(wipe.id, steamId);
    const eloRow = eloGet(wipe.id, steamId);
    return {
      steamId, name: p.name, avatar: p.avatar, lastSeen: p.last_seen,
      wipe: {
        kills: k.kills, deaths: d.n,
        kd: Math.round((k.kills / Math.max(d.n, 1)) * 100) / 100,
        headshots: k.hs, hsRate: k.kills ? Math.round((k.hs / k.kills) * 100) : 0,
        bestDistance: Math.round(k.dist),
        hours: Math.round((pw?.seconds || 0) / 3600),
        structuresDestroyed: raidStats(steamId, wipe.id),
        streak: playerStreak(steamId, wipe.id),
      },
      allTime: {
        kills: ka.n, deaths: da.n,
        kd: Math.round((ka.n / Math.max(da.n, 1)) * 100) / 100,
        hours: Math.round(p.playtime_s / 3600),
      },
      elo: eloRow.games >= 5
        ? { rating: Math.round(eloRow.rating), tier: eloTier(eloRow.rating) } : null,
    };
  };

  const a = side(idA), b = side(idB);
  if (!a || !b) return null;

  const h2h = {
    aKilledB: db.prepare('SELECT COUNT(*) n FROM kills WHERE attacker_id = ? AND victim_id = ?').get(idA, idB).n,
    bKilledA: db.prepare('SELECT COUNT(*) n FROM kills WHERE attacker_id = ? AND victim_id = ?').get(idB, idA).n,
    recent: db.prepare(`
      SELECT ts, attacker_id, weapon, distance, headshot FROM kills
      WHERE (attacker_id = ? AND victim_id = ?) OR (attacker_id = ? AND victim_id = ?)
      ORDER BY ts DESC LIMIT 10`).all(idA, idB, idB, idA),
  };

  return { a, b, h2h };
}

// ---------- wipes ----------

function listWipes() {
  return db.prepare('SELECT id, started_at, label, map_seed, map_size FROM wipes ORDER BY started_at DESC LIMIT 24').all();
}

function recordKill(e, wipeId) {
  recordKill.stmt ??= db.prepare(`
    INSERT INTO kills (ts, wipe_id, attacker_id, victim_id, weapon, distance, headshot, bodypart, pos_x, pos_z)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  recordKill.stmt.run(e.ts, wipeId, e.attackerId, e.victimId,
    e.weapon || null, e.distance ?? null, e.headshot ? 1 : 0, e.bodypart || null,
    e.posX ?? null, e.posZ ?? null);
  updateElo(wipeId, e.attackerId, e.victimId);
}

// ---------- Elo sazonal ----------
// Cada kill é um "jogo": o atacante ganha, a vítima perde. K=32, início 1000.

const ELO_K = 32;

function eloGet(wipeId, steamId) {
  const r = db.prepare('SELECT rating, games FROM elo WHERE wipe_id = ? AND steam_id = ?').get(wipeId, steamId);
  return r || { rating: 1000, games: 0 };
}

function updateElo(wipeId, attackerId, victimId) {
  const a = eloGet(wipeId, attackerId);
  const v = eloGet(wipeId, victimId);
  const expectedA = 1 / (1 + Math.pow(10, (v.rating - a.rating) / 400));
  const newA = a.rating + ELO_K * (1 - expectedA);
  const newV = v.rating - ELO_K * (1 - expectedA);
  updateElo.stmt ??= db.prepare(`
    INSERT INTO elo (wipe_id, steam_id, rating, games) VALUES (?, ?, ?, 1)
    ON CONFLICT(wipe_id, steam_id) DO UPDATE SET rating = excluded.rating, games = games + 1
  `);
  updateElo.stmt.run(wipeId, attackerId, newA);
  updateElo.stmt.run(wipeId, victimId, newV);
}

const ELO_TIERS = [
  [1300, 'Predator 🦅'], [1150, 'Diamond 💠'], [1050, 'Gold 🥇'],
  [950, 'Silver 🥈'], [0, 'Bronze 🥉'],
];

function eloTier(rating) {
  return ELO_TIERS.find(([min]) => rating >= min)[1];
}

function eloLeaderboard(wipeId, limit = 50) {
  return db.prepare(`
    SELECT p.steam_id, p.name, p.avatar, ROUND(e.rating) AS rating, e.games
    FROM elo e JOIN players p ON p.steam_id = e.steam_id
    WHERE e.wipe_id = ? AND e.games >= 5
    ORDER BY e.rating DESC LIMIT ?
  `).all(wipeId, limit).map((r) => ({ ...r, tier: eloTier(r.rating) }));
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

/**
 * scope:
 *   { type: 'wipe', wipeId }   — uma wipe (por omissão a atual)
 *   { type: 'all' }            — desde sempre
 *   { type: 'window', since }  — janela temporal (última hora/dia/semana/mês),
 *                                útil também para detetar picos suspeitos de kills
 */
function leaderboard(by = 'kills', scope = null, limit = 50) {
  const order = LEADERBOARD_SORTS[by] || LEADERBOARD_SORTS.kills;
  scope = scope || { type: 'wipe', wipeId: currentWipe().id };

  let filter, playtimeCol, playtimeJoin, params;
  if (scope.type === 'window') {
    filter = 'AND k.ts >= ?';
    playtimeCol = 'COALESCE(pl.secs, 0)';
    playtimeJoin = `LEFT JOIN (
      SELECT steam_id, SUM(seconds) secs FROM playtime_log WHERE ts >= ? GROUP BY steam_id
    ) pl ON pl.steam_id = p.steam_id`;
    params = [scope.since, scope.since, scope.since, limit];
  } else if (scope.type === 'wipe') {
    // Numa wipe específica, as horas mostradas e o filtro de atividade são DESSA wipe
    filter = 'AND k.wipe_id = ?';
    playtimeCol = 'COALESCE(pw.seconds, 0)';
    playtimeJoin = 'LEFT JOIN playtime_wipe pw ON pw.steam_id = p.steam_id AND pw.wipe_id = ?';
    params = [scope.wipeId, scope.wipeId, scope.wipeId, limit];
  } else {
    filter = '';
    playtimeCol = 'p.playtime_s';
    playtimeJoin = '';
    params = [limit];
  }

  return db.prepare(`
    SELECT p.steam_id, p.name, p.avatar, ${playtimeCol} AS playtime_s,
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

  const eloRow = eloGet(wipe.id, steamId);

  return {
    steamId: p.steam_id, name: p.name, avatar: p.avatar,
    firstSeen: p.first_seen, lastSeen: p.last_seen, playtimeS: p.playtime_s,
    wipe: agg(wipe.id), allTime: agg(null),
    weapons, victims, nemesis, gather: gatherRows, recent,
    elo: eloRow.games >= 5
      ? { rating: Math.round(eloRow.rating), games: eloRow.games, tier: eloTier(eloRow.rating) }
      : null,
    badges: achievements(steamId, wipe.id),
    team: playerTeam(wipe.id, steamId),
    streak: playerStreak(steamId, wipe.id),
    structuresDestroyed: raidStats(steamId, wipe.id),
  };
}

function killfeed(limit = 50) {
  return db.prepare(`
    SELECT k.ts, k.weapon, k.distance, k.headshot, k.bodypart,
           k.attacker_id, k.victim_id, pa.name attacker_name, pv.name victim_name,
           pa.avatar attacker_avatar, pv.avatar victim_avatar
    FROM kills k
    LEFT JOIN players pa ON pa.steam_id = k.attacker_id
    LEFT JOIN players pv ON pv.steam_id = k.victim_id
    ORDER BY k.ts DESC LIMIT ?`).all(Math.max(1, Math.min(limit | 0, 200)));
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
  avatarInfo, setAvatar, ensureWebPlayer, achievementsCatalog,
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
  listWipes, previousWipeId, wipeSummary,
  // equipas, elo, conquistas, heatmap, bans admin
  updateTeams, teamLeaderboard, playerTeam,
  eloLeaderboard, eloGet, eloTier,
  achievements, deathHeatmap,
  addBan, deleteBan, listBansAdmin,
  // raids, streaks, comparador, eventos do mapa
  recordRaidEvent, raidList, raidStats,
  currentStreaks, playerStreak, comparePlayers,
  recordMapEvent, mapEventLeaders, playerMapEvents,
};
