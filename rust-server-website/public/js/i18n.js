'use strict';
// Sistema de idiomas. Base: inglês (escrito diretamente no HTML/JS).
// Outros idiomas: dicionários neste ficheiro, aplicados no arranque da página.
//
// Como funciona:
//  - Elementos com data-i18n="chave" têm o texto EN no HTML; se o idioma
//    ativo não for EN, o innerHTML é substituído pela tradução.
//  - data-i18n-ph traduz o placeholder; data-i18n-title traduz o title.
//  - Strings geradas por JS usam t('chave', ...args) — EN vem de EN_JS.
//  - Para adicionar um idioma: copia o bloco "pt", traduz, e acrescenta o
//    código a LANGS. Aparece automaticamente no seletor da navegação.

const LANGS = { en: 'EN', pt: 'PT' };
let LANG = 'en';
try { LANG = localStorage.getItem('lang') || 'en'; } catch {}
if (!LANGS[LANG]) LANG = 'en';
document.documentElement.lang = LANG;

function setLang(l) {
  if (!LANGS[l]) return;
  try { localStorage.setItem('lang', l); } catch {}
  location.reload();
}

// ---------- EN para strings geradas por JS ----------

const EN_JS = {
  // comuns
  'nav.home': 'Home', 'nav.stats': 'Stats', 'nav.store': 'Store', 'nav.map': 'Map Vote',
  'nav.overwatch': 'Overwatch', 'nav.rules': 'Rules', 'nav.staff': 'Staff', 'nav.apply': 'Apply',
  'nav.trust': 'Trust',
  'sub.leaderboards': 'Leaderboards', 'sub.teams': 'Teams & Raids', 'sub.heatmap': 'Heatmap',
  'sub.recap': 'Wipe Recap', 'sub.ach': 'Achievements', 'sub.vs': '1v1', 'sub.mine': '★ My stats',
  'sub.staffBans': 'Staff & Bans', 'sub.appeal': 'Appeal',
  'nav.login': 'Sign in with Steam', 'nav.account': 'My account',
  'footer.rules': 'Rules', 'footer.staff': 'Staff & Transparency', 'footer.apply': 'Join the team',
  'footer.news': 'News', 'footer.appeal': 'Appeal a ban',
  'footer.disclaimer': 'This server is not affiliated with Facepunch Studios or Valve.',
  'time.now': 'just now', 'time.min': '$1 min ago', 'time.hour': '$1 h ago', 'time.day': '$1 d ago',
  'chart.empty': 'Not enough history yet.', 'chart.players': 'players',
  'chart.aria': 'Players online over the last 48 hours',
  'countdown.wipe': 'WIPE!',
  'loading': 'loading…',
  'seen': 'seen $1',
  'error.generic': 'Error $1',

  // status (valores da base de dados -> etiquetas)
  'status.pending': 'pending', 'status.reviewing': 'reviewing', 'status.interview': 'interview',
  'status.approved': 'approved', 'status.rejected': 'rejected', 'status.accepted': 'accepted',
  'status.sent': 'sent', 'status.delivered': 'delivered', 'status.failed': 'failed',
  'status.open': 'open', 'status.closed': 'closed',
  'status.cheater': 'cheater', 'status.innocent': 'innocent', 'status.inconclusive': 'inconclusive',
  'mod.priority': 'PRIORITY',
  'conta.title': 'My account', 'modpage.title': 'Mod Room',

  // home
  'home.copied': 'copied! paste in F1 console', 'home.copy': 'copy',
  'home.noData': 'No data yet.', 'home.noKills': 'No kills recorded yet.',

  // ticker (fio de notícias no topo)
  'ticker.online': 'survivors online',
  'ticker.killsWipe': '$1 kills this wipe',
  'ticker.wipeIn': 'wipe in $1',
  'ticker.topKiller': 'wipe leader: $1 · $2 kills',

  // overwatch / mapa (JS)
  'ow.clipGone': 'Clip removed after the verdict (frees server space).',
  'map.voteFail': 'Your vote was not registered: $1',

  // conquistas (JS)
  'footer.ach': 'Achievements',
  'player.allBadges': 'all achievements →',
  'player.wrapped': 'Wipe Wrapped',
  'player.progress': 'Progress this wipe',
  'player.progressHint': 'Cumulative K/D, day by day — the story of your wipe.',
  'stats.mKills': 'Kills', 'stats.mDeaths': 'Deaths',
  // chat + sala de mods (JS)
  'chat.title': 'Community chat',
  'chat.global': 'GLOBAL', 'chat.staff': 'STAFF',
  'chat.ph': 'say something…', 'chat.send': 'Send',
  'chat.login': '🔒 Sign in with Steam to chat.',
  'chat.empty': 'No messages yet — say hi!',
  'mod.title': '🛡️ Mod Room',
  'mod.sub': 'Staff only. The watchlist ranks who deserves spectate first; priority reports need eyes now.',
  'mod.denied': 'Staff only. If you should have access, ask the owner to add your SteamID in the admin panel (Team tab).',
  'mod.watchlist': 'Watchlist', 'mod.reports': 'Reports', 'mod.chatTitle': 'Staff chat',
  'mod.fullAdmin': 'full admin →',
  'mod.watchEmpty': 'Nobody trips the radar right now. 🕊️',
  'mod.reportsEmpty': 'No reports. 🎉',
  'mod.profile': 'profile',

  // squad up / precisão / próximo mapa (JS)
  'su.counter': '$1 team(s) · $2 player(s) confirmed for next wipe',
  'su.none': 'Nobody registered yet — be the first crew in!',
  'su.login': 'Sign in with Steam to register your team.',
  'su.namePh': 'team / clan name…',
  'su.solo': 'solo',
  'su.register': 'Register team', 'su.update': 'Update', 'su.remove': 'remove',
  'stats.mPrecision': 'Precision 🎯',
  'stats.thAccuracy': 'Accuracy', 'stats.thShots': 'Shots', 'stats.thAvgDist': 'Avg distance',
  'stats.precisionEmpty': 'Not enough shot data yet (needs 300+ tracked shots).',
  'player.aimTile': 'aim accuracy ($1 shots)',
  'home.nextMap': 'next map',
  'store.donBtn': 'Donate — keep the server alive',
  'store.donSoon': 'Donations open soon — meanwhile, playing and reporting cheaters is the best support.',
  'staff.rBans': 'cheaters banned',
  'staff.rReports': 'F7 reports processed',
  'staff.rAppeals': 'appeals answered',
  'staff.rOw': 'overwatch verdicts',
  'stats.youRank': 'YOU · #$1 — jump to your row',
  'home.combatHeat': 'combat intensity — kills in the last 10 min',
  'home.raidLive': 'BASE UNDER RAID AT',
  'home.raidWalls': 'structures down',
  'player.onlineNow': 'ONLINE NOW',
  'wr.topPct': 'TOP $1%',
  'tv.headshot': 'HEADSHOT', 'tv.longshot': 'LONGSHOT',
  'map.leading': 'LEADING',
  'heat.hotzone': 'HOT ZONE', 'heat.cellDeaths': 'deaths',
  'sum.myWrapped': 'My Wipe Wrapped',

  // spotlight do hero (JS)
  'spot.leader': 'wipe leader',
  'spot.longest': 'longest kill',
  'spot.onFire': 'on fire right now',

  // wipe wrapped (JS)
  'wr.eyebrow': 'Wipe Wrapped — $1 · $2',
  'wr.rank': '#$1 of $2 killers this wipe',
  'wr.peaceful': 'A peaceful wipe (so far)',
  'wr.share': 'copy share link', 'wr.shared': 'link copied!',
  'wr.kills': 'sent to the beach', 'wr.killsSub': 'kills this wipe',
  'wr.deaths': 'trips to respawn', 'wr.deathsSub': 'deaths this wipe',
  'wr.hsSub': '$1% headshot rate',
  'wr.longest': 'longest kill', 'wr.withWeapon': 'with $1',
  'wr.hours': 'hours survived', 'wr.farm': 'resources farmed',
  'wr.structures': 'structures razed', 'wr.badges': 'badges unlocked',
  'wr.victim': 'favourite victim', 'wr.nemesis': 'your nemesis',
  'wr.footer': 'Generated live from server stats',
  'wr.fullProfile': 'full profile →',
  'wr.noId': 'This link is missing the player id.',

  'ach.holders': '$1 unlocked',
  'ach.best': 'record: $1 ($2)',
  'ach.none': 'Nobody yet — be the first!',

  // stats
  'stats.noPeriod': 'No data for this period.', 'stats.noPlayers': 'No players found.',
  'stats.eloEmpty': 'Nobody with 5+ fights this wipe yet.', 'stats.archive': 'Archive: $1 ($2)', 'stats.wipeWord': 'Wipe',
  'stats.team': 'Team $1', 'stats.noTeams': 'No teams recorded this wipe yet (the plugin reports native Rust teams every 5 min).',
  'stats.noRaids': 'No raids recorded this wipe. The bases thank you. 🏠',
  'stats.noKills': 'No kills recorded.',
  'stats.kfLink': '\u2620 Live killfeed is on the home page \u2192',
  'home.newsTitle': '\ud83d\udcf0 Latest news', 'home.newsAll': 'all news \u2192',
  'staff.bans30': 'bans in the last 30 days', 'staff.bansTotal': 'bans in total',
  'player.reportBox': '\ud83d\udea9 Suspect this player? Report in-game with <b>F7</b> or on Discord \u2014 confirmed cheaters end up on the <a href="/staff#bans">public ban list</a>.',
  'player.moreActivity': 'show $1 older \u2192',
  'nf.title': 'Not found', 'nf.sub': 'sector not found on this map',
  'nf.desc': 'This page got wiped \u2014 or the link was wrong from the start.', 'nf.home': '\u2190 Back to base',
  'stats.evTotal': '· $1 this wipe', 'stats.evEmpty': 'Nobody yet. $1 on the loose!',
  'stats.evHeli': 'Heli Hunters', 'stats.evBradley': 'Tank Busters', 'stats.evCrate': 'Fast Hands',

  // player
  'player.notSeen': "We haven't seen this player yet.",
  'player.backToStats': '← back to stats',
  'player.killed': '⚔️ killed', 'player.diedTo': '💀 died to',
  'player.kills': 'kills', 'player.deaths': 'deaths', 'player.deathsPvp': 'deaths (PVP)',
  'player.hsRate': 'headshot rate', 'player.longest': 'longest kill',
  'player.streakTile': 'current streak (no deaths)', 'player.structuresTile': 'structures destroyed',
  'player.playtimeTotal': 'playtime (total)', 'player.headshots': 'headshots',
  'player.compare': '⚔️ Compare with another player', 'player.team': '👥 Team:',
  'player.favWeapons': 'Favorite weapons (wipe)', 'player.noKillsWipe': 'No kills this wipe.',
  'player.gather': 'Resources gathered (wipe)', 'player.noFarm': 'No farm data.',
  'player.victims': '🎯 Frequent victims', 'player.nemesis': '💀 Nemesis (kills you most)',
  'player.activity': 'Recent activity', 'player.noActivity': 'No recorded activity.',
  'player.killsUnit': '$1 kills',
  'res.wood': '🪵 Wood', 'res.stone': '🪨 Stone', 'res.metal': '⛏️ Metal',
  'res.sulfur': '💥 Sulfur', 'res.hqm': '✨ HQM',

  // loja
  'store.rate': '$1 gems per hour played', 'store.enterToSee': 'sign in to see 💎',
  'store.redeem': 'Redeem', 'store.notEnough': 'Not enough gems', 'store.loginToRedeem': 'Sign in to redeem',
  'store.redeeming': 'redeeming…', 'store.redeemedAuto': '✅ Redeemed — delivery in ~1 min',
  'store.redeemedInstant': '✅ Redeemed — active on your profile now',
  'store.redeemedManual': '✅ Redeemed — manual delivery within 24 h', 'store.empty': 'Store is empty.',

  // mapa
  'map.closed': '🔒 Voting is closed right now. It usually opens 36 h before wipe — watch Discord.',
  'map.login': '🔑 <a href="/auth/steam">Sign in with Steam</a> to vote.',
  'map.open': '🗳️ Voting is open! Your vote is worth <b>×$1</b>',
  'map.thanks': '(thanks for playing with us!)', 'map.playMore': '(play 10 h+ in a wipe to earn more)',
  'map.changed': 'You already voted — you can change your vote.',
  'map.seed': 'seed $1', 'map.viewMap': 'view on RustMaps ↗',
  'map.points': '<b>$1</b> points · $2 voter(s)', 'map.yourVote': '✓ Your vote', 'map.voteThis': 'Vote for this',
  'map.noOptions': 'No candidate maps for this round yet.',

  // overwatch
  'ow.loginHint': '🔑 <a href="/auth/steam">Sign in with Steam</a> to vote on open cases.',
  'ow.watchClip': '🎬 Watch the clip ↗', 'ow.noCases': 'No cases published — good sign. 🎉',
  'ow.voteCheat': '🚨 Cheater', 'ow.voteUnsure': '🤔 Not sure', 'ow.voteClean': '✅ Clean',
  'ow.verdict.cheater': '🚨 CONFIRMED CHEATER — banned', 'ow.verdict.innocent': '✅ Innocent',
  'ow.verdict.inconclusive': '🤷 Inconclusive',
  'ow.community': 'Community: <b style="color:var(--bad)">$1% cheater</b> · $2% unsure · <b style="color:var(--good)">$3% clean</b> <span style="color:var(--ink-muted)">($4 votes)</span>',
  'ow.noVotes': 'No community votes yet.',

  // conta / apelo
  'account.survivor': 'Survivor',
  'account.noRedemptions': "You haven't redeemed anything yet. <a href=\"/loja\">Check the store →</a>",
  'account.noAppeals': 'No appeals. Good. 😄',
  'account.title': 'SIGN IN TO YOUR ACCOUNT',
  'account.loginDesc': 'Link your Steam account to see your gems, redeem rewards, vote on the next map and on Overwatch, and appeal bans. We only receive your SteamID — never your password.',
  'account.loginBtn': '🎮 Sign in with Steam',
  'account.loginFailed': '⚠️ Steam sign-in failed. Try again.',
  'account.notSeenYet': "We haven't seen you on the server yet — join the game and your stats start counting.",
  'account.logout': 'sign out',
  'account.gemsAvailable': '💎 gems available', 'account.gemsTotal': 'gems earned in total',
  'account.playtime': 'playtime', 'account.voteWeight': 'your map vote weight',
  'account.goStore': '💎 Go to the store', 'account.goMap': '🗳️ Vote on the map',
  'account.myProfile': '📊 My public profile', 'account.goAppeal': '⚖️ Appeal a ban',
  'account.myRedemptions': 'My redemptions', 'account.myAppeals': 'My appeals',
  'account.staffReply': 'Staff reply:',
  'appeal.discordLabel': 'Your Discord (so we can contact you)',
  'appeal.textLabel': 'Your appeal *',
  'appeal.textPh': 'Tell your side: what happened, why you think the ban was unfair, and any context staff should know.',
  'store.thWhen': 'When', 'store.thItem': 'Item', 'store.thCost': 'Cost', 'store.thStatus': 'Status',
  'stats.thPlayer': 'Player', 'stats.thKills': 'Kills', 'stats.thDeaths': 'Deaths',
  'stats.thHeadshots': 'Headshots', 'stats.thLongest': 'Longest kill', 'stats.thHours': 'Hours',
  'stats.thTier': 'Tier', 'stats.thRating': 'Rating', 'stats.thFights': 'Fights',
  'stats.eloWindowNote': 'Elo is seasonal — always the current wipe.',
  'appeal.open': '⏳ You already have an appeal <b>$1</b> ($2). Track it in <a href="/conta">your account</a>.',
  'appeal.received': '<b>✅ Appeal received.</b> Answer within 48-72 h — track it in <a href="/conta">your account</a>.',
  'appeal.login': '🔑 <a href="/auth/steam">Sign in with Steam</a> to appeal — so we know the appeal comes from the banned account.',
  'appeal.sending': 'sending…', 'appeal.submit': 'Submit appeal',

  // candidatura / novidades / staff
  'apply.sending': 'sending…', 'apply.submit': 'Submit application',
  'apply.received': '<b>✅ Application received!</b><br>Thanks for your interest. The team will review it and reply on Discord within 3-7 days. Meanwhile, stay active on the server — activity counts.',
  'news.empty': 'No posts yet.',
  'staff.noTeam': 'Team to be announced.', 'staff.since': 'on the team since $1',
  'staff.noBans': 'No bans recorded. 🎉', 'staff.view': '🎬 view',

  // vs
  'vs.same': 'Pick two different players. 😄', 'vs.nothing': 'Nothing found.',
  'vs.h2h': 'Head to head (all wipes)', 'vs.never': 'They never crossed paths. Someone fix that.',
  'vs.dominates': '<b style="color:var(--accent)">$1</b> owns this rivalry.', 'vs.tie': 'Perfect tie. 🍿',
  'vs.thisWipe': 'This wipe', 'vs.allTime': 'All time', 'vs.recent': 'Recent encounters',
  'vs.kills': 'Kills', 'vs.deaths': 'Deaths', 'vs.headshots': 'Headshots', 'vs.hsRate': 'HS rate',
  'vs.longest': 'Longest kill', 'vs.streak': 'Current streak', 'vs.structures': 'Structures destroyed',
  'vs.hours': 'Hours',

  // resumo / heatmap
  'sum.topKiller': 'Top killer', 'sum.bestElo': 'Best Elo', 'sum.longest': 'Longest kill',
  'sum.headshots': 'Most headshots', 'sum.farmer': 'Top farmer', 'sum.hours': 'Most hours',
  'sum.punchbag': 'Punching bag', 'sum.heli': 'Heli Hunter',
  'sum.kills': '$1 kills', 'sum.deaths': '$1 deaths (a hero)', 'sum.resources': '$1 resources',
  'sum.hoursVal': '$1 hours', 'sum.helis': '$1 Patrol Helis downed',
  'sum.meta': '$1 · started $2', 'sum.metaKills': '$1 kills by $2 players',
  'sum.current': 'current', 'sum.noData': 'Not enough data in this wipe yet.',
  'heat.deaths': '$1 PVP deaths with recorded position · map $2',
  'heat.tip': ' · tip: set "mapImage" (a map image URL, e.g. from RustMaps) in server/config.json to overlay the real map',
};

