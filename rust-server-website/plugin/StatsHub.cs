using System;
using System.Collections.Generic;
using System.Linq;
using Newtonsoft.Json;
using Oxide.Core.Libraries;
using UnityEngine;

namespace Oxide.Plugins
{
    [Info("StatsHub", "LusoRust", "1.0.0")]
    [Description("Envia kills, sessões, farm e heartbeats para o site de estatísticas do servidor")]
    public class StatsHub : RustPlugin
    {
        #region Configuração

        private PluginConfig _config;

        private class PluginConfig
        {
            [JsonProperty("Url do site (sem barra final)")]
            public string SiteUrl = "http://127.0.0.1:8080";

            [JsonProperty("Chave de API (apiKey do config.json do site)")]
            public string ApiKey = "COLOCA-AQUI-A-CHAVE";

            [JsonProperty("Intervalo de envio de eventos (segundos)")]
            public float FlushInterval = 30f;

            [JsonProperty("Intervalo do heartbeat (segundos)")]
            public float HeartbeatInterval = 60f;

            [JsonProperty("Registar farm de recursos")]
            public bool TrackGather = true;
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
        private readonly Dictionary<ulong, float> _sessionStart = new Dictionary<ulong, float>();
        private readonly Dictionary<ulong, Dictionary<string, int>> _gather = new Dictionary<ulong, Dictionary<string, int>>();
        private Timer _flushTimer, _heartbeatTimer;

        private static long Now() => DateTimeOffset.UtcNow.ToUnixTimeSeconds();

        #endregion

        #region Ciclo de vida

        private void OnServerInitialized()
        {
            if (_config.ApiKey == "COLOCA-AQUI-A-CHAVE")
                PrintWarning("Configura a chave de API em oxide/config/StatsHub.json!");

            foreach (var player in BasePlayer.activePlayerList)
                _sessionStart[player.userID] = Time.realtimeSinceStartup;

            _flushTimer = timer.Every(_config.FlushInterval, Flush);
            _heartbeatTimer = timer.Every(_config.HeartbeatInterval, SendHeartbeat);
            SendHeartbeat();
        }

        private void Unload()
        {
            foreach (var player in BasePlayer.activePlayerList)
                CloseSession(player);
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

        #region Hooks de jogo

        private void OnPlayerConnected(BasePlayer player)
        {
            if (player == null) return;
            _sessionStart[player.userID] = Time.realtimeSinceStartup;
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
            CloseSession(player);
        }

        private void CloseSession(BasePlayer player)
        {
            float start;
            if (!_sessionStart.TryGetValue(player.userID, out start)) return;
            _sessionStart.Remove(player.userID);
            var seconds = (int)(Time.realtimeSinceStartup - start);
            Enqueue(new Dictionary<string, object>
            {
                ["type"] = "session",
                ["ts"] = Now(),
                ["steamId"] = player.UserIDString,
                ["name"] = player.displayName,
                ["seconds"] = seconds,
            });
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
            var major = victim.lastDamage;
            return major.ToString();
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
            var batch = _queue.ToList();
            _queue.Clear();

            Post("/api/ingest", new Dictionary<string, object> { ["events"] = batch }, success =>
            {
                if (!success)
                {
                    // devolve à fila para tentar de novo no próximo flush (com limite)
                    if (batch.Count + _queue.Count <= 2000)
                        _queue.InsertRange(0, batch);
                }
            });
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
                if (!ok) PrintWarning($"POST {path} falhou ({code}): {response}");
                callback?.Invoke(ok);
            }, this, RequestMethod.POST, headers, 10f);
        }

        #endregion
    }
}
