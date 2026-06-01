import React, { useState, useEffect, useCallback } from 'react';
import {
  Cctv, Plus, Trash2, RefreshCw, CheckCircle,
  AlertTriangle, X, Wifi, WifiOff, Clock,
} from 'lucide-react';

import { SERVER_URL } from '../config';

// ── Toast helpers ─────────────────────────────────────────────────────────────
let _toastId = 0;

// ── Sub-components ────────────────────────────────────────────────────────────

/** Inline toast bar rendered at the top of the page */
const ToastList = ({ toasts, onDismiss }) => (
  <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 min-w-72 max-w-sm pointer-events-none">
    {toasts.map(t => (
      <div
        key={t.id}
        className={`flex items-start gap-3 px-4 py-3 rounded-xl shadow-2xl border pointer-events-auto
          ${t.type === 'success' ? 'bg-emerald-900/90 border-emerald-700 text-emerald-200' :
            t.type === 'warning' ? 'bg-amber-900/90  border-amber-700  text-amber-200'   :
                                   'bg-red-900/90    border-red-700    text-red-200'}`}
      >
        {t.type === 'success' && <CheckCircle size={18} className="flex-shrink-0 mt-0.5" />}
        {t.type === 'warning' && <AlertTriangle size={18} className="flex-shrink-0 mt-0.5" />}
        {t.type === 'error'   && <X size={18} className="flex-shrink-0 mt-0.5" />}
        <p className="text-sm flex-1">{t.message}</p>
        <button onClick={() => onDismiss(t.id)} className="opacity-60 hover:opacity-100 ml-1">
          <X size={14} />
        </button>
      </div>
    ))}
  </div>
);

/** Status dot + label for camera connection state */
const StatusBadge = ({ status }) => {
  const cfg = {
    connected:    { dot: 'bg-emerald-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]', text: 'text-emerald-400', label: 'Connected'    },
    disconnected: { dot: 'bg-red-500',                                           text: 'text-red-400',     label: 'Disconnected' },
    reconnecting: { dot: 'bg-yellow-500 animate-pulse',                          text: 'text-yellow-400',  label: 'Reconnecting' },
  }[status] ?? { dot: 'bg-slate-600', text: 'text-slate-400', label: status ?? '—' };

  return (
    <div className="flex items-center gap-2">
      <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
      <span className={`text-sm font-medium ${cfg.text}`}>{cfg.label}</span>
    </div>
  );
};

// ── Add / Edit Camera Modal ───────────────────────────────────────────────────

const EMPTY_FORM = {
  camera_id:     '',
  rtsp_url:      '',
  rtsp_username: '',
  rtsp_password: '',
  resolution:    '',
  fps_cap:       '',
};

