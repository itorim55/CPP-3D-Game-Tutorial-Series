# StatsHub — plugin Oxide/uMod

Plugin que liga o teu servidor de Rust ao site de estatísticas. Envia:

- **Kills PVP** (arma, distância, headshot, parte do corpo) → killfeed e leaderboards
- **Mortes PVE** (ursos, queda, scientists, heli…)
- **Sessões** (tempo de jogo por jogador)
- **Farm** (madeira, pedra, minérios — agregado, sem spam)
- **Heartbeat** a cada 60 s (jogadores online, fila, FPS do servidor, entidades, mapa)
- **Wipes** — deteta um save novo e abre automaticamente uma wipe nova no site

## Instalação

1. Instala o [Oxide/uMod](https://umod.org) (ou [Carbon](https://carbonmod.gg) — compatível) no servidor de Rust.
2. Copia `StatsHub.cs` para `oxide/plugins/` (Carbon: `carbon/plugins/`).
3. O plugin compila automaticamente e cria `oxide/config/StatsHub.json`.
4. Edita a configuração:

```json
{
  "Url do site (sem barra final)": "https://stats.oteudominio.pt",
  "Chave de API (apiKey do config.json do site)": "a-chave-gerada-pelo-site",
  "Intervalo de envio de eventos (segundos)": 30.0,
  "Intervalo do heartbeat (segundos)": 60.0,
  "Registar farm de recursos": true
}
```

5. `oxide.reload StatsHub` na consola RCON.

A chave de API é a `apiKey` que o site gera no primeiro arranque (em `server/config.json`).
**Nunca uses a `adminKey` aqui** — essa é só para a página /admin do site.

## Notas

- Os eventos são enviados em lotes a cada 30 s — uma kill não gera um pedido HTTP imediato.
- Se o site estiver em baixo, os eventos ficam em fila (até 2000) e são reenviados.
- Testado com a API do Oxide para Rust de 2026; se um hook mudar de assinatura
  após um update da Facepunch, verifica os avisos na consola do servidor.
