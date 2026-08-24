# Análise da concorrência — sites dos grandes servidores de Rust

> Pesquisa feita em agosto de 2026 sobre as maiores redes de servidores de Rust
> (Rustoria, Rustafied, Rusticated, Rusty Moose, Vital, Atlas, Stevious, Rustopia,
> Rustinity) e sobre o BattleMetrics. Fontes listadas no fim.

## Resumo executivo

Todas as grandes redes têm o mesmo esqueleto: **página de servidores com horários
de wipe + IP de ligação, loja de VIP/queue skip, regras, Discord em destaque**.
O que separa as melhores das restantes é:

1. **Estatísticas públicas profundas** (Vital e Moose lideram);
2. **Transparência de moderação** (Rustoria com lista pública de bans; Atlas com
   um portal comunitário de revisão de cheaters);
3. **Ciclos de retenção** (moeda ganha por tempo de jogo na Rustoria; votação de
   mapas com peso ganho por horas jogadas na Moose).

## Site a site

### Rustoria (rustoria.co) — a mais completa
- Páginas: home, servers, store, **leaderboards** (K/D por servidor, reset por wipe,
  login Steam), rules (vanilla/modded), **maps (votação de mapa)**, rewards, **apply
  (candidaturas a admin)**, support center completo (tickets, report, appeal).
- Subdomínios: `donate.` (loja), **`bans.` (lista pública de bans + appeal com login
  Steam)**, `signups.` (torneios com leaderboard PvP próprio), `articles.` (blog).
- Monetização: VIP ~£8/30 dias por servidor (queue skip, 2× peso no voto de mapa,
  acesso a um **servidor de pré-visualização do próximo mapa**), queue skip avulso.
- **Rustoria Gems**: 1 000 gemas por hora jogada, trocáveis por recompensas no site
  — ciclo de retenção que também traz visitas ao site.
- Torneio semanal "Base Invaders" com prémios em dinheiro e inscrições no site.

### Rustafied (rustafied.com) — o motor de conteúdo
- Identidade dupla: rede de servidores **e** site de notícias de Rust (cobertura dos
  updates mensais) — máquina de SEO/tráfego que nenhuma outra rede tem.
