import React, { useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';
import { AlertTriangle, CheckCircle, Ban, Activity } from 'lucide-react';

const LiveRoom = () => {
  const [alerts, setAlerts] = useState([]);
  // שינוי: עכשיו זה מערך של זיהויים פעילים, לא אחד בודד
  const [activeDetections, setActiveDetections] = useState([]); 
  
  const socketRef = useRef(null);
  const imgRef = useRef(null);
  const canvasRef = useRef(null);

  useEffect(() => {
    socketRef.current = io('http://localhost:5000', {
      transports: ['websocket'],
      reconnectionAttempts: 5,
    });
    
    // האזנה לאירוע החדש: alert_batch
    socketRef.current.on('alert_batch', (detections) => {
      console.log(`📦 Received batch of ${detections.length} objects`);
      
      // עדכון הציור בזמן אמת
      setActiveDetections(detections);

      // עדכון הלוג בצד (לוקחים רק את הראשון מהנגלה כדי לא להספים את הלוג)
      if (detections.length > 0) {
        setAlerts((prev) => [detections[0], ...prev].slice(0, 10));
      }
    });

    return () => socketRef.current.disconnect();
  }, []);

  // לוגיקת הציור - תומכת בריבוי אובייקטים
  useEffect(() => {
    // מנקים את הקנבס תמיד, גם אם אין זיהויים (כדי למחוק ריבועים ישנים)
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;

    const ctx = canvas.getContext('2d');
    
    // סנכרון גודל
    if (canvas.width !== img.clientWidth || canvas.height !== img.clientHeight) {
        canvas.width = img.clientWidth;
        canvas.height = img.clientHeight;
    }

    // 1. נקה את המסך
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 2. צייר את כל הריבועים בלולאה
    activeDetections.forEach(detection => {
        drawSingleBox(ctx, detection, canvas.width, canvas.height);
    });

    // טיימר לניקוי אם אין תנועה יותר משנייה
    const timer = setTimeout(() => {
        // אופציונלי: אפשר לאפס את המערך אם רוצים שהריבועים יעלמו מהר כשיש שקט
        // setActiveDetections([]); 
    }, 1000);

    return () => clearTimeout(timer);

  }, [activeDetections]); 

  const drawSingleBox = (ctx, detection, width, height) => {
      const { x, y, w, h } = detection.bbox;
      const rectX = x * width;
      const rectY = y * height;
      const rectW = w * width;
      const rectH = h * height;

      ctx.beginPath();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#00ff00'; 
      ctx.rect(rectX, rectY, rectW, rectH);
      ctx.stroke();

      ctx.fillStyle = '#00ff00';
      ctx.fillRect(rectX, rectY - 25, 120, 25);

      ctx.fillStyle = 'black';
      ctx.font = 'bold 14px Arial';
      ctx.fillText(`${detection.label} ${(detection.confidence * 100).toFixed(0)}%`, rectX + 5, rectY - 7);
  };

  const handleDecision = (status) => {
     // כרגע מטפל רק בהתראה הראשונה ברשימה לדוגמה
     if (activeDetections.length === 0) return;
     const target = activeDetections[0];
     socketRef.current.emit('feedback', { eventId: target.id, status });
     setActiveDetections([]); // מנקה את המסך
  };

  return (
    <div className="grid grid-cols-12 gap-6 h-[calc(100vh-8rem)]">
      <div className="col-span-9 flex flex-col gap-4">
        
        <div className="relative bg-black rounded-2xl overflow-hidden aspect-video border-2 border-slate-700">
          <img 
            ref={imgRef}
            src="http://localhost:5000/video_feed"
            className="w-full h-full object-contain"
            alt="stream"
          />
          <canvas 
            ref={canvasRef}
            className="absolute top-0 left-0 w-full h-full pointer-events-none z-10"
          />
        </div>

        <div className="bg-slate-800 p-4 rounded text-white flex justify-between items-center">
            <span>
                {activeDetections.length > 0 
                ? `⚠️ DETECTED: ${activeDetections.length} Objects Moving` 
                : "Scanning Area (Motion Detection Active)..."}
            </span>
            {activeDetections.length > 0 && (
                <span className="text-xs bg-red-500 px-2 py-1 rounded animate-pulse">MOTION</span>
            )}
        </div>
        
        {/* כפתורים */}
        <div className="grid grid-cols-2 gap-4 h-24">
          <button 
            onClick={() => handleDecision('confirmed')}
            disabled={activeDetections.length === 0}
            className={`rounded-xl flex items-center justify-center gap-3 text-xl font-semibold transition-all shadow-lg 
              ${activeDetections.length > 0
                ? 'bg-red-500 hover:bg-red-600 text-white cursor-pointer' 
                : 'bg-slate-800 text-slate-600 cursor-not-allowed'}`}
          >
            <AlertTriangle size={28} /> Confirm Alarm
          </button>
          
          <button 
             onClick={() => handleDecision('false_alarm')}
             disabled={activeDetections.length === 0}
             className={`rounded-xl flex items-center justify-center gap-3 text-xl font-semibold transition-all shadow-lg 
              ${activeDetections.length > 0
                ? 'bg-slate-700 hover:bg-emerald-600 text-white cursor-pointer' 
                : 'bg-slate-800 text-slate-600 cursor-not-allowed'}`}
          >
            <CheckCircle size={28} /> Mark as False
          </button>
        </div>
      </div>

      <div className="col-span-3 bg-slate-900 rounded-2xl border border-slate-800 flex flex-col overflow-hidden">
        <div className="p-4 border-b border-slate-800 flex justify-between items-center">
          <h3 className="font-semibold text-slate-100 flex items-center gap-2">
            <Activity size={18} className="text-indigo-400"/> Recent Alerts
          </h3>
        </div>
        <div className="flex-1 overflow-auto p-2 space-y-2 custom-scrollbar">
          {alerts.map((alert, idx) => (
            <div key={idx} className="bg-slate-800/50 p-3 rounded-lg border border-slate-700/50">
              <div className="flex justify-between items-start mb-1">
                <span className="text-red-400 font-bold text-sm">{alert.label}</span>
                <span className="text-xs text-slate-500">{alert.timestamp ? alert.timestamp.split('T')[1] : ''}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default LiveRoom;