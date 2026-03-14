import { useEffect, useState, useCallback } from 'react';
import { Shield, RefreshCw, Trash2, Ban } from 'lucide-react';
import { getRateLimitConfig, getRateLimitStats, getBlockedIPs, blockIP, unblockIP } from '../api';

interface RateLimitTier {
  windowMs:    number;
  maxRequests: number;
  ttlSeconds:  number;
}

interface RateLimitConfig {
  ip:     RateLimitTier;
  user:   RateLimitTier;
  apiKey: RateLimitTier;
}

interface IPStat {
  ip:    string;
  count: number;
}

export default function RateLimits() {
  const [config,       setConfig]       = useState<RateLimitConfig | null>(null);
  const [stats,        setStats]        = useState<{ topBlockedIPs: IPStat[]; blockedTotal: number } | null>(null);
  const [blockedIPs,   setBlockedIPs]   = useState<string[]>([]);
  const [newIP,        setNewIP]        = useState('');
  const [loading,      setLoading]      = useState(true);
  const [actionIP,     setActionIP]     = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [cfgRes, statsRes, blockedRes] = await Promise.all([
        getRateLimitConfig(),
        getRateLimitStats(),
        getBlockedIPs(),
      ]);
      setConfig(cfgRes.data);
      setStats(statsRes.data);
      setBlockedIPs(blockedRes.data.blocked ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 20_000);
    return () => clearInterval(id);
  }, [refresh]);

  const handleBlock = async () => {
    if (!newIP.trim()) return;
    try {
      await blockIP(newIP.trim());
      setNewIP('');
      await refresh();
    } catch (err) {
      console.error('Block IP error', err);
    }
  };

  const handleUnblock = async (ip: string) => {
    setActionIP(ip);
    try { await unblockIP(ip); await refresh(); }
    finally { setActionIP(null); }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <RefreshCw className="animate-spin text-brand-500" size={28} />
      </div>
    );
  }

  const tiers = config
    ? [
        { label: 'Per IP (unauthenticated)', key: 'ip',     data: config.ip },
        { label: 'Per User (authenticated)', key: 'user',   data: config.user },
        { label: 'Per API Key',              key: 'apiKey', data: config.apiKey },
      ]
    : [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Shield className="text-brand-500" size={20} />
          <h1 className="text-xl font-bold text-white">Rate Limits</h1>
        </div>
        <button
          onClick={refresh}
          className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm text-gray-300 transition-colors"
        >
          <RefreshCw size={14} />
          Refresh
        </button>
      </div>

      {/* Rate Limit Tiers */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {tiers.map(({ label, data }) => (
          <div key={label} className="bg-gray-900 rounded-xl border border-gray-800 p-5">
            <p className="text-xs text-gray-400 uppercase tracking-wider mb-3">{label}</p>
            <p className="text-3xl font-bold text-white">{data.maxRequests}</p>
            <p className="text-sm text-gray-400 mt-1">
              requests / {Math.round(data.windowMs / 1000)}s window
            </p>
            <div className="mt-4 pt-4 border-t border-gray-800 space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Window</span>
                <span className="text-gray-300">{data.windowMs / 1000}s</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">TTL</span>
                <span className="text-gray-300">{data.ttlSeconds}s</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Top Blocked IPs */}
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-white">Top Rate-Limited IPs</h2>
            <span className="text-xs text-gray-500">{stats?.blockedTotal ?? 0} total blocks</span>
          </div>
          <div className="space-y-2">
            {stats?.topBlockedIPs.map(({ ip, count }) => (
              <div key={ip} className="flex items-center justify-between py-1.5">
                <span className="text-sm font-mono text-gray-300">{ip}</span>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-yellow-400 font-semibold">{count}×</span>
                  <button
                    onClick={() => handleBlock()}
                    className="text-xs text-red-400 hover:text-red-300 transition-colors"
                    title="Block this IP"
                  >
                    <Ban size={13} />
                  </button>
                </div>
              </div>
            ))}
            {!stats?.topBlockedIPs.length && (
              <p className="text-sm text-gray-500 text-center py-4">No rate limit hits yet</p>
            )}
          </div>
        </div>

        {/* Manually Blocked IPs */}
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
          <h2 className="text-sm font-semibold text-white mb-4">Manually Blocked IPs</h2>

          {/* Add IP form */}
          <div className="flex gap-2 mb-4">
            <input
              type="text"
              value={newIP}
              onChange={(e) => setNewIP(e.target.value)}
              placeholder="e.g. 192.168.1.1"
              onKeyDown={(e) => e.key === 'Enter' && handleBlock()}
              className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <button
              onClick={handleBlock}
              disabled={!newIP.trim()}
              className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-sm rounded-lg transition-colors disabled:opacity-40"
            >
              Block
            </button>
          </div>

          <div className="space-y-2 max-h-64 overflow-y-auto">
            {blockedIPs.map((ip) => (
              <div key={ip} className="flex items-center justify-between py-1.5 border-b border-gray-800 last:border-0">
                <span className="text-sm font-mono text-red-400">{ip}</span>
                <button
                  onClick={() => handleUnblock(ip)}
                  disabled={actionIP === ip}
                  className="text-gray-500 hover:text-gray-300 transition-colors disabled:opacity-40"
                  title="Unblock"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
            {blockedIPs.length === 0 && (
              <p className="text-sm text-gray-500 text-center py-4">No manually blocked IPs</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
