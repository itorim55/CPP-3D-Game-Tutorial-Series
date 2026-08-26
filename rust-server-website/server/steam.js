'use strict';
// Avatares Steam com cache na tabela players.
//
// Sem configuração extra usa o perfil XML público da comunidade (não precisa
// de chave). Se definires "steamApiKey" no config.json (chave gratuita em
// https://steamcommunity.com/dev/apikey) usa a API oficial — mais fiável.
// Tudo é fire-and-forget: falhas nunca afetam a resposta ao utilizador.

const store = require('./db');

const TTL_OK = 7 * 86400;   // avatar em cache vale 7 dias
const TTL_FAIL = 86400;     // perfil privado/falha: nova tentativa após 1 dia
const inflight = new Set(); // evita pedidos duplicados e limita concorrência

let apiKey = '';
function init(key) { apiKey = key || ''; }

async function fetchProfile(steamId) {
  if (apiKey) {
    const r = await fetch(
      `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${apiKey}&steamids=${steamId}`,
      { signal: AbortSignal.timeout(6000) });
    if (!r.ok) throw new Error(`steam api ${r.status}`);
    const d = await r.json();
    const pl = d?.response?.players?.[0];
    return pl ? { name: pl.personaname || null, avatar: pl.avatarmedium || null, createdTs: pl.timecreated || null } : null;
  }
  const r = await fetch(`https://steamcommunity.com/profiles/${steamId}/?xml=1`,
    { signal: AbortSignal.timeout(6000) });
  if (!r.ok) throw new Error(`steam profile ${r.status}`);
  const xml = await r.text();
  const name = xml.match(/<steamID><!\[CDATA\[(.*?)\]\]><\/steamID>/);
  const av = xml.match(/<avatarMedium><!\[CDATA\[(.*?)\]\]><\/avatarMedium>/);
  return { name: name ? name[1] : null, avatar: av ? av[1] : null };
}

/**
 * Garante que o avatar do jogador está fresco na cache. Não bloqueia:
 * dispara o fetch em segundo plano e a próxima resposta já o inclui.
 * Só atua sobre jogadores que existem na tabela players.
 */
function refresh(steamId) {
  steamId = String(steamId || '');
  if (!/^7656119\d{10}$/.test(steamId)) return;
  const info = store.avatarInfo(steamId);
  if (!info) return; // jogador desconhecido — nada onde guardar
  const age = Math.floor(Date.now() / 1000) - (info.avatar_ts || 0);
  const nameless = info.name === 'Unknown'; // nome por preencher — ignorar o TTL
  if (!nameless && info.avatar_ts && age < (info.avatar ? TTL_OK : TTL_FAIL)) return;
  if (inflight.has(steamId) || inflight.size >= 4) return;

  inflight.add(steamId);
  fetchProfile(steamId)
    .then(async (prof) => {
      store.setAvatar(steamId, prof?.avatar || null);
      // auto-cura: se o registo ficou 'Unknown' (ex.: seed), cola o nome Steam
      if (prof?.name) store.ensureWebPlayer(steamId, prof.name);
      // com steamApiKey também refrescamos bans + idade da conta + horas de Rust
      if (apiKey) {
        try {
          const flags = { createdTs: prof?.createdTs || null };
          const r = await fetch(
            `https://api.steampowered.com/ISteamUser/GetPlayerBans/v1/?key=${apiKey}&steamids=${steamId}`,
            { signal: AbortSignal.timeout(6000) });
          const b = (await r.json())?.players?.[0];
          if (b) {
            flags.vac = !!b.VACBanned;
            flags.gameBans = b.NumberOfGameBans | 0;
            flags.daysSinceLastBan = b.DaysSinceLastBan | 0;
            flags.community = !!b.CommunityBanned;
          }
          try {
            // horas de Rust (só perfis com detalhes de jogos públicos)
            const g = await fetch(
              `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${apiKey}&steamid=${steamId}` +
              '&appids_filter%5B0%5D=252490&include_played_free_games=1',
              { signal: AbortSignal.timeout(6000) });
            const game = (await g.json())?.response?.games?.[0];
            if (game) flags.rustHours = Math.round((game.playtime_forever || 0) / 60);
          } catch { /* perfil privado — sem horas */ }
          store.setSteamFlags(steamId, JSON.stringify(flags));
        } catch { /* flags ficam por refrescar */ }
      }
    })
    // Falha de rede: mantém o avatar antigo mas carimba a tentativa,
    // para não martelar a Steam a cada pedido.
    .catch(() => store.setAvatar(steamId, info.avatar || null))
    .finally(() => inflight.delete(steamId));
}

/**
 * Chamado no regresso do login Steam. Garante que quem entra pelo site tem
 * nome e avatar mesmo sem nunca ter jogado no servidor: cria o registo
 * mínimo na tabela players (sem tocar em last_seen nem em nomes do jogo).
 */
async function adopt(steamId) {
  steamId = String(steamId || '');
  if (!/^7656119\d{10}$/.test(steamId)) return;
  try {
    const prof = await fetchProfile(steamId);
    if (!prof || (!prof.name && !prof.avatar)) return;
    store.ensureWebPlayer(steamId, prof.name || null);
    if (prof.avatar) store.setAvatar(steamId, prof.avatar);
  } catch { /* o login nunca falha por causa do perfil */ }
}

module.exports = { init, refresh, adopt };
