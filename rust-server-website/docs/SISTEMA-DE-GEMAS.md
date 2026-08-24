# O sistema de gemas — como funciona e porque não come performance

## A pergunta certa

> "Como é que detetamos que o jogador está a jogar? Isso não come recursos de
> performance do servidor?"

Resposta curta: **o custo é praticamente zero**, porque o servidor de jogo nunca
faz trabalho "por frame" nem "por segundo" para as gemas. Tudo funciona por
**eventos discretos e timers lentos**, e as contas todas acontecem **no site**,
noutra máquina.

## Como detetamos que o jogador está a jogar

O Rust (via Oxide/Carbon) chama *hooks* no plugin quando acontecem coisas:

```
OnPlayerConnected(player)     → o jogador entrou (guardamos a hora, 1 vez)
OnPlayerDisconnected(player)  → o jogador saiu   (creditamos o resto, 1 vez)
```

Entre estes dois momentos, o jogador "está a jogar". Para não perder tempo de
jogo se o servidor crashar (e para as gemas acumularem quase em tempo real),
um **timer a cada 5 minutos** percorre a lista de jogadores online e envia o
delta de segundos de cada um para o site:

```
timer a cada 300 s:
  para cada jogador online:            ← iterar ~100 entradas, nanossegundos
    segundos = agora - último_crédito  ← uma subtração
    fila.adicionar(evento_session)     ← adicionar a uma lista em memória
```

O site recebe os eventos e faz a única conta que existe:

```
gemas += segundos / 3600 × gemsPerHour     (padrão: 1000/hora)
```

**O plugin nunca pergunta "estás a jogar?" a ninguém.** Não há polling por tick,
não há verificação por segundo, não há queries à base de dados no servidor de
jogo (a base de dados vive no site).

## O orçamento de performance, ao detalhe

O servidor de Rust corre o main loop a 30–60 FPS (16–33 ms por frame). Para
"comer performance", algo tem de roubar tempo DENTRO desse loop. O que o
StatsHub faz por frame: **nada**. O que faz por evento:

| Operação | Frequência | Custo por ocorrência |
|---|---|---|
| Hook de kill (`OnPlayerDeath`) | por morte (~poucas/min) | montar um dicionário em memória: **microssegundos** |
| Hook connect/disconnect | por entrada/saída | idem |
| Hook de farm (`OnDispenserGathered`) | por pancada de farm | somar num dicionário: **nanossegundos** (e podes desligar: `TrackGather: false`) |
| Crédito de tempo | 1× a cada **5 min** | iterar a lista de jogadores: **< 1 ms** |
| Envio do lote (`Flush`) | 1× a cada **30 s** | serializar JSON + HTTP **assíncrono** |
| Heartbeat | 1× a cada **60 s** | ler 5 contadores já existentes |
| Poll de recompensas | 1× a cada **60 s** | um GET assíncrono |

O ponto crítico: os pedidos HTTP usam o `webrequest` do Oxide, que corre
**fora do main thread**. O envio de um lote de 200 eventos não bloqueia um
único frame do jogo. Num servidor com "performance max", o overhead disto é
indistinguível de zero — plugins comuns como Kits, Clans ou TruePVE fazem
mais trabalho por frame do que o StatsHub faz por minuto.

O que realmente come performance num servidor de Rust (para comparação):
entidades (bases gigantes), contagem de jogadores (o loop de física/IA), e
plugins mal escritos que fazem queries síncronas a MySQL no main thread —
**é exatamente por isso que a nossa base de dados está no site**, não no
servidor de jogo.

## O caminho completo de uma gema

```
[Servidor de jogo]                              [Site (PC de casa)]
jogador joga 5 min
  └─ timer: evento {session, 300 s} → fila
     (30 s depois) Flush():
  └─ POST /api/ingest  ────────────────────────►  addPlaytime(+300 s)
                                                  addGems(+83 gemas)
                                                  playtime_wipe (+300 s p/ peso de voto)

jogador abre o site, faz login Steam
  └─ vê saldo em /loja, resgata "queue skip"
                                                  wallets.gems -= 15000
                                                  redemptions: pendente

[Servidor de jogo]
poll a cada 60 s:
  └─ GET /api/plugin/redemptions ───────────────►  devolve o comando, marca "enviado"
  └─ executa: oxide.usergroup add <steamid> queueskip
  └─ POST .../complete ─────────────────────────►  marca "entregue"
```

## Anti-abuso

- O site aceita no máximo **6 h por evento de sessão** (sanidade contra bugs
  ou tentativas de forjar pedidos — que de qualquer forma exigem a chave de API).
- As gemas só se ganham com o plugin ligado — não há endpoint público que as crie.
- Jogador AFK ganha gemas? Sim, se estiver ligado — como na Rustoria. Se quiseres
  caça ao AFK, o plugin gratuito **Playtime Tracker** (uMod) deteta AFK e podes
  cruzar os dados; não vale a complexidade no arranque.
- Resgates: o saldo é verificado e descontado numa única operação no SQLite
  (síncrono, sem race conditions), e cada resgate fica registado com estado
  (`pending → sent → delivered/failed`) visível no /admin.

## Configuração

No site (`server/config.json`):
```json
"gemsPerHour": 1000
```

No plugin (`oxide/config/StatsHub.json`):
```json
"Playtime credit interval (seconds)": 300.0,
"Deliver store rewards (runs commands)": true,
"Reward poll interval (seconds)": 60.0
```

Os itens da loja editam-se em `server/store-items.json` (nome, custo, e o
comando de consola a executar — vazio = entrega manual pela staff). O site
sincroniza no arranque.
