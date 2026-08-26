'use strict';
// ============================================================================
// Rustworthy — montagem automática do servidor Discord
//
// Uso (no PC, dentro da pasta do repositório):
//   node rust-server-website\deploy\discord-setup.js --token SEU_BOT_TOKEN --guild ID_DO_SERVIDOR
//
// Flags:
//   --dry-run        só mostra o plano, não cria nada
//   --write-config   escreve os webhooks + convite no server/config.json
//
// O que faz: cargos, categorias, canais (com permissões), mensagens de
// regras/boas-vindas/info, webhooks para o site, convite permanente.
// É idempotente: cargos/canais que já existam com o mesmo nome são reaproveitados.
// Zero dependências — só Node 18+.
// ============================================================================

const fs = require('node:fs');
const path = require('node:path');

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };

const TOKEN = opt('--token') || process.env.DISCORD_TOKEN;
const GUILD = opt('--guild') || process.env.DISCORD_GUILD;
const DRY = flag('--dry-run');
const WRITE = flag('--write-config');

if (!TOKEN || !GUILD) {
  console.log('Uso: node discord-setup.js --token <BOT_TOKEN> --guild <GUILD_ID> [--dry-run] [--write-config]');
  console.log('Guia completo: deploy/DISCORD.md');
  process.exit(1);
}

