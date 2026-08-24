'use strict';
// Dados de demonstração — para veres o site "vivo" antes de ligares o plugin.
// Uso: node server/app.js --seed   (só insere se a base de dados estiver vazia)

const store = require('./db');

const NAMES = [
  'Zé do Rust', 'RaidMaster PT', 'xX_Sniper_Xx', 'Bárbara Selvagem', 'O Naked',
  'CaçadorDeCheaters', 'Rei do Sulfur', 'Miúdo AK', 'Farmzilla', 'Doutor C4',
  'A Lenda de Peniche', 'Camper Profissional', 'Turista Alemão', 'ZergLeader',
  'Solo Sofredor', 'Duo Dinamite', 'Pescador de Bradley', 'Génio das Bases',
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

  console.log('[seed] A gerar kills...');
  for (let k = 0; k < 900; k++) {
    let a = rnd(ids.length), v = rnd(ids.length);
    // dar personalidade: primeiros nomes matam mais
    if (Math.random() < 0.5) a = rnd(6);
    if (a === v) continue;
    store.recordKill({
      ts: now - rnd(10 * 86400),
      attackerId: ids[a], victimId: ids[v],
      weapon: pick(WEAPONS),
      distance: Math.round(Math.random() * (Math.random() < 0.1 ? 350 : 120) * 10) / 10,
      headshot: Math.random() < 0.35,
      bodypart: pick(['head', 'chest', 'stomach', 'arm', 'leg']),
    }, wipe.id);
  }

  for (let k = 0; k < 200; k++) {
    store.recordPveDeath({ ts: now - rnd(10 * 86400), victimId: pick(ids), cause: pick(CAUSES) }, wipe.id);
  }

  for (const id of ids) {
    for (const r of RESOURCES) store.recordGather(wipe.id, id, r, 1000 + rnd(90000));
  }

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
    ['Admin Principal', 'Fundador / Dono', 'Fundou o servidor. Nunca joga a wipe com vantagens — conta de admin separada, só para moderar.'],
    ['VigiaNoturno', 'Head Admin', 'Especialista em apanhar cheaters. Todas as provas gravadas e publicadas.'],
    ['Moderadora Ana', 'Moderadora', 'Responde a tickets no Discord e faz verificações in-game.'],
    ['ShadowBanPT', 'Moderador', 'Moderador do mês de julho. 23 cheaters banidos com provas.'],
  ];
  for (const [name, role, blurb] of staff) {
    store.db.prepare('INSERT INTO staff (name, role, since, blurb) VALUES (?, ?, ?, ?)')
      .run(name, role, now - rnd(300 * 86400), blurb);
  }

  const banReasons = [
    ['Aimbot confirmado (gravação publicada)', 'VigiaNoturno'],
    ['ESP / wallhack — flagged pelo sistema + revisão manual', 'ShadowBanPT'],
    ['Contorno de ban (conta alternativa)', 'VigiaNoturno'],
    ['Scripts de recoil', 'Moderadora Ana'],
    ['Toxicidade extrema / discurso de ódio no chat', 'Moderadora Ana'],
    ['Aimbot confirmado (gravação publicada)', 'ShadowBanPT'],
    ['Associação a cheater (jogava em equipa com conta banida)', 'VigiaNoturno'],
  ];
  banReasons.forEach(([reason, staffName], i) => {
    store.db.prepare('INSERT INTO bans (ts, steam_name, reason, staff_name, evidence) VALUES (?, ?, ?, ?, ?)')
      .run(now - rnd(25 * 86400), `Cheater#${1000 + i}`, reason, staffName,
           i % 2 === 0 ? 'https://youtu.be/exemplo' : null);
  });

  store.setInfo('map', 'Procedural 3800');
  console.log('[seed] Concluído.');
}

module.exports = { seed };
