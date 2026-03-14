import { useEffect, useState, useCallback } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, AreaChart, Area, Legend,
} from 'recharts';
import { Activity, AlertTriangle, Clock, TrendingUp, RefreshCw } from 'lucide-react';
import {
  getGlobalSummary, getServiceHealth, getServiceTimeSeries, getCircuitBreakers,
} from '../api';
import StatCard from '../components/StatCard';

interface Summary {
  totalRequests: number;
  totalErrors: number;
  totalBlocked: number;
  errorRate: number;
  uptimeMs: number;
}

interface ServiceHealth {
  serviceId: string;
  state: string;
  uptime: number;
  errorRate: number;
  avgLatencyMs: number;
  requestCount: number;
}

interface CB {
  serviceId: string;
  state: string;
  failureCount: number;
  openedAt: number | null;
}

interface Bucket {
  timestamp: string;
  total: number;
  success: number;
  error: number;
  avgLatencyMs: number;
}

const STATE_COLOR: Record<string, string> = {
  CLOSED:    'bg-emerald-500',
  OPEN:      'bg-red-500',
  HALF_OPEN: 'bg-yellow-500',
};

function formatUptime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}h ${m}m`;
}

export default function Dashboard() {
  const [summary,    setSummary]    = useState<Summary | null>(null);
  const [services,   setServices]   = useState<ServiceHealth[]>([]);
  const [cbs,        setCbs]        = useState<CB[]>([]);
  const [timeSeries, setTimeSeries] = useState<Bucket[]>([]);
  const [selectedSvc, setSelectedSvc] = useState('user-service');
  const [loading,    setLoading]    = useState(true);
  const [lastRefresh, setLastRefresh] = useState(new Date());

  const refresh = useCallback(async () => {
    try {
      const [sumRes, svcRes, cbRes] = await Promise.all([
        getGlobalSummary(),
        getServiceHealth(),
        getCircuitBreakers(),
      ]);
      setSummary(sumRes.data);
      setServices(svcRes.data);
      setCbs(cbRes.data);
      setLastRefresh(new Date());
    } catch (err) {
      console.error('Dashboard fetch error', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshTimeSeries = useCallback(async () => {
    try {
      const to   = new Date().toISOString();
      const from = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const res  = await getServiceTimeSeries(selectedSvc, from, to);
      setTimeSeries(res.data.buckets ?? []);
    } catch (err) {
      console.error('Timeseries fetch error', err);
    }
  }, [selectedSvc]);

  useEffect(() => {
    refresh();
    refreshTimeSeries();
    const interval = setInterval(() => { refresh(); refreshTimeSeries(); }, 15_000);
    return () => clearInterval(interval);
  }, [refresh, refreshTimeSeries]);

  useEffect(() => { refreshTimeSeries(); }, [refreshTimeSeries]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <RefreshCw className="animate-spin text-brand-500" size={32} />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Gateway Dashboard</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Last updated: {lastRefresh.toLocaleTimeString()}
          </p>
        </div>
        <button
          onClick={() => { refresh(); refreshTimeSeries(); }}
          className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm text-gray-300 transition-colors"
        >
          <RefreshCw size={14} />
          Refresh
        </button>
      </div>

      {/* Global Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Requests"
          value={summary?.totalRequests.toLocaleString() ?? '—'}
          icon={<Activity size={16} />}
          color="blue"
        />
        <StatCard
          label="Error Rate"
          value={summary ? `${(summary.errorRate * 100).toFixed(1)}%` : '—'}
          icon={<AlertTriangle size={16} />}
          color={summary && summary.errorRate > 0.05 ? 'red' : 'green'}
        />
        <StatCard
          label="Blocked Requests"
          value={summary?.totalBlocked.toLocaleString() ?? '—'}
          icon={<TrendingUp size={16} />}
          color="yellow"
        />
        <StatCard
          label="Uptime"
          value={summary ? formatUptime(summary.uptimeMs) : '—'}
          icon={<Clock size={16} />}
          color="green"
        />
      </div>

      {/* Time Series Chart */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-white">Request Volume (last 60 min)</h2>
          <select
            value={selectedSvc}
            onChange={(e) => setSelectedSvc(e.target.value)}
            className="bg-gray-800 border border-gray-700 text-sm text-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            {services.map((s) => (
              <option key={s.serviceId} value={s.serviceId}>{s.serviceId}</option>
            ))}
          </select>
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={timeSeries} margin={{ left: -10 }}>
            <defs>
              <linearGradient id="colorSuccess" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#10b981" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="colorError" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#ef4444" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
            <XAxis dataKey="timestamp" tick={{ fontSize: 10, fill: '#6b7280' }} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: '#6b7280' }} tickLine={false} axisLine={false} />
            <Tooltip
              contentStyle={{ backgroundColor: '#111827', border: '1px solid #1f2937', borderRadius: 8 }}
              labelStyle={{ color: '#9ca3af', fontSize: 11 }}
              itemStyle={{ fontSize: 12 }}
            />
            <Legend wrapperStyle={{ fontSize: 12, color: '#9ca3af' }} />
            <Area type="monotone" dataKey="success" stroke="#10b981" fill="url(#colorSuccess)" strokeWidth={2} name="Success" />
            <Area type="monotone" dataKey="error"   stroke="#ef4444" fill="url(#colorError)"   strokeWidth={2} name="Error" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Latency Chart */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
        <h2 className="text-sm font-semibold text-white mb-4">Avg Latency (ms)</h2>
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={timeSeries} margin={{ left: -10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
            <XAxis dataKey="timestamp" tick={{ fontSize: 10, fill: '#6b7280' }} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: '#6b7280' }} tickLine={false} axisLine={false} />
            <Tooltip
              contentStyle={{ backgroundColor: '#111827', border: '1px solid #1f2937', borderRadius: 8 }}
              labelStyle={{ color: '#9ca3af', fontSize: 11 }}
            />
            <Line type="monotone" dataKey="avgLatencyMs" stroke="#6366f1" strokeWidth={2} dot={false} name="Latency (ms)" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Services + Circuit Breakers */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Service Health */}
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
          <h2 className="text-sm font-semibold text-white mb-4">Service Health</h2>
          <div className="space-y-3">
            {services.map((svc) => (
              <div key={svc.serviceId} className="flex items-center justify-between py-2 border-b border-gray-800 last:border-0">
                <div>
                  <p className="text-sm font-medium text-white">{svc.serviceId}</p>
                  <p className="text-xs text-gray-500">{svc.requestCount} requests · {svc.avgLatencyMs}ms avg</p>
                </div>
                <div className="text-right">
                  <p className={`text-sm font-semibold ${svc.errorRate > 0.05 ? 'text-red-400' : 'text-emerald-400'}`}>
                    {(svc.uptime * 100).toFixed(1)}% uptime
                  </p>
                  <p className="text-xs text-gray-500">{(svc.errorRate * 100).toFixed(1)}% errors</p>
                </div>
              </div>
            ))}
            {services.length === 0 && (
              <p className="text-sm text-gray-500 text-center py-4">No traffic yet</p>
            )}
          </div>
        </div>

        {/* Circuit Breakers */}
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
          <h2 className="text-sm font-semibold text-white mb-4">Circuit Breakers</h2>
          <div className="space-y-3">
            {cbs.map((cb) => (
              <div key={cb.serviceId} className="flex items-center justify-between py-2 border-b border-gray-800 last:border-0">
                <div className="flex items-center gap-3">
                  <span className={`w-2.5 h-2.5 rounded-full ${STATE_COLOR[cb.state] ?? 'bg-gray-500'}`} />
                  <div>
                    <p className="text-sm font-medium text-white">{cb.serviceId}</p>
                    <p className="text-xs text-gray-500">{cb.failureCount} failures</p>
                  </div>
                </div>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                  cb.state === 'CLOSED'    ? 'bg-emerald-500/20 text-emerald-400' :
                  cb.state === 'OPEN'      ? 'bg-red-500/20 text-red-400' :
                                             'bg-yellow-500/20 text-yellow-400'
                }`}>
                  {cb.state}
                </span>
              </div>
            ))}
            {cbs.length === 0 && (
              <p className="text-sm text-gray-500 text-center py-4">No circuit breakers registered</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