- Fórum IPS com store (VIP $12/mês por servidor), FAQ estruturado ("quando é a
  wipe?", "os BPs dão wipe?"), **diretório público de staff** e candidaturas
  abertas periodicamente.
- Curiosamente: **não tem leaderboards públicos** — a única grande rede sem stats.

### Rusticated (rusticated.com) — as melhores leaderboards técnicas
- **Leaderboards com todos os filtros no URL**: tipo (jogador/clã), servidor, e
  **wipe específica** (`?type=clan&serverId=main&serverWipeId=4008`) — dá para
  navegar wipes históricas e partilhar links de "gabarolice".
- Página legada de kill-log por SteamID. Loja com queue skip por servidor.

### Rusty Moose (moose.gg) — as stats mais abrangentes
- `/stats` com **PvP, PvE, recursos, construção, raiding** e pesquisa de jogador
  (nova versão em beta.moose.gg).
- **Votação de mapa com influência ganha**: até 5 votos por wipe consoante as horas
  jogadas na wipe anterior; VIP duplica. Abre 36 h antes da wipe.
- Fórum público de appeals (todos podem ler os desfechos) — forte sinal de confiança.
- VIP global $40/30 dias; VIP = só queue skip, sem imunidade às regras.

### Vital (vitalrust.com) — o esquema de stats mais profundo
- `/statistics` com **8 categorias** (Player, Raiding, Scientists, Animals, PVE,
  Gambling, Farming, Building); campos como rockets disparados, balas acertadas,
  headshots, kills nos últimos 30 dias.
- **Página pública de perfil por SteamID** (`/statistics/player-overview?userId=…`).
- Mas: monetização agressiva (ranks pagos com kits) — pay-to-win assumido.

### Atlas (atlasrust.com) — a ideia mais original
- **`overwatch.atlasrust.com` — "Cheater Review Program"**: a comunidade revê
  gravações de suspeitos e vota veredictos. Único entre todos os analisados;
  transforma o anti-cheat em conteúdo e envolvimento.
- Loja com kits/gems (pay-to-win) — o modelo de negócio menos admirado.

### Stevious, Rustopia, Rustinity — notas rápidas
- Stevious: VIP dá acesso a **servidores de teste** e voto/acesso antecipado à seed
  do mapa via Discord.
- Rustopia: **staff proibida de jogar em qualquer servidor da rede** (política de
  conflito de interesses); auto-kick para contas com game ban < 90 dias.
- Rustinity: loja simples VIP+queue skip; regras claras (thresholds de 150/180 dias
  para game bans).

### BattleMetrics — o que já existe de graça
- Rankings objetivos (horas de jogo × 7 dias), gráfico de população ao minuto,
  histórico de wipes, uptime, lista de jogadores, leaderboard de tempo jogado,
  perfis de jogador pesquisáveis, API REST completa.
- **Implicação**: não vale a pena reconstruir o que o BM dá de graça (uptime,
  rank). O nosso site ganha onde o BM não chega: **kills/K/D/farm por wipe,
  perfis ricos, killfeed, candidaturas, transparência de bans**.

## Matriz de funcionalidades (resumo)

| Funcionalidade | Rustoria | Rustafied | Rusticated | Moose | Vital | O NOSSO SITE |
|---|---|---|---|---|---|---|
| Leaderboards públicos | ✅ K/D | ❌ | ✅ por wipe | ✅ multi-categoria | ✅ 8 categorias | ✅ 5 métricas, por wipe |
| Perfil público por jogador | parcial | ❌ | legado | pesquisa | ✅ | ✅ com nemesis/vítimas |
| Killfeed ao vivo no site | ❌ | ❌ | parcial | ❌ | ❌ | ✅ **(diferenciador!)** |
| Lista pública de bans | ✅ | parcial | ❌ | ❌ | ❌ | ✅ com provas |
| Página de candidaturas | ✅ | periódica | ❌ | ❌ | ❌ | ✅ com cenários |
| Código do moderador público | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ **(diferenciador!)** |
| Stats de bans por moderador | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ **(diferenciador!)** |
| Countdown de wipe | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Loja / VIP | ✅ | ✅ | ✅ | ✅ | ✅ P2W | 🔜 roadmap |
| Votação de mapa | ✅ | ✅ | ❌ | ✅ ganha | ❌ | 🔜 roadmap |
| Moeda por tempo jogado | ✅ | ❌ | ❌ | ❌ | ❌ | 🔜 roadmap |

## As 10 melhores ideias vistas (por ordem de valor para nós)

1. **Leaderboards por wipe com filtros no URL** (Rusticated) — já implementado
   (período wipe/sempre); falta arquivar wipes antigas navegáveis.
2. **Perfis públicos ricos por SteamID** (Vital/Moose) — já implementado.
3. **Support center web** (Rustoria: tickets/report/appeal com Steam) — roadmap.
4. **Lista pública de bans + appeals** (Rustoria/Moose) — já implementado (lista);
   appeals via Discord por agora.
5. **Moeda ganha por tempo de jogo** (Rustoria Gems) — roadmap; excelente retenção.
6. **Votação de mapa com influência ganha por horas** (Moose) — roadmap.
7. **Portal comunitário de revisão de cheaters** (Atlas Overwatch) — roadmap;
   encaixa perfeitamente no nosso posicionamento camomo_10.
8. **Eventos/torneios com inscrição no site** (Rustoria) — roadmap.
9. **Monetização em camadas sem P2W** (VIP por servidor + skip avulso + bundle
   global; billing transparente como a Rustafied) — roadmap.
10. **Conteúdo/FAQ canónico** (Rustafied) — parcialmente feito (regras + countdown);
    um mini-blog de updates é barato e traz SEO.

## Onde já somos melhores do que a maioria

- **Killfeed ao vivo no site** — nenhuma das grandes redes mostra isto publicamente.
- **Transparência total da moderação**: código do moderador público, bans com
  provas e moderador responsável, estatísticas de bans por moderador, "Moderador
  do Mês" — nenhuma rede combina tudo isto.
- **Candidaturas com perguntas-cenário** baseadas nos formulários reais
  (RustyNation, Rusty Wasteland, RustEZ) — a maioria das redes esconde isto
  no Discord.
- **Custo zero de infraestrutura de software**: Node puro + SQLite, sem
  dependências, corre em qualquer máquina.

## Fontes principais

rustoria.co (/leaderboards, /apply, /rewards, bans.rustoria.co, signups.rustoria.co) ·
rustafied.com + forum.rustafied.com (store, FAQ, staff) · rusticated.com
(/leaderboards com wipeId) · moose.gg (/stats, /map-voting, appeals) ·
vitalrust.com (/statistics, player-overview) · atlasrust.com + overwatch.atlasrust.com ·
stevious.io · rustopia.gg · store.rustinity.com · battlemetrics.com (rankings, API).
