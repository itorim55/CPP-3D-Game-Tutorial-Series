'use strict';
// Dados de demonstração — para veres o site "vivo" antes de ligares o plugin.
// Uso: node server/app.js --seed   (só insere se a base de dados estiver vazia)

const store = require('./db');

const NAMES = [
  'Naked Bob', 'RaidMaster', 'xX_Sniper_Xx', 'Bush Wookie', 'The Naked One',
  'CheaterHunter', 'Sulfur King', 'AK Kid', 'Farmzilla', 'Doctor C4',
  'Beach Legend', 'Pro Camper', 'German Tourist', 'ZergLeader',
  'Solo Sufferer', 'Duo Dynamite', 'Bradley Fisher', 'Base Genius',
];

const WEAPONS = [
  'Assault Rifle', 'LR-300', 'MP5A4', 'Bolt Action Rifle', 'L96 Rifle',
  'Semi-Automatic Rifle', 'Thompson', 'Custom SMG', 'Python Revolver',
  'Pump Shotgun', 'Crossbow', 'Compound Bow', 'F1 Grenade', 'Machete',
];

const RESOURCES = ['wood', 'stone', 'metal.ore', 'sulfur.ore', 'hq.metal.ore'];
const CAUSES = ['Bear', 'Wolf', 'Fall', 'Drowned', 'Scientist', 'Patrol Helicopter', 'Bradley APC', 'Cold', 'Hunger'];

function rnd(n) { return Math.floor(Math.random() * n); }
function pick(a) { return a[rnd(a.length)]; }

