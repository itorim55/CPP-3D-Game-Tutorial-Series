'use strict';
// Open Graph dinâmico — injetado no <head> de cada página HTML pelo servidor.
// Quando alguém cola um link no Discord/WhatsApp/Twitter, o crawler vê tags
// geradas com dados AO VIVO (perfil com kills/Elo, resumo com highlights...).

const store = require('./db');

function escAttr(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function brand() {
  return (store.getInfo('brand_accent') || 'RUST') + (store.getInfo('brand_rest') || '');
}

// ---------- descrições por rota ----------

function forHome() {
  const s = store.status();
  const online = s.heartbeat ? `${s.heartbeat.players}/${s.heartbeat.max_players} online` : null;
  return {
    title: store.getInfo('server_name') || brand(),
    desc: [
      online, `${s.killsThisWipe.toLocaleString('pt-PT')} kills esta wipe`,
      'Estatísticas ao vivo · Staff transparente · Zero pay-to-win',
    ].filter(Boolean).join(' · '),
  };
}

function forPlayer(query) {
  const id = query.get('id');
  if (!id) return null;
  const p = store.playerProfile(id);
  if (!p) return null;
  const w = p.wipe;
  return {
    title: `${p.name} — perfil ${brand()}`,
    desc: [
      `⚔️ ${w.kills} kills · 💀 ${w.deaths} mortes · K/D ${w.kd.toFixed(2)}`,
      p.elo ? `${p.elo.tier} ${p.elo.rating}` : null,
      p.streak >= 3 ? `🔥 streak de ${p.streak}` : null,
      p.badges.length ? `${p.badges.length} conquistas` : null,
    ].filter(Boolean).join(' · '),
  };
}

function forSummary(query) {
  const wid = parseInt(query.get('wipe') || '', 10) || store.currentWipe().id;
  const s = store.wipeSummary(wid);
  if (!s) return null;
  return {
    title: `🏁 ${s.wipe.label || 'Resumo da wipe'} — ${brand()}`,
    desc: [
      s.topKiller && `⚔️ Top killer: ${s.topKiller.name} (${s.topKiller.n})`,
      s.longestKill && `🎯 ${s.longestKill.name} a ${Math.round(s.longestKill.distance)} m`,
      s.totals && `${s.totals.kills.toLocaleString('pt-PT')} kills no total`,
    ].filter(Boolean).join(' · '),
  };
}

function forVs(query) {
  const a = query.get('a'), b = query.get('b');
  if (!a || !b) return { title: `⚔️ Comparador 1v1 — ${brand()}`, desc: 'Escolhe dois jogadores e vê quem manda.' };
  const c = store.comparePlayers(a, b);
  if (!c) return null;
  return {
    title: `⚔️ ${c.a.name} vs ${c.b.name}`,
    desc: `Frente a frente: ${c.h2h.aKilledB}–${c.h2h.bKilledA} · ` +
      `Kills esta wipe: ${c.a.wipe.kills} vs ${c.b.wipe.kills} · K/D: ${c.a.wipe.kd} vs ${c.b.wipe.kd}`,
  };
}

function forStats() {
  const top = store.leaderboard('kills', null, 3);
  return {
    title: `Leaderboards — ${brand()}`,
    desc: top.length
      ? 'Top da wipe: ' + top.map((r, i) => `${i + 1}. ${r.name} (${r.kills})`).join(' · ')
      : 'Kills, K/D, Elo, headshots, equipas, raids e mais.',
  };
}

const STATIC_PAGES = {
  '/loja': { title: 'Loja de Gemas', desc: 'Ganha gemas por cada hora jogada e troca por recompensas 100% cosméticas. Zero pay-to-win.' },
  '/mapa': { title: 'Votação do próximo mapa', desc: 'A comunidade escolhe o mapa — quem joga mais, vota mais.' },
  '/overwatch': { title: 'Overwatch Comunitário', desc: 'Ajuda a caça aos cheaters: vê clips anónimos de suspeitos e dá o teu veredicto.' },
  '/regras': { title: 'Regras do servidor', desc: 'Tolerância zero a cheats, grupos limitados, staff transparente com bans públicos.' },
  '/staff': { title: 'Staff & Transparência', desc: 'Código do Moderador, lista pública de bans com provas, e Moderador do Mês.' },
  '/candidatura': { title: 'Candidatura a Moderador', desc: 'Queres moderar como o camomo_10? Candidata-te — provas gravadas em todos os bans.' },
  '/heatmap': { title: 'Heatmap de mortes', desc: 'Onde se morre neste mapa? As zonas mais quentes da wipe.' },
  '/novidades': { title: 'Novidades', desc: 'Changelog do servidor, wipe a wipe.' },
  '/apelo': { title: 'Apelar um ban', desc: 'Todos os bans podem ser contestados. Revisão por um admin diferente, resposta em 48-72 h.' },
};

// ---------- construção do bloco de tags ----------

/** Devolve o bloco de meta tags OG para injetar no <head>, ou '' em caso de erro. */
function tagsFor(pathname, query, siteUrl) {
  try {
    let meta = null;
    if (pathname === '/' || pathname === '/index') meta = forHome();
    else if (pathname === '/player') meta = forPlayer(query);
    else if (pathname === '/resumo') meta = forSummary(query);
    else if (pathname === '/vs') meta = forVs(query);
    else if (pathname === '/stats') meta = forStats();
    else meta = STATIC_PAGES[pathname] || null;
    if (!meta) meta = { title: brand(), desc: store.getInfo('server_name') || 'Servidor de Rust' };

    const url = siteUrl + pathname + (query.toString() ? `?${query}` : '');
    return [
      `<meta property="og:site_name" content="${escAttr(brand())}">`,
      `<meta property="og:type" content="website">`,
      `<meta property="og:title" content="${escAttr(meta.title)}">`,
      `<meta property="og:description" content="${escAttr(meta.desc)}">`,
      `<meta property="og:url" content="${escAttr(url)}">`,
      `<meta property="og:image" content="${escAttr(siteUrl)}/img/og.png">`,
      `<meta name="twitter:card" content="summary_large_image">`,
      `<meta name="description" content="${escAttr(meta.desc)}">`,
      `<meta name="theme-color" content="#e0552e">`,
    ].join('\n');
  } catch {
    return '<meta name="theme-color" content="#e0552e">';
  }
}

module.exports = { tagsFor };
