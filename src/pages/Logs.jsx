import React, { useState, useEffect, useMemo } from 'react';
import {
  Search, Filter, Calendar, Download, Eye,
  AlertTriangle, CheckCircle, Ban, Activity,
  X, MapPin, Clock, Camera,
} from 'lucide-react';
import { ref, onValue, update } from 'firebase/database';
import { database } from '../firebase';

// ── Investigation Modal ───────────────────────────────────────────────────────
const EventModal = ({ event, onClose, onUpdateStatus }) => {
  if (!event) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      <div className="relative bg-slate-900 border border-slate-700 w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-slate-800 bg-slate-900">
          <div>
            <h3 className="text-xl font-bold text-white flex items-center gap-2">
              Investigation Details
              <span className="text-slate-500 text-sm font-normal">#{event.alert_id}</span>
            </h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X size={24} />
          </button>
        </div>

        {/* Snapshot */}
        <div className="relative h-64 bg-black w-full group">
          <img
            src={event.snapshot_url || 'https://via.placeholder.com/600/0f172a/ffffff?text=No+Snapshot'}
            alt="Evidence"
            className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity"
          />
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-slate-900 to-transparent p-6 pt-12">
            <span className="bg-indigo-600 text-white px-3 py-1 rounded text-xs font-bold tracking-wide uppercase">
              AI Detected: {event.alert_type}
            </span>
          </div>
        </div>

        {/* Details grid */}
        <div className="grid grid-cols-2 gap-6 p-6 bg-slate-800/30">
          <div className="space-y-1">
            <label className="text-xs text-slate-500 uppercase tracking-wider font-semibold flex items-center gap-2">
              <Clock size={14} /> Timestamp
            </label>
            <p className="text-slate-200 font-mono text-sm">
              {event.timestamp_iso
                ? new Date(event.timestamp_iso).toLocaleString()
                : '—'}
            </p>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-slate-500 uppercase tracking-wider font-semibold flex items-center gap-2">
              <Camera size={14} /> Source Camera
            </label>
            <p className="text-slate-200 text-sm font-medium">{event.camera_id || '—'}</p>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-slate-500 uppercase tracking-wider font-semibold flex items-center gap-2">
              <Activity size={14} /> Severity
            </label>
            <p className="text-slate-200 text-sm font-medium capitalize">{event.severity || '—'}</p>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-slate-500 uppercase tracking-wider font-semibold flex items-center gap-2">
              <MapPin size={14} /> Current Status
            </label>
            <div className="text-sm">
              {event.status === 'acknowledged' && <span className="text-red-400 font-bold">Acknowledged Threat</span>}
              {event.status === 'resolved'     && <span className="text-emerald-400 font-bold">Resolved</span>}
              {event.status === 'open'         && <span className="text-yellow-400 font-bold">Open</span>}
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div className="p-6 border-t border-slate-800 bg-slate-900 flex justify-end gap-3">
          <button
            onClick={() => onUpdateStatus(event.camera_id, event.alert_id, 'resolved')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2
              ${event.status === 'resolved'
                ? 'bg-emerald-900/50 text-emerald-500 border border-emerald-500/50'
                : 'bg-slate-800 text-slate-300 hover:bg-emerald-900/30 hover:text-emerald-400'}`}
          >
            <CheckCircle size={16} /> Mark as Resolved
          </button>
          <button
            onClick={() => onUpdateStatus(event.camera_id, event.alert_id, 'acknowledged')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2
              ${event.status === 'acknowledged'
                ? 'bg-red-900/50 text-red-500 border border-red-500/50'
                : 'bg-slate-800 text-slate-300 hover:bg-red-900/30 hover:text-red-400'}`}
          >
            <AlertTriangle size={16} /> Acknowledge Threat
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Main Component ────────────────────────────────────────────────────────────
const Logs = () => {
  const [logs, setLogs]                 = useState([]);
  const [loading, setLoading]           = useState(true);
  const [searchTerm, setSearchTerm]     = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFilter, setDateFilter]     = useState('');
  const [selectedEvent, setSelectedEvent] = useState(null);

  // ── Realtime Database listener ───────────────────────────────────────
  // Alerts are nested: /alerts/{camera_id}/{alert_id} — flatten for the table.
  useEffect(() => {
    const alertsRef = ref(database, '/alerts');
    const unsubscribe = onValue(
      alertsRef,
      (snapshot) => {
        const data = snapshot.val();
        const docs = [];
        if (data) {
          Object.values(data).forEach(cameraAlerts => {
            Object.values(cameraAlerts).forEach(alert => docs.push(alert));
          });
        }
        // Sort newest first using timestamp_iso
        docs.sort((a, b) => {
          const ta = a.timestamp_iso ? new Date(a.timestamp_iso) : new Date(0);
          const tb = b.timestamp_iso ? new Date(b.timestamp_iso) : new Date(0);
          return tb - ta;
        });
        setLogs(docs);
        setLoading(false);
      },
      (err) => {
        console.error('[Logs] Realtime DB error:', err);
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  // ── Update Realtime Database document AND local state ────────────────
  const handleUpdateStatus = async (cameraId, alertId, newStatus) => {
    // Optimistic local update so the UI responds immediately
    setLogs(prev => prev.map(log =>
      log.alert_id === alertId ? { ...log, status: newStatus } : log
    ));
    setSelectedEvent(prev => ({ ...prev, status: newStatus }));

    try {
      await update(ref(database, `/alerts/${cameraId}/${alertId}`), { status: newStatus });
    } catch (err) {
      console.error('[Logs] Failed to update Realtime DB:', err);
      // Roll back on failure
      setLogs(prev => prev.map(log =>
        log.alert_id === alertId ? { ...log, status: log.status } : log
      ));
    }
  };

  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      const cameraId = log.camera_id || '';
      const alertId  = log.alert_id  || '';
      const matchesSearch = (
        cameraId.toLowerCase().includes(searchTerm.toLowerCase()) ||
        alertId.toLowerCase().includes(searchTerm.toLowerCase())
      );
      const matchesStatus = statusFilter === 'all' || log.status === statusFilter;
      const ts = log.timestamp_iso || '';
      const matchesDate = dateFilter === '' || ts.startsWith(dateFilter);
      return matchesSearch && matchesStatus && matchesDate;
    });
  }, [logs, searchTerm, statusFilter, dateFilter]);

  const handleExportCSV = () => {
    const headers = ['Event ID', 'Camera', 'Alert Type', 'Severity', 'Status', 'Timestamp'];
    const rows = filteredLogs.map(log => [
      log.alert_id   || '',
      log.camera_id  || '',
      log.alert_type || '',
      log.severity   || '',
      log.status     || '',
      log.timestamp_iso || '',
    ]);

    const csv = [headers, ...rows]
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `secureguard-events-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'acknowledged': return <span className="bg-red-500/20 text-red-400 px-3 py-1 rounded-full text-xs font-medium flex items-center w-fit gap-1"><AlertTriangle size={12}/> Acknowledged</span>;
      case 'resolved':     return <span className="bg-emerald-500/20 text-emerald-400 px-3 py-1 rounded-full text-xs font-medium flex items-center w-fit gap-1"><CheckCircle size={12}/> Resolved</span>;
      default:             return <span className="bg-yellow-500/20 text-yellow-400 px-3 py-1 rounded-full text-xs font-medium flex items-center w-fit gap-1"><Activity size={12}/> Open</span>;
    }
  };

  return (
    <div className="space-y-6 relative">
      {selectedEvent && (
        <EventModal
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
          onUpdateStatus={handleUpdateStatus}
        />
      )}

      {/* Header */}
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-2xl font-bold text-white">Events Log</h2>
          <p className="text-slate-400">Review and audit detection history</p>
        </div>
        <button
          onClick={handleExportCSV}
          disabled={filteredLogs.length === 0}
          className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
        >
          <Download size={18} /> Export CSV
        </button>
      </div>

      {/* Filters */}
      <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 flex flex-wrap gap-4 items-center">
        <div className="flex-1 relative min-w-50">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
          <input
            type="text"
            placeholder="Search camera or event ID…"
            className="w-full bg-slate-800 border border-slate-700 text-white pl-10 pr-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="relative">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
          <select
            className="bg-slate-800 border border-slate-700 text-white pl-10 pr-8 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 appearance-none cursor-pointer"
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
          >
            <option value="all">All Statuses</option>
            <option value="acknowledged">Acknowledged Threats</option>
            <option value="resolved">Resolved</option>
            <option value="open">Open</option>
          </select>
        </div>
        <div className="relative">
          <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
          <input
            type="date"
            className="bg-slate-800 border border-slate-700 text-slate-300 pl-10 pr-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 scheme-dark"
            value={dateFilter}
            onChange={e => setDateFilter(e.target.value)}
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden shadow-xl">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-950 text-slate-400 border-b border-slate-800 text-sm uppercase tracking-wider">
              <th className="p-4 font-semibold">Event</th>
              <th className="p-4 font-semibold">Camera</th>
              <th className="p-4 font-semibold">Alert Type</th>
              <th className="p-4 font-semibold">Severity</th>
              <th className="p-4 font-semibold">Status</th>
              <th className="p-4 font-semibold text-right">Action</th>
            </tr>
          </thead>
          <tbody className="text-slate-300 text-sm divide-y divide-slate-800">
            {loading && (
              <tr>
                <td colSpan="6" className="p-8 text-center text-slate-500">
                  Loading alerts from Realtime Database…
                </td>
              </tr>
            )}

            {!loading && filteredLogs.map(log => {
              const ts = log.timestamp_iso ? new Date(log.timestamp_iso) : new Date(0);
              return (
                <tr key={log.alert_id} className="hover:bg-slate-800/50 transition-colors group">
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-slate-800 rounded-md overflow-hidden border border-slate-700">
                        <img
                          src={log.snapshot_url || 'https://via.placeholder.com/48/0f172a/ffffff?text=+'}
                          alt="Thumb"
                          className="w-full h-full object-cover opacity-70 group-hover:opacity-100 transition-opacity"
                        />
                      </div>
                      <div>
                        <div className="font-bold text-white">{log.alert_id}</div>
                        <div className="text-xs text-slate-500">{ts.toLocaleTimeString()}</div>
                      </div>
                    </div>
                  </td>
                  <td className="p-4 font-medium">{log.camera_id || '—'}</td>
                  <td className="p-4 capitalize">{log.alert_type || '—'}</td>
                  <td className="p-4">
                    <span className={`text-xs px-2 py-0.5 rounded font-medium capitalize
                      ${log.severity === 'high'   ? 'bg-red-900/60 text-red-300'     :
                        log.severity === 'medium' ? 'bg-amber-900/60 text-amber-300' :
                                                    'bg-slate-700 text-slate-400'}`}>
                      {log.severity || '—'}
                    </span>
                  </td>
                  <td className="p-4">{getStatusBadge(log.status)}</td>
                  <td className="p-4 text-right">
                    <button
                      onClick={() => setSelectedEvent(log)}
                      className="text-slate-400 hover:text-indigo-400 p-2 hover:bg-slate-700 rounded-lg transition-all"
                      title="View Details"
                    >
                      <Eye size={18} />
                    </button>
                  </td>
                </tr>
              );
            })}

            {!loading && filteredLogs.length === 0 && (
              <tr>
                <td colSpan="6" className="p-8 text-center text-slate-500">
                  <div className="flex flex-col items-center gap-2">
                    <Ban size={32} />
                    <p>No logs found matching your filters.</p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Logs;