// ---------- traduções ----------

const I18N = {
  pt: {
    // navegação e rodapé
    'nav.home': 'Início', 'nav.stats': 'Stats', 'nav.store': 'Loja', 'nav.map': 'Mapa',
    'nav.overwatch': 'Overwatch', 'nav.rules': 'Regras', 'nav.staff': 'Staff', 'nav.apply': 'Candidaturas',
    'nav.trust': 'Confiança',
    'sub.leaderboards': 'Classificações', 'sub.teams': 'Equipas & Raids', 'sub.heatmap': 'Heatmap',
    'sub.recap': 'Resumo do wipe', 'sub.ach': 'Conquistas', 'sub.vs': '1v1', 'sub.mine': '★ As minhas stats',
    'sub.staffBans': 'Staff & Bans', 'sub.appeal': 'Apelo',
    'nav.login': 'Entrar com Steam', 'nav.account': 'A minha conta',
    'footer.rules': 'Regras', 'footer.staff': 'Staff & Transparência', 'footer.apply': 'Junta-te à equipa',
    'footer.news': 'Novidades', 'footer.appeal': 'Apelar um ban',
    'footer.disclaimer': 'Este servidor não é afiliado à Facepunch Studios nem à Valve.',
    'time.now': 'agora mesmo', 'time.min': 'há $1 min', 'time.hour': 'há $1 h', 'time.day': 'há $1 d',
    'chart.empty': 'Ainda sem histórico suficiente.', 'chart.players': 'jogadores',
    'chart.aria': 'Jogadores online nas últimas 48 horas',
    'countdown.wipe': 'WIPE!',
    'loading': 'a carregar…',
    'seen': 'visto $1',
    'error.generic': 'Erro $1',

    'status.pending': 'pendente', 'status.reviewing': 'em análise', 'status.interview': 'entrevista',
    'status.approved': 'aprovado', 'status.rejected': 'recusado', 'status.accepted': 'aceite',
    'status.sent': 'enviado', 'status.delivered': 'entregue', 'status.failed': 'falhou',
    'status.open': 'aberto', 'status.closed': 'fechado',
    'status.cheater': 'cheater confirmado', 'status.innocent': 'inocente', 'status.inconclusive': 'inconclusivo',
    'mod.priority': 'PRIORIDADE',
    'conta.title': 'A minha conta', 'modpage.title': 'Sala de Mods',

    // home (JS)
    'home.copied': 'copiado! cola na consola F1', 'home.copy': 'copiar',
    'home.noData': 'Sem dados ainda.', 'home.noKills': 'Sem kills registadas ainda.',

    'ticker.online': 'sobreviventes online',
    'ticker.killsWipe': '$1 kills nesta wipe',
    'ticker.wipeIn': 'wipe em $1',
    'ticker.topKiller': 'líder da wipe: $1 · $2 kills',

    'ow.clipGone': 'Clip removido após o veredicto (liberta espaço no servidor).',
    'map.voteFail': 'O teu voto não ficou registado: $1',

    'footer.ach': 'Conquistas',
    'player.allBadges': 'todas as conquistas →',
    'player.wrapped': 'Wipe Wrapped',
    'player.progress': 'Progresso nesta wipe',
    'player.progressHint': 'K/D acumulado, dia a dia — a história da tua wipe.',
    'sum.myWrapped': 'O meu Wipe Wrapped',
    'chat.title': 'Chat da comunidade',
    'chat.global': 'GLOBAL', 'chat.staff': 'STAFF',
    'chat.ph': 'diz qualquer coisa…', 'chat.send': 'Enviar',
    'chat.login': '🔒 Entra com a Steam para falar no chat.',
    'chat.empty': 'Ainda sem mensagens — diz olá!',
    'mod.title': '🛡️ Sala de Mods',
    'mod.sub': 'Só staff. A watchlist ordena quem merece spectate primeiro; reports com prioridade precisam de olhos já.',
    'mod.denied': 'Só staff. Se devias ter acesso, pede ao dono para adicionar o teu SteamID no painel admin (separador Team).',
    'mod.watchlist': 'Watchlist', 'mod.reports': 'Reports', 'mod.chatTitle': 'Chat da staff',
    'mod.fullAdmin': 'admin completo →',
    'mod.watchEmpty': 'Ninguém a disparar o radar agora. 🕊️',
    'mod.reportsEmpty': 'Sem reports. 🎉',
    'mod.profile': 'perfil',
    'su.title': 'Junta a equipa para a wipe',
    'su.sub': 'regista o teu grupo — mostra a todos que a wipe vai estar cheia',
    'su.counter': '$1 equipa(s) · $2 jogador(es) confirmados para a próxima wipe',
    'su.none': 'Ainda ninguém registado — sê a primeira equipa!',
    'su.login': 'Entra com a Steam para registar a tua equipa.',
    'su.namePh': 'nome da equipa / clã…',
    'su.solo': 'solo',
    'su.register': 'Registar equipa', 'su.update': 'Atualizar', 'su.remove': 'remover',
    'stats.mPrecision': 'Precisão 🎯',
    'stats.thAccuracy': 'Precisão', 'stats.thShots': 'Tiros', 'stats.thAvgDist': 'Distância média',
    'stats.precisionEmpty': 'Ainda não há dados de tiro suficientes (mínimo 300 tiros registados).',
    'player.aimTile': 'precisão de mira ($1 tiros)',
    'home.nextMap': 'próximo mapa',
    'store.donTitle': 'Apoia o servidor',
    'store.donDesc': 'O Rustworthy vive de donativos — pagam o servidor de jogo e mais nada. Doar <b>nunca</b> dá vantagens in-game: recebes o badge 💎 Supporter no perfil, cargo no Discord e a nossa gratidão genuína. O jogo continua igual para todos; é esse o propósito deste servidor.',
    'store.donBtn': 'Doar — manter o servidor vivo',
    'store.donSoon': 'Donativos abrem em breve — entretanto, jogar e reportar cheaters é o melhor apoio.',
    'staff.receipts': 'Os recibos',
    'staff.receiptsSub': 'nesta wipe — prova de que a moderação acontece mesmo',
    'staff.rBans': 'cheaters banidos',
    'staff.rReports': 'reports F7 processados',
    'staff.rAppeals': 'apelos respondidos',
    'staff.rOw': 'veredictos overwatch',
    'stats.youRank': 'TU · #$1 — saltar para a tua linha',
    'home.combatHeat': 'intensidade de combate — kills nos últimos 10 min',
    'home.raidLive': 'BASE A SER RAIDADA EM',
    'home.raidWalls': 'estruturas destruídas',
    'player.onlineNow': 'ONLINE AGORA',
    'wr.topPct': 'TOP $1%',
    'tv.headshot': 'HEADSHOT', 'tv.longshot': 'TIRO LONGO',
    'map.leading': 'A LIDERAR',
    'heat.hotzone': 'ZONA QUENTE', 'heat.cellDeaths': 'mortes',
    'spot.leader': 'líder da wipe',
    'spot.longest': 'kill mais longa',
    'spot.onFire': 'em fogo agora',
    'wr.title': 'Wipe Wrapped',
    'wr.eyebrow': 'Wipe Wrapped — $1 · $2',
    'wr.rank': '#$1 de $2 killers nesta wipe',
    'wr.peaceful': 'Uma wipe pacífica (para já)',
    'wr.share': 'copiar link', 'wr.shared': 'link copiado!',
    'wr.kills': 'mandados para a praia', 'wr.killsSub': 'kills nesta wipe',
    'wr.deaths': 'viagens ao respawn', 'wr.deathsSub': 'mortes nesta wipe',
    'wr.hsSub': '$1% de headshots',
    'wr.longest': 'kill mais longa', 'wr.withWeapon': 'com $1',
    'wr.hours': 'horas sobrevividas', 'wr.farm': 'recursos farmados',
    'wr.structures': 'estruturas arrasadas', 'wr.badges': 'conquistas',
    'wr.victim': 'vítima favorita', 'wr.nemesis': 'o teu némesis',
    'wr.footer': 'Gerado ao vivo a partir das stats do servidor',
    'wr.fullProfile': 'perfil completo →',
    'wr.noId': 'Falta o id do jogador neste link.',
    'tv.title': 'Modo TV',

    'ach.title': '🏅 Conquistas',
    'ach.desc': 'Todos os badges que podes desbloquear no servidor e quem os tem. Os badges de wipe fazem reset com o mapa; os restantes são para sempre. Aparecem automaticamente no teu perfil público.',
    'ach.holders': '$1 desbloqueado(s)',
    'ach.best': 'recorde: $1 ($2)',
    'ach.none': 'Ainda ninguém — sê o primeiro!',
    // home (HTML)
    'home.tagline': 'Moderação ativa ao vivo · bans públicos · zero pay-to-win.',
    'home.playersOnline': 'jogadores online', 'home.untilWipe': 'até à próxima wipe',
    'home.killsWipe': 'kills esta wipe', 'home.wipeLeader': 'líder da wipe',
    'home.population': 'População', 'home.last48h': 'últimas 48 horas',
    'home.topWipe': 'Top da wipe', 'home.viewAll': 'ver tudo →',
    'home.liveKillfeed': 'Killfeed ao vivo', 'home.onFire': '🔥 Em fogo agora',
    'home.whyPlay': 'Porquê jogar aqui?',
    'home.antiCheat': '🛡️ Anti-cheat a sério',
    'home.antiCheatDesc': 'Cheaters apanhados em direto, provas gravadas, <a href="/staff">bans públicos</a>. Aqui a moderação é o produto.',
    'home.liveStats': '📊 Estatísticas ao vivo',
    'home.liveStatsDesc': 'Todas as kills, mortes, headshots e recursos registados em tempo real. Procura o teu nome e acompanha a tua evolução wipe a wipe.',
    'home.noP2w': '⚖️ Zero pay-to-win',
    'home.noP2wDesc': 'Nada de kits pagos nem loot à venda. Os apoios dão apenas cosméticos e cor no chat — <a href="/loja">vê a loja</a>: o jogo é igual para todos.',

    // stats (JS)
    'stats.noPeriod': 'Sem dados para este período.', 'stats.noPlayers': 'Nenhum jogador encontrado.',
    'stats.eloEmpty': 'Ainda ninguém com 5+ combates nesta wipe.', 'stats.archive': 'Arquivo: $1 ($2)', 'stats.wipeWord': 'Wipe',
    'stats.team': 'Equipa $1', 'stats.noTeams': 'Ainda sem equipas registadas nesta wipe (o plugin envia as equipas nativas a cada 5 min).',
    'stats.noRaids': 'Ainda sem raids registados nesta wipe. As bases agradecem. 🏠',
    'stats.noKills': 'Sem kills registadas.',
    'stats.kfLink': '\u2620 O killfeed ao vivo est\u00e1 na p\u00e1gina inicial \u2192',
    'home.newsTitle': '\ud83d\udcf0 \u00daltimas novidades', 'home.newsAll': 'todas \u2192',
    'player.reportBox': '\ud83d\udea9 Suspeitas deste jogador? Reporta no jogo com <b>F7</b> ou no Discord \u2014 cheaters confirmados acabam na <a href="/staff#bans">lista p\u00fablica de bans</a>.',
    'player.moreActivity': 'mostrar mais $1 \u2192',
    'nf.title': 'N\u00e3o encontrada', 'nf.sub': 'setor n\u00e3o encontrado neste mapa',
    'nf.desc': 'Esta p\u00e1gina levou wipe \u2014 ou o link j\u00e1 vinha errado.', 'nf.home': '\u2190 Voltar \u00e0 base',
    'stats.evTotal': '· $1 esta wipe', 'stats.evEmpty': 'Ainda ninguém. $1 à solta!',
    'stats.evHeli': 'Caça-Helis', 'stats.evBradley': 'Anti-Tanque', 'stats.evCrate': 'Mãos Rápidas',
    // stats (HTML)
    'stats.title': 'Leaderboards',
    'stats.mKills': 'Kills', 'stats.mDeaths': 'Mortes', 'stats.mKd': 'K/D', 'stats.mElo': 'Elo 🦅',
    'stats.mHeadshots': 'Headshots', 'stats.mLongest': 'Kill + longa', 'stats.mHours': 'Horas jogadas',
    'stats.wLastHour': '⏱️ Última hora', 'stats.wToday': 'Hoje (24 h)', 'stats.w7d': 'Últimos 7 dias',
    'stats.w30d': 'Últimos 30 dias', 'stats.wWipe': 'Esta wipe', 'stats.wAll': 'Sempre (todas as wipes)',
    'stats.hint': '💡 As janelas curtas (hora/dia) também servem para a comunidade detetar picos suspeitos — um jogador com kills anormais na última hora merece um F7. O Elo é sazonal (reset a cada wipe, mínimo 5 combates).',
    'stats.searchPh': '🔍 procurar jogador…',
    'stats.thPlayer': 'Jogador', 'stats.thKills': 'Kills', 'stats.thDeaths': 'Mortes',
    'stats.thHeadshots': 'Headshots', 'stats.thLongest': 'Kill + longa', 'stats.thHours': 'Horas',
    'stats.thTier': 'Tier', 'stats.thRating': 'Rating', 'stats.thFights': 'Combates',
    'stats.eloWindowNote': 'O Elo é sazonal — sempre a wipe atual.',
    'stats.teamsTitle': 'Top equipas', 'stats.teamsSub': 'esta wipe · equipas nativas do Rust',
    'stats.thTeam': 'Equipa', 'stats.thMembers': 'Membros',
    'stats.eventsTitle': 'Eventos do mapa', 'stats.eventsSub': 'esta wipe — quem manda nos monumentos',
    'stats.raidsTitle': 'Maiores raids da wipe', 'stats.raidsSub': 'agrupados por zona e hora',
    'stats.thWhen': 'Quando', 'stats.thZone': 'Zona', 'stats.thStructures': 'Estruturas',
    'stats.thRaiders': 'Raiders', 'stats.thWeapons': 'Armas',

    // player
    'player.notSeen': 'Ainda não vimos este jogador.',
    'player.backToStats': '← voltar às estatísticas',
    'player.killed': '⚔️ matou', 'player.diedTo': '💀 morreu para',
    'player.kills': 'kills', 'player.deaths': 'mortes', 'player.deathsPvp': 'mortes (PVP)',
    'player.hsRate': 'taxa de headshot', 'player.longest': 'kill mais longa',
    'player.streakTile': 'streak atual (sem morrer)', 'player.structuresTile': 'estruturas destruídas',
    'player.playtimeTotal': 'tempo de jogo (total)', 'player.headshots': 'headshots',
    'player.compare': '⚔️ Comparar com outro jogador', 'player.team': '👥 Equipa:',
    'player.favWeapons': 'Armas favoritas (wipe)', 'player.noKillsWipe': 'Sem kills nesta wipe.',
    'player.gather': 'Recursos recolhidos (wipe)', 'player.noFarm': 'Sem dados de farm.',
    'player.victims': '🎯 Vítimas frequentes', 'player.nemesis': '💀 Nemesis (quem mais te mata)',
    'player.activity': 'Atividade recente', 'player.noActivity': 'Sem atividade registada.',
    'player.killsUnit': '$1 kills',
    'res.wood': '🪵 Madeira', 'res.stone': '🪨 Pedra', 'res.metal': '⛏️ Metal',
    'res.sulfur': '💥 Sulfur', 'res.hqm': '✨ HQM',

    // loja (JS)
    'store.rate': '$1 gemas por cada hora jogada', 'store.enterToSee': 'entra para ver 💎',
    'store.redeem': 'Resgatar', 'store.notEnough': 'Gemas insuficientes', 'store.loginToRedeem': 'Entra para resgatar',
    'store.redeeming': 'a resgatar…', 'store.redeemedAuto': '✅ Resgatado — entrega em ~1 min',
    'store.redeemedInstant': '✅ Resgatado — já ativo no teu perfil',
    'store.redeemedManual': '✅ Resgatado — entrega manual em 24 h', 'store.empty': 'Loja vazia.',
    // loja (HTML)
    'store.title': 'Loja de Gemas',
    'store.how': 'Como funciona',
    'store.howDesc': 'Ganhas <b style="color:var(--gold)" id="rate">1,000 gemas por cada hora jogada</b> no servidor — automaticamente, sem fazer nada. As recompensas <b>nunca afetam combate, loot ou progressão</b>; o salto de fila é o único conforto, o resto é cosmético. Entra com a Steam para ver o saldo e resgatar.',
    'store.loginHint': '🔒 <a href="/auth/steam">Inicia sessão com a Steam</a> para resgatares recompensas.',
    'store.rewards': 'Recompensas',
    'store.myRedemptions': 'Os meus resgates',
    'store.deliveryNote': 'Resgates automáticos são entregues in-game em ~1 minuto (se estiveres online). Itens de entrega manual são tratados pela staff em 24 h.',
    'store.thWhen': 'Quando', 'store.thItem': 'Item', 'store.thCost': 'Custo', 'store.thStatus': 'Estado',

    // mapa (JS)
    'map.closed': '🔒 A votação está fechada de momento. Abre normalmente 36 h antes da wipe — fica atento ao Discord.',
    'map.login': '🔑 <a href="/auth/steam">Inicia sessão com a Steam</a> para votares.',
    'map.open': '🗳️ Votação aberta! O teu voto vale <b>×$1</b>',
    'map.thanks': '(obrigado por jogares connosco!)', 'map.playMore': '(joga 10 h+ numa wipe para valer mais)',
    'map.changed': 'Já votaste — podes mudar o voto.',
    'map.seed': 'seed $1', 'map.viewMap': 'ver no RustMaps ↗',
    'map.points': '<b>$1</b> pontos · $2 votante(s)', 'map.yourVote': '✓ O teu voto', 'map.voteThis': 'Votar neste',
    'map.noOptions': 'Ainda não há mapas candidatos para esta ronda.',
    // mapa (HTML)
    'map.title': 'Votação do próximo mapa',
    'map.how': 'Como funciona',
    'map.howDesc': 'Antes de cada wipe, a comunidade escolhe o mapa. O teu voto vale mais se jogares mais: <b style="color:var(--accent)">1 voto base + 1 por cada 10 horas jogadas na wipe anterior (máximo 5)</b>. Quem constrói o servidor decide o servidor. Podes mudar o teu voto enquanto a votação estiver aberta.',

    // overwatch (JS)
    'ow.loginHint': '🔑 <a href="/auth/steam">Inicia sessão com a Steam</a> para votares nos casos abertos.',
    'ow.watchClip': '🎬 Ver o clip ↗', 'ow.noCases': 'Sem casos publicados — bom sinal. 🎉',
    'ow.voteCheat': '🚨 Cheater', 'ow.voteUnsure': '🤔 Não sei', 'ow.voteClean': '✅ Limpo',
    'ow.verdict.cheater': '🚨 CONFIRMADO CHEATER — banido', 'ow.verdict.innocent': '✅ Inocente',
    'ow.verdict.inconclusive': '🤷 Inconclusivo',
    'ow.community': 'Comunidade: <b style="color:var(--bad)">$1% cheater</b> · $2% não sabe · <b style="color:var(--good)">$3% limpo</b> <span style="color:var(--ink-muted)">($4 votos)</span>',
    'ow.noVotes': 'Ainda sem votos da comunidade.',
    // overwatch (HTML)
    'ow.title': 'Overwatch Comunitário 🕵️',
    'ow.sub': 'A comunidade também caça cheaters',
    'ow.desc': 'A staff publica aqui clips de jogadores suspeitos — <b>sempre anónimos</b> (sem nomes, para não haver witch-hunts). Vê o clip e dá o teu veredicto. Os votos da comunidade <b>não banem ninguém</b>: são mais um sinal para a investigação da staff, que decide sempre com provas gravadas. Precisas de <b>5 h+ de jogo</b> no servidor para votar — e só vês os resultados depois de votares, para não seres influenciado.',

    // conta / apelo (JS)
    'account.survivor': 'Sobrevivente',
    'account.noRedemptions': 'Ainda não resgataste nada. <a href="/loja">Vê a loja →</a>',
    'account.noAppeals': 'Sem apelos. Ainda bem. 😄',
    'appeal.open': '⏳ Já tens um apelo <b>$1</b> ($2). Acompanha o estado na <a href="/conta">tua conta</a>.',
    'appeal.received': '<b>✅ Apelo recebido.</b> Resposta em 48-72 h — acompanha na <a href="/conta">tua conta</a>.',
    'appeal.login': '🔑 <a href="/auth/steam">Inicia sessão com a Steam</a> para apelares — assim sabemos que o apelo vem mesmo da conta banida.',
    'appeal.sending': 'a enviar…', 'appeal.submit': 'Enviar apelo',
    // conta (HTML)
    'account.title': 'ENTRAR NA CONTA',
    'account.loginDesc': 'Liga a tua conta Steam para veres as tuas gemas, resgatares recompensas, votares no próximo mapa e no Overwatch, e apelares bans. Só recebemos o teu SteamID — nunca a tua password.',
    'account.loginBtn': '🎮 Entrar com a Steam',
    'account.loginFailed': '⚠️ O login com a Steam falhou. Tenta outra vez.',
    'account.notSeenYet': 'Ainda não te vimos no servidor — entra no jogo e as tuas stats começam a contar.',
    'account.logout': 'terminar sessão',
    'account.gemsAvailable': '💎 gemas disponíveis', 'account.gemsTotal': 'gemas ganhas no total',
    'account.playtime': 'tempo de jogo', 'account.voteWeight': 'peso do teu voto de mapa',
    'account.goStore': '💎 Ir à loja', 'account.goMap': '🗳️ Votar no mapa',
    'account.myProfile': '📊 O meu perfil público', 'account.goAppeal': '⚖️ Apelar um ban',
    'account.myRedemptions': 'Os meus resgates', 'account.myAppeals': 'Os meus apelos',
    'account.staffReply': 'Resposta da staff:',
    // apelo (HTML)
    'appeal.title': 'Apelar um ban ⚖️',
    'appeal.intro': 'Todos os bans podem ser contestados — é uma promessa do nosso <a href="/staff">Código do Moderador</a>. Como funciona:',
    'appeal.li1': 'O apelo é revisto por um admin <b>diferente</b> do que aplicou o ban;',
    'appeal.li2': 'Revemos as provas gravadas do teu caso contigo em mente;',
    'appeal.li3': 'Resposta em 48-72 h, visível aqui e na <a href="/conta">tua conta</a>;',
    'appeal.li4': 'Sê honesto: um apelo com mentiras confirma o ban de vez.',
    'appeal.discordLabel': 'O teu Discord (para te contactarmos)',
    'appeal.textLabel': 'O teu apelo *',
    'appeal.textPh': 'Conta a tua versão: o que aconteceu, porque achas que o ban foi injusto, e qualquer contexto que a staff deva saber.',

    // candidatura (JS)
    'apply.sending': 'a enviar…', 'apply.submit': 'Enviar candidatura',
    'apply.received': '<b>✅ Candidatura recebida!</b><br>Obrigado pelo interesse. A equipa vai analisar e responde-te no Discord em 3-7 dias. Entretanto, mantém-te ativo no servidor — a atividade conta na avaliação.',
    // candidatura (HTML) — blocos longos
    'apply.title': 'Candidatura a Moderador',
    'apply.intro': 'Procuramos pessoas que queiram moderar como o <b>camomo_10</b>: investigar denúncias a sério, apanhar cheaters com provas gravadas, e nunca — <b>nunca</b> — abusar dos poderes de admin.',
    'apply.offerTitle': 'O que oferecemos a quem modera bem',
    'apply.offerList': '<li>🏆 <b>Moderador do Mês</b> — destaque no site e no Discord, com estatísticas públicas de bans/tickets resolvidos;</li><li>🎖️ Progressão clara: <b>Helper → Moderador → Moderador Sénior → Admin</b>, cada nível com mais responsabilidades (e permissões mínimas — ninguém começa com poderes totais);</li><li>🎥 Os teus melhores "apanhados" de cheaters podem ser publicados no canal da comunidade — constróis reputação como o camomo;</li><li>🎁 Regalias de apoiante oferecidas (cosméticos, cor no chat, slot reservado) — nada de vantagens de loot;</li><li>📚 Formação: acesso às ferramentas (admin cam, WebRCON, BattleMetrics) e mentoria de um membro sénior durante o período experimental.</li>',
    'apply.reqTitle': 'Requisitos mínimos',
    'apply.reqList': '<li>18+ anos;</li><li>Sem VAC bans ou game bans na conta Steam (vamos verificar);</li><li>Pelo menos ~100 h no nosso servidor (conhecer a comunidade conta mais do que horas totais de Rust);</li><li>PC capaz de correr Rust + Discord + software de gravação (OBS/ShadowPlay) — <b>todos os bans exigem provas gravadas</b>;</li><li>Calma sob pressão e disponibilidade regular.</li>',
    'apply.sectionA': 'A. Identidade e contacto',
    'apply.name': 'Nome in-game *', 'apply.steamHint': 'Encontra-o em steamid.io — começa por 7656119.',
    'apply.discord': 'Discord *', 'apply.age': 'Idade *', 'apply.tz': 'País / fuso horário',
    'apply.tzPh': 'Portugal (UTC+0/+1)', 'apply.hours': 'Horas de Rust (Steam)',
    'apply.sectionB': 'B. Disponibilidade e experiência',
    'apply.avail': 'Disponibilidade semanal',
    'apply.availPh': 'ex.: 3-4 noites por semana, 20h-24h, fins de semana à tarde',
    'apply.exp': 'Experiência anterior como staff',
    'apply.expPh': 'Servidores onde foste staff, cargo, duração, motivo da saída. Ferramentas que dominas: admin cam, RCON, RustAdmin, BattleMetrics, Oxide/Carbon…',
    'apply.sectionC': 'C. Motivação',
    'apply.motivation': 'Porque queres ser moderador AQUI, e porque te devemos escolher? *',
    'apply.sectionD': 'D. Cenários', 'apply.sectionDNote': '— a parte que mais pesa na avaliação',
    'apply.s1': '1. Um clã é denunciado por cheating, mas não há provas claras. Descreve passo a passo o que fazes. *',
    'apply.s2': '2. Um amigo teu / colega de equipa é acusado de cheating. O que fazes? *',
    'apply.s3': '3. Um jogador acusa-te publicamente de admin abuse no chat. Como respondes?',
    'apply.sectionE': 'E. Declarações de integridade',
    'apply.d1': 'Não tenho VAC bans nem game bans, e declaro todas as contas alternativas que possuo.',
    'apply.d2': 'Aceito o <a href="/staff">Código do Moderador</a>: zero vantagens in-game, provas gravadas em todos os bans, bans públicos e contestáveis.',
    'apply.d3': 'Aceito começar como Helper (período experimental) com permissões mínimas.',
    'apply.replyNote': 'Resposta em 3-7 dias via Discord. Boa sorte! 🍀',

    // novidades
    'news.empty': 'Ainda sem publicações.',
    'news.title': 'Novidades e changelog', 'news.sub': 'O que mudou no servidor, wipe a wipe.',

    // staff (JS)
    'staff.noTeam': 'Equipa por anunciar.', 'staff.since': 'na equipa desde $1',
    'staff.noBans': 'Sem banimentos registados. 🎉', 'staff.view': '🎬 ver',
    // staff (HTML)
    'staff.title': 'A nossa equipa',
    'staff.hubTitle': 'Confiança e transparência',
    'store.myRedLink': '\ud83d\udce6 Os meus resgates e estado de entrega \u2192',
    'ow.reportHint': 'Os casos s\u00e3o an\u00f3nimos por design \u2014 viste algo suspeito? Reporta no jogo com <b>F7</b> ou no Discord.',
    'staff.appealLine': 'Foste banido e achas que é um erro? <a href="/apelo">Apela aqui \u2192</a>',
    'staff.codeHint': 'Clica numa regra para a ler completa.',
    'staff.joinLine': '\ud83d\udee1\ufe0f Queres juntar-te \u00e0 equipa? Candidata-te \u2192',
    'staff.intro': 'Moderação inspirada no melhor da comunidade Rust — o padrão <b style="color:var(--ink)">camomo_10</b>: apanhar cheaters com provas, nunca abusar de poderes, e mostrar tudo à comunidade. Aqui os admins não são um mistério: sabes quem são, o que fazem, e quantos bans aplicaram.',
    'staff.codeTitle': 'O Código do Moderador',
    'staff.codeIntro': 'Todos os membros da equipa assinam e cumprem este código. Violações resultam em remoção imediata da equipa — sem exceções.',
    'staff.p1': '<b>1. Staff não joga.</b> A staff não joga no servidor que modera — nem na conta principal, nem em alts. Nada de spawnar itens, noclip/vanish para vantagem, ou espreitar bases "só para ver". Se a comunidade não confia no árbitro, o servidor morre.',
    'staff.p2': '<b>2. Provas, sempre.</b> Todas as verificações são gravadas. Nenhum ban por cheating sem gravação, e as provas guardam-se pelo menos 30 dias para responder a apelos — publicadas sempre que possível, ao estilo camomo_10.',
    'staff.p3': '<b>3. Bans públicos.</b> Todos os banimentos aparecem na lista pública acima, com motivo e o admin responsável. Qualquer pessoa pode contestar qualquer decisão — <a href="/apelo">apela aqui</a>.',
    'staff.p4': '<b>4. Neutralidade total.</b> Um admin nunca modera situações que envolvam a própria equipa/amigos — passa o caso a outro membro da staff.',
    'staff.p5': '<b>5. Respeito sempre.</b> Mesmo com cheaters e tóxicos: profissionalismo. Nós representamos o servidor.',
    'staff.transparency': 'Transparência de banimentos', 'staff.last30': 'últimos 30 dias',
    'staff.bans30': 'bans nos últimos 30 dias', 'staff.bansTotal': 'bans no total',
    'staff.modMonth': 'moderador do mês 🏆',
    'staff.thWhen': 'Quando', 'staff.thPlayer': 'Jogador', 'staff.thReason': 'Motivo',
    'staff.thAdmin': 'Admin', 'staff.thEvidence': 'Provas',

    // regras
    'rules.title': 'Regras do servidor',
    'rules.updated': 'Última atualização: agosto 2026 · O desconhecimento das regras não é desculpa. Em caso de dúvida, pergunta no Discord antes de agir.',
    'rules.s1': '1. Cheating e exploits — tolerância zero',
    'rules.s1l': '<li>Qualquer cheat, script, macro de recoil ou exploit = <b>ban permanente</b>, sem aviso.</li><li>Contas com VAC ban ou game ban com menos de 180 dias não podem jogar aqui.</li><li>Jogar em equipa com um cheater conhecido = ban por associação.</li><li>Todos os bans têm provas gravadas e aparecem na <a href="/staff">lista pública</a>. Podes contestar no Discord.</li>',
    'rules.s2': '2. Grupos',
    'rules.s2l': '<li><b>Sem limite de grupo</b> — full vanilla é mesmo isso: solo, duo, trio ou um clã inteiro, traz quem quiseres.</li><li>As equipas nativas do Rust aparecem automaticamente na <a href="/stats">página de stats</a> (Top equipas) — rivalidades são bem-vindas.</li>',
    'rules.s3': '3. Toxicidade',
    'rules.s3l': '<li>Provocação normal de Rust é aceitável — discurso de ódio, racismo, ameaças reais e doxxing não são.</li><li>Spam de voz/chat: mute. Reincidência: ban temporário.</li><li>Stream sniping de criadores de conteúdo = ban.</li>',
    'rules.s4': '4. Jogo limpo',
    'rules.s4l': '<li>Não há "zonas seguras" além das do jogo — raid e roof camping fazem parte do Rust.</li><li>Bug abuse (glitches de construção, ver através de paredes, etc.) = mesma categoria que cheating.</li><li>Vendas de itens/bases por dinheiro real (RMT) = ban.</li>',
    'rules.s5': '5. Wipes',
    'rules.s5l': '<li><b>Wipe de mapa</b>: todas as quintas-feiras de force wipe (primeira quinta do mês) e wipe intermédio quinzenal se anunciado.</li><li><b>Wipe de blueprints</b>: apenas no force wipe mensal.</li><li>O countdown está sempre na <a href="/">página inicial</a> e no Discord.</li>',
    'rules.s6': '6. Staff',
    'rules.s6l': '<li>A staff cumpre o <a href="/staff">Código do Moderador</a> — zero vantagens in-game, provas em todos os bans.</li><li>Denúncias: usa F7 in-game ou abre ticket no Discord. Todas são investigadas.</li><li>Se achas que um admin abusou de poderes, reporta ao dono no Discord — levamos isso mais a sério do que tudo o resto.</li>',

    // vs (JS)
    'vs.same': 'Escolhe dois jogadores diferentes. 😄', 'vs.nothing': 'Nada encontrado.',
    'vs.h2h': 'Frente a frente (todas as wipes)', 'vs.never': 'Ainda nunca se cruzaram. Alguém que trate disso.',
    'vs.dominates': '<b style="color:var(--accent)">$1</b> domina esta rivalidade.', 'vs.tie': 'Empate perfeito. 🍿',
    'vs.thisWipe': 'Esta wipe', 'vs.allTime': 'Todas as wipes', 'vs.recent': 'Últimos confrontos',
    'vs.kills': 'Kills', 'vs.deaths': 'Mortes', 'vs.headshots': 'Headshots', 'vs.hsRate': '% headshot',
    'vs.longest': 'Kill + longa', 'vs.streak': 'Streak atual', 'vs.structures': 'Estruturas destruídas',
    'vs.hours': 'Horas',
    // vs (HTML)
    'vs.title': '⚔️ 1 vs 1 — Comparador de jogadores',
    'vs.sub': 'Escolhe dois jogadores e vê quem manda. Inclui o histórico direto entre os dois.',
    'vs.phA': '🔍 jogador A…', 'vs.phB': '🔍 jogador B…',

    // resumo / heatmap (JS)
    'sum.topKiller': 'Top killer', 'sum.bestElo': 'Melhor Elo', 'sum.longest': 'Kill mais longa',
    'sum.headshots': 'Mais headshots', 'sum.farmer': 'Maior farmer', 'sum.hours': 'Mais horas',
    'sum.punchbag': 'Saco de pancada', 'sum.heli': 'Caça-Helis',
    'sum.kills': '$1 kills', 'sum.deaths': '$1 mortes (um herói)', 'sum.resources': '$1 recursos',
    'sum.hoursVal': '$1 horas', 'sum.helis': '$1 Patrol Helis abatidos',
    'sum.meta': '$1 · começou a $2', 'sum.metaKills': '$1 kills por $2 jogadores',
    'sum.current': 'atual', 'sum.noData': 'Ainda não há dados suficientes nesta wipe.',
    'heat.deaths': '$1 mortes PVP com posição registada · mapa $2',
    'heat.tip': ' · dica: define "mapImage" (URL de uma imagem do mapa, ex.: do RustMaps) em server/config.json para sobrepor o mapa real',
    // resumo / heatmap (HTML)
    'sum.title': '🏁 Resumo da wipe',
    'heat.title': '🗺️ Heatmap de mortes',
    'heat.desc': 'Onde se morre neste mapa. Quanto mais quente (laranja→branco), mais mortes na zona. Norte para cima; coordenadas do jogo normalizadas ao tamanho do mapa.',
  },
};

