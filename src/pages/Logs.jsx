import React, { useState, useMemo } from 'react';
import { Search, Filter, Calendar, Download, Eye, AlertTriangle, CheckCircle, Ban, Activity, X, MapPin, Clock, Camera } from 'lucide-react';

// --- Mock Data Generator ---
const generateMockLogs = () => {
  const statuses = ['confirmed', 'false_alarm', 'pending'];
  const types = ['Person', 'Vehicle', 'Animal', 'Unknown'];
  const cameras = ['Main Entrance', 'Backyard West', 'Garage Interior', 'Roof Cam'];

  return Array.from({ length: 25 }).map((_, i) => ({
    id: `EVT-${1000 + i}`,
    timestamp: new Date(Date.now() - i * 3600000).toISOString(),
    camera: cameras[Math.floor(Math.random() * cameras.length)],
    type: types[Math.floor(Math.random() * types.length)],
    confidence: (Math.random() * (0.99 - 0.60) + 0.60).toFixed(2),
    status: statuses[Math.floor(Math.random() * statuses.length)],
    thumbnailUrl: 'https://via.placeholder.com/600/0f172a/ffffff?text=Evidence+Snapshot' // תמונה גדולה יותר למודל
  }));
};

// --- קומפוננטת המודל (Investigator Modal) ---
// אנחנו מגדירים אותה באותו קובץ לנוחות, בפרויקט ענק היינו מפרידים
const EventModal = ({ event, onClose, onUpdateStatus }) => {
  if (!event) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* 1. Backdrop - הרקע הכהה והמטושטש */}
      <div 
        className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      ></div>

      {/* 2. The Modal Card */}
      <div className="relative bg-slate-900 border border-slate-700 w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-slate-800 bg-slate-900">
          <div>
            <h3 className="text-xl font-bold text-white flex items-center gap-2">
              Investigation Details
              <span className="text-slate-500 text-sm font-normal">#{event.id}</span>
            </h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X size={24} />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-0">
          {/* תמונת האירוע */}
          <div className="relative h-64 bg-black w-full group">
            <img 
              src={event.thumbnailUrl} 
              alt="Evidence" 
              className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity"
            />
            {/* שכבת מידע על התמונה */}
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-slate-900 to-transparent p-6 pt-12">
               <span className="bg-indigo-600 text-white px-3 py-1 rounded text-xs font-bold tracking-wide uppercase">
                 AI Detected: {event.type}
               </span>
            </div>
          </div>

          {/* גריד פרטים */}
          <div className="grid grid-cols-2 gap-6 p-6 bg-slate-800/30">
            <div className="space-y-1">
              <label className="text-xs text-slate-500 uppercase tracking-wider font-semibold flex items-center gap-2">
                <Clock size={14}/> Timestamp
              </label>
              <p className="text-slate-200 font-mono text-sm">
                {new Date(event.timestamp).toLocaleString()}
              </p>
            </div>
            
            <div className="space-y-1">
              <label className="text-xs text-slate-500 uppercase tracking-wider font-semibold flex items-center gap-2">
                <Camera size={14}/> Source Camera
              </label>
              <p className="text-slate-200 text-sm font-medium">
                {event.camera}
              </p>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-slate-500 uppercase tracking-wider font-semibold flex items-center gap-2">
                <Activity size={14}/> Confidence Score
              </label>
              <div className="flex items-center gap-3">
                <div className="flex-1 h-2 bg-slate-700 rounded-full max-w-[100px]">
                  <div 
                    className={`h-full rounded-full ${Number(event.confidence) > 0.8 ? 'bg-green-500' : 'bg-yellow-500'}`} 
                    style={{ width: `${event.confidence * 100}%` }}
                  ></div>
                </div>
                <span className="text-white font-bold">{(event.confidence * 100).toFixed(0)}%</span>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-slate-500 uppercase tracking-wider font-semibold flex items-center gap-2">
                <MapPin size={14}/> Current Status
              </label>
              <div className="text-sm">
                {event.status === 'confirmed' && <span className="text-red-400 font-bold">Confirmed Threat</span>}
                {event.status === 'false_alarm' && <span className="text-emerald-400 font-bold">False Alarm</span>}
                {event.status === 'pending' && <span className="text-yellow-400 font-bold">Pending Review</span>}
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-6 border-t border-slate-800 bg-slate-900 flex justify-end gap-3">
          <button 
            onClick={() => onUpdateStatus(event.id, 'false_alarm')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2
              ${event.status === 'false_alarm' ? 'bg-emerald-900/50 text-emerald-500 border border-emerald-500/50' : 'bg-slate-800 text-slate-300 hover:bg-emerald-900/30 hover:text-emerald-400'}`}
          >
            <CheckCircle size={16} />
            Mark as False Alarm
          </button>

          <button 
            onClick={() => onUpdateStatus(event.id, 'confirmed')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2
              ${event.status === 'confirmed' ? 'bg-red-900/50 text-red-500 border border-red-500/50' : 'bg-slate-800 text-slate-300 hover:bg-red-900/30 hover:text-red-400'}`}
          >
            <AlertTriangle size={16} />
            Confirm Threat
          </button>
        </div>
      </div>
    </div>
  );
};


