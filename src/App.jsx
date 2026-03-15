import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth } from './firebase';
import MainLayout from './layouts/MainLayout';
import LiveRoom from './pages/LiveRoom';
import Dashboard from './pages/Dashboard';
import Logs from './pages/Logs';
import Settings from './pages/Settings';
import Login from './pages/Login';

// Placeholder until a real Users management page is built
const Users = () => <div className="text-2xl p-4 text-white">User Management Module</div>;

const DEV_BYPASS = import.meta.env.VITE_DEV_BYPASS_AUTH === 'true';

function App() {
  /**
   * currentUser states:
   *   null  — Firebase is still resolving the persisted session (show spinner)
   *   false — No authenticated user
   *   obj   — Firebase User object (or the DEV_BYPASS sentinel object)
   */
  const [currentUser, setCurrentUser] = useState(DEV_BYPASS ? { uid: 'dev' } : null);

  useEffect(() => {
    if (DEV_BYPASS) return; // skip Firebase listener in dev bypass mode
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

  // ── Loading state while Firebase resolves the persisted session ────────
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
      <Routes>
        {/* Public route — redirects to dashboard if already authenticated */}
        <Route
          path="/login"
          element={isAuthenticated ? <Navigate to="/" /> : <Login />}
        />

        {/* Protected routes — wrapped in the main shell layout */}
        <Route
          path="/"
          element={
            isAuthenticated
              ? <MainLayout onLogout={handleLogout} />
              : <Navigate to="/login" />
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="live" element={<LiveRoom />} />
          <Route path="logs" element={<Logs />} />
          <Route path="users" element={<Users />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