function seed() {
  const existing = store.db.prepare('SELECT COUNT(*) c FROM players').get().c;
  if (existing > 0) { console.log('[seed] Base de dados já tem dados — seed ignorado.'); return; }

  const now = store.now();
  const wipe = store.currentWipe();
  const ids = NAMES.map((_, i) => `7656119800000${String(1000 + i)}`);

  console.log('[seed] A criar jogadores de demonstração...');
  NAMES.forEach((name, i) => {
    const firstSeen = now - rnd(12 * 86400);
    store.upsertPlayer(ids[i], name, firstSeen);
    store.addPlaytime(ids[i], 3600 * (2 + rnd(120)));
  });

  // O dono do site entra na demo com o SteamID real. O nome fica 'Unknown'
  // até ao primeiro login Steam — aí o nome e o avatar verdadeiros colam-se
  // sozinhos (ver steam.adopt), e o dono aparece em todos os leaderboards.
  const ownerId = '76561198874661673';
  store.upsertPlayer(ownerId, null, now - 9 * 86400);
  store.addPlaytime(ownerId, 3600 * 38);
  ids.push(ownerId);

  console.log('[seed] A gerar kills...');
  // alguns "hotspots" no mapa para o heatmap ficar interessante
  const hotspots = [[-800, 600], [400, -900], [1200, 1100], [0, 0], [-1400, -400]];
  for (let k = 0; k < 900; k++) {
    let a = rnd(ids.length), v = rnd(ids.length);
    // dar personalidade: primeiros nomes matam mais
    if (Math.random() < 0.5) a = rnd(6);
    if (a === v) continue;
    const [hx, hz] = pick(hotspots);
    store.recordKill({
      ts: now - rnd(10 * 86400),
      attackerId: ids[a], victimId: ids[v],
      weapon: pick(WEAPONS),
      distance: Math.round(Math.random() * (Math.random() < 0.1 ? 350 : 120) * 10) / 10,
      headshot: Math.random() < 0.35,
      bodypart: pick(['head', 'chest', 'stomach', 'arm', 'leg']),
      posX: hx + (Math.random() - 0.5) * 600,
      posZ: hz + (Math.random() - 0.5) * 600,
    }, wipe.id);
  }

  // o dono leva um empurrão para meio da tabela — com direito a badge de sniper
  for (let k = 0; k < 45; k++) {
    let v = rnd(ids.length - 1);
    const [hx, hz] = pick(hotspots);
    store.recordKill({
      ts: now - rnd(10 * 86400),
      attackerId: ownerId, victimId: ids[v],
      weapon: pick(WEAPONS),
      distance: k === 0 ? 327 : Math.round(Math.random() * 140 * 10) / 10,
      headshot: k === 0 ? true : Math.random() < 0.4,
      bodypart: pick(['head', 'chest', 'stomach', 'arm', 'leg']),
      posX: hx + (Math.random() - 0.5) * 600,
      posZ: hz + (Math.random() - 0.5) * 600,
    }, wipe.id);
  }

  for (let k = 0; k < 200; k++) {
    store.recordPveDeath({ ts: now - rnd(10 * 86400), victimId: pick(ids), cause: pick(CAUSES) }, wipe.id);
  }

  for (const id of ids) {
    for (const r of RESOURCES) store.recordGather(wipe.id, id, r, 1000 + rnd(90000));
  }

  console.log('[seed] Chat de demonstração...');
  const chat = [
    [ids[3], 'anyone selling scrap at bandit? paying in wood lol'],
    [ids[1], 'that heli fight at dome was insane'],
    [ids[5], 'GG to the trio at lighthouse, good fight'],
    [ids[0], 'wipe day hype, who is dropping launch?'],
    [ids[8], 'farmzilla does not fight, farmzilla farms'],
  ];
  chat.forEach(([id, text], i) => {
    store.addChatMessage('global', id, text);
  });

  console.log('[seed] Heartbeats (histórico de população)...');
  for (let h = 48; h >= 0; h--) {
    const ts = now - h * 3600;
    const hour = new Date(ts * 1000).getUTCHours();
    const base = hour >= 17 && hour <= 23 ? 60 : hour >= 10 ? 35 : 15;
    store.db.prepare(`
      INSERT INTO heartbeats (ts, players, max_players, queued, joining, fps, entities)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(ts, base + rnd(25), 100, 0, rnd(3), 55 + rnd(10), 140000 + rnd(20000));
  }

  console.log('[seed] Staff e transparência...');
  const staff = [
    ['HeadAdmin', 'Founder / Owner', 'Founded the server. Never plays a wipe with advantages — separate admin account, moderation only.'],
    ['NightWatch', 'Head Admin', 'Cheater-catching specialist. Every piece of evidence recorded and published.'],
    ['ModAna', 'Moderator', 'Handles Discord tickets and in-game checks.'],
    ['ShadowBan', 'Moderator', 'Moderator of the month in July. 23 cheaters banned with evidence.'],
  ];
  for (const [name, role, blurb] of staff) {
    store.db.prepare('INSERT INTO staff (name, role, since, blurb) VALUES (?, ?, ?, ?)')
      .run(name, role, now - rnd(300 * 86400), blurb);
  }

  const banReasons = [
    ['Confirmed aimbot (recording published)', 'NightWatch'],
    ['ESP / wallhack — flagged by the system + manual review', 'ShadowBan'],
    ['Ban evasion (alt account)', 'NightWatch'],
    ['Recoil scripts', 'ModAna'],
    ['Extreme toxicity / hate speech in chat', 'ModAna'],
    ['Confirmed aimbot (recording published)', 'ShadowBan'],
    ['Cheater association (teamed with a banned account)', 'NightWatch'],
  ];
  banReasons.forEach(([reason, staffName], i) => {
    store.db.prepare('INSERT INTO bans (ts, steam_name, reason, staff_name, evidence) VALUES (?, ?, ?, ?, ?)')
      .run(now - rnd(25 * 86400), `Cheater#${1000 + i}`, reason, staffName,
           i % 2 === 0 ? 'https://youtu.be/example' : null);
  });

  store.setInfo('map', 'Procedural 3800');

  console.log('[seed] Gemas, tempo por wipe, novidades, overwatch e votação de mapa...');
  const wipeNow = store.currentWipe();
  ids.forEach((id) => {
    const secondsThisWipe = 3600 * (1 + rnd(60));
    store.db.prepare(`
      INSERT INTO playtime_wipe (wipe_id, steam_id, seconds) VALUES (?, ?, ?)
      ON CONFLICT(wipe_id, steam_id) DO UPDATE SET seconds = excluded.seconds`)
      .run(wipeNow.id, id, secondsThisWipe);
    store.addGems(id, 1000 * (2 + rnd(80)));
  });

  store.addPost('Welcome to the server!',
    'Fresh server, fresh wipe. Rules on the site, staff on Discord. Good luck out there — and remember: cheaters do not last long around here.');
  store.addPost('September 3rd wipe',
    'Force wipe on Thursday at 7pm UTC. New map chosen by the community on the map vote page. Blueprints wipe too (monthly force wipe).');

  store.addOwCase('Suspected ESP near Launch Site', 'https://youtu.be/example-clip-1');
  store.addOwCase('Perfect recoil with an AK at 150m?', 'https://youtu.be/example-clip-2');
  store.db.prepare("UPDATE ow_cases SET status = 'closed', verdict = 'cheater' WHERE id = 1").run();
  ids.slice(0, 9).forEach((id, i) => {
    store.db.prepare('INSERT OR IGNORE INTO ow_votes (case_id, steam_id, vote) VALUES (?, ?, ?)')
      .run(1, id, i < 6 ? 'cheat' : i < 8 ? 'unsure' : 'clean');
  });

  store.mapAdmin('add', { label: 'Map A — classic, 2 lakes', seed: '183456201', size: 3800 });
  store.mapAdmin('add', { label: 'Map B — big island + ocean', seed: '990122837', size: 4000 });
  store.mapAdmin('add', { label: 'Map C — mountains and snow', seed: '447789123', size: 3600 });
  store.mapAdmin('open', {});
  const opts = store.db.prepare('SELECT id FROM map_options WHERE round = 1').all();
  ids.slice(0, 12).forEach((id, i) => {
    store.db.prepare('INSERT OR IGNORE INTO map_votes (round, steam_id, option_id, weight) VALUES (?, ?, ?, ?)')
      .run(1, id, opts[i % opts.length].id, 1 + rnd(5));
  });

  // espalhar o registo de tempo de jogo pelos últimos 10 dias
  // (o addPlaytime regista tudo "agora"; em produção chega de 5 em 5 min)
  store.db.prepare(`UPDATE playtime_log SET ts = ? - ABS(RANDOM() % ?)`).run(now, 10 * 86400);
  // e marcar toda a gente como vista nas últimas ~20 h (para streaks/atividade)
  store.db.prepare(`UPDATE players SET last_seen = ? - ABS(RANDOM() % 72000)`).run(now);

  console.log('[seed] Eventos do mapa...');
  const eventKinds = [['heli', 9], ['bradley', 14], ['crate', 30]];
  for (const [kind, count] of eventKinds) {
    for (let i = 0; i < count; i++) {
      store.recordMapEvent({
        ts: now - rnd(10 * 86400),
        kind,
        steamId: pick(ids.slice(0, 10)),
        posX: (Math.random() - 0.5) * 3000,
        posZ: (Math.random() - 0.5) * 3000,
      }, wipeNow.id);
    }
  }

  console.log('[seed] Equipas...');
  store.updateTeams(wipeNow.id, [
    { id: '1001', leader: ids[0], members: [ids[0], ids[1], ids[7]] },
    { id: '1002', leader: ids[2], members: [ids[2], ids[4]] },
    { id: '1003', leader: ids[13], members: [ids[13], ids[8], ids[9], ids[17]] },
  ]);

  // wipe atualiza o tamanho do mapa (para o heatmap normalizar coordenadas)
  store.db.prepare('UPDATE wipes SET map_size = 3800 WHERE id = ?').run(wipeNow.id);

  console.log('[seed] Raids...');
  const raidWeapons = ['rocket_basic', 'explosive.timed.deployed', 'explosive.satchel.deployed'];
  const raids = [
    { at: now - 2 * 86400, x: -900, z: 700, size: 38, raiders: [ids[0], ids[1], ids[7]] },
    { at: now - 5 * 86400, x: 1100, z: -300, size: 21, raiders: [ids[2], ids[4]] },
    { at: now - 86400, x: 300, z: 1400, size: 12, raiders: [ids[13], ids[8]] },
    { at: now - 3 * 3600, x: -400, z: -1100, size: 7, raiders: [ids[5]] },
  ];
  for (const r of raids) {
    for (let i = 0; i < r.size; i++) {
      store.recordRaidEvent({
        ts: r.at + rnd(600),
        attackerId: pick(r.raiders),
        entity: pick(['wall', 'wall.doorway', 'foundation', 'door.hinged.toptier']),
        grade: pick(['Stone', 'Metal', 'TopTier']),
        weapon: pick(raidWeapons),
        posX: r.x + (Math.random() - 0.5) * 40,
        posZ: r.z + (Math.random() - 0.5) * 40,
      }, wipeNow.id);
    }
  }

  store.addAppeal(ids[10], 'sufferer#0001',
    'I was banned for "cheater association" but I only played with him twice and had no idea. Requesting a review — my account has 900 h and a clean record.');

  console.log('[seed] Concluído.');
}

module.exports = { seed };
