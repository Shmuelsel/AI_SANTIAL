import React, { useState } from 'react'; // <--- הוספנו את useState
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'; // <--- הוספנו את Navigate
import MainLayout from './layouts/MainLayout';
import LiveRoom from './pages/LiveRoom';
import Dashboard from './pages/Dashboard';
import Logs from './pages/Logs';
import Settings from './pages/Settings';
import Login from './pages/Login';

// קומפוננטה זמנית למשתמשים (זה בסדר גמור כרגע)
const Users = () => <div className="text-2xl p-4 text-white">User Management Module</div>;

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(true);

  const handleLogin = () => {
    setIsAuthenticated(true);
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
  };

  return (
    <BrowserRouter>
      <Routes>
        {/* נתיב הכניסה */}
        <Route 
          path="/login" 
          element={
            isAuthenticated ? <Navigate to="/" /> : <Login onLogin={handleLogin} />
          } 
        />
        
        {/* נתיבים מוגנים - עטופים ב-Layout */}
        <Route path="/" element={isAuthenticated ? <MainLayout onLogout={handleLogout} /> : <Navigate to="/login" />}>
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