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
      online, `${s.killsThisWipe.toLocaleString('en-GB')} kills this wipe`,
      'Live stats · Transparent staff · Zero pay-to-win',
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
    title: `${p.name} — ${brand()} profile`,
    desc: [
      `⚔️ ${w.kills} kills · 💀 ${w.deaths} deaths · K/D ${w.kd.toFixed(2)}`,
      p.elo ? `${p.elo.tier} ${p.elo.rating}` : null,
      p.streak >= 3 ? `🔥 ${p.streak} streak` : null,
      p.badges.length ? `${p.badges.length} achievements` : null,
    ].filter(Boolean).join(' · '),
  };
}

function forSummary(query) {
  const wid = parseInt(query.get('wipe') || '', 10) || store.currentWipe().id;
  const s = store.wipeSummary(wid);
  if (!s) return null;
  return {
    title: `🏁 ${s.wipe.label || 'Wipe recap'} — ${brand()}`,
    desc: [
      s.topKiller && `⚔️ Top killer: ${s.topKiller.name} (${s.topKiller.n})`,
      s.longestKill && `🎯 ${s.longestKill.name} at ${Math.round(s.longestKill.distance)} m`,
      s.totals && `${s.totals.kills.toLocaleString('en-GB')} kills in total`,
    ].filter(Boolean).join(' · '),
  };
}

function forVs(query) {
  const a = query.get('a'), b = query.get('b');
  if (!a || !b) return { title: `⚔️ 1v1 Comparator — ${brand()}`, desc: 'Pick two players and see who is boss.' };
  const c = store.comparePlayers(a, b);
  if (!c) return null;
  return {
    title: `⚔️ ${c.a.name} vs ${c.b.name}`,
    desc: `Head to head: ${c.h2h.aKilledB}–${c.h2h.bKilledA} · ` +
      `Kills this wipe: ${c.a.wipe.kills} vs ${c.b.wipe.kills} · K/D: ${c.a.wipe.kd} vs ${c.b.wipe.kd}`,
  };
}

function forStats() {
  const top = store.leaderboard('kills', null, 3);
  return {
    title: `Leaderboards — ${brand()}`,
    desc: top.length
      ? 'Wipe top: ' + top.map((r, i) => `${i + 1}. ${r.name} (${r.kills})`).join(' · ')
      : 'Kills, K/D, Elo, headshots, teams, raids and more.',
  };
}

const STATIC_PAGES = {
  '/loja': { title: 'Gem Store', desc: 'Earn gems for every hour played and trade them for 100% cosmetic rewards. Zero pay-to-win.' },
  '/mapa': { title: 'Next map vote', desc: 'The community picks the map — the more you play, the more your vote counts.' },
  '/overwatch': { title: 'Community Overwatch', desc: 'Help hunt cheaters: watch anonymous clips of suspects and give your verdict.' },
  '/regras': { title: 'Server rules', desc: 'Zero tolerance for cheats, no group limit, transparent staff with public bans.' },
  '/conquistas': { title: 'Achievements', desc: 'Every badge you can unlock on the server — and who holds it right now.' },
  '/tv': { title: 'TV Mode', desc: 'Fullscreen live dashboard — killfeed, population and wipe top for screens and streams.' },
  '/staff': { title: 'Staff & Transparency', desc: 'The Moderator Code, a public ban list with evidence, and Moderator of the Month.' },
  '/candidatura': { title: 'Moderator Application', desc: 'Want to moderate like camomo_10? Apply — recorded evidence behind every ban.' },
  '/heatmap': { title: 'Death heatmap', desc: 'Where do people die on this map? The hottest zones of the wipe.' },
  '/novidades': { title: 'News', desc: 'Server changelog, wipe by wipe.' },
  '/apelo': { title: 'Appeal a ban', desc: 'Every ban can be contested. Reviewed by a different admin, answer within 48-72 h.' },
};

// ---------- construção do bloco de tags ----------

/** Devolve o bloco de meta tags OG para injetar no <head>, ou '' em caso de erro. */
function forWrapped(query) {
  const id = query.get('id');
  if (!id) return null;
  const p = store.playerProfile(id);
  if (!p) return null;
  return {
    title: `${p.name} — Wipe Wrapped`,
    desc: `${p.wipe.kills} kills · ${p.wipe.kd} K/D · ${Math.round(p.wipe.bestDistance)}m longest — the story of ${p.name}'s wipe.`,
  };
}

function tagsFor(pathname, query, siteUrl) {
  try {
    let meta = null;
    if (pathname === '/' || pathname === '/index') meta = forHome();
    else if (pathname === '/player') meta = forPlayer(query);
    else if (pathname === '/resumo') meta = forSummary(query);
    else if (pathname === '/vs') meta = forVs(query);
    else if (pathname === '/wrapped') meta = forWrapped(query);
    else if (pathname === '/stats') meta = forStats();
    else meta = STATIC_PAGES[pathname] || null;
    if (!meta) meta = { title: brand(), desc: store.getInfo('server_name') || 'Rust server' };

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
