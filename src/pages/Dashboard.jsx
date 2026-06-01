import React, { useState, useEffect } from 'react';
import {
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, AreaChart, Area,
  PieChart, Pie, Cell, Legend,
  BarChart, Bar,
} from 'recharts';
import { ShieldCheck, AlertTriangle, Activity, Eye } from 'lucide-react';
import { ref, onValue } from 'firebase/database';
import { database } from '../firebase';
import { SERVER_URL as API_BASE_URL } from '../config';

// ── Design tokens ─────────────────────────────────────────────────────────────
const CARD_CLS  = 'bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl';
const AXIS_CLR  = '#64748b';
const GRID_CLR  = '#1e293b';

// Colour map for each trigger type — mirrors alertHelpers TRIGGER_LABELS
const TRIGGER_PALETTE = {
  CLIMBING:  '#ef4444',   // red
  LOITERING: '#f59e0b',   // amber
  COMBINED:  '#a855f7',   // purple
  INTRUSION: '#f97316',   // orange
  UNKNOWN:   '#64748b',   // slate fallback
};

// ── Shared Recharts tooltip ───────────────────────────────────────────────────
const DarkTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 shadow-xl text-sm">
      {label && <p className="text-slate-400 text-xs mb-1">{label}</p>}
      {payload.map(p => (
        <p key={p.dataKey ?? p.name} className="text-white font-semibold">
          {p.name ?? p.dataKey}: {p.value}
        </p>
      ))}
    </div>
  );
};

const PieTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const { name, value } = payload[0];
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 shadow-xl text-sm">
      <p className="text-slate-300 font-semibold capitalize">{name}</p>
      <p className="text-white">{value} alert{value !== 1 ? 's' : ''}</p>
    </div>
  );
};

// ── Pie legend rendered below the chart ──────────────────────────────────────
const renderPieLegend = (props) => {
  const { payload } = props;
  return (
    <ul className="flex flex-wrap justify-center gap-x-4 gap-y-1 mt-2">
      {payload.map(entry => (
        <li key={entry.value} className="flex items-center gap-1.5 text-xs text-slate-400">
          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: entry.color }} />
          {entry.value}
        </li>
      ))}
    </ul>
  );
};

