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
