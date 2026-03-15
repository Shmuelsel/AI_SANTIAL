import React, { useState, useEffect } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, AreaChart, Area,
} from 'recharts';
import { ShieldCheck, AlertTriangle, Activity, Eye } from 'lucide-react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

const Dashboard = () => {
  const [currentTime, setCurrentTime] = useState(new Date());

  // Live stats derived from Firestore
  const [stats, setStats] = useState({
    total: '—', falseAlarms: '—', threats: '—', cameras: '—',
  });

  // Chart data: alerts grouped by hour
  const [chartData, setChartData] = useState([]);

  // System health from backend REST API
  const [health, setHealth] = useState({
    serverLoad: 0, dbStorage: 0, aiLatency: 0, network: 0,
  });

  // ── Clock ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // ── Firestore real-time stats ──────────────────────────────────────────
  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, 'alerts'),
      (snapshot) => {
        const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

        const total       = docs.length;
        const falseAlarms = docs.filter(d => d.status === 'false_alarm').length;
        const threats     = docs.filter(d => d.status === 'confirmed').length;

        setStats({ total, falseAlarms, threats, cameras: '—' });

        // Group by hour for the trend chart
        const buckets = {};
        docs.forEach(alert => {
          const raw = alert.timestamp;
          const ts  = raw?.toDate ? raw.toDate() : new Date(raw ?? 0);
          const key = `${ts.getHours().toString().padStart(2, '0')}:00`;
          if (!buckets[key]) buckets[key] = { name: key, total: 0, falseAlarm: 0 };
          buckets[key].total++;
          if (alert.status === 'false_alarm') buckets[key].falseAlarm++;
        });

        const sorted = Object.values(buckets).sort((a, b) =>
          a.name.localeCompare(b.name)
        );
        setChartData(sorted);
      },
      (err) => console.error('[Dashboard] Firestore error:', err)
    );
    return () => unsubscribe();
  }, []);

  // ── Backend health metrics ─────────────────────────────────────────────
  useEffect(() => {
    const fetchHealth = async () => {
      try {
        const res  = await fetch(`${API_BASE_URL}/api/health`);
        if (!res.ok) throw new Error(res.statusText);
        const data = await res.json();
        setHealth({
          serverLoad: data.serverLoad  ?? 0,
          dbStorage:  data.dbStorage   ?? 0,
          aiLatency:  data.aiLatency   ?? 0,
          network:    data.network     ?? 0,
        });
      } catch {
        // Backend not yet running – silently keep zeros
      }
    };
    fetchHealth();
    // Refresh health every 30 s
    const interval = setInterval(fetchHealth, 30_000);
    return () => clearInterval(interval);
  }, []);

  // ── Active camera count from backend ──────────────────────────────────
  useEffect(() => {
    const fetchCameras = async () => {
      try {
        const res  = await fetch(`${API_BASE_URL}/api/cameras`);
        if (!res.ok) throw new Error(res.statusText);
        const data = await res.json();
        const online = (data.cameras ?? []).filter(c => c.status === 'Online').length;
        const total  = (data.cameras ?? []).length;
        setStats(prev => ({ ...prev, cameras: `${online}/${total}` }));
      } catch {
        setStats(prev => ({ ...prev, cameras: 'N/A' }));
      }
    };
    fetchCameras();
  }, []);

  return (
    <div className="w-full space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">System Overview</h2>
        <p className="text-slate-400">Real-time surveillance statistics</p>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Total Alerts"
          value={String(stats.total)}
          subValue="All-time detections"
          icon={Activity}
          color="blue"
        />
        <StatCard
          title="False Alarms"
          value={String(stats.falseAlarms)}
          subValue={
            typeof stats.total === 'number' && stats.total > 0
              ? `${((stats.falseAlarms / stats.total) * 100).toFixed(0)}% of total`
              : '—'
          }
          icon={AlertTriangle}
          color="red"
        />
        <StatCard
          title="Verified Threats"
          value={String(stats.threats)}
          subValue="Operator-confirmed"
          icon={ShieldCheck}
          color="green"
        />
        <StatCard
          title="Active Cameras"
          value={stats.cameras}
          subValue="Online / total"
          icon={Eye}
          color="indigo"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-96">
        {/* Trend chart */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl">
          <h3 className="text-lg font-semibold text-white mb-6">
            Detection Trend (today, by hour)
          </h3>
          <div className="h-72 w-full">
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0}   />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="name" stroke="#64748b" />
                  <YAxis stroke="#64748b" />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', color: '#fff' }}
                  />
                  <Area
                    type="monotone"
                    dataKey="total"
                    stroke="#6366f1"
                    strokeWidth={3}
                    fillOpacity={1}
                    fill="url(#colorTotal)"
                  />
                  <Line
                    type="monotone"
                    dataKey="falseAlarm"
                    stroke="#ef4444"
                    strokeWidth={2}
                    dot={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-slate-500 text-sm">
                No alert data yet
              </div>
            )}
          </div>
        </div>

        {/* System health */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl">
          <h3 className="text-lg font-semibold text-white mb-4">System Health</h3>
          <div className="space-y-6 mt-8">
            <HealthBar label="Server Load"       percent={health.serverLoad} color="bg-emerald-500" />
            <HealthBar label="Database Storage"  percent={health.dbStorage}  color="bg-yellow-500" />
            <HealthBar label="AI Model Latency"  percent={health.aiLatency}  color="bg-blue-500"   />
            <HealthBar label="Network Traffic"   percent={health.network}    color="bg-purple-500" />
          </div>

          <div className="mt-8 p-4 bg-slate-800/50 rounded-lg border border-slate-700">
            <p className="text-sm text-slate-400">Last system check:</p>
            <p className="text-white font-mono text-sm">{currentTime.toLocaleString()}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Sub-components ────────────────────────────────────────────────────────────
const StatCard = ({ title, value, subValue, icon: Icon, color }) => {
  const colorClasses = {
    blue:   'bg-blue-500/10 text-blue-500',
    red:    'bg-red-500/10 text-red-500',
    green:  'bg-emerald-500/10 text-emerald-500',
    indigo: 'bg-indigo-500/10 text-indigo-500',
  };
  return (
    <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl hover:shadow-lg transition-all hover:scale-[1.02]">
      <div className="flex justify-between items-start mb-4">
        <div>
          <p className="text-slate-400 text-sm font-medium">{title}</p>
          <h4 className="text-3xl font-bold text-white mt-1">{value}</h4>
        </div>
        <div className={`p-3 rounded-lg ${colorClasses[color]}`}>
          <Icon size={24} />
        </div>
      </div>
      <p className="text-xs text-slate-500">{subValue}</p>
    </div>
  );
};

const HealthBar = ({ label, percent, color }) => (
  <div>
    <div className="flex justify-between text-sm mb-1">
      <span className="text-slate-300">{label}</span>
      <span className="text-slate-400">{percent}%</span>
    </div>
    <div className="w-full bg-slate-800 rounded-full h-2">
      <div className={`h-2 rounded-full ${color}`} style={{ width: `${percent}%` }} />
    </div>
  </div>
);

export default Dashboard;
