using System;
using System.Collections.Generic;
using System.Linq;
using Newtonsoft.Json;
using Oxide.Core.Libraries;
using UnityEngine;

namespace Oxide.Plugins
{
    [Info("StatsHub", "Rustworthy", "1.2.0")]
    [Description("Sends kills, sessions, farming and heartbeats to the stats website and delivers store rewards")]
    public class StatsHub : RustPlugin
    {
        #region Configuração

        private PluginConfig _config;

        private class PluginConfig
        {
            [JsonProperty("Site URL (no trailing slash)")]
            public string SiteUrl = "http://127.0.0.1:8080";

            [JsonProperty("API key (apiKey from the site config.json)")]
            public string ApiKey = "PUT-YOUR-KEY-HERE";

            [JsonProperty("Event flush interval (seconds)")]
            public float FlushInterval = 30f;

            [JsonProperty("Heartbeat interval (seconds)")]
            public float HeartbeatInterval = 60f;

            [JsonProperty("Playtime credit interval (seconds)")]
            public float CreditInterval = 300f;

            [JsonProperty("Track resource gathering")]
            public bool TrackGather = true;

            [JsonProperty("Track raids (destroyed structures)")]
            public bool TrackRaids = true;

            [JsonProperty("Deliver store rewards (runs commands)")]
            public bool ExecuteRedemptions = true;

            [JsonProperty("Reward poll interval (seconds)")]
            public float RedemptionPollInterval = 60f;
        }

        protected override void LoadDefaultConfig() => _config = new PluginConfig();

        protected override void LoadConfig()
        {
            base.LoadConfig();
            try { _config = Config.ReadObject<PluginConfig>() ?? new PluginConfig(); }
            catch { _config = new PluginConfig(); }
            SaveConfig();
        }

        protected override void SaveConfig() => Config.WriteObject(_config);

        #endregion

        #region Estado

        private readonly List<Dictionary<string, object>> _queue = new List<Dictionary<string, object>>();
        private readonly Dictionary<ulong, float> _lastCredit = new Dictionary<ulong, float>();
        private readonly Dictionary<ulong, Dictionary<string, int>> _gather = new Dictionary<ulong, Dictionary<string, int>>();

        private static long Now() => DateTimeOffset.UtcNow.ToUnixTimeSeconds();

        #endregion

        #region Ciclo de vida

        private void OnServerInitialized()
        {
            if (_config.ApiKey == "PUT-YOUR-KEY-HERE")
                PrintWarning("Set the API key in oxide/config/StatsHub.json!");

            foreach (var player in BasePlayer.activePlayerList)
                _lastCredit[player.userID] = UnityEngine.Time.realtimeSinceStartup;

            timer.Every(_config.FlushInterval, Flush);
            timer.Every(_config.HeartbeatInterval, SendHeartbeat);
            timer.Every(_config.CreditInterval, CreditPlaytime);
            timer.Every(_config.CreditInterval, SendTeams);
            if (_config.ExecuteRedemptions)
                timer.Every(_config.RedemptionPollInterval, PollRedemptions);
            SendHeartbeat();
        }

        private void Unload()
        {
            foreach (var player in BasePlayer.activePlayerList.ToList())
                CreditPlayer(player);
            Flush();
        }

        // Wipe novo (novo save) — avisa o site para abrir uma wipe nova
        private void OnNewSave(string filename)
        {
            Post("/api/wipe", new Dictionary<string, object>
            {
                ["mapSeed"] = World.Seed.ToString(),
                ["mapSize"] = World.Size,
                ["label"] = $"Wipe {DateTime.UtcNow:yyyy-MM-dd}",
            });
        }

        #endregion

        #region Tempo de jogo (crédito periódico -> gemas quase em tempo real)

        // Em vez de esperar pelo disconnect (perde-se tudo se o servidor crashar),
        // creditamos o tempo em fatias regulares. Custo: iterar a lista de
        // jogadores 1x a cada CreditInterval — desprezável.
        private void CreditPlaytime()
        {
            foreach (var player in BasePlayer.activePlayerList)
                CreditPlayer(player);
        }

