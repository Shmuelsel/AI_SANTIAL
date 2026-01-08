import React from "react";
import CameraStream from "./components/CameraStream";

function App() {
  return (
    // עיצוב הרקע של ה-Dashboard (מראה חמ"ל כהה)
    <div className="min-h-screen bg-slate-950 text-slate-100 p-8 font-sans">
      {/* כותרת המערכת */}
      <header className="mb-12 text-center">
        <h1 className="text-4xl font-black tracking-tighter uppercase text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400">
          AI False Alarm Filter
        </h1>
        <p className="text-slate-500 mt-2 font-mono">
          System Status: <span className="text-emerald-500">Active</span>
        </p>
      </header>

      {/* אזור התצוגה הראשי */}
      <main className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-8">
        {/* חלון המצלמה - תופס 3 עמודות מתוך 4 */}
        <div className="md:col-span-3 space-y-4">k
          <h2 className="text-xl font-semibold flex items-center gap-2 bg-bla">
            <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
            Main Camera Feed
          </h2>
          <CameraStream />
        </div>

        {/* סרגל צד של התראות - נבנה בהמשך */}
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4">
          <h2 className="text-lg font-medium mb-4 border-b border-slate-800 pb-2">
            Recent Alerts
          </h2>
          <div className="text-slate-600 text-sm italic text-center py-10">
            No alerts detected yet...
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
