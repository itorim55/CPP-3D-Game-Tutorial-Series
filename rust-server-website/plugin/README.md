# StatsHub — plugin Oxide/uMod

Plugin que liga o teu servidor de Rust ao site de estatísticas. Envia:

- **Kills PVP** (arma, distância, headshot, parte do corpo) → killfeed e leaderboards
- **Mortes PVE** (ursos, queda, scientists, heli…)
- **Tempo de jogo** — creditado a cada 5 min (alimenta as gemas e o peso do voto de mapa)
- **Farm** (madeira, pedra, minérios — agregado, sem spam)
- **Heartbeat** a cada 60 s (jogadores online, fila, FPS do servidor, entidades, mapa)
- **Wipes** — deteta um save novo e abre automaticamente uma wipe nova no site

E recebe do site:

- **Recompensas da loja** — a cada 60 s pergunta ao site se há resgates
  pendentes e executa o comando de consola respetivo (ex.:
  `oxide.usergroup add <steamid> queueskip`). Desativável na config.
- **Notices** — mensagens do site para jogadores no chat (ex.: obrigado + bounty
  por um report que levou a ban).
- **Bans do site** — bans registados no console com SteamID são aplicados no
  jogo com `banid` em ≤60 s. Desativável.
- **Registo público de ações de admin** — comandos privilegiados (give, spawn,
  teleport, godmode, vanish, noclip, demos, kicks, bans…) executados por admins
  ou pela consola/RCON vão para a página Trust do site. Desativável.
- **Demos automáticas** — 3 reporters distintos em 24h → `demo.record` do alvo.

## Instalação

1. Instala o [Oxide/uMod](https://umod.org) (ou [Carbon](https://carbonmod.gg) — compatível) no servidor de Rust.
2. Copia `StatsHub.cs` para `oxide/plugins/` (Carbon: `carbon/plugins/`).
3. O plugin compila automaticamente e cria `oxide/config/StatsHub.json`.
4. Edita a configuração:

```json
{
  "Site URL (no trailing slash)": "https://stats.yourdomain.com",
  "API key (apiKey from the site config.json)": "the-key-the-site-generated",
  "Event flush interval (seconds)": 30.0,
  "Heartbeat interval (seconds)": 60.0,
  "Playtime credit interval (seconds)": 300.0,
  "Track resource gathering": true,
  "Track raids (destroyed structures)": true,
  "Deliver store rewards (runs commands)": true,
  "Auto server demo on report pressure (seconds, 0 = off)": 60.0,
  "Auto demo: distinct reporters in 24h to trigger": 3,
  "Reward poll interval (seconds)": 60.0,
  "Apply site bans in-game (banid)": true,
  "Public admin action log (give/spawn/teleport...)": true
}
```

5. `oxide.reload StatsHub` na consola RCON.

A chave de API é a `apiKey` que o site gera no primeiro arranque (em `server/config.json`).
**Nunca uses a `adminKey` aqui** — essa é só para a página /admin do site.

## Servidor full vanilla? Lê isto

O separador do server browser onde apareces importa: **Community** (sem mods)
tem muito mais tráfego de jogadores vanilla do que **Modded**. Por convenção,
um servidor com Oxide/Carbon carregado lista-se em Modded — mesmo que os
plugins não alterem o gameplay.

As opções, da mais purista à mais prática:

1. **Zero plugins (Community tab garantida)** — não instalar Oxide de todo e
   recolher stats por **WebRCON**: o site liga-se ao websocket RCON do servidor
   e lê o feed da consola (mortes, ligações, `serverinfo` para o heartbeat).
   Custo: stats mais pobres (sem arma exata/headshot/distância/farm) e sem
   entrega automática de recompensas. Se quiseres este caminho, é um módulo
   extra no site (`rcon-collector`) em vez deste plugin.
2. **Oxide só com plugins de telemetria/admin (o que as grandes fazem)** — o
   StatsHub não altera nada do gameplay (só observa e envia), tal como os
   plugins de admin que as redes "vanilla" usam. Muitos servidores assim
   continuam listados como Community; a decisão final do separador é feita
   pelas tags do servidor. Verifica como o teu servidor aparece após instalar
   e decide.
3. **Assumir Modded** — se acabares por querer queue skip/cor no chat da loja
   de gemas (precisam de plugins), já estás em Modded e não há conflito.

Recomendação para full vanilla a sério: começa pela opção 2 (só StatsHub),
confirma o separador onde apareces, e se fores parar a Modded pondera a
opção 1. Os itens da loja que não tocam no jogo (badge no site, sorteios,
cargos no Discord) funcionam em qualquer das opções.

## Notas

- Os eventos são enviados em lotes a cada 30 s — uma kill não gera um pedido HTTP imediato.
- Se o site estiver em baixo, os eventos ficam em fila (até 4000) e são reenviados; cada lote leva um `batchId` para um retry nunca duplicar kills/gemas.
- Testado com a API do Oxide para Rust de 2026; se um hook mudar de assinatura
  após um update da Facepunch, verifica os avisos na consola do servidor.