// --- הקומפוננטה הראשית ---
const Logs = () => {
  const [logs, setLogs] = useState(() => {
    try { return generateMockLogs(); } catch (e) { return []; }
  });

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('');
  
  // State חדש לניהול המודל
  const [selectedEvent, setSelectedEvent] = useState(null);

  const filteredLogs = useMemo(() => {
    if (!logs) return [];
    return logs.filter(log => {
      const camera = log.camera || '';
      const id = log.id || '';
      
      const matchesSearch = camera.toLowerCase().includes(searchTerm.toLowerCase()) || id.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === 'all' || log.status === statusFilter;
      const matchesDate = dateFilter === '' || (log.timestamp && log.timestamp.startsWith(dateFilter));
      return matchesSearch && matchesStatus && matchesDate;
    });
  }, [logs, searchTerm, statusFilter, dateFilter]);

  // פונקציה לעדכון סטטוס מתוך המודל
  const handleUpdateStatus = (id, newStatus) => {
    // 1. מעדכנים את הרשימה הראשית
    setLogs(prevLogs => prevLogs.map(log => 
      log.id === id ? { ...log, status: newStatus } : log
    ));
    // 2. מעדכנים גם את האירוע שפתוח כרגע במודל כדי שנראה את השינוי מיד
    setSelectedEvent(prev => ({ ...prev, status: newStatus }));
  };

  const getStatusBadge = (status) => {
    switch(status) {
      case 'confirmed': return <span className="bg-red-500/20 text-red-400 px-3 py-1 rounded-full text-xs font-medium flex items-center w-fit gap-1"><AlertTriangle size={12}/> Confirmed</span>;
      case 'false_alarm': return <span className="bg-emerald-500/20 text-emerald-400 px-3 py-1 rounded-full text-xs font-medium flex items-center w-fit gap-1"><CheckCircle size={12}/> False Alarm</span>;
      default: return <span className="bg-yellow-500/20 text-yellow-400 px-3 py-1 rounded-full text-xs font-medium flex items-center w-fit gap-1"><Activity size={12}/> Pending</span>;
    }
  };

  return (
    <div className="space-y-6 relative">
      
      {/* שילוב המודל בדף */}
      {selectedEvent && (
        <EventModal 
          event={selectedEvent} 
          onClose={() => setSelectedEvent(null)} 
          onUpdateStatus={handleUpdateStatus}
        />
      )}

      {/* Header */}
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-2xl font-bold text-white">Events Log</h2>
          <p className="text-slate-400">Review and audit detection history</p>
        </div>
        <button className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors">
          <Download size={18} />
          Export CSV
        </button>
      </div>

      {/* Filter Bar */}
      <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 flex flex-wrap gap-4 items-center">
        <div className="flex-1 relative min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
          <input 
            type="text" 
            placeholder="Search camera or event ID..." 
            className="w-full bg-slate-800 border border-slate-700 text-white pl-10 pr-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="relative">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
          <select 
            className="bg-slate-800 border border-slate-700 text-white pl-10 pr-8 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 appearance-none cursor-pointer"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All Statuses</option>
            <option value="confirmed">Confirmed Threats</option>
            <option value="false_alarm">False Alarms</option>
            <option value="pending">Pending Review</option>
          </select>
        </div>
        <div className="relative">
           <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
           <input 
             type="date" 
             className="bg-slate-800 border border-slate-700 text-slate-300 pl-10 pr-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 [color-scheme:dark]"
             value={dateFilter}
             onChange={(e) => setDateFilter(e.target.value)}
           />
        </div>
      </div>

      {/* Table */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden shadow-xl">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-950 text-slate-400 border-b border-slate-800 text-sm uppercase tracking-wider">
              <th className="p-4 font-semibold">Event</th>
              <th className="p-4 font-semibold">Camera</th>
              <th className="p-4 font-semibold">Type</th>
              <th className="p-4 font-semibold">Confidence</th>
              <th className="p-4 font-semibold">Status</th>
              <th className="p-4 font-semibold text-right">Action</th>
            </tr>
          </thead>
          <tbody className="text-slate-300 text-sm divide-y divide-slate-800">
            {filteredLogs.map((log) => (
              <tr key={log.id} className="hover:bg-slate-800/50 transition-colors group">
                <td className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-slate-800 rounded-md overflow-hidden border border-slate-700">
                      <img src={log.thumbnailUrl} alt="Thumb" className="w-full h-full object-cover opacity-70 group-hover:opacity-100 transition-opacity"/>
                    </div>
                    <div>
                      <div className="font-bold text-white">{log.id}</div>
                      <div className="text-xs text-slate-500">{new Date(log.timestamp).toLocaleTimeString()}</div>
                    </div>
                  </div>
                </td>
                <td className="p-4 font-medium">{log.camera}</td>
                <td className="p-4">{log.type}</td>
                <td className="p-4">
                  <div className="flex items-center gap-2">
                    <div className="w-16 bg-slate-800 rounded-full h-1.5 overflow-hidden">
                      <div className={`h-full rounded-full ${Number(log.confidence) > 0.8 ? 'bg-green-500' : 'bg-yellow-500'}`} style={{ width: `${log.confidence * 100}%` }}></div>
                    </div>
                    <span className="text-xs">{(log.confidence * 100).toFixed(0)}%</span>
                  </div>
                </td>
                <td className="p-4">
                  {getStatusBadge(log.status)}
                </td>
                <td className="p-4 text-right">
                  <button 
                    onClick={() => setSelectedEvent(log)} // כאן אנחנו פותחים את המודל!
                    className="text-slate-400 hover:text-indigo-400 p-2 hover:bg-slate-700 rounded-lg transition-all"
                    title="View Details"
                  >
                    <Eye size={18} />
                  </button>
                </td>
              </tr>
            ))}
            
            {filteredLogs.length === 0 && (
              <tr>
                <td colSpan="6" className="p-8 text-center text-slate-500">
                  <div className="flex flex-col items-center gap-2">
                    <Ban size={32} />
                    <p>No logs found matching your filters.</p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Logs;