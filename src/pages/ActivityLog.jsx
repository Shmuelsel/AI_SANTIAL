import React, { useState, useEffect } from 'react';
import { ref, onValue } from 'firebase/database';
import { database } from '../firebase';
import {
  Calendar, Camera, Clock, AlertTriangle,
  Activity, Users, MapPin, RefreshCw,
} from 'lucide-react';
import { getScoreStyle, ALERT_TYPE_COLORS } from '../utils/alertHelpers';

import { SERVER_URL } from '../config';
const CAMERA_IDS  = ['CAM_1001', 'CAM_1002', 'CAM_1003'];

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Format a total-seconds integer as HH:MM:SS */
function formatDuration(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return [h, m, sec].map(v => String(v).padStart(2, '0')).join(':');
}

/** Coloured chip showing the peak total_person_score */
const RiskChip = ({ score }) => {
  const { text, bg } = getScoreStyle(score);
  return (
    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${bg} ${text}`}>
      {score}
    </span>
  );
};

// ── Main Component ────────────────────────────────────────────────────────────

const ActivityLog = () => {
  const todayISO  = new Date().toISOString().slice(0, 10);   // "YYYY-MM-DD"
  const todayKey  = todayISO.replace(/-/g, '');               // "YYYYMMDD"

  const [dateFilter, setDateFilter] = useState(todayISO);
  const [cameraId,   setCameraId]   = useState(CAMERA_IDS[0]);
  const [entries,    setEntries]    = useState([]);
  const [loading,    setLoading]    = useState(false);

  const isToday = dateFilter === todayISO;

  // ── Option A: Firebase real-time subscription (today only) ────────────────
  useEffect(() => {
    if (!isToday) return;
    setLoading(true);
    setEntries([]);

    const logRef   = ref(database, `/activity_log/${todayKey}/${cameraId}`);
    const unsub    = onValue(
      logRef,
      (snap) => {
        setEntries(snap.val() ? Object.values(snap.val()) : []);
        setLoading(false);
      },
      (err) => {
        console.error('[ActivityLog] Firebase error:', err);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [isToday, cameraId, todayKey]);

  // ── Option B: REST fetch for historical dates ──────────────────────────────
  useEffect(() => {
    if (isToday) return;
    let cancelled = false;

    const fetchHistorical = async () => {
      setLoading(true);
      setEntries([]);
      try {
        const params = new URLSearchParams({ date: dateFilter, camera_id: cameraId });
        const res    = await fetch(`${SERVER_URL}/api/activity-log?${params}`);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
        }
        const json = await res.json();
        if (!cancelled) setEntries(json.entries ?? []);
      } catch (err) {
        console.error('[ActivityLog] REST error:', err);
        if (!cancelled) setEntries([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchHistorical();
    return () => { cancelled = true; };
  }, [isToday, dateFilter, cameraId]);

  return (
    <div className="space-y-6">

      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-white">Activity Log</h2>
        <p className="text-slate-400">Daily per-person activity summary per camera</p>
      </div>

      {/* Filters bar */}
      <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 flex flex-wrap gap-4 items-center">

        {/* Date picker */}
        <div className="relative">
          <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
          <input
            type="date"
            value={dateFilter}
            max={todayISO}
            onChange={e => setDateFilter(e.target.value)}
            className="bg-slate-800 border border-slate-700 text-slate-300 pl-10 pr-4 py-2 rounded-lg
                       focus:outline-none focus:ring-2 focus:ring-indigo-500 scheme-dark text-sm"
          />
        </div>

        {/* Camera selector */}
        <div className="relative">
          <Camera className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
          <select
            value={cameraId}
            onChange={e => setCameraId(e.target.value)}
            className="bg-slate-800 border border-slate-700 text-white pl-10 pr-8 py-2 rounded-lg
                       focus:outline-none focus:ring-2 focus:ring-indigo-500 appearance-none cursor-pointer text-sm"
          >
            {CAMERA_IDS.map(id => (
              <option key={id} value={id}>{id}</option>
            ))}
          </select>
        </div>

        {/* Live indicator / entry count */}
        <div className="ml-auto flex items-center gap-3">
          {isToday && (
            <span className="flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-900/30 border border-emerald-800/50 px-3 py-1 rounded-full">
              <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
              Live
            </span>
          )}
          <span className="text-sm text-slate-400 font-mono">
            {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
          </span>
        </div>
      </div>

      {/* Table */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-950 text-slate-400 border-b border-slate-800 text-xs uppercase tracking-wider">
                <th className="p-4 font-semibold">
                  <span className="flex items-center gap-1.5"><Users size={13} /> Person ID</span>
                </th>
                <th className="p-4 font-semibold">
                  <span className="flex items-center gap-1.5"><Clock size={13} /> First Seen</span>
                </th>
                <th className="p-4 font-semibold">
                  <span className="flex items-center gap-1.5"><Clock size={13} /> Last Seen</span>
                </th>
                <th className="p-4 font-semibold">Time on Camera</th>
                <th className="p-4 font-semibold">
                  <span className="flex items-center gap-1.5"><AlertTriangle size={13} /> Alerts</span>
                </th>
                <th className="p-4 font-semibold">
                  <span className="flex items-center gap-1.5"><Activity size={13} /> Peak Risk</span>
                </th>
                <th className="p-4 font-semibold">
                  <span className="flex items-center gap-1.5"><MapPin size={13} /> Zones Visited</span>
                </th>
              </tr>
            </thead>

            <tbody className="text-slate-300 text-sm divide-y divide-slate-800">

              {/* Loading state */}
              {loading && (
                <tr>
                  <td colSpan="7" className="p-10 text-center text-slate-500">
                    <div className="flex items-center justify-center gap-2">
                      <RefreshCw className="animate-spin" size={18} />
                      <span>Loading activity log…</span>
                    </div>
                  </td>
                </tr>
              )}

              {/* Empty state */}
              {!loading && entries.length === 0 && (
                <tr>
                  <td colSpan="7" className="p-10 text-center text-slate-500">
                    <div className="flex flex-col items-center gap-2">
                      <Users size={36} className="opacity-20" />
                      <p>No activity recorded for <span className="font-mono">{cameraId}</span> on {dateFilter}</p>
                    </div>
                  </td>
                </tr>
              )}

              {/* Data rows */}
              {!loading && entries.map(entry => {
                const firstSeen  = entry.first_seen_iso ? new Date(entry.first_seen_iso) : null;
                const lastSeen   = entry.last_seen_iso  ? new Date(entry.last_seen_iso)  : null;
                const peakScore  = entry.peak_scores?.total_person_score ?? 0;
                const alertTypes = entry.alerts_triggered ?? [];
                const zones      = entry.zones_visited    ?? [];

                return (
                  <tr key={entry.log_id} className="hover:bg-slate-800/50 transition-colors">

                    {/* Person ID */}
                    <td className="p-4 font-bold text-white">{entry.global_id}</td>

                    {/* First Seen */}
                    <td className="p-4 font-mono text-xs text-slate-300">
                      {firstSeen
                        ? <>{firstSeen.toLocaleDateString()} <span className="text-slate-500">{firstSeen.toLocaleTimeString()}</span></>
                        : '—'}
                    </td>

                    {/* Last Seen */}
                    <td className="p-4 font-mono text-xs text-slate-300">
                      {lastSeen
                        ? <>{lastSeen.toLocaleDateString()} <span className="text-slate-500">{lastSeen.toLocaleTimeString()}</span></>
                        : '—'}
                    </td>

                    {/* Time on Camera */}
                    <td className="p-4 font-mono text-slate-200">
                      {formatDuration(entry.total_time_seconds ?? 0)}
                    </td>

                    {/* Alerts: count + type badges */}
                    <td className="p-4">
                      <div className="flex flex-wrap gap-1 items-center">
                        <span className="text-slate-400 text-xs font-mono mr-0.5">
                          {entry.alert_count ?? 0}×
                        </span>
                        {alertTypes.map(type => (
                          <span
                            key={type}
                            className={`text-[10px] px-1.5 py-0.5 rounded capitalize font-medium
                              ${ALERT_TYPE_COLORS[type] ?? 'bg-slate-700 text-slate-400'}`}
                          >
                            {type}
                          </span>
                        ))}
                        {alertTypes.length === 0 && (
                          <span className="text-[10px] text-slate-600">none</span>
                        )}
                      </div>
                    </td>

                    {/* Peak Risk Score */}
                    <td className="p-4">
                      <RiskChip score={peakScore} />
                    </td>

                    {/* Zones Visited */}
                    <td className="p-4 text-slate-400 text-xs max-w-xs">
                      {zones.length > 0 ? zones.join(', ') : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>

                  </tr>
                );
              })}

            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ActivityLog;
