import React, { useEffect, useRef } from 'react';
const CameraStream = () => {
  const videoRef = useRef(null);

  useEffect(() => {
    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (err) {
        console.error("שגיאה בגישה למצלמה:", err);
      }
    };

    startCamera();
  }, []);

  return (
    <div className="relative w-full max-w-2xl mx-auto border-4 border-slate-800 rounded-lg overflow-hidden shadow-2xl bg-bl">
      <video 
        ref={videoRef} 
        autoPlay 
        playsInline 
        className="w-full h-auto grayscale-20"
      />
      <div className="absolute top-4 left-4 flex items-center gap-2 bg-bla">
        <span className="w-3 h-3 rounded-full animate-pulse bg-red-500"></span>
        <span className="text-white text-xs font-mono uppercase tracking-widest bg-black/50 px-2 py-1 rounded">
          Live Feed
        </span>
      </div>
    </div>
  );
};

export default CameraStream;