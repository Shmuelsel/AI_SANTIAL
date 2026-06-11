import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Video, FileText, Settings, Users, LogOut, ShieldCheck } from 'lucide-react';

// מקבלים את onLogout
const Sidebar = ({ onLogout }) => {
  
  const navItems = [
    { path: '/', icon: <LayoutDashboard size={20} />, label: 'Dashboard' },
    { path: '/live', icon: <Video size={20} />, label: 'Live Room' },
    { path: '/logs', icon: <FileText size={20} />, label: 'Events Log' },
    { path: '/users', icon: <Users size={20} />, label: 'Users' }, // הקישור החדש
    { path: '/settings', icon: <Settings size={20} />, label: 'Settings' },
  ];

  return (
    <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col">
      {/* Logo */}
      <div className="h-16 flex items-center px-6 border-b border-slate-800 gap-3">
        <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
            <ShieldCheck size={18} className="text-white" />
        </div>
        <span className="font-bold text-lg tracking-wide">SecureGuard</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-2">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                isActive
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              }`
            }
          >
            {item.icon}
            <span className="font-medium">{item.label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Logout Button */}
      <div className="p-4 border-t border-slate-800">
        <button 
          onClick={onLogout} // כאן הקסם קורה!
          className="flex items-center gap-3 text-slate-400 hover:text-red-400 hover:bg-slate-800/50 w-full px-4 py-3 rounded-xl transition-all group"
        >
          <LogOut size={20} className="group-hover:text-red-500 transition-colors" />
          <span className="font-medium">Logout</span>
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;