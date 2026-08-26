# Playbook de Moderação — Rustworthy

Guia prático para a staff. O objetivo é um servidor Vanilla com reputação de
100% limpo — moderação ativa ao vivo, provas sempre, transparência total.

## O que o NOSSO site já faz por ti (automático)

| Ferramenta | Onde | O que faz |
|---|---|---|
| **Reports F7** | `/admin` → Reports | Todos os F7 do jogo caem aqui, agrupados por alvo. 3+ jogadores diferentes em 24h = **PRIORITY** + alerta no Discord (webhook `staff`) |
| **Watchlist** | `/admin` → Watchlist | Radar de risco automático: headshot rate anómalo, kills a 150m+, rajadas de kills/hora, kills por hora jogada, pressão de reports, historial de bans Steam. Ordena quem merece spectate primeiro |
| **Alerta de spike** | Discord `staff` | Kills acima de `anomalyKillsPerHour` (config) na última hora → alerta |
| **Bans VAC/Game** | Watchlist | Com `steamApiKey` no config.json, o site consulta o historial de bans Steam de cada jogador e assinala bans recentes |
| **Ban log público** | `/staff` + webhook `bans` | Cada ban aparece no site e no canal Discord em tempo real — a comunidade VÊ a limpeza a acontecer |
| **Apelos** | `/apelo` | Formulário no site, resposta da staff, tudo registado |
| **Overwatch** | `/overwatch` | Clips anónimos + veredicto da comunidade como sinal extra |
| **Janelas curtas** | `/stats` (última hora/24h) | Spikes suspeitos visíveis para toda a comunidade |

## Fluxo de investigação recomendado

1. **Sinal** — alerta no Discord (spike ou pressão de reports) ou entrada na Watchlist.
2. **Spectate** — entra em modo spectate (comando nativo `spectate <nome>`), grava o ecrã DESDE O INÍCIO.
3. **Confirma** — procura: recoil sem variação (script), tracking através de paredes (ESP), flicks impossíveis (aimbot). Compara com o perfil no site (HS%, distâncias).
4. **Decide** — na dúvida, NÃO banas: marca para revisitar e pede segunda opinião a outro admin.
5. **Ban + provas** — ban com a gravação guardada (mín. 30 dias), publica no `/admin` → Bans (vai automaticamente para o site + Discord).
6. **Apelo** — outro admin (nunca o que baniu) responde em 48–72h com base na gravação.

## Ferramentas do SERVIDOR DE JOGO a instalar (Oxide)

Estas correm no servidor de jogo, não no site — instalar quando o servidor existir:

- **Admin Radar** (uMod) — ESP de admin: ver jogadores/vida/inventário através de paredes durante investigações. Permissão APENAS para staff, registada.
- **Vanish** (uMod) — invisibilidade para spectate discreto.
- **Spectate nativo** — `spectate <nome>` na consola F1 (permissão `global.spectate`).

## Serviços externos recomendados

- **BattleMetrics** (battlemetrics.com) — RCON web, histórico de jogadores, deteção de ban evasion entre servidores, triggers automáticos. O standard da indústria; plano gratuito serve para começar.
- **Rust Admin** (rustadmin.com) — alternativa desktop de RCON.
- **Filtros de entrada** — opções no servidor de jogo/BattleMetrics:
  - Bloquear contas Steam com VAC/game ban < 180 dias (a nossa regra pública já o diz — automatizável via plugin/BattleMetrics)
  - Sinalizar contas Steam recém-criadas
  - VPN block: serviços como IPHub/proxycheck.io (têm planos gratuitos limitados) — avaliar quando houver tráfego a justificar

## Política (inegociável — está pública em /staff)

1. **Staff não joga** no servidor que modera — nem em alts.
2. **Gravação obrigatória** em todas as verificações; provas guardadas ≥ 30 dias.
3. **Bans públicos** com razão e admin responsável.
4. **Neutralidade** — casos de amigos passam para outro admin.
5. **Apelos** respondidos por um admin diferente do que baniu.

## Configuração relevante (server/config.json)

```json
"anomalyKillsPerHour": 15,      // alerta de spike de kills
"reportAlertThreshold": 3,      // nº de reporters distintos em 24h para alerta PRIORITY
"steamApiKey": "",              // ativa verificação de bans Steam na watchlist
"discordWebhooks": { "staff": "..." , "bans": "..." }
```

---

# Estratégia avançada (fase 150–400 jogadores)

Análise das táticas dos servidores de topo — o que implementámos, o que fica
para depois, e onde a informação corrente anda errada.

## Inspeções por screen share — política, com pés atrás

A prática existe nos servidores grandes: 90% de certeza + clip inconclusivo →
convite para sala privada de Discord, inspeção ao PC (Echo é a ferramenta
usada profissionalmente; recusa = ban por política publicada).

**⚠️ Correção importante ao que se lê por aí: screen shares NÃO detetam DMA
cheats.** Cheats DMA correm num segundo PC ligado por hardware — por definição
não deixam rasto na máquina inspecionada. O screen share apanha cheats de
software, macros e scripts de recoil. Contra DMA, o que funciona é a análise
de padrão (a nossa watchlist + analytics de pontaria) e o spectate atento.