// ── Empty state placeholder ────────────────────────────────────────────────────
const EmptyChart = ({ message = 'No data yet' }) => (
  <div className="flex items-center justify-center h-full text-slate-500 text-sm select-none">
    {message}
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
const Dashboard = () => {
  const [currentTime, setCurrentTime] = useState(new Date());

  // KPI card values (derived from Realtime DB + /api/stats)
  const [stats, setStats] = useState({
    total: '—', falseAlarms: '—', threats: '—', cameras: '—',
  });

  // ── Chart state ────────────────────────────────────────────────────────────
  // Row 1 – existing trend chart
  const [chartData, setChartData] = useState([]);

  // Row 2 – three new analysis charts
  const [triggerData, setTriggerData] = useState([]); // { name, value }[]
  const [cameraData,  setCameraData]  = useState([]); // { name, count }[]
  const [zoneData,    setZoneData]    = useState([]); // { name, count }[]

  // System health bars
  const [health, setHealth] = useState({
    serverLoad: 0, dbStorage: 0, aiLatency: 0, network: 0,
  });

  // ── Clock ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // ── Firebase Realtime DB – single listener drives ALL charts ──────────────
  useEffect(() => {
    const alertsRef = ref(database, '/alerts');
    const unsubscribe = onValue(
      alertsRef,
      (snapshot) => {
        const data = snapshot.val();
        // Flatten nested /alerts/{camera_id}/{alert_id}
        const docs = [];
        if (data) {
          Object.values(data).forEach(cameraAlerts => {
            Object.values(cameraAlerts).forEach(alert => docs.push(alert));
          });
        }

        // ── KPI cards ───────────────────────────────────────────────────
        const total       = docs.length;
        const falseAlarms = docs.filter(d => d.status === 'resolved').length;
        const threats     = docs.filter(d => d.status === 'acknowledged').length;
        setStats(prev => ({ ...prev, total, falseAlarms, threats }));

        // ── Trend chart: alerts bucketed by hour ─────────────────────────
        const buckets = {};
        docs.forEach(alert => {
          const ts  = alert.timestamp_iso ? new Date(alert.timestamp_iso) : new Date(0);
          const key = `${ts.getHours().toString().padStart(2, '0')}:00`;
          if (!buckets[key]) buckets[key] = { name: key, total: 0, falseAlarm: 0 };
          buckets[key].total++;
          if (alert.status === 'resolved') buckets[key].falseAlarm++;
        });
        setChartData(
          Object.values(buckets).sort((a, b) => a.name.localeCompare(b.name))
        );

        // ── Chart 1: Trigger-type distribution ──────────────────────────
        // Group by trigger_type; fall back to 'UNKNOWN' when field is absent.
        const triggerCounts = {};
        docs.forEach(alert => {
          const key = alert.trigger_type ?? 'UNKNOWN';
          triggerCounts[key] = (triggerCounts[key] ?? 0) + 1;
        });
        setTriggerData(
          Object.entries(triggerCounts)
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value)
        );

        // ── Chart 2: Alerts per camera ───────────────────────────────────
        const cameraCounts = {};
        docs.forEach(alert => {
          const key = alert.camera_id ?? 'Unknown';
          cameraCounts[key] = (cameraCounts[key] ?? 0) + 1;
        });
        setCameraData(
          Object.entries(cameraCounts)
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count)
        );

        // ── Chart 3: Top zones by alert frequency ────────────────────────
        // Only alerts that include location.zone_name are counted.
        const zoneCounts = {};
        docs.forEach(alert => {
          const zone = alert.location?.zone_name;
          if (zone) zoneCounts[zone] = (zoneCounts[zone] ?? 0) + 1;
        });
        setZoneData(
          Object.entries(zoneCounts)
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 6)
        );
      },
      (err) => console.error('[Dashboard] Realtime DB error:', err)
    );
    return () => unsubscribe();
  }, []);

  // ── GET /api/stats – authoritative total + health bars ────────────────────
  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res  = await fetch(`${API_BASE_URL}/api/stats`);
        if (!res.ok) throw new Error(res.statusText);
        const data = await res.json();

        if (data.total_alerts != null) {
          setStats(prev => ({ ...prev, total: data.total_alerts }));
        }

        const sh = data.system_health ?? {};
        setHealth({
          serverLoad: sh.cpu_load   ?? sh.serverLoad  ?? 0,
          dbStorage:  sh.db_storage ?? sh.dbStorage   ?? 0,
          aiLatency:  sh.ai_latency ?? sh.aiLatency   ?? 0,
          network:    sh.network                      ?? 0,
        });

        if (Array.isArray(data.detection_trend) && data.detection_trend.length > 0) {
          setChartData(data.detection_trend);
        }
      } catch (err) {
        console.error('[Dashboard] /api/stats error:', err);
      }
    };
    fetchStats();
    const interval = setInterval(fetchStats, 30_000);
    return () => clearInterval(interval);
  }, []);

  // ── Camera count ───────────────────────────────────────────────────────────
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

  // ── Derived value used in StatCard subValue ────────────────────────────────
  const resolvedPct =
    typeof stats.total === 'number' && stats.total > 0
      ? `${((stats.falseAlarms / stats.total) * 100).toFixed(0)}% of total`
      : '—';

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="w-full space-y-8">

      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div>
        <h2 className="text-2xl font-bold text-white">System Overview</h2>
        <p className="text-slate-400">Real-time surveillance statistics</p>
      </div>

      {/* ── KPI cards ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Total Alerts"
          value={String(stats.total)}
          subValue="All-time detections"
          icon={Activity}
          color="blue"
        />
        <StatCard
          title="Resolved Alerts"
          value={String(stats.falseAlarms)}
          subValue={resolvedPct}
          icon={AlertTriangle}
          color="red"
        />
        <StatCard
          title="Acknowledged Threats"
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

      {/* ── Row 1: Detection trend + System health ───────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Trend chart */}
        <div className={`${CARD_CLS} lg:col-span-2`}>
          <h3 className="text-lg font-semibold text-white mb-6">
            Detection Trend <span className="text-slate-500 text-sm font-normal">(today, by hour)</span>
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
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_CLR} />
                  <XAxis dataKey="name" stroke={AXIS_CLR} tick={{ fontSize: 12 }} />
                  <YAxis stroke={AXIS_CLR} tick={{ fontSize: 12 }} allowDecimals={false} />
                  <Tooltip
                    content={<DarkTooltip />}
                    cursor={{ stroke: '#334155', strokeWidth: 1 }}
                  />
                  <Area
                    type="monotone"
                    dataKey="total"
                    name="Total"
                    stroke="#6366f1"
                    strokeWidth={3}
                    fillOpacity={1}
                    fill="url(#colorTotal)"
                  />
                  <Area
                    type="monotone"
                    dataKey="falseAlarm"
                    name="Resolved"
                    stroke="#ef4444"
                    strokeWidth={2}
                    fill="none"
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart message="No alert data yet" />
            )}
          </div>
        </div>

        {/* System health */}
        <div className={CARD_CLS}>
          <h3 className="text-lg font-semibold text-white mb-4">System Health</h3>
          <div className="space-y-6 mt-8">
            <HealthBar label="Server Load"      percent={health.serverLoad} color="bg-emerald-500" />
            <HealthBar label="Database Storage" percent={health.dbStorage}  color="bg-yellow-500"  />
            <HealthBar label="AI Model Latency" percent={health.aiLatency}  color="bg-blue-500"    />
            <HealthBar label="Network Traffic"  percent={health.network}    color="bg-purple-500"  />
          </div>
          <div className="mt-8 p-4 bg-slate-800/50 rounded-lg border border-slate-700">
            <p className="text-sm text-slate-400">Last system check:</p>
            <p className="text-white font-mono text-sm">{currentTime.toLocaleString()}</p>
          </div>
        </div>
      </div>

      {/* ── Row 2: Alert intelligence charts ─────────────────────────────── */}
      <div>
        <div className="mb-4">
          <h3 className="text-lg font-semibold text-white">Alert Intelligence</h3>
          <p className="text-slate-500 text-sm">Segmentation analysis across all collected alerts</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">

          {/* ── Chart 1: Trigger-type distribution (Donut) ─────────────── */}
          <div className={CARD_CLS}>
            <h4 className="text-base font-semibold text-white mb-1">
              Trigger Distribution
            </h4>
            <p className="text-xs text-slate-500 mb-4">Breakdown by detected behaviour type</p>

            <div className="h-56">
              {triggerData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={triggerData}
                      cx="50%"
                      cy="45%"
                      innerRadius="45%"
                      outerRadius="68%"
                      paddingAngle={3}
                      dataKey="value"
                      nameKey="name"
                      strokeWidth={0}
                    >
                      {triggerData.map(entry => (
                        <Cell
                          key={entry.name}
                          fill={TRIGGER_PALETTE[entry.name] ?? TRIGGER_PALETTE.UNKNOWN}
                        />
                      ))}
                    </Pie>
                    <Tooltip content={<PieTooltip />} />
                    <Legend content={renderPieLegend} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <EmptyChart message="No trigger data yet" />
              )}
            </div>

            {/* Quick count chips */}
            {triggerData.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-slate-800">
                {triggerData.map(({ name, value }) => (
                  <span
                    key={name}
                    className="flex items-center gap-1.5 text-xs px-2 py-1 rounded-full bg-slate-800 text-slate-300"
                  >
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: TRIGGER_PALETTE[name] ?? TRIGGER_PALETTE.UNKNOWN }}
                    />
                    {name}: <span className="font-bold text-white">{value}</span>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* ── Chart 2: Alerts per camera (Vertical bar) ──────────────── */}
          <div className={CARD_CLS}>
            <h4 className="text-base font-semibold text-white mb-1">
              Alerts per Camera
            </h4>
            <p className="text-xs text-slate-500 mb-4">Total alerts originating from each camera</p>

            <div className="h-56">
              {cameraData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={cameraData} barCategoryGap="30%">
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID_CLR} vertical={false} />
                    <XAxis
                      dataKey="name"
                      stroke={AXIS_CLR}
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      stroke={AXIS_CLR}
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      allowDecimals={false}
                    />
                    <Tooltip
                      content={<DarkTooltip />}
                      cursor={{ fill: '#1e293b' }}
                    />
                    <Bar dataKey="count" name="Alerts" fill="#6366f1" radius={[4, 4, 0, 0]}>
                      {cameraData.map((entry) => {
                        // Highlight the busiest camera
                        const maxCount = Math.max(...cameraData.map(d => d.count));
                        return (
                          <Cell
                            key={entry.name}
                            fill={entry.count === maxCount ? '#818cf8' : '#4f46e5'}
                          />
                        );
                      })}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <EmptyChart message="No camera data yet" />
              )}
            </div>

            {/* Busiest camera callout */}
            {cameraData.length > 0 && (
              <div className="mt-3 pt-3 border-t border-slate-800 flex items-center justify-between text-xs text-slate-500">
                <span>Busiest camera</span>
                <span className="font-semibold text-indigo-400">
                  {cameraData[0].name} ({cameraData[0].count} alerts)
                </span>
              </div>
            )}
          </div>

          {/* ── Chart 3: Top zones (Horizontal bar) ────────────────────── */}
          <div className={CARD_CLS}>
            <h4 className="text-base font-semibold text-white mb-1">
              Top Alert Zones
            </h4>
            <p className="text-xs text-slate-500 mb-4">Most frequently triggered areas (top 6)</p>

            <div className="h-56">
              {zoneData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={zoneData}
                    layout="vertical"
                    barCategoryGap="20%"
                    margin={{ left: 0, right: 16, top: 0, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID_CLR} horizontal={false} />
                    <XAxis
                      type="number"
                      stroke={AXIS_CLR}
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      allowDecimals={false}
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      stroke={AXIS_CLR}
                      tick={{ fontSize: 11, fill: '#94a3b8' }}
                      tickLine={false}
                      axisLine={false}
                      width={90}
                    />
                    <Tooltip
                      content={<DarkTooltip />}
                      cursor={{ fill: '#1e293b' }}
                    />
                    <Bar dataKey="count" name="Alerts" radius={[0, 4, 4, 0]}>
                      {zoneData.map((entry) => {
                        // Gradient intensity: more alerts → brighter cyan
                        const maxCount = Math.max(...zoneData.map(d => d.count));
                        const intensity = maxCount > 0 ? entry.count / maxCount : 1;
                        // Interpolate between #164e63 (dim) and #06b6d4 (bright)
                        const opacity = 0.4 + intensity * 0.6;
                        return (
                          <Cell
                            key={entry.name}
                            fill="#06b6d4"
                            fillOpacity={opacity}
                          />
                        );
                      })}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <EmptyChart message="No zone data yet — alerts need location.zone_name" />
              )}
            </div>

            {/* Top zone callout */}
            {zoneData.length > 0 && (
              <div className="mt-3 pt-3 border-t border-slate-800 flex items-center justify-between text-xs text-slate-500">
                <span>Highest-risk zone</span>
                <span className="font-semibold text-cyan-400">
                  {zoneData[0].name} ({zoneData[0].count} alerts)
                </span>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
};

// ── Sub-components ─────────────────────────────────────────────────────────────

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
