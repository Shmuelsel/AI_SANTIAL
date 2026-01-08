import React, { useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';
import { AlertTriangle, CheckCircle, XCircle, Activity, Ban } from 'lucide-react';

const LiveRoom = () => {
  const [alerts, setAlerts] = useState([]);
  const [activeDetection, setActiveDetection] = useState(null);
  
  // 1. שינוי חשוב: שימוש ב-useRef כדי שהסוקט יהיה זמין לכפתורים
  const socketRef = useRef(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  
  // חיבור ל-Socket
  useEffect(() => {
    // אתחול הסוקט לרפרנס
    socketRef.current = io('http://localhost:3001');

    socketRef.current.on('alert', (data) => {
      setAlerts((prev) => [data, ...prev].slice(0, 10)); 
      setActiveDetection(data);
    });

    return () => socketRef.current.disconnect();
  }, []);

  // 2. הפונקציה החדשה שמטפלת בלחיצה על הכפתורים
  const handleDecision = (status) => {
    if (!activeDetection) return;

    // א. שליחת המידע לשרת
    const feedbackData = {
      eventId: activeDetection.id,
      status: status, // 'confirmed' או 'false_alarm'
      timestamp: new Date().toISOString()
    };
    
    socketRef.current.emit('feedback', feedbackData);

    // ב. משוב ויזואלי למשתמש (UI)
    console.log(`Decision sent: ${status}`);
    
    // ג. ניקוי המסך - מעלים את הריבוע האדום
    setActiveDetection(null); 
    
    // ד. ניקוי הקנבס מיידית
    const canvas = canvasRef.current;
    if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  };

  // לוגיקה לציור הריבוע (ללא שינוי מהותי, רק הוספת תנאי)
  useEffect(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video || !activeDetection) return;

    const ctx = canvas.getContext('2d');
    canvas.width = video.clientWidth;
    canvas.height = video.clientHeight;
    
    // קריאה לפונקציית ציור (אותו קוד מקודם)
    drawDetection(ctx, canvas.width, canvas.height);

  }, [activeDetection]);

  const drawDetection = (ctx, width, height) => {
      ctx.clearRect(0, 0, width, height);
      const { x, y, w, h } = activeDetection.bbox;
      const rectX = x * width;
      const rectY = y * height;
      const rectW = w * width;
      const rectH = h * height;

      ctx.strokeStyle = '#ef4444'; 
      ctx.lineWidth = 4;
      ctx.strokeRect(rectX, rectY, rectW, rectH);

      ctx.fillStyle = '#ef4444';
      ctx.fillRect(rectX, rectY - 30, 140, 30);

      ctx.fillStyle = 'white';
      ctx.font = 'bold 14px Inter';
      ctx.fillText(
        `${activeDetection.label} ${(activeDetection.confidence * 100).toFixed(0)}%`, 
        rectX + 10, 
        rectY - 10
      );
  };

  return (
    <div className="grid grid-cols-12 gap-6 h-[calc(100vh-8rem)]">
      
      {/* אזור הוידאו המרכזי */}
      <div className="col-span-9 flex flex-col gap-4">
        <div className="relative bg-black rounded-2xl overflow-hidden shadow-2xl border border-slate-800 aspect-video group">
          <video 
            ref={videoRef}
            className="w-full h-full object-cover opacity-80"
            src="https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4"
            autoPlay loop muted 
          />
          <canvas 
            ref={canvasRef}
            className="absolute top-0 left-0 w-full h-full pointer-events-none"
          />
          
          {/* מחוון LIVE */}
          <div className="absolute top-4 left-4 bg-red-600/90 text-white px-3 py-1 rounded text-xs font-bold tracking-widest flex items-center animate-pulse">
            <span className="w-2 h-2 bg-white rounded-full mr-2"></span>
            LIVE FEED
          </div>

          {/* הודעה אם אין התראה כרגע */}
          {!activeDetection && (
             <div className="absolute top-4 right-4 bg-slate-900/80 text-slate-300 px-3 py-1 rounded text-xs border border-slate-700">
                Scanning Area...
             </div>
          )}
        </div>

        {/* 3. כפתורי פעולה מחוברים ללוגיקה */}
        <div className="grid grid-cols-2 gap-4 h-24">
          <button 
            onClick={() => handleDecision('confirmed')}
            disabled={!activeDetection} // כפתור לא פעיל אם אין התראה
            className={`rounded-xl flex items-center justify-center gap-3 text-xl font-semibold transition-all shadow-lg 
              ${activeDetection 
                ? 'bg-red-500 hover:bg-red-600 text-white shadow-red-500/20 active:scale-95 cursor-pointer' 
                : 'bg-slate-800 text-slate-600 cursor-not-allowed'}`}
          >
            <AlertTriangle size={28} />
            Confirm Alarm
          </button>

          <button 
            onClick={() => handleDecision('false_alarm')}
            disabled={!activeDetection} // כפתור לא פעיל אם אין התראה
            className={`rounded-xl flex items-center justify-center gap-3 text-xl font-semibold transition-all shadow-lg 
              ${activeDetection 
                ? 'bg-slate-700 hover:bg-emerald-600 text-white active:scale-95 cursor-pointer' 
                : 'bg-slate-800 text-slate-600 cursor-not-allowed'}`}
          >
            {activeDetection ? <CheckCircle size={28} /> : <Ban size={28} />}
            {activeDetection ? "Mark as False Alarm" : "No Active Threats"}
          </button>
        </div>
      </div>

      {/* סרגל צד - ללא שינוי */}
      <div className="col-span-3 bg-slate-900 rounded-2xl border border-slate-800 flex flex-col overflow-hidden">
        <div className="p-4 border-b border-slate-800 flex justify-between items-center">
          <h3 className="font-semibold text-slate-100 flex items-center gap-2">
            <Activity size={18} className="text-indigo-400"/>
            Recent Alerts
          </h3>
          <span className="text-xs bg-slate-800 text-slate-400 px-2 py-1 rounded-full">Real-time</span>
        </div>
        
        <div className="flex-1 overflow-auto p-2 space-y-2 custom-scrollbar">
          {alerts.map((alert) => (
            <div key={alert.id} className="bg-slate-800/50 p-3 rounded-lg border border-slate-700/50 hover:bg-slate-800 transition-colors cursor-pointer">
              <div className="flex justify-between items-start mb-1">
                <span className="text-red-400 font-bold text-sm">{alert.label}</span>
                <span className="text-xs text-slate-500">{new Date(alert.timestamp).toLocaleTimeString()}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-slate-400">Cam: {alert.camera_id}</span>
                <span className="text-xs text-slate-500">{(Number(alert.confidence) * 100).toFixed(0)}%</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default LiveRoom;