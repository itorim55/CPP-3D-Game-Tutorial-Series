'use strict';
// Envio de mensagens para canais do Discord via webhooks (sem bot, sem deps).
// Configura os URLs em config.json -> "discordWebhooks".
// Criar um webhook: Discord > Editar canal > Integrações > Webhooks > Novo.

const https = require('node:https');

/** Envia um payload para um webhook do Discord. Fire-and-forget: nunca lança. */
function send(webhookUrl, payload) {
  if (!webhookUrl || !webhookUrl.startsWith('https://discord.com/api/webhooks/')) return;
  try {
    const body = JSON.stringify(payload);
    const req = https.request(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      timeout: 8000,
    }, (res) => { res.resume(); });
    req.on('error', () => {});
    req.on('timeout', () => req.destroy());
    req.end(body);
  } catch { /* nunca deixar um webhook derrubar o site */ }
}

const ORANGE = 0xe0552e, RED = 0xd05c5c, GOLD = 0xd8a94e;

/** Killfeed: um digest por lote de ingestão (evita rate-limit do Discord). */
function killfeed(url, lines) {
  if (!lines.length) return;
  send(url, {
    embeds: [{
      color: ORANGE,
      description: lines.slice(0, 15).join('\n') +
        (lines.length > 15 ? `\n… e mais ${lines.length - 15} kills` : ''),
    }],
  });
}

function banAnnounce(url, { steamName, reason, staffName, evidence }) {
  send(url, {
    embeds: [{
      color: RED,
      title: '🔨 Banimento',
      fields: [
        { name: 'Jogador', value: steamName, inline: true },
        { name: 'Admin', value: staffName, inline: true },
        { name: 'Motivo', value: reason },
        ...(evidence ? [{ name: 'Provas', value: evidence }] : []),
      ],
    }],
  });
}

function newApplication(url, { name, discord, steamId }) {
  send(url, {
    embeds: [{
      color: GOLD,
      title: '📋 Nova candidatura a moderador',
      description: `**${name}** (${discord})\nSteamID: ${steamId}\nVê no painel: /admin`,
    }],
  });
}

function wipeSummaryPost(url, s, siteUrl) {
  if (!s) return;
  const f = [];
  if (s.topKiller) f.push({ name: '⚔️ Top killer', value: `${s.topKiller.name} (${s.topKiller.n} kills)`, inline: true });
  if (s.topElo) f.push({ name: '🦅 Melhor Elo', value: `${s.topElo.name} (${s.topElo.rating})`, inline: true });
  if (s.longestKill) f.push({ name: '🎯 Kill mais longa', value: `${s.longestKill.name} — ${Math.round(s.longestKill.distance)} m`, inline: true });
  if (s.topHeadshots) f.push({ name: '🎖️ Mais headshots', value: `${s.topHeadshots.name} (${s.topHeadshots.n})`, inline: true });
  if (s.topFarmer) f.push({ name: '🌾 Maior farmer', value: `${s.topFarmer.name}`, inline: true });
  if (s.topHours) f.push({ name: '⏱️ Mais horas', value: `${s.topHours.name} (${Math.round(s.topHours.seconds / 3600)} h)`, inline: true });
  if (s.topDeaths) f.push({ name: '🧲 Saco de pancada', value: `${s.topDeaths.name} (${s.topDeaths.n} mortes)`, inline: true });
  send(url, {
    embeds: [{
      color: ORANGE,
      title: `🏁 Fim da ${s.wipe.label || 'wipe'} — os highlights`,
      description: `${s.totals?.kills ?? 0} kills no total. Resumo completo: ${siteUrl}/resumo?wipe=${s.wipe.id}`,
      fields: f,
    }],
  });
}

module.exports = { send, killfeed, banAnnounce, newApplication, wipeSummaryPost };
