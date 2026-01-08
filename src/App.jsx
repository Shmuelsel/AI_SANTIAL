import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import MainLayout from './layouts/MainLayout';
import LiveRoom from './pages/LiveRoom';
import Dashboard from './pages/Dashboard';
import Logs from './pages/Logs';
import Settings from './pages/Settings';
// import Users from './pages/Users';

// Placeholder Components (נחליף אותם בהמשך)
//const Dashboard = () => <div className="text-2xl">Dashboard Content</div>;
//const LiveRoom = () => <div className="text-2xl">Live Incident Room (Video Here)</div>;
//const Logs = () => <div className="text-2xl">Events History Log</div>;
const Users = () => <div className="text-2xl">User Management</div>;
//const Settings = () => <div className="text-2xl">System Configuration</div>;

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<MainLayout />}>
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