        private void CreditPlayer(BasePlayer player)
        {
            if (player == null) return;
            float last;
            if (!_lastCredit.TryGetValue(player.userID, out last))
            {
                _lastCredit[player.userID] = UnityEngine.Time.realtimeSinceStartup;
                return;
            }
            var seconds = (int)(UnityEngine.Time.realtimeSinceStartup - last);
            _lastCredit[player.userID] = UnityEngine.Time.realtimeSinceStartup;
            if (seconds <= 0) return;
            Enqueue(new Dictionary<string, object>
            {
                ["type"] = "session",
                ["ts"] = Now(),
                ["steamId"] = player.UserIDString,
                ["name"] = player.displayName,
                ["seconds"] = seconds,
            });
        }

        #endregion

        #region Hooks de jogo

        private void OnPlayerConnected(BasePlayer player)
        {
            if (player == null) return;
            _lastCredit[player.userID] = UnityEngine.Time.realtimeSinceStartup;
            Enqueue(new Dictionary<string, object>
            {
                ["type"] = "connect",
                ["ts"] = Now(),
                ["steamId"] = player.UserIDString,
                ["name"] = player.displayName,
            });
        }

        private void OnPlayerDisconnected(BasePlayer player, string reason)
        {
            if (player == null) return;
            CreditPlayer(player);
            _lastCredit.Remove(player.userID);
        }

        private void OnPlayerDeath(BasePlayer victim, HitInfo info)
        {
            if (victim == null || victim.IsNpc) return;

            var attacker = info?.InitiatorPlayer;
            var ts = Now();

            // Morte PVP: atacante é um jogador real e não é a própria vítima
            if (attacker != null && !attacker.IsNpc && attacker.userID != victim.userID)
            {
                Enqueue(new Dictionary<string, object>
                {
                    ["type"] = "kill",
                    ["ts"] = ts,
                    ["attackerId"] = attacker.UserIDString,
                    ["attackerName"] = attacker.displayName,
                    ["victimId"] = victim.UserIDString,
                    ["victimName"] = victim.displayName,
                    ["weapon"] = GetWeaponName(info),
                    ["distance"] = Math.Round(Vector3.Distance(attacker.transform.position, victim.transform.position), 1),
                    ["headshot"] = info.isHeadshot,
                    ["bodypart"] = info.boneName ?? "",
                    // posição da vítima -> heatmap de mortes no site
                    ["posX"] = Math.Round(victim.transform.position.x, 1),
                    ["posZ"] = Math.Round(victim.transform.position.z, 1),
                });
                return;
            }

            // Morte PVE / ambiente
            Enqueue(new Dictionary<string, object>
            {
                ["type"] = "pve_death",
                ["ts"] = ts,
                ["victimId"] = victim.UserIDString,
                ["victimName"] = victim.displayName,
                ["cause"] = GetDeathCause(victim, info),
            });
        }

        private static string GetWeaponName(HitInfo info)
        {
            var item = info?.Weapon?.GetItem();
            if (item != null) return item.info.displayName.english;
            if (info?.WeaponPrefab != null) return info.WeaponPrefab.ShortPrefabName;
            return "desconhecida";
        }

        private static string GetDeathCause(BasePlayer victim, HitInfo info)
        {
            if (info?.Initiator != null && info.Initiator != victim)
                return info.Initiator.ShortPrefabName;
            return victim.lastDamage.ToString();
        }

