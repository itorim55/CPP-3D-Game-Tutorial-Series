'use strict';
// Envio de mensagens para canais do Discord via webhooks (sem bot, sem deps).
// Configura os URLs em config.json -> "discordWebhooks".
// Criar um webhook: Discord > Editar canal > Integrações > Webhooks > Novo.

const https = require('node:https');

/** Envia um payload para um webhook do Discord. Fire-and-forget: nunca lança. */
const _warned = new Set(); // um aviso por código de erro, não spam por post

function send(webhookUrl, payload) {
  if (!webhookUrl) return;
  if (!/^https:\/\/(ptb\.|canary\.)?discord(app)?\.com\/api\/webhooks\//.test(webhookUrl)) {
    if (!_warned.has('badurl')) { _warned.add('badurl'); console.warn('[discord] webhook URL ignorado — tem de ser https://discord.com/api/webhooks/…'); }
    return;
  }
  try {
    const body = JSON.stringify(payload);
    const req = https.request(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      timeout: 8000,
    }, (res) => {
      res.resume();
      // um webhook apagado (404) ou rate-limited (429) falha em silêncio sem isto
      if (res.statusCode >= 300 && !_warned.has(res.statusCode)) {
        _warned.add(res.statusCode);
        console.warn(`[discord] webhook respondeu ${res.statusCode} — verifica os URLs em config.json (discordWebhooks)`);
      }
    });
    req.on('error', () => {});
    req.on('timeout', () => req.destroy());
    req.end(body);
  } catch { /* nunca deixar um webhook derrubar o site */ }
}

const ORANGE = 0xe0552e, RED = 0xd05c5c, GOLD = 0xd8a94e;
// nomes vindos do jogo nunca podem virar markdown/links mascarados no Discord
const md = (s) => String(s ?? '').replace(/([\\*_~`|\[\]()])/g, '\\$1');

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

function banAnnounce(url, { steamName, reason, staffName, evidence, steamId }, siteUrl = '') {
  const site = String(siteUrl || '').replace(/\/$/, '');
  send(url, {
    embeds: [{
      color: RED,
      author: { name: 'RUSTWORTHY · BAN HAMMER' },
      title: `⛔  ${md(steamName)} has been banned`,
      description:
        `**📋 Reason**\n${md(reason)}\n\n` +
        (evidence ? `**🎥 Evidence**\n${evidence}\n\n` : '') +
        `Another one gone. The island stays clean. 🧹`,
      fields: [
        { name: '🛡️ Banned by', value: md(staffName), inline: true },
        ...(site ? [{ name: '⚖️ Think it\'s a mistake?', value: `[Appeal here](${site}/apelo)`, inline: true }] : []),
        ...(site && steamId ? [{ name: '📊 Their stats', value: `[Profile](${site}/player?id=${steamId})`, inline: true }] : []),
      ],
      footer: { text: 'Zero tolerance · every ban has recorded evidence · full list on the website' },
      timestamp: new Date().toISOString(),
    }],
  });
}

function newApplication(url, { name, discord, steamId }) {
  send(url, {
    embeds: [{
      color: GOLD,
      title: '📋 New moderator application',
      description: `**${md(name)}** (${md(discord)})\nSteamID: ${steamId}\nReview in the panel: /admin`,
    }],
  });
}

function wipeSummaryPost(url, s, siteUrl) {
  if (!s) return;
  const f = [];
  if (s.topKiller) f.push({ name: '⚔️ Top killer', value: `${md(s.topKiller.name)} (${s.topKiller.n} kills)`, inline: true });
  if (s.topElo) f.push({ name: '🦅 Best Elo', value: `${md(s.topElo.name)} (${s.topElo.rating})`, inline: true });
  if (s.longestKill) f.push({ name: '🎯 Longest kill', value: `${md(s.longestKill.name)} — ${Math.round(s.longestKill.distance)} m`, inline: true });
  if (s.topHeadshots) f.push({ name: '🎖️ Most headshots', value: `${md(s.topHeadshots.name)} (${s.topHeadshots.n})`, inline: true });
  if (s.topFarmer) f.push({ name: '🌾 Top farmer', value: `${md(s.topFarmer.name)}`, inline: true });
  if (s.topHours) f.push({ name: '⏱️ Most hours', value: `${md(s.topHours.name)} (${Math.round(s.topHours.seconds / 3600)} h)`, inline: true });
  if (s.topDeaths) f.push({ name: '🧲 Punching bag', value: `${md(s.topDeaths.name)} (${s.topDeaths.n} deaths)`, inline: true });
  // prova de trabalho da moderação — os jogadores VEEM a limpeza a acontecer
  if (s.modStats) {
    const m = s.modStats;
    f.push({
      name: '🛡️ Moderation this wipe',
      value: `${m.bans} cheater ban(s) · ${m.reports} F7 report(s) processed · ` +
        `${m.appealsAnswered} appeal(s) answered · ${m.owClosed} overwatch verdict(s)`,
      inline: false,
    });
  }
  send(url, {
    embeds: [{
      color: ORANGE,
      title: `🏁 End of ${s.wipe.label || 'the wipe'} — the highlights`,
      description: `${s.totals?.kills ?? 0} kills in total. Full recap: ${siteUrl}/resumo?wipe=${s.wipe.id}`,
      fields: f,
    }],
  });
}

/** Novidade publicada no admin → embed no canal de announcements. */
function newsPost(url, { title, body, siteUrl = '' }) {
  const text = body.length > 1800 ? body.slice(0, 1800) + '…' : body;
  send(url, {
    embeds: [{
      author: { name: 'RUSTWORTHY · NEWS' },
      title: `📰 ${title}`,
      description: text,
      color: ORANGE,
      ...(siteUrl ? { url: `${siteUrl}/novidades` } : {}),
      footer: { text: 'Full changelog on the site → /novidades' },
      timestamp: new Date().toISOString(),
    }],
  });
}

module.exports = { send, killfeed, banAnnounce, newApplication, wipeSummaryPost, newsPost };
