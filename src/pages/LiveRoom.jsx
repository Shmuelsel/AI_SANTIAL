import React, { useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';
import { AlertTriangle, CheckCircle, Activity, Pen } from 'lucide-react';
import DrawingOverlay from '../components/DrawingOverlay';

const WS_URL       = import.meta.env.VITE_WS_URL;
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

const LiveRoom = () => {
  const [alerts, setAlerts]                 = useState([]);
  const [activeDetections, setActiveDetections] = useState([]);
  const [isDrawingMode, setIsDrawingMode]   = useState(false);

  const socketRef       = useRef(null);
  const imgRef          = useRef(null);
  const canvasRef       = useRef(null);
  const videoContainerRef = useRef(null);

  // ── WebSocket connection ─────────────────────────────────────────────
  useEffect(() => {
    socketRef.current = io(WS_URL, {
      transports: ['websocket'],
      reconnectionAttempts: 5,
    });

    socketRef.current.on('alert_batch', (detections) => {
      console.log(`📦 Received batch of ${detections.length} objects`);
      setActiveDetections(detections);
      if (detections.length > 0) {
        setAlerts(prev => [detections[0], ...prev].slice(0, 10));
      }
    });

    return () => socketRef.current.disconnect();
  }, []);

  // ── Bounding-box drawing ─────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    const img    = imgRef.current;
    if (!canvas || !img) return;

    const ctx = canvas.getContext('2d');
    if (canvas.width !== img.clientWidth || canvas.height !== img.clientHeight) {
      canvas.width  = img.clientWidth;
      canvas.height = img.clientHeight;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!isDrawingMode) {
      activeDetections.forEach(det => drawSingleBox(ctx, det, canvas.width, canvas.height));
    }

    const timer = setTimeout(() => {}, 1000);
    return () => clearTimeout(timer);
  }, [activeDetections, isDrawingMode]);

  const drawSingleBox = (ctx, detection, width, height) => {
    const { x, y, w, h } = detection.bbox;
    const rectX = x * width;
    const rectY = y * height;
    const rectW = w * width;
    const rectH = h * height;

    ctx.beginPath();
    ctx.lineWidth   = 3;
    ctx.strokeStyle = '#00ff00';
    ctx.rect(rectX, rectY, rectW, rectH);
    ctx.stroke();

    ctx.fillStyle = '#00ff00';
    ctx.fillRect(rectX, rectY - 25, 120, 25);

    ctx.fillStyle = 'black';
    ctx.font      = 'bold 14px Arial';
    ctx.fillText(
      `${detection.label} ${(detection.confidence * 100).toFixed(0)}%`,
      rectX + 5,
      rectY - 7
    );
  };

  // ── Operator decision: emit via socket AND POST to REST API ──────────
  const handleDecision = async (status) => {
    if (activeDetections.length === 0) return;
    const target = activeDetections[0];

    // 1. Real-time channel – keeps the backend ML loop updated immediately
    socketRef.current.emit('feedback', { eventId: target.id, status });

    // 2. REST channel – persists the decision and triggers downstream logic
    try {
      await fetch(`${API_BASE_URL}/api/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId: target.id, status }),
      });
    } catch (err) {
      console.error('[LiveRoom] Failed to POST feedback:', err);
    }

    setActiveDetections([]);
  };

  return (
    <div className="grid grid-cols-12 gap-6 h-[calc(100vh-8rem)]">
      <div className="col-span-9 flex flex-col gap-4">

        {/* Video feed + overlays */}
        <div
          ref={videoContainerRef}
          className="relative bg-black rounded-2xl overflow-hidden aspect-video border-2 border-slate-700"
        >
          <img
            ref={imgRef}
            src={`${API_BASE_URL}/video_feed`}
            className="w-full h-full object-contain"
            alt="Live camera stream"
          />

          {/* Bounding-box canvas (hidden while drawing so it doesn't intercept clicks) */}
          <canvas
            ref={canvasRef}
            className={`absolute top-0 left-0 w-full h-full pointer-events-none z-10 ${isDrawingMode ? 'opacity-0' : ''}`}
          />

          {/* VCA drawing overlay */}
          {isDrawingMode && (
            <DrawingOverlay
              containerRef={videoContainerRef}
              onClose={() => setIsDrawingMode(false)}
            />
          )}
        </div>

        {/* Status bar */}
        <div className="bg-slate-800 p-4 rounded text-white flex justify-between items-center">
          <span>
            {activeDetections.length > 0
              ? `⚠️ DETECTED: ${activeDetections.length} Object${activeDetections.length !== 1 ? 's' : ''} Moving`
              : 'Scanning Area (Motion Detection Active)…'}
          </span>
          <div className="flex items-center gap-3">
            {activeDetections.length > 0 && (
              <span className="text-xs bg-red-500 px-2 py-1 rounded animate-pulse">MOTION</span>
            )}
            <button
              onClick={() => setIsDrawingMode(v => !v)}
              title="Draw a VCA zone on the feed"
              className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded transition-colors
                ${isDrawingMode
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-700 hover:bg-slate-600 text-slate-300'}`}
            >
              <Pen size={13} />
              {isDrawingMode ? 'Drawing…' : 'Draw Zone'}
            </button>
          </div>
        </div>

        {/* Decision buttons */}
        <div className="grid grid-cols-2 gap-4 h-24">
          <button
            onClick={() => handleDecision('confirmed')}
            disabled={activeDetections.length === 0 || isDrawingMode}
            className={`rounded-xl flex items-center justify-center gap-3 text-xl font-semibold transition-all shadow-lg
              ${activeDetections.length > 0 && !isDrawingMode
                ? 'bg-red-500 hover:bg-red-600 text-white cursor-pointer'
                : 'bg-slate-800 text-slate-600 cursor-not-allowed'}`}
          >
            <AlertTriangle size={28} /> Confirm Alarm
          </button>

          <button
            onClick={() => handleDecision('false_alarm')}
            disabled={activeDetections.length === 0 || isDrawingMode}
            className={`rounded-xl flex items-center justify-center gap-3 text-xl font-semibold transition-all shadow-lg
              ${activeDetections.length > 0 && !isDrawingMode
                ? 'bg-slate-700 hover:bg-emerald-600 text-white cursor-pointer'
                : 'bg-slate-800 text-slate-600 cursor-not-allowed'}`}
          >
            <CheckCircle size={28} /> Mark as False
          </button>
        </div>
      </div>

      {/* Recent alerts sidebar */}
      <div className="col-span-3 bg-slate-900 rounded-2xl border border-slate-800 flex flex-col overflow-hidden">
        <div className="p-4 border-b border-slate-800 flex justify-between items-center">
          <h3 className="font-semibold text-slate-100 flex items-center gap-2">
            <Activity size={18} className="text-indigo-400" /> Recent Alerts
          </h3>
        </div>
        <div className="flex-1 overflow-auto p-2 space-y-2 custom-scrollbar">
          {alerts.map((alert, idx) => (
            <div key={idx} className="bg-slate-800/50 p-3 rounded-lg border border-slate-700/50">
              <div className="flex justify-between items-start mb-1">
                <span className="text-red-400 font-bold text-sm">{alert.label}</span>
                <span className="text-xs text-slate-500">
                  {alert.timestamp ? alert.timestamp.split('T')[1] : ''}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default LiveRoom;
