import { useEffect, useState, useCallback } from 'react';
import { Zap, RefreshCw, AlertTriangle, CheckCircle, Minus } from 'lucide-react';
import { getCircuitBreakers, tripCircuit, resetCircuit } from '../api';

interface CB {
  serviceId:       string;
  state:           'CLOSED' | 'OPEN' | 'HALF_OPEN';
  failureCount:    number;
  successCount:    number;
  lastFailureAt:   number | null;
  lastStateChange: number;
  openedAt:        number | null;
  nextAttemptAt:   number | null;
}

const STATE_META = {
  CLOSED:    { label: 'Closed',    color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20', dot: 'bg-emerald-500', icon: CheckCircle },
  OPEN:      { label: 'Open',      color: 'text-red-400',     bg: 'bg-red-500/10 border-red-500/20',         dot: 'bg-red-500',     icon: AlertTriangle },
  HALF_OPEN: { label: 'Half-Open', color: 'text-yellow-400',  bg: 'bg-yellow-500/10 border-yellow-500/20',   dot: 'bg-yellow-500',  icon: Minus },
};

function relativeTime(ts: number | null): string {
  if (!ts) return '—';
  const diff = Date.now() - ts;
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
  return `${Math.floor(diff / 3600_000)}h ago`;
}

export default function CircuitBreakers() {
  const [cbs,     setCbs]     = useState<CB[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting,  setActing]  = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await getCircuitBreakers();
      setCbs(res.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 10_000);
    return () => clearInterval(id);
  }, [refresh]);

  const handleTrip = async (serviceId: string) => {
    setActing(serviceId);
    try { await tripCircuit(serviceId); await refresh(); }
    finally { setActing(null); }
  };

  const handleReset = async (serviceId: string) => {
    setActing(serviceId);
    try { await resetCircuit(serviceId); await refresh(); }
    finally { setActing(null); }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <RefreshCw className="animate-spin text-brand-500" size={28} />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Zap className="text-brand-500" size={20} />
          <h1 className="text-xl font-bold text-white">Circuit Breakers</h1>
        </div>
        <button
          onClick={refresh}
          className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm text-gray-300 transition-colors"
        >
          <RefreshCw size={14} />
          Refresh
        </button>
      </div>

      {/* State legend */}
      <div className="flex gap-4 text-xs text-gray-400">
        {Object.entries(STATE_META).map(([state, meta]) => (
          <div key={state} className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${meta.dot}`} />
            {meta.label}
          </div>
        ))}
      </div>

      {cbs.length === 0 && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-12 text-center">
          <p className="text-gray-400">No circuit breakers registered yet.</p>
          <p className="text-gray-500 text-sm mt-1">Send traffic through the gateway to register services.</p>
        </div>
      )}

      <div className="grid gap-4">
        {cbs.map((cb) => {
          const meta    = STATE_META[cb.state] ?? STATE_META.CLOSED;
          const Icon    = meta.icon;
          const isActing = acting === cb.serviceId;

          return (
            <div key={cb.serviceId} className={`bg-gray-900 rounded-xl border p-5 ${meta.bg}`}>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <span className={`w-3 h-3 rounded-full ${meta.dot} ${cb.state === 'OPEN' ? 'animate-pulse' : ''}`} />
                  <div>
                    <h3 className="font-semibold text-white">{cb.serviceId}</h3>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <Icon size={12} className={meta.color} />
                      <span className={`text-sm font-medium ${meta.color}`}>{meta.label}</span>
                    </div>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => handleTrip(cb.serviceId)}
                    disabled={isActing || cb.state === 'OPEN'}
                    className="px-3 py-1.5 text-xs bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {isActing ? '…' : 'Trip'}
                  </button>
                  <button
                    onClick={() => handleReset(cb.serviceId)}
                    disabled={isActing || cb.state === 'CLOSED'}
                    className="px-3 py-1.5 text-xs bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/30 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {isActing ? '…' : 'Reset'}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-5">
                <div>
                  <p className="text-xs text-gray-500">Failures</p>
                  <p className="text-lg font-bold text-red-400">{cb.failureCount}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Successes</p>
                  <p className="text-lg font-bold text-emerald-400">{cb.successCount}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Last Failure</p>
                  <p className="text-sm text-gray-300">{relativeTime(cb.lastFailureAt)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">
                    {cb.state === 'OPEN' ? 'Retry At' : 'State Changed'}
                  </p>
                  <p className="text-sm text-gray-300">
                    {cb.state === 'OPEN' && cb.nextAttemptAt
                      ? new Date(cb.nextAttemptAt).toLocaleTimeString()
                      : relativeTime(cb.lastStateChange)}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