        // Estruturas destruídas (raids) e eventos do mapa (Heli/Bradley abatidos)
        private void OnEntityDeath(BaseCombatEntity entity, HitInfo info)
        {
            if (entity == null) return;
            var attacker = info?.InitiatorPlayer;
            if (attacker == null || attacker.IsNpc) return;

            // Patrol Helicopter / Bradley APC abatidos -> "caçadores" no site
            if (entity is PatrolHelicopter || entity is BradleyAPC)
            {
                Enqueue(new Dictionary<string, object>
                {
                    ["type"] = "mapevent",
                    ["ts"] = Now(),
                    ["kind"] = entity is PatrolHelicopter ? "heli" : "bradley",
                    ["steamId"] = attacker.UserIDString,
                    ["name"] = attacker.displayName,
                    ["posX"] = Math.Round(entity.transform.position.x, 1),
                    ["posZ"] = Math.Round(entity.transform.position.z, 1),
                });
                return;
            }

            if (!_config.TrackRaids) return;
            if (!(entity is BuildingBlock) && !(entity is Door)) return;

            var block = entity as BuildingBlock;
            Enqueue(new Dictionary<string, object>
            {
                ["type"] = "raid",
                ["ts"] = Now(),
                ["attackerId"] = attacker.UserIDString,
                ["attackerName"] = attacker.displayName,
                ["entity"] = entity.ShortPrefabName,
                ["grade"] = block != null ? block.grade.ToString() : "door",
                ["weapon"] = info.WeaponPrefab != null ? info.WeaponPrefab.ShortPrefabName : GetWeaponName(info),
                ["posX"] = Math.Round(entity.transform.position.x, 1),
                ["posZ"] = Math.Round(entity.transform.position.z, 1),
            });
        }

        // Crate hackeada (Oil Rig / Cargo) -> "Fast Hands" no site.
        // O hack demora ~15 min, por isso o jogador pode já ter saído/morrido
        // quando termina — creditamos pelo SteamID (não precisamos do objeto
        // BasePlayer, que FindByID só devolve para jogadores online).
        private void OnCrateHackEnd(HackableLockedCrate crate)
        {
            if (crate == null) return;
            var hackerId = crate.originalHackerPlayerId;
            if (hackerId == 0) return;
            var hacker = BasePlayer.FindByID(hackerId);          // online?
                       ?? BasePlayer.FindSleeping(hackerId);      // ou a dormir
            Enqueue(new Dictionary<string, object>
            {
                ["type"] = "mapevent",
                ["ts"] = Now(),
                ["kind"] = "crate",
                ["steamId"] = hackerId.ToString(),
                ["name"] = hacker != null ? hacker.displayName : null,
                ["posX"] = Math.Round(crate.transform.position.x, 1),
                ["posZ"] = Math.Round(crate.transform.position.z, 1),
            });
        }

        private void OnDispenserGathered(ResourceDispenser dispenser, BaseEntity entity, Item item)
        {
            if (!_config.TrackGather) return;
            var player = entity as BasePlayer;
            if (player == null || item == null) return;
            AddGather(player.userID, item.info.shortname, item.amount);
        }

        private void OnCollectiblePickup(CollectibleEntity collectible, BasePlayer player)
        {
            if (!_config.TrackGather || player == null || collectible?.itemList == null) return;
            foreach (var item in collectible.itemList)
                AddGather(player.userID, item.itemDef.shortname, (int)item.amount);
        }

        private void AddGather(ulong userId, string resource, int amount)
        {
            Dictionary<string, int> perPlayer;
            if (!_gather.TryGetValue(userId, out perPlayer))
                _gather[userId] = perPlayer = new Dictionary<string, int>();
            int current;
            perPlayer.TryGetValue(resource, out current);
            perPlayer[resource] = current + amount;
        }

        // Snapshot das equipas nativas do Rust (vanilla) -> leaderboard de equipas
        private void SendTeams()
        {
            var mgr = RelationshipManager.ServerInstance;
            if (mgr == null || mgr.teams == null || mgr.teams.Count == 0) return;

            var teams = new List<Dictionary<string, object>>();
            foreach (var kv in mgr.teams)
            {
                var team = kv.Value;
                if (team?.members == null || team.members.Count < 2) continue;
                teams.Add(new Dictionary<string, object>
                {
                    ["id"] = team.teamID.ToString(),
                    ["leader"] = team.teamLeader.ToString(),
                    ["members"] = team.members.Select(m => m.ToString()).ToList(),
                });
                if (teams.Count >= 200) break;
            }
            if (teams.Count == 0) return;
            Enqueue(new Dictionary<string, object>
            {
                ["type"] = "teams",
                ["ts"] = Now(),
                ["teams"] = teams,
            });
        }

        #endregion

        #region Recompensas da loja (site -> jogo)

        private class RedemptionRow
        {
            [JsonProperty("id")] public int Id;
            [JsonProperty("steam_id")] public string SteamId;
            [JsonProperty("command")] public string Command;
        }