// ---------- API ----------

/** Traduz uma chave; $1, $2… são substituídos pelos argumentos.
 *  Usa uma função de substituição (não uma string) para que argumentos com
 *  $-patterns (ex.: nomes de jogadores como "Cool$1Guy") não sejam
 *  reinterpretados como referências de captura. */
function t(key, ...args) {
  const s = (LANG !== 'en' && I18N[LANG]?.[key]) || EN_JS[key] || key;
  if (!args.length) return s;
  return s.replace(/\$(\d+)/g, (m, n) => {
    const i = parseInt(n, 10) - 1;
    return i >= 0 && i < args.length ? String(args[i]) : m;
  });
}

/** Traduz o estado guardado na BD (pending/delivered/…) para etiqueta visível. */
function tStatus(dbValue) {
  return t(`status.${dbValue}`);
}

/** Aplica as traduções aos elementos data-i18n do documento. */
function applyI18n(root = document) {
  if (LANG === 'en') return; // o EN já está no HTML
  const dict = I18N[LANG];
  if (!dict) return;
  root.querySelectorAll('[data-i18n]').forEach((el) => {
    const v = dict[el.dataset.i18n];
    if (v !== undefined) el.innerHTML = v;
  });
  root.querySelectorAll('[data-i18n-ph]').forEach((el) => {
    const v = dict[el.dataset.i18nPh];
    if (v !== undefined) el.placeholder = v;
  });
  root.querySelectorAll('[data-i18n-title]').forEach((el) => {
    const v = dict[el.dataset.i18nTitle];
    if (v !== undefined) el.title = v;
  });
  // <title> da página
  const titleEl = document.querySelector('title[data-i18n-key]');
  if (titleEl && dict[titleEl.dataset.i18nKey]) document.title = dict[titleEl.dataset.i18nKey];
}

document.addEventListener('DOMContentLoaded', () => applyI18n());
