import React, { useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';
import { AlertTriangle, CheckCircle, Ban, Activity } from 'lucide-react';

const LiveRoom = () => {
    const [alerts, setAlerts] = useState([]);
    const [activeDetection, setActiveDetection] = useState(null);

    const socketRef = useRef(null);
    const imgRef = useRef(null); // שינינו את השם מ-videoRef ל-imgRef לבהירות
    const canvasRef = useRef(null);

    // 1. חיבור לסוקט
    useEffect(() => {
        console.log("🔌 Attempting to connect to React...");
        socketRef.current = io('http://localhost:5000', {
            transports: ['websocket'], // כופה שימוש ב-WebSocket בלבד
            reconnectionAttempts: 5,   // מנסה להתחבר מחדש 5 פעמים
        });

        socketRef.current.on('alert', (data) => {
            console.log("📦 Alert received from Python:", data.label); // נראה את זה ב-F12
            setAlerts((prev) => [data, ...prev].slice(0, 10));
            setActiveDetection(data);
        });

        socketRef.current.on('disconnect', () => {
            console.log("❌ WebSocket Disconnected");
        });

        return () => socketRef.current.disconnect();
    }, []);

    // 2. לוגיקה לציור הריבוע
    useEffect(() => {
        const canvas = canvasRef.current;
        const img = imgRef.current;

        // אם אין תמונה, אין קנבס או אין זיהוי - בורחים
        if (!canvas || !img || !activeDetection) return;

        const ctx = canvas.getContext('2d');

        // מוודאים שגודל הקנבס תואם לגודל התמונה המוצגת
        // זה החלק הקריטי שהיה חסר!
        if (canvas.width !== img.clientWidth || canvas.height !== img.clientHeight) {
            canvas.width = img.clientWidth;
            canvas.height = img.clientHeight;
        }

        // הדפסת נתוני ציור לקונסול כדי לוודא חישובים
        // console.log("🎨 Drawing on canvas size:", canvas.width, "x", canvas.height);

        drawDetection(ctx, canvas.width, canvas.height);

    }, [activeDetection]); // רץ כל פעם שיש זיהוי חדש

    const drawDetection = (ctx, width, height) => {
        // ניקוי הקנבס לפני ציור חדש
        ctx.clearRect(0, 0, width, height);

        const { x, y, w, h } = activeDetection.bbox;

        // המרה מאחוזים (0.5) לפיקסלים (400px)
        const rectX = x * width;
        const rectY = y * height;
        const rectW = w * width;
        const rectH = h * height;

        // ציור הריבוע
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 4;
        ctx.strokeRect(rectX, rectY, rectW, rectH);

        // רקע לטקסט
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(rectX, rectY - 30, 140, 30);

        // טקסט
        ctx.fillStyle = 'white';
        ctx.font = 'bold 14px sans-serif';
        ctx.fillText(
            `${activeDetection.label} ${(activeDetection.confidence * 100).toFixed(0)}%`,
            rectX + 10,
            rectY - 10
        );

        // טיימר לניקוי הריבוע אם אין זיהוי חדש תוך שנייה
        setTimeout(() => {
            if (canvasRef.current) {
                const currentCtx = canvasRef.current.getContext('2d');
                // מנקים רק אם אין זיהוי חדש שקרה בינתיים (בדיקה פשטנית)
                // בפועל זה יגרום להבהוב קל אבל זה טוב לדיבאג
                // currentCtx.clearRect(0, 0, width, height); 
            }
        }, 1000);
    };

    const handleDecision = (status) => {
        if (!activeDetection || !socketRef.current) return;
        socketRef.current.emit('feedback', { eventId: activeDetection.id, status });
        setActiveDetection(null);
        if (canvasRef.current) {
            const ctx = canvasRef.current.getContext('2d');
            ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        }
    };

    return (
        <div className="grid grid-cols-12 gap-6 h-[calc(100vh-8rem)]">

            <div className="col-span-9 flex flex-col gap-4">
                {/* קונטיינר הוידאו - חייב להיות relative כדי שהקנבס ישב עליו */}
                <div className="relative bg-black rounded-2xl overflow-hidden shadow-2xl border border-slate-800 aspect-video group">

                    <img
                        ref={imgRef}
                        className="w-full h-full object-contain" // object-contain שומר על פרופורציות
                        src="http://localhost:5000/video_feed"
                        alt="Live Feed"
                        // ברגע שהתמונה נטענת, נעדכן את גודל הקנבס
                        onLoad={() => {
                            if (canvasRef.current && imgRef.current) {
                                canvasRef.current.width = imgRef.current.clientWidth;
                                canvasRef.current.height = imgRef.current.clientHeight;
                            }
                        }}
                    />

                    <canvas
                        ref={canvasRef}
                        className="absolute top-0 left-0 w-full h-full pointer-events-none"
                    />

                    <div className="absolute top-4 left-4 bg-red-600/90 text-white px-3 py-1 rounded text-xs font-bold tracking-widest flex items-center animate-pulse">
                        <span className="w-2 h-2 bg-white rounded-full mr-2"></span>
                        LIVE FEED
                    </div>
                </div>

                {/* כפתורים */}
                <div className="grid grid-cols-2 gap-4 h-24">
                    <button
                        onClick={() => handleDecision('confirmed')}
                        disabled={!activeDetection}
                        className={`rounded-xl flex items-center justify-center gap-3 text-xl font-semibold transition-all shadow-lg 
              ${activeDetection
                                ? 'bg-red-500 hover:bg-red-600 text-white shadow-red-500/20 active:scale-95'
                                : 'bg-slate-800 text-slate-600 cursor-not-allowed'}`}
                    >
                        <AlertTriangle size={28} />
                        Confirm Alarm
                    </button>

                    <button
                        onClick={() => handleDecision('false_alarm')}
                        disabled={!activeDetection}
                        className={`rounded-xl flex items-center justify-center gap-3 text-xl font-semibold transition-all shadow-lg 
              ${activeDetection
                                ? 'bg-slate-700 hover:bg-emerald-600 text-white active:scale-95'
                                : 'bg-slate-800 text-slate-600 cursor-not-allowed'}`}
                    >
                        {activeDetection ? <CheckCircle size={28} /> : <Ban size={28} />}
                        {activeDetection ? "Mark as False Alarm" : "No Active Threats"}
                    </button>
                </div>
            </div>

            {/* סרגל צד */}
            <div className="col-span-3 bg-slate-900 rounded-2xl border border-slate-800 flex flex-col overflow-hidden">
                <div className="p-4 border-b border-slate-800 flex justify-between items-center">
                    <h3 className="font-semibold text-slate-100 flex items-center gap-2">
                        <Activity size={18} className="text-indigo-400" />
                        Recent Alerts
                    </h3>
                    <span className="text-xs bg-slate-800 text-slate-400 px-2 py-1 rounded-full">Real-time</span>
                </div>

                <div className="flex-1 overflow-auto p-2 space-y-2 custom-scrollbar">
                    {alerts.map((alert, idx) => (
                        <div key={idx} className="bg-slate-800/50 p-3 rounded-lg border border-slate-700/50 hover:bg-slate-800 transition-colors animate-in slide-in-from-right-4">
                            <div className="flex justify-between items-start mb-1">
                                <span className="text-red-400 font-bold text-sm">{alert.label}</span>
                                <span className="text-xs text-slate-500">
                                    {alert.timestamp ? alert.timestamp.split('T')[1] : 'Just now'}
                                </span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-xs text-slate-400">Cam: {alert.camera_id}</span>
                                <span className="text-xs text-slate-500">{(alert.confidence * 100).toFixed(0)}%</span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default LiveRoom;