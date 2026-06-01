import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Pen, Trash2, Save, X } from 'lucide-react';
import { SERVER_URL } from '../config';

// ── Sensitivity level config (contract §3.2, §8.2) ───────────────────────────
const SENSITIVITY_OPTS = [
  { value: 1, label: 'Low',      activeClass: 'bg-blue-600   text-white' },
  { value: 2, label: 'Guarded',  activeClass: 'bg-emerald-600 text-white' },
  { value: 3, label: 'Elevated', activeClass: 'bg-yellow-500 text-slate-900' },
  { value: 4, label: 'High',     activeClass: 'bg-orange-500 text-white' },
  { value: 5, label: 'Critical', activeClass: 'bg-red-600    text-white' },
];

/**
 * DrawingOverlay – lets the operator click on the video feed to define
 * a virtual polygon / line zone.  All coordinates are stored and sent to
 * the backend as NORMALISED values (0.0 – 1.0) so they are resolution-
 * independent.
 *
 * Props:
 *   containerRef  – ref to the parent video-container element (used for sizing)
 *   onClose       – callback to exit drawing mode
 *   onSubmitZone  – callback to broadcast the zone via Socket.IO
 */
const DrawingOverlay = ({ containerRef, onClose, onSubmitZone }) => {
  const canvasRef = useRef(null);
  const [points,           setPoints]           = useState([]);
  const [sensitivityLevel, setSensitivityLevel] = useState(3); // NEW – default: Elevated
  const [isSaving,         setIsSaving]         = useState(false);
  const [saveStatus,       setSaveStatus]       = useState(null); // 'success' | 'error' | null

  // ── Keep canvas dimensions in sync with the video container ──────────
  useEffect(() => {
    const canvas    = canvasRef.current;
    const container = containerRef?.current;
    if (!canvas || !container) return;

    const sync = () => {
      canvas.width  = container.clientWidth;
      canvas.height = container.clientHeight;
    };
    sync();

    const ro = new ResizeObserver(sync);
    ro.observe(container);
    return () => ro.disconnect();
  }, [containerRef]);

  // ── Redraw polygon whenever the points array changes ─────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (points.length === 0) return;

    // Semi-transparent fill
    ctx.beginPath();
    ctx.moveTo(points[0].px, points[0].py);
    points.slice(1).forEach(p => ctx.lineTo(p.px, p.py));
    if (points.length >= 3) ctx.closePath();
    ctx.fillStyle = 'rgba(99, 102, 241, 0.15)';
    ctx.fill();

    // Outline
    ctx.beginPath();
    ctx.moveTo(points[0].px, points[0].py);
    points.slice(1).forEach(p => ctx.lineTo(p.px, p.py));
    if (points.length >= 3) ctx.closePath();
    ctx.strokeStyle = '#6366f1';
    ctx.lineWidth   = 2;
    ctx.setLineDash([]);
    ctx.stroke();

    // Dashed preview line back to origin (close hint)
    if (points.length >= 3) {
      ctx.beginPath();
      ctx.moveTo(points[points.length - 1].px, points[points.length - 1].py);
      ctx.lineTo(points[0].px, points[0].py);
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = 'rgba(99,102,241,0.5)';
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Vertex dots
    points.forEach(p => {
      ctx.beginPath();
      ctx.arc(p.px, p.py, 5, 0, Math.PI * 2);
      ctx.fillStyle   = '#6366f1';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth   = 1.5;
      ctx.stroke();
    });
  }, [points]);

  // ── Record a click as a normalised point ─────────────────────────────
  const handleCanvasClick = useCallback((e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const px   = e.clientX - rect.left;
    const py   = e.clientY - rect.top;
    const nx   = px / canvas.width;
    const ny   = py / canvas.height;
    setPoints(prev => [...prev, { px, py, nx, ny }]);
  }, []);

  // ── POST normalised coordinates + sensitivity to backend (§3.2) ──────
  const handleSave = async () => {
    if (points.length < 2) return;
    setIsSaving(true);
    setSaveStatus(null);

    const isPolygon      = points.length >= 3;
    const normalizedPts  = points.map(p => ({ x: p.nx, y: p.ny }));

    // Broadcast zone via Socket.IO (real-time, no sensitivity needed here)
    onSubmitZone?.(normalizedPts);

    const payload = {
      camera_id:         'CAM_1001',
      rule_type:         'zone',
      name:              'Restricted Zone',
      alert_type:        'intrusion',
      active:            true,
      sensitivity_level: sensitivityLevel,   // NEW – contract §3.2
      geometry: {
        type:   isPolygon ? 'polygon' : 'line',
        points: normalizedPts,
      },
      conditions: {
        min_dwell_seconds:      30,
        loitering_zone_returns: 3,
      },
    };

    try {
      const res = await fetch(`${SERVER_URL}/api/rules`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`Server responded with ${res.status}`);
      setSaveStatus('success');
      setTimeout(() => setSaveStatus(null), 3000);
    } catch (err) {
      console.error('[DrawingOverlay] Save failed:', err);
      setSaveStatus('error');
    } finally {
      setIsSaving(false);
    }
  };

  const currentOpt = SENSITIVITY_OPTS.find(o => o.value === sensitivityLevel);

  return (
    <div className="absolute inset-0 z-20">
      {/* The clickable drawing canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full cursor-crosshair"
        onClick={handleCanvasClick}
      />

      {/* ── Top-right controls ─────────────────────────────────────────── */}
      <div className="absolute top-2 right-2 flex flex-col items-end gap-2 z-30">

        {/* Status feedback */}
        {saveStatus === 'success' && (
          <span className="bg-emerald-600 text-white text-xs px-3 py-1.5 rounded-lg font-medium">
            Rule saved!
          </span>
        )}
        {saveStatus === 'error' && (
          <span className="bg-red-600 text-white text-xs px-3 py-1.5 rounded-lg font-medium">
            Save failed – check backend
          </span>
        )}

        {/* NEW – Sensitivity level segmented control (contract §3.2) */}
        <div className="bg-slate-900/90 backdrop-blur-sm border border-slate-700 rounded-lg p-2 flex flex-col gap-1.5">
          <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold px-1">
            Zone Sensitivity
          </p>
          <div className="flex gap-1">
            {SENSITIVITY_OPTS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setSensitivityLevel(opt.value)}
                title={opt.label}
                className={`px-2 py-1 rounded text-[10px] font-semibold transition-colors
                  ${sensitivityLevel === opt.value
                    ? opt.activeClass
                    : 'bg-slate-700/80 text-slate-400 hover:bg-slate-600 hover:text-white'}`}
              >
                {opt.value}
              </button>
            ))}
          </div>
          <p className={`text-[10px] text-center font-medium ${
            sensitivityLevel <= 2 ? 'text-emerald-400' :
            sensitivityLevel === 3 ? 'text-yellow-400' :
            sensitivityLevel === 4 ? 'text-orange-400' : 'text-red-400'
          }`}>
            {currentOpt?.label}
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPoints([])}
            title="Clear all points"
            className="bg-slate-800/90 hover:bg-slate-700 text-white px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5 backdrop-blur-sm"
          >
            <Trash2 size={13} /> Clear
          </button>

          <button
            onClick={handleSave}
            disabled={points.length < 2 || isSaving}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed
                       text-white px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5 font-medium"
          >
            <Save size={13} />
            {isSaving ? 'Saving…' : 'Save Rule'}
          </button>

          <button
            onClick={onClose}
            title="Exit drawing mode"
            className="bg-slate-800/90 hover:bg-red-900/60 text-slate-300 hover:text-white px-2 py-1.5 rounded-lg backdrop-blur-sm"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Bottom-left hint */}
      <div className="absolute bottom-2 left-2 bg-slate-900/80 text-slate-300 text-xs px-3 py-1.5 rounded-lg backdrop-blur-sm flex items-center gap-1.5 pointer-events-none">
        <Pen size={12} />
        {points.length === 0
          ? 'Click on the feed to start drawing a zone'
          : `${points.length} point${points.length !== 1 ? 's' : ''} placed${points.length >= 3 ? ' · polygon ready' : ''}`}
      </div>
    </div>
  );
};

export default DrawingOverlay;