        private class RedemptionResponse
        {
            [JsonProperty("rows")] public List<RedemptionRow> Rows;
        }

        private void PollRedemptions()
        {
            var url = _config.SiteUrl.TrimEnd('/') + "/api/plugin/redemptions";
            var headers = new Dictionary<string, string> { ["X-API-Key"] = _config.ApiKey };
            webrequest.Enqueue(url, null, (code, response) =>
            {
                if (code < 200 || code >= 300 || string.IsNullOrEmpty(response)) return;
                RedemptionResponse data;
                try { data = JsonConvert.DeserializeObject<RedemptionResponse>(response); }
                catch { return; }
                if (data?.Rows == null) return;
                foreach (var row in data.Rows)
                {
                    var ok = true;
                    try
                    {
                        Puts($"Reward #{row.Id} for {row.SteamId}: {row.Command}");
                        ConsoleSystem.Run(ConsoleSystem.Option.Server.Quiet(), row.Command);
                    }
                    catch (Exception ex)
                    {
                        ok = false;
                        PrintWarning($"Reward #{row.Id} failed: {ex.Message}");
                    }
                    Post("/api/plugin/redemptions/complete", new Dictionary<string, object>
                    {
                        ["id"] = row.Id,
                        ["ok"] = ok,
                    });
                }
            }, this, RequestMethod.GET, headers, 10f);
        }

        #endregion

        #region Envio para o site

        private void Enqueue(Dictionary<string, object> evt)
        {
            _queue.Add(evt);
            if (_queue.Count >= 400) Flush(); // não deixar crescer demasiado
        }

        private void Flush()
        {
            // agregar farm acumulado como eventos "gather"
            foreach (var kv in _gather)
            {
                foreach (var res in kv.Value)
                {
                    _queue.Add(new Dictionary<string, object>
                    {
                        ["type"] = "gather",
                        ["ts"] = Now(),
                        ["steamId"] = kv.Key.ToString(),
                        ["resource"] = res.Key,
                        ["amount"] = res.Value,
                    });
                }
            }
            _gather.Clear();

            if (_queue.Count == 0) return;

            // O site aceita no máximo 500 eventos por pedido — enviar em pedaços
            // de 250 para nunca perder eventos silenciosamente (mesmo que a fila
            // tenha crescido por causa de retries).
            const int chunkSize = 250;
            var pending = _queue.ToList();
            _queue.Clear();

            for (int i = 0; i < pending.Count; i += chunkSize)
            {
                var batch = pending.GetRange(i, Math.Min(chunkSize, pending.Count - i));
                Post("/api/ingest", new Dictionary<string, object> { ["events"] = batch }, success =>
                {
                    if (!success)
                    {
                        // devolve à fila para tentar de novo no próximo flush (com limite)
                        if (batch.Count + _queue.Count <= 4000)
                            _queue.InsertRange(0, batch);
                    }
                });
            }
        }

        private void SendHeartbeat()
        {
            Post("/api/heartbeat", new Dictionary<string, object>
            {
                ["players"] = BasePlayer.activePlayerList.Count,
                ["maxPlayers"] = ConVar.Server.maxplayers,
                ["queued"] = ServerMgr.Instance?.connectionQueue?.Queued ?? 0,
                ["joining"] = ServerMgr.Instance?.connectionQueue?.Joining ?? 0,
                ["fps"] = Performance.report.frameRate,
                ["entities"] = BaseNetworkable.serverEntities.Count,
                ["map"] = $"{World.Name} {World.Size} (seed {World.Seed})",
            });
        }

        private void Post(string path, Dictionary<string, object> payload, Action<bool> callback = null)
        {
            var url = _config.SiteUrl.TrimEnd('/') + path;
            var body = JsonConvert.SerializeObject(payload);
            var headers = new Dictionary<string, string>
            {
                ["Content-Type"] = "application/json",
                ["X-API-Key"] = _config.ApiKey,
            };
            webrequest.Enqueue(url, body, (code, response) =>
            {
                var ok = code >= 200 && code < 300;
                if (!ok) PrintWarning($"POST {path} failed ({code}): {response}");
                callback?.Invoke(ok);
            }, this, RequestMethod.POST, headers, 10f);
        }

        #endregion
    }
}