const CameraFormModal = ({ initial, onClose, onSaved }) => {
  const isEdit            = !!initial;
  const [form,   setForm] = useState(initial ?? EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const set = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
    setErrors(prev => ({ ...prev, [field]: undefined }));
  };

  const validate = () => {
    const e = {};
    if (!form.camera_id.trim())  e.camera_id = 'Camera ID is required';
    if (!form.rtsp_url.trim())   e.rtsp_url  = 'RTSP URL is required';
    else if (!form.rtsp_url.startsWith('rtsp://'))
      e.rtsp_url = 'Must start with rtsp://';
    if (form.fps_cap !== '' && (isNaN(Number(form.fps_cap)) || Number(form.fps_cap) <= 0))
      e.fps_cap = 'Must be a positive number';
    return e;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }

    setSaving(true);
    try {
      const body = {
        camera_id:  form.camera_id.trim(),
        rtsp_url:   form.rtsp_url.trim(),
        ...(form.rtsp_username.trim() && { rtsp_username: form.rtsp_username.trim() }),
        ...(form.rtsp_password.trim() && { rtsp_password: form.rtsp_password.trim() }),
        ...(form.resolution.trim()    && { resolution:    form.resolution.trim()    }),
        ...(form.fps_cap !== ''       && { fps_cap:       Number(form.fps_cap)      }),
      };

      const res  = await fetch(`${SERVER_URL}/api/cameras`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? `HTTP ${res.status}`);

      onSaved(json);   // passes relay_status + camera_id back up
    } catch (err) {
      console.error('[CameraManagement] Save failed:', err);
      setErrors({ _form: err.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-slate-900 border border-slate-700 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden">
        {/* Modal header */}
        <div className="flex justify-between items-center p-6 border-b border-slate-800">
          <h3 className="text-lg font-bold text-white">
            {isEdit ? `Edit ${initial.camera_id}` : 'Register New Camera'}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X size={22} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {errors._form && (
            <p className="text-sm text-red-400 bg-red-900/20 border border-red-800/50 rounded-lg px-3 py-2">
              {errors._form}
            </p>
          )}

          {/* Camera ID */}
          <Field
            label="Camera ID *"
            error={errors.camera_id}
          >
            <input
              type="text"
              value={form.camera_id}
              onChange={e => set('camera_id', e.target.value)}
              disabled={isEdit}
              placeholder="CAM_1001"
              className="input-base disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </Field>

          {/* RTSP URL */}
          <Field label="RTSP URL *" error={errors.rtsp_url}>
            <input
              type="text"
              value={form.rtsp_url}
              onChange={e => set('rtsp_url', e.target.value)}
              placeholder="rtsp://192.168.1.100:554/stream"
              className="input-base font-mono text-sm"
            />
          </Field>

          {/* Credentials row */}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Username" error={errors.rtsp_username}>
              <input
                type="text"
                value={form.rtsp_username}
                onChange={e => set('rtsp_username', e.target.value)}
                placeholder="admin"
                autoComplete="off"
                className="input-base"
              />
            </Field>
            <Field label="Password" error={errors.rtsp_password}>
              <input
                type="password"
                value={form.rtsp_password}
                onChange={e => set('rtsp_password', e.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
                className="input-base"
              />
            </Field>
          </div>

          {/* Resolution + FPS row */}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Resolution" error={errors.resolution}>
              <input
                type="text"
                value={form.resolution}
                onChange={e => set('resolution', e.target.value)}
                placeholder="1920x1080"
                className="input-base font-mono text-sm"
              />
            </Field>
            <Field label="FPS Cap" error={errors.fps_cap}>
              <input
                type="number"
                value={form.fps_cap}
                onChange={e => set('fps_cap', e.target.value)}
                placeholder="25"
                min="1"
                max="120"
                className="input-base"
              />
            </Field>
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm text-slate-300 bg-slate-800 hover:bg-slate-700 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 rounded-lg text-sm font-semibold bg-indigo-600 hover:bg-indigo-700
                         disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors flex items-center gap-2"
            >
              {saving && <RefreshCw className="animate-spin" size={14} />}
              {saving ? 'Saving…' : isEdit ? 'Update Camera' : 'Register Camera'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

/** Tiny form-field wrapper with label + error */
const Field = ({ label, error, children }) => (
  <div className="space-y-1">
    <label className="text-xs text-slate-400 font-medium uppercase tracking-wider">{label}</label>
    {children}
    {error && <p className="text-xs text-red-400">{error}</p>}
  </div>
);

// ── Main Component ────────────────────────────────────────────────────────────

const CameraManagement = () => {
  const [cameras,      setCameras]      = useState([]);
  const [loading,      setLoading]      = useState(false);
  const [showForm,     setShowForm]     = useState(false);
  const [editTarget,   setEditTarget]   = useState(null);   // camera object or null
  const [confirmDelete, setConfirmDelete] = useState(null); // camera_id to delete
  const [toasts,       setToasts]       = useState([]);

  // ── Toast helpers ──────────────────────────────────────────────────────────
  const pushToast = useCallback((message, type = 'success') => {
    const id = ++_toastId;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 6000);
  }, []);

  const dismissToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // ── GET /api/cameras ──────────────────────────────────────────────────────
  const fetchCameras = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch(`${SERVER_URL}/api/cameras`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setCameras(json.cameras ?? []);
    } catch (err) {
      console.error('[CameraManagement] Fetch error:', err);
      pushToast('Failed to load cameras from server.', 'error');
    } finally {
      setLoading(false);
    }
  }, [pushToast]);

  useEffect(() => { fetchCameras(); }, [fetchCameras]);

  // ── Handle save (POST) result ─────────────────────────────────────────────
  const handleSaved = useCallback((result) => {
    if (result.relay_status === 'queued') {
      pushToast(
        `Config saved for ${result.camera_id}. Edge node is offline — will apply on reconnect.`,
        'warning'
      );
    } else {
      pushToast(`${result.camera_id} configured successfully.`, 'success');
    }
    setShowForm(false);
    setEditTarget(null);
    fetchCameras();
  }, [fetchCameras, pushToast]);

  // ── DELETE /api/cameras/:id ───────────────────────────────────────────────
  const handleDelete = async (cameraId) => {
    try {
      const res  = await fetch(`${SERVER_URL}/api/cameras/${cameraId}`, { method: 'DELETE' });
      const json = await res.json();

      if (!res.ok) {
        // Handle CAMERA_CONFIG_NOT_FOUND (404) explicitly (contract §10)
        const code = json?.error?.code;
        if (code === 'CAMERA_CONFIG_NOT_FOUND' || res.status === 404) {
          pushToast(`Camera "${cameraId}" not found. Refreshing list.`, 'warning');
        } else {
          throw new Error(json?.error?.message ?? `HTTP ${res.status}`);
        }
      } else {
        pushToast(`${cameraId} removed successfully.`, 'success');
      }

      fetchCameras();
    } catch (err) {
      console.error('[CameraManagement] Delete error:', err);
      pushToast(`Failed to delete ${cameraId}: ${err.message}`, 'error');
    } finally {
      setConfirmDelete(null);
    }
  };

  const openAdd  = ()   => { setEditTarget(null); setShowForm(true); };
  const openEdit = (cam) => {
    // Pre-fill everything except the password (never returned by GET)
    setEditTarget({
      camera_id:     cam.camera_id,
      rtsp_url:      cam.rtsp_url      ?? '',
      rtsp_username: cam.rtsp_username ?? '',
      rtsp_password: '',            // intentionally blank — never sent back by GET
      resolution:    cam.resolution    ?? '',
      fps_cap:       cam.fps_cap != null ? String(cam.fps_cap) : '',
    });
    setShowForm(true);
  };

  return (
    <>
      <ToastList toasts={toasts} onDismiss={dismissToast} />

      {/* ── Add / Edit form modal ─────────────────────────────────────── */}
      {showForm && (
        <CameraFormModal
          initial={editTarget}
          onClose={() => { setShowForm(false); setEditTarget(null); }}
          onSaved={handleSaved}
        />
      )}

      {/* ── Delete confirmation modal ─────────────────────────────────── */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => setConfirmDelete(null)} />
          <div className="relative bg-slate-900 border border-slate-700 rounded-2xl p-6 shadow-2xl max-w-sm w-full space-y-4">
            <h3 className="text-lg font-bold text-white">Delete Camera?</h3>
            <p className="text-slate-400 text-sm">
              Remove <span className="font-mono text-slate-200">{confirmDelete}</span>? The edge
              node will stop streaming this camera until it is re-registered.
            </p>
            <div className="flex justify-end gap-3 pt-1">
              <button
                onClick={() => setConfirmDelete(null)}
                className="px-4 py-2 rounded-lg text-sm bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(confirmDelete)}
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-red-600 hover:bg-red-700 text-white transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Page content ─────────────────────────────────────────────── */}
      <div className="space-y-6">

        {/* Header */}
        <div className="flex justify-between items-end">
          <div>
            <h2 className="text-2xl font-bold text-white">Camera Management</h2>
            <p className="text-slate-400">Register, configure, and remove cameras</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={fetchCameras}
              disabled={loading}
              title="Refresh camera list"
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors disabled:opacity-50"
            >
              <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
            </button>
            <button
              onClick={openAdd}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors font-medium text-sm"
            >
              <Plus size={18} /> Add Camera
            </button>
          </div>
        </div>

        {/* Camera list */}
        <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden shadow-xl">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-950 text-slate-400 border-b border-slate-800 text-xs uppercase tracking-wider">
                <th className="p-4 font-semibold">Status</th>
                <th className="p-4 font-semibold">Camera ID</th>
                <th className="p-4 font-semibold">RTSP URL</th>
                <th className="p-4 font-semibold">Resolution</th>
                <th className="p-4 font-semibold">FPS Cap</th>
                <th className="p-4 font-semibold">
                  <span className="flex items-center gap-1.5"><Clock size={12} /> Registered</span>
                </th>
                <th className="p-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="text-slate-300 text-sm divide-y divide-slate-800">

              {/* Loading */}
              {loading && (
                <tr>
                  <td colSpan="7" className="p-10 text-center text-slate-500">
                    <div className="flex items-center justify-center gap-2">
                      <RefreshCw className="animate-spin" size={18} />
                      <span>Loading cameras…</span>
                    </div>
                  </td>
                </tr>
              )}

              {/* Empty */}
              {!loading && cameras.length === 0 && (
                <tr>
                  <td colSpan="7" className="p-10 text-center text-slate-500">
                    <div className="flex flex-col items-center gap-3">
                      <Cctv size={40} className="opacity-20" />
                      <p>No cameras registered yet.</p>
                      <button
                        onClick={openAdd}
                        className="text-indigo-400 hover:text-indigo-300 text-sm underline underline-offset-2"
                      >
                        Register the first camera
                      </button>
                    </div>
                  </td>
                </tr>
              )}

              {/* Data rows */}
              {!loading && cameras.map(cam => (
                <tr key={cam.camera_id} className="hover:bg-slate-800/50 transition-colors group">
                  <td className="p-4">
                    <StatusBadge status={cam.status} />
                  </td>
                  <td className="p-4 font-bold text-white font-mono">{cam.camera_id}</td>
                  <td className="p-4 font-mono text-xs text-slate-400 max-w-xs truncate" title={cam.rtsp_url}>
                    {cam.rtsp_url}
                  </td>
                  <td className="p-4 text-slate-300 font-mono text-xs">
                    {cam.resolution ?? <span className="text-slate-600">—</span>}
                  </td>
                  <td className="p-4 text-slate-300">
                    {cam.fps_cap != null ? `${cam.fps_cap} fps` : <span className="text-slate-600">—</span>}
                  </td>
                  <td className="p-4 text-slate-400 text-xs font-mono">
                    {cam.registered_at
                      ? new Date(cam.registered_at).toLocaleString()
                      : '—'}
                  </td>
                  <td className="p-4 text-right">
                    <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => openEdit(cam)}
                        className="text-xs text-indigo-400 hover:text-white hover:bg-indigo-600/30 px-2 py-1 rounded transition-colors font-medium"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => setConfirmDelete(cam.camera_id)}
                        className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-900/30 rounded transition-colors"
                        title="Delete camera"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

            </tbody>
          </table>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-6 text-xs text-slate-500">
          <span className="flex items-center gap-1.5"><Wifi size={13} className="text-emerald-400" /> Connected — streaming normally</span>
          <span className="flex items-center gap-1.5"><WifiOff size={13} className="text-red-400" /> Disconnected — edge node offline or RTSP unreachable</span>
          <span className="text-slate-600">Password is never shown in GET responses (masked as ***)</span>
        </div>
      </div>

      {/* Tailwind utility for inputs — avoids repetition */}
      <style>{`
        .input-base {
          width: 100%;
          background: rgb(30 41 59);
          border: 1px solid rgb(51 65 85);
          color: white;
          padding: 0.5rem 0.75rem;
          border-radius: 0.5rem;
          font-size: 0.875rem;
          outline: none;
        }
        .input-base:focus {
          ring: 2px;
          border-color: rgb(99 102 241);
          box-shadow: 0 0 0 2px rgba(99,102,241,0.3);
        }
        .input-base::placeholder { color: rgb(100 116 139); }
      `}</style>
    </>
  );
};

export default CameraManagement;
