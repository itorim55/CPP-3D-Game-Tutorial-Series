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
        (lines.length > 15 ? `\n… and ${lines.length - 15} more kills` : ''),
    }],
  });
}

function banAnnounce(url, { steamName, reason, staffName, evidence }) {
  send(url, {
    embeds: [{
      color: RED,
      title: '🔨 Ban',
      fields: [
        { name: 'Player', value: steamName, inline: true },
        { name: 'Admin', value: staffName, inline: true },
        { name: 'Reason', value: reason },
        ...(evidence ? [{ name: 'Evidence', value: evidence }] : []),
      ],
    }],
  });
}

function newApplication(url, { name, discord, steamId }) {
  send(url, {
    embeds: [{
      color: GOLD,
      title: '📋 New moderator application',
      description: `**${name}** (${discord})\nSteamID: ${steamId}\nReview in the panel: /admin`,
    }],
  });
}

function wipeSummaryPost(url, s, siteUrl) {
  if (!s) return;
  const f = [];
  if (s.topKiller) f.push({ name: '⚔️ Top killer', value: `${s.topKiller.name} (${s.topKiller.n} kills)`, inline: true });
  if (s.topElo) f.push({ name: '🦅 Best Elo', value: `${s.topElo.name} (${s.topElo.rating})`, inline: true });
  if (s.longestKill) f.push({ name: '🎯 Longest kill', value: `${s.longestKill.name} — ${Math.round(s.longestKill.distance)} m`, inline: true });
  if (s.topHeadshots) f.push({ name: '🎖️ Most headshots', value: `${s.topHeadshots.name} (${s.topHeadshots.n})`, inline: true });
  if (s.topFarmer) f.push({ name: '🌾 Top farmer', value: `${s.topFarmer.name}`, inline: true });
  if (s.topHours) f.push({ name: '⏱️ Most hours', value: `${s.topHours.name} (${Math.round(s.topHours.seconds / 3600)} h)`, inline: true });
  if (s.topDeaths) f.push({ name: '🧲 Punching bag', value: `${s.topDeaths.name} (${s.topDeaths.n} deaths)`, inline: true });
  send(url, {
    embeds: [{
      color: ORANGE,
      title: `🏁 End of ${s.wipe.label || 'the wipe'} — the highlights`,
      description: `${s.totals?.kills ?? 0} kills in total. Full recap: ${siteUrl}/resumo?wipe=${s.wipe.id}`,
      fields: f,
    }],
  });
}

module.exports = { send, killfeed, banAnnounce, newApplication, wipeSummaryPost };
