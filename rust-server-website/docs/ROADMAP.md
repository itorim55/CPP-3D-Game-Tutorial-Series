# Roadmap e opiniões — o que fazer a seguir

As minhas opiniões sobre prioridades, com base na análise da concorrência
(ver `ANALISE-CONCORRENCIA.md`). Organizado por fases realistas.

> **Estado (atualização 2):** já implementado — login Steam (5), apelos no site (6),
> moeda por tempo jogado + loja com entrega automática (9), votação de mapa (10),
> arquivo de wipes (12), Overwatch comunitário (13), mini-changelog (8), e ainda:
> stats de equipas, conquistas/badges, resumo automático de fim de wipe,
> webhooks do Discord (killfeed/bans/candidaturas/resumos), ranking Elo sazonal,
> heatmap de mortes, leaderboards por janela (hora/dia/semana/mês) com kills,
> mortes e horas jogadas, e gestão de bans no /admin.
> Falta: multi-servidor (7), pagamentos VIP (11), torneios (14), canal de
> vídeo (15), sincronização de ban lists via BattleMetrics (16).

## Fase 0 — antes de abrir o servidor (essencial)

1. **Escolhe a identidade.** O nome atual é **Rustworthy** (o trocadilho
   *trustworthy*) — muda-o, se quiseres, editando `brandAccent`/`brandRest` e
   `serverName` em `server/config.json` (o site inteiro atualiza; não há nomes
   no HTML). Decide o nicho: o mercado PT/BR tem poucos
   servidores 2x vanilla+ com moderação a sério; essa é a tua abertura. Não
   compitas com a Rustoria em população — compete em **confiança**.
2. **Discord primeiro.** Todas as grandes redes vivem do Discord (Rusticated:
   156k membros). Cria canais: regras, anúncios, tickets, appeals, e um canal
   público **#bans** alimentado por webhook (o killfeed do anti-cheat).
3. **Define o grupo máximo e a cadência de wipe e NUNCA mudes.** Consistência
   de wipe é o fator nº 1 de retenção; redes grandes publicam o horário com
   semanas de antecedência.
4. **Host de jogo gerido** (€15–35/mês) — ver `HOSPEDAGEM-EM-CASA.md`. Site no
   PC de casa com Cloudflare Tunnel.

## Fase 1 — primeiras semanas (fidelizar os primeiros 50)

5. **Login Steam no site** (OpenID da Steam é grátis e simples). Desbloqueia:
   perfil "meu", candidaturas verificadas (sem SteamID falso), e mais tarde
   loja/votos. A Rustoria exige Steam login para tudo — com razão.
6. **Appeals de ban no site** (formulário + estado), em vez de DMs no Discord.
   A Moose mostra que appeals públicos geram confiança; começa com privados.
7. **Página de servidores** com vários servidores/modos quando cresceres
   (main/solo-duo-trio) — o padrão de todas as redes.
8. **Mini-blog/changelog** — 1 post por wipe ("o que mudou") já dá SEO e dá
   conteúdo para partilhar no Discord. (Rustafied construiu um império nisto.)

## Fase 2 — quando houver população estável

9. **Moeda por tempo jogado** (estilo Rustoria Gems: 1000/hora) trocável por
   cosméticos/cor no chat/queue skip de 1 dia. Poderoso ciclo de retenção,
   zero pay-to-win, e o plugin já mede o tempo de jogo.
10. **Votação de mapa com influência ganha** (estilo Moose: votos por horas
    jogadas na wipe anterior, abre 36 h antes da wipe). O plugin já regista
    playtime — falta só a página de voto.
11. **Monetização sem P2W**: VIP por servidor (queue skip + cosméticos), skip
    avulso, bundle global. Publica preços e billing claro (a Rustafied é o
    exemplo). **Nunca vendas kits/loot** — Vital e Atlas fazem-no e é a parte
    mais criticada dos seus modelos.
12. **Arquivo de wipes navegável** (estilo Rusticated: `?wipeId=`) — a base de
    dados já guarda tudo por wipe; falta expor o seletor no frontend.

## Fase 3 — diferenciação a sério

13. **"Overwatch" comunitário** (inspirado no Atlas): página onde a comunidade
    revê clips de suspeitos (sem nome visível) e vota. Combina perfeitamente
    com o posicionamento camomo_10 e gera envolvimento enorme.
14. **Torneios com inscrição no site** (estilo Rustoria "Base Invaders") —
    a tabela `applications` generaliza-se facilmente para inscrições de equipas.
15. **Canal de vídeo dos "apanhados"**: publica os melhores clips de cheaters
    apanhados (com provas). É literalmente o formato que fez o camomo_10 ter
    612k subscritores — e cada vídeo é marketing do servidor.
16. **Integração BattleMetrics**: link para a página BM do servidor (uptime/rank
    são de graça lá) e usa a API deles para sincronizar ban lists partilhadas.

## Opiniões técnicas (o que EU faria)

- **Mantém o site sem dependências** enquanto puderes. A versão atual corre em
  qualquer lado com Node 22+. Só adiciona framework quando o Steam login/loja
  o justificarem (nessa altura: Fastify + better-sqlite3, ou migrar para MySQL
  se quiseres usar plugins como Player Ranks com SQL direto).
- **Backups**: o ficheiro `data/stats.db` é tudo. Um cron com
  `sqlite3 stats.db ".backup backup-$(date +%F).db"` + cópia para outro disco.
- **Plugins úteis a instalar no servidor** (todos grátis): Player Ranks
  (Codefling), Statistics DB, Playtime Tracker (uMod), DiscordMessages
  (webhooks para o Discord), e o nosso StatsHub.cs para o site.
- **Segurança do site** ✅ feito: o console aceita a sessão Steam de quem tem
  cargo `admin` (ownerSteamId automático); a `adminKey` ficou como chave de
  emergência — mantém-na fora do Discord/git.
- **Monitorização do servidor de jogo**: RustServerMetrics (HarmonyMod) →
  InfluxDB → Grafana se quiseres dashboards de FPS/lag; não misturar com o
  site de stats de jogadores.

## O que NÃO fazer (aprendido com a concorrência)

- ❌ Kits/ranks pagos com vantagem in-game (Vital/Atlas) — mata a credibilidade
  de servidor "justo" e afasta exatamente os jogadores que queres.
- ❌ Admins a jogar com poderes na wipe — metade das polémicas de servidores
  pequenos nascem aqui. O Código do Moderador do site resolve isto por escrito.
- ❌ Reconstruir o que o BattleMetrics dá de graça (uptime, rank histórico).
- ❌ Prometer wipes/eventos e falhar o horário. Pior do que não ter.
- ❌ Abrir 5 servidores no dia 1. Um servidor cheio > cinco vazios (o algoritmo
  do server browser favorece população).