Regras se fores usar screen shares:
1. Política **pública** nas regras antes do primeiro uso ("suspeitas fortes
   podem levar a verificação por Discord; recusar = ban").
2. Sempre 2 staff presentes, sessão gravada.
3. Nunca pedir passwords nem aceder a contas — só observar.
4. É o último recurso, não a rotina — jogadores legítimos detestam.

## Analytics de pontaria — IMPLEMENTADO ✅

Melhor do que o "recoil analytics" vago que se sugere por aí: o plugin agora
conta **tiros disparados vs. acertos PvP vs. headshots** por jogador e por
arma (agregado de 5 em 5 min — zero impacto de performance, nunca por tiro).
A watchlist ganhou dois sinais novos:
- ≥50% dos tiros a acertar com 200+ tiros → +30 risco
- ≥50% dos acertos na cabeça com 60+ acertos → +30 risco

O separador Watchlist do /admin mostra a coluna "Aim" (% acerto e amostra).
Limiares conservadores de propósito: um bom jogador anda nos 20–35% de
acerto em spray; >50% sustentado é quase sempre soft-aim.

## Obrigado a quem reporta — IMPLEMENTADO ✅

Ao registares um ban no /admin com o **SteamID64** do banido, todos os que o
reportaram por F7 nos últimos 30 dias recebem automaticamente in-game:
"✅ The player you reported was banned. Thanks for keeping the server clean!"
(entregue pelo plugin quando o jogador estiver online). É o ciclo de
confiança: reporto → acontece alguma coisa → reporto outra vez.

## Prova de trabalho — IMPLEMENTADO ✅

- Página /staff: secção "The receipts" com os números da wipe (bans, reports
  processados, apelos respondidos, veredictos overwatch) — pública.
- O post de fim de wipe no Discord inclui agora o bloco de moderação
  automaticamente. Zero trabalho manual.

## Hall of shame — IMPLEMENTADO ✅

Ao fechar um caso Overwatch como cheater há agora o botão
"close: cheater · keep clip 🎬" — o vídeo fica público na página como prova
viva. Casos sem interesse continuam a apagar o clip (poupa disco).

## VIP / fila de espera — PLANO (quando houver fila)

A regra de ouro mantém-se: **zero vantagem in-game**. O aceitável:
- Skip queue (a loja de gemas já tem o item "Queue skip 24h" — a versão
  paga usa o mesmo mecanismo de permissão no servidor de jogo)
- Cor no chat + cargo Discord + badge no site (a loja já suporta)
Implementação quando chegar a hora: Tebex (o standard, trata de IVA e
chargebacks) + plugin de queue bypass por permissão. A política da Facepunch
permite monetizar queue skip em servidores comunitários.

## Clips de moderação como marketing — PLANO (precisa de staff ativa)

- Toda a verificação por spectate é gravada (já é política) → os melhores
  momentos viram TikTok/Shorts/Reels ("POV: apanhado a voar às 3 da manhã").
- O hall of shame do Overwatch é a versão site disto — linka os clips nos
  posts.
- Regra: nunca mostrar nomes reais/Discord do banido além do nick in-game.

---

# Ronda 3 de estratégia — o que entrou e o que foi descartado

## Descartado (com razão técnica)

- **"GIF/vídeo automático da perspetiva no report"** — impossível como descrito:
  um servidor de Rust não renderiza gráficos, não há vídeo para gravar. A
  versão REAL disto são as **demos server-side nativas** (`demo.record`) — ver
  abaixo, implementado.
- **Valor do inventário Steam / nº de amigos banidos** como sinais de risco —
  na prática inúteis: inventários e listas de amigos estão quase sempre
  privados, e o valor de inventário exige chamadas de mercado pesadas para um
  sinal fraquíssimo. Os sinais fortes (idade da conta, horas de Rust, bans
  anteriores) já estão na watchlist.
- **"Trust Score"** como sistema novo — já existe: é a nossa Watchlist. Foi
  aprofundada em vez de duplicada.

## Implementado nesta ronda ✅

1. **Watchlist enriquecida (o "trust score" completo)** — com `steamApiKey`,
   as flags de cada jogador incluem agora idade da conta Steam e horas de
   Rust (perfis públicos). Sinais novos: conta com <90 dias (+15) e <150 h
   de Rust (+15). O histórico de nomes é registado automaticamente
   (trigger na BD) e aparece como "aka" na watchlist — rebranding não
   esconde ninguém.
2. **Alerta de primeira kill** — quando uma conta sinalizada (ban anterior,
   conta nova, poucas horas) faz a PRIMEIRA kill da wipe, a staff recebe
   alerta no Discord. O topo da fila de spectate faz-se sozinho.
3. **Dossier no alerta de pressão** — o alerta de 3+ reporters agora inclui
   o resumo de combate do alvo (kills da wipe e da última hora, HS%, melhor
   distância, precisão) — o moderador decide em segundos.
4. **Auto-demo (o "killcam" verdadeiro)** — quando 3 jogadores distintos
   reportam o mesmo alvo, o plugin grava automaticamente uma demo
   server-side de 60 s (`demo.record`) — fica em `server/<identity>/demos/`,
   abre-se no cliente do Rust com `demo.play`. Configurável
   ("Auto server demo on report pressure", 0 desliga).
5. **Bounty de reports** — quem reportou um jogador que acabou banido recebe
   gemas (config `reporterBountyGems`, 5000 por defeito, 0 desliga) junto
   com o obrigado in-game. Gemas são cosméticas → sem risco de P2W; o custo
   de reports falsos é zero porque só pagam bans confirmados.
6. **Wipe Hype** — `nextMapSeed`/`nextMapSize` no config mostram o próximo
   mapa na home (link RustMaps para planear a base) + secção **"Squad up"**
   na página do mapa: equipas registam-se para a próxima wipe e o contador
   público ("N equipas · M jogadores confirmados") vende movimento.
7. **Leaderboard de Precisão** — tab pública 🎯 na stats (mín. 300 tiros):
   precisão, tiros, distância média, kills. Os bons exibem números; os
   batoteiros sabem que os deles vão gritar. O perfil de cada jogador mostra
   a tile de precisão (mín. 100 tiros). Os limiares INTERNOS da watchlist
   não são publicados.
