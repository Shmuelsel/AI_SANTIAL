import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth } from './firebase';
import MainLayout       from './layouts/MainLayout';
import LiveRoom         from './pages/LiveRoom';
import Dashboard        from './pages/Dashboard';
import Logs             from './pages/Logs';
import ActivityLog      from './pages/ActivityLog';
import CameraManagement from './pages/CameraManagement';
import Settings         from './pages/Settings';
import Login            from './pages/Login';

// Placeholder until a real Users management page is built
const Users = () => <div className="text-2xl p-4 text-white">User Management Module</div>;

const DEV_BYPASS = import.meta.env.VITE_DEV_BYPASS_AUTH === 'true';

// ── Backend health banner ─────────────────────────────────────────────────────
// Polls /api/stats every 30 s. Shows a sticky amber banner when the backend
// is unreachable so the developer knows immediately why data isn't loading.
const BackendStatusBanner = () => {
  const [status, setStatus] = useState('checking'); // 'ok' | 'down' | 'checking'

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      try {
        // Use a relative URL so the request goes through the Vite proxy.
        const res = await fetch('/api/stats', { signal: AbortSignal.timeout(5000) });
        if (!cancelled) setStatus(res.ok ? 'ok' : 'down');
      } catch {
        if (!cancelled) setStatus('down');
      }
    };

    check();
    const id = setInterval(check, 30_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  if (status !== 'down') return null;

  return (
    <div className="fixed bottom-0 inset-x-0 z-50 bg-amber-600/95 backdrop-blur-sm border-t border-amber-500 px-4 py-2 flex items-center justify-center gap-3 text-sm text-white font-medium shadow-2xl">
      <span className="w-2 h-2 rounded-full bg-white animate-pulse flex-shrink-0" />
      <span>
        Backend unreachable — all API calls will fail.
        Check the Azure App Service logs or restart the server.
      </span>
      <a
        href="https://alarm-system-server-hqdpg3b3htceefgx.scm.israelcentral-01.azurewebsites.net/detectors"
        target="_blank"
        rel="noreferrer"
        className="underline underline-offset-2 hover:text-amber-200 whitespace-nowrap"
      >
        Open Kudu logs ↗
      </a>
    </div>
  );
};

// ── App ───────────────────────────────────────────────────────────────────────
function App() {
  /**
   * currentUser states:
   *   null  — Firebase is still resolving the persisted session (show spinner)
   *   false — No authenticated user
   *   obj   — Firebase User object (or the DEV_BYPASS sentinel object)
   */
  const [currentUser, setCurrentUser] = useState(DEV_BYPASS ? { uid: 'dev' } : null);

  useEffect(() => {
    if (DEV_BYPASS) return;
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user ?? false);
    });
    return () => unsubscribe();
  }, []);

  const handleLogout = async () => {
    if (DEV_BYPASS) { setCurrentUser(false); return; }
    try {
      await signOut(auth);
    } catch (err) {
      console.error('[App] Sign-out failed:', err);
    }
  };

  // ── Loading spinner while Firebase resolves session ────────────────────────
  if (currentUser === null) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-400 text-sm tracking-wide">Verifying session…</p>
        </div>
      </div>
    );
  }

  const isAuthenticated = !!currentUser;

  return (
    <BrowserRouter>
      {/* Shows a sticky banner when the backend is down */}
      <BackendStatusBanner />

      <Routes>
        {/* Public route */}
        <Route
          path="/login"
          element={isAuthenticated ? <Navigate to="/" /> : <Login />}
        />

        {/* Protected routes */}
        <Route
          path="/"
          element={
            isAuthenticated
              ? <MainLayout onLogout={handleLogout} />
              : <Navigate to="/login" />
          }
        >
          <Route index           element={<Dashboard />}        />
          <Route path="live"     element={<LiveRoom />}         />
          <Route path="logs"     element={<Logs />}             />
          <Route path="activity" element={<ActivityLog />}      />
          <Route path="cameras"  element={<CameraManagement />} />
          <Route path="users"    element={<Users />}            />
          <Route path="settings" element={<Settings />}         />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