// ler a configuração do site para preencher IP/URL nas mensagens
let site = { serverName: 'Rustworthy | Full Vanilla | EU', serverIp: 'connect <ip>:28015', siteUrl: 'http://localhost:8080' };
const CONFIG_PATH = path.join(__dirname, '..', 'server', 'config.json');
try { site = { ...site, ...JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8')) }; } catch { /* config ainda não existe */ }

const API = 'https://discord.com/api/v10';
const HEADERS = { Authorization: `Bot ${TOKEN}`, 'Content-Type': 'application/json' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(method, pathname, body) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(API + pathname, { method, headers: HEADERS, body: body ? JSON.stringify(body) : undefined });
    if (res.status === 429) {
      const data = await res.json().catch(() => ({}));
      const wait = Math.ceil((data.retry_after || 1) * 1000) + 250;
      console.log(`   (rate limit — à espera ${wait}ms)`);
      await sleep(wait);
      continue;
    }
    if (!res.ok) throw new Error(`${method} ${pathname} → ${res.status}: ${await res.text()}`);
    await sleep(350); // suave com os rate limits
    return res.status === 204 ? null : res.json();
  }
  throw new Error(`rate limit persistente em ${pathname}`);
}

// permissões (bit flags)
const P = {
  VIEW: 1n << 10n, SEND: 1n << 11n, HISTORY: 1n << 16n,
  CONNECT: 1n << 20n, SPEAK: 1n << 21n, REACT: 1n << 6n,
  ATTACH: 1n << 15n, EMBED: 1n << 14n, THREADS: 1n << 34n,
};
const s = (...bits) => bits.reduce((a, b) => a | b, 0n).toString();

const ORANGE = 0xff5b26, EMBER = 0xffb020, GREEN = 0x4ade80, BLUE = 0x7ea6ff;

(async () => {
  console.log(`\n🛠️  Rustworthy Discord setup ${DRY ? '(DRY RUN — nada será criado)' : ''}\n`);

  const me = await call('GET', '/users/@me');
  console.log(`Bot: ${me.username}`);
  const guild = await call('GET', `/guilds/${GUILD}`);
  console.log(`Servidor: ${guild.name}\n`);
  const everyone = GUILD; // o cargo @everyone tem o id do guild

  // ---------- CARGOS ----------
  const existingRoles = await call('GET', `/guilds/${GUILD}/roles`);
  const wantRoles = [
    { name: '⚖️ Admin', color: ORANGE, hoist: true, mentionable: false },
    { name: '🛡️ Moderator', color: EMBER, hoist: true, mentionable: false },
    { name: '💎 Supporter', color: BLUE, hoist: true, mentionable: false },
    { name: '✅ Survivor', color: GREEN, hoist: false, mentionable: false },
  ];
  const roles = {};
  for (const r of wantRoles) {
    const found = existingRoles.find((x) => x.name === r.name);
    if (found) { roles[r.name] = found.id; console.log(`• cargo já existe: ${r.name}`); continue; }
    if (DRY) { console.log(`+ criaria cargo: ${r.name}`); roles[r.name] = 'DRY'; continue; }
    const created = await call('POST', `/guilds/${GUILD}/roles`, { name: r.name, color: r.color, hoist: r.hoist, mentionable: r.mentionable });
    roles[r.name] = created.id;
    console.log(`+ cargo criado: ${r.name}`);
  }
  const ADMIN = roles['⚖️ Admin'], MOD = roles['🛡️ Moderator'], SUP = roles['💎 Supporter'];

  // presets de permissões
  const readOnly = [
    { id: everyone, type: 0, deny: s(P.SEND, P.THREADS), allow: s(P.VIEW, P.HISTORY, P.REACT) },
    { id: ADMIN, type: 0, allow: s(P.SEND) },
    { id: MOD, type: 0, allow: s(P.SEND) },
  ];
  const staffOnly = [
    { id: everyone, type: 0, deny: s(P.VIEW) },
    { id: ADMIN, type: 0, allow: s(P.VIEW, P.SEND, P.HISTORY, P.ATTACH, P.EMBED) },
    { id: MOD, type: 0, allow: s(P.VIEW, P.SEND, P.HISTORY, P.ATTACH, P.EMBED) },
  ];
  const supporterOnly = [
    { id: everyone, type: 0, deny: s(P.VIEW) },
    { id: SUP, type: 0, allow: s(P.VIEW, P.SEND, P.HISTORY) },
    { id: ADMIN, type: 0, allow: s(P.VIEW, P.SEND, P.HISTORY) },
    { id: MOD, type: 0, allow: s(P.VIEW, P.SEND, P.HISTORY) },
  ];
  const staffVoice = [
    { id: everyone, type: 0, deny: s(P.VIEW, P.CONNECT) },
    { id: ADMIN, type: 0, allow: s(P.VIEW, P.CONNECT, P.SPEAK) },
    { id: MOD, type: 0, allow: s(P.VIEW, P.CONNECT, P.SPEAK) },
  ];

  // ---------- ESTRUTURA ----------
  // type: 4 categoria · 0 texto · 2 voz
  const plan = [
    { cat: '📌 INFO', channels: [
      { name: 'welcome', ro: true, topic: 'Start here — what Rustworthy is and where everything lives.' },
      { name: 'rules', ro: true, topic: 'The law of the land. Not knowing them is not an excuse.' },
      { name: 'announcements', ro: true, topic: 'Wipes, updates, events. Automated wipe recaps land here.', hook: 'announcements' },
      { name: 'server-info', ro: true, topic: 'IP, website, how to connect.' },
    ]},
    { cat: '🛰️ LIVE FROM THE SERVER', channels: [
      // (killfeed removido por decisão do dono — o site já tem o killfeed ao vivo)
      { name: 'ban-log', ro: true, topic: 'Every ban, public, with reason and admin. Automated.', hook: 'bans' },
    ]},
    { cat: '💬 COMMUNITY', channels: [
      { name: 'general', topic: 'Talk Rust. PT e EN bem-vindos.' },
      { name: 'clips-and-media', topic: 'Your best plays, fails and base tours.' },
      { name: 'looking-for-group', topic: 'Find a duo/trio/clan for the wipe. Also register on the site → Map Vote page.' },
      { name: 'suggestions', topic: 'Ideas for the server and the website.' },
      { name: 'supporter-lounge', sup: true, topic: '💎 Thank you for keeping the server alive.' },
    ]},
    { cat: '🎫 SUPPORT', channels: [
      { name: 'open-a-ticket', ro: true, topic: 'Cheater reports (with evidence), ban appeals, questions — open a ticket here.' },
    ]},
    { cat: '🔒 STAFF', channels: [
      { name: 'staff-chat', staff: true, topic: 'Internal. The website staff chat mirrors the same crew.' },
      { name: 'staff-alerts', staff: true, topic: 'Automated: kill spikes, report pressure, flagged first kills.', hook: 'staff' },
      { name: 'evidence-vault', staff: true, topic: 'Recordings and demos per case. Keep ≥30 days.' },
      { name: 'mod-logs', staff: true, topic: 'Who did what. Transparency inwards too.' },
    ]},
    { cat: '🔊 VOICE', channels: [
      { name: 'General VC', voice: true },
      { name: 'Squad 1', voice: true },
      { name: 'Squad 2', voice: true },
      { name: 'Staff VC', voice: true, staffV: true },
      { name: 'AFK', voice: true },
    ]},
  ];

  const existing = await call('GET', `/guilds/${GUILD}/channels`);
  const byName = (name, parent) => existing.find((c) => c.name === name && (parent === undefined || c.parent_id === parent));
  const hooks = {};
  const created = { welcome: null, rules: null, info: null };

  for (const block of plan) {
    let cat = existing.find((c) => c.type === 4 && c.name === block.cat);
    if (!cat) {
      if (DRY) { console.log(`+ criaria categoria: ${block.cat}`); cat = { id: 'DRY' }; }
      else { cat = await call('POST', `/guilds/${GUILD}/channels`, { name: block.cat, type: 4 }); console.log(`+ categoria: ${block.cat}`); }
    } else console.log(`• categoria já existe: ${block.cat}`);

    for (const ch of block.channels) {
      let overwrites;
      if (ch.staff) overwrites = staffOnly;
      else if (ch.staffV) overwrites = staffVoice;
      else if (ch.sup) overwrites = supporterOnly;
      else if (ch.ro) overwrites = readOnly;
      const found = byName(ch.voice ? ch.name : ch.name.toLowerCase().replace(/ /g, '-'), cat.id);
      let channel = found;
      if (found) { console.log(`  • canal já existe: #${ch.name}`); }
      else if (DRY) { console.log(`  + criaria: ${ch.voice ? '🔊' : '#'}${ch.name}`); channel = { id: 'DRY' }; }
      else {
        channel = await call('POST', `/guilds/${GUILD}/channels`, {
          name: ch.name, type: ch.voice ? 2 : 0, parent_id: cat.id,
          topic: ch.topic, permission_overwrites: overwrites,
        });
        console.log(`  + canal: ${ch.voice ? '🔊' : '#'}${ch.name}`);
      }
      if (ch.name === 'welcome') created.welcome = channel;
      if (ch.name === 'rules') created.rules = channel;
      if (ch.name === 'server-info') created.info = channel;

      // webhook para o site
      if (ch.hook && !DRY && channel.id !== 'DRY') {
        const existingHooks = await call('GET', `/channels/${channel.id}/webhooks`).catch(() => []);
        let hook = existingHooks.find((h) => h.name === 'Rustworthy Site');
        if (!hook) hook = await call('POST', `/channels/${channel.id}/webhooks`, { name: 'Rustworthy Site' });
        hooks[ch.hook] = `https://discord.com/api/webhooks/${hook.id}/${hook.token}`;
        console.log(`    ↳ webhook "${ch.hook}" pronto`);
      }
    }
  }

  // ---------- MENSAGENS ----------
  const post = async (channel, embeds) => {
    if (DRY || !channel || channel.id === 'DRY') return;
    const msgs = await call('GET', `/channels/${channel.id}/messages?limit=5`).catch(() => []);
    if (msgs.some((m) => m.author?.id === me.id)) { console.log(`  • mensagens já publicadas em #${channel.name}`); return; }
    await call('POST', `/channels/${channel.id}/messages`, { embeds });
    console.log(`  + mensagem publicada em #${channel.name}`);
  };

  const siteUrl = (site.siteUrl || '').replace(/\/$/, '');
  await post(created.welcome, [{
    color: ORANGE,
    title: '☢️ Welcome to RUSTWORTHY',
    description:
      `**Full Vanilla · EU · Active live moderation · Zero pay-to-win**\n\n` +
      `The server worth trusting: every kill tracked live, every ban public with evidence, ` +
      `staff that never plays the wipe they moderate.\n\n` +
      `📍 **Start here:**\n` +
      `• Read ${created.rules && created.rules.id !== 'DRY' ? `<#${created.rules.id}>` : '#rules'} — short, fair, enforced\n` +
      `• Grab the IP in ${created.info && created.info.id !== 'DRY' ? `<#${created.info.id}>` : '#server-info'}\n` +
      `• Live stats, leaderboards & your profile: ${siteUrl}\n` +
      `• Found a cheater? **F7 in-game** + open a ticket in 🎫`,
  }]);

  await post(created.rules, [{
    color: ORANGE,
    title: '📜 The Rules',
    description:
      `**1 · Cheating & exploits — zero tolerance.** Any cheat, script, macro or exploit = permanent ban, no warning. ` +
      `VAC/game ban under 180 days = no entry. Teaming with a cheater = ban by association.\n\n` +
      `**2 · Groups.** No group limit — full vanilla means bring whoever you want.\n\n` +
      `**3 · Toxicity.** Rust banter is fine. Hate speech, racism, real threats, doxxing are not. Stream sniping = ban.\n\n` +
      `**4 · Fair play.** Raiding and roof camping are Rust. Bug abuse = same as cheating. RMT = ban.\n\n` +
      `**5 · Appeals.** Every ban can be contested: ${siteUrl}/apelo — answered by a different admin within 48–72h.\n\n` +
      `Full version: ${siteUrl}/regras`,
  }]);

  await post(created.info, [{
    color: EMBER,
    title: '🛰️ Server Info',
    fields: [
      { name: 'Connect', value: '```' + (site.serverIp || 'connect <ip>:28015') + '```', inline: false },
      { name: 'Website · live stats', value: siteUrl || '(em breve)', inline: true },
      { name: 'Wipe', value: 'Force wipe Thursdays · countdown on the site', inline: true },
    ],
    footer: { text: 'Rustworthy — the server worth trusting' },
  }]);

  // ---------- CONVITE ----------
  let inviteUrl = null;
  if (!DRY && created.welcome && created.welcome.id !== 'DRY') {
    const inv = await call('POST', `/channels/${created.welcome.id}/invites`, { max_age: 0, max_uses: 0, unique: false });
    inviteUrl = `https://discord.gg/${inv.code}`;
    console.log(`\n🔗 Convite permanente: ${inviteUrl}`);
  }

  // ---------- CONFIG DO SITE ----------
  console.log('\n================ WEBHOOKS ================');
  for (const [k, v] of Object.entries(hooks)) console.log(`${k}: ${v}`);
  if (WRITE && !DRY) {
    try {
      const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
      cfg.discordWebhooks = { ...cfg.discordWebhooks, ...hooks };
      if (inviteUrl) cfg.discord = inviteUrl;
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
      console.log(`\n✅ server/config.json atualizado (webhooks + convite). Reinicia o node para ativar.`);
    } catch (e) { console.log(`\n⚠️ Não consegui escrever no config.json: ${e.message}`); }
  } else if (!DRY) {
    console.log('\nDica: corre outra vez com --write-config para colar isto no server/config.json automaticamente.');
  }

  console.log('\n✅ Estrutura completa. Passos manuais que a API não faz por ti:');
  console.log('   1. Server Settings → Enable COMMUNITY (para o canal de regras oficial e onboarding)');
  console.log('   2. Ícone e banner: usa as imagens que já tens (icon-rustworthy.png / banner-rustworthy.png)');
  console.log('   3. Tickets: adiciona o bot gratuito "Ticket Tool" (tickettool.xyz) e aponta o painel para #open-a-ticket');
  console.log('   4. Arrasta o cargo do bot para o TOPO da lista de cargos, acima de Admin/Moderator');
})().catch((e) => { console.error('\n❌ ' + e.message); process.exit(1); });
