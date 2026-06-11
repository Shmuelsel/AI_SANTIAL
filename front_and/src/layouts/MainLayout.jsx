import React from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from '../components/Sidebar';

// 1. מקבלים את ה-prop
const MainLayout = ({ onLogout }) => {
  return (
    <div className="flex h-screen bg-slate-950 text-slate-100 font-sans">
      
      {/* 2. מעבירים אותו הלאה לרכיב הסרגל */}
      <Sidebar onLogout={onLogout} />

      <main className="flex-1 overflow-auto relative">
        <header className="h-16 bg-slate-900/50 backdrop-blur-md border-b border-slate-800 sticky top-0 z-10 flex items-center px-8 justify-between">
          <h1 className="text-xl font-semibold text-slate-100">System Overview</h1>
          <div className="flex items-center gap-4">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
            <span className="text-xs text-slate-400 font-mono">SYSTEM ONLINE</span>
          </div>
        </header>

        <div className="p-8">
          <Outlet />
        </div>
      </main>
      
    </div>
  );
};

export default MainLayout;