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

async function fetchAvatar(steamId) {
  if (apiKey) {
    const r = await fetch(
      `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${apiKey}&steamids=${steamId}`,
      { signal: AbortSignal.timeout(6000) });
    if (!r.ok) throw new Error(`steam api ${r.status}`);
    const d = await r.json();
    return d?.response?.players?.[0]?.avatarmedium || null;
  }
  const r = await fetch(`https://steamcommunity.com/profiles/${steamId}/?xml=1`,
    { signal: AbortSignal.timeout(6000) });
  if (!r.ok) throw new Error(`steam profile ${r.status}`);
  const xml = await r.text();
  const m = xml.match(/<avatarMedium><!\[CDATA\[(.*?)\]\]><\/avatarMedium>/);
  return m ? m[1] : null;
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
  if (info.avatar_ts && age < (info.avatar ? TTL_OK : TTL_FAIL)) return;
  if (inflight.has(steamId) || inflight.size >= 4) return;

  inflight.add(steamId);
  fetchAvatar(steamId)
    .then((url) => store.setAvatar(steamId, url))
    // Falha de rede: mantém o avatar antigo mas carimba a tentativa,
    // para não martelar a Steam a cada pedido.
    .catch(() => store.setAvatar(steamId, info.avatar || null))
    .finally(() => inflight.delete(steamId));
}

module.exports = { init, refresh };
