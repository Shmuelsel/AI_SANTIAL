import React, { useState, useEffect } from 'react';
import { Save, Bell, Shield, Server, Camera, RefreshCw, Volume2, Mail, Cpu, CheckCircle, XCircle, Video, PlayCircle } from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

const Settings = () => {
  // State לניהול ההגדרות
  const [thresholds, setThresholds] = useState({
    person: 85,
    vehicle: 70,
    animal: 60
  });

  const [notifications, setNotifications] = useState({
    sound: true,
    email: false,
    desktop: true
  });

  const [cameras] = useState([
    { id: 1, name: 'Main Entrance', ip: '192.168.1.101', status: 'Online' },
    { id: 2, name: 'Backyard West', ip: '192.168.1.102', status: 'Online' },
    { id: 3, name: 'Garage Interior', ip: '192.168.1.103', status: 'Offline' },
  ]);

  const [isSaving, setIsSaving]   = useState(false);
  const [saveStatus, setSaveStatus] = useState(null); // 'success' | 'error' | null

  const [videoSource, setVideoSource] = useState(null); // {mode, running, camera_id, source, filename}
  const [demoVideos, setDemoVideos] = useState([]); // ["alert_behavior.mp4", ...]
  const [videoSourceBusy, setVideoSourceBusy] = useState(false);
  const [videoSourceError, setVideoSourceError] = useState(null);

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/video-source`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`Server responded with ${res.status}`))))
      .then(setVideoSource)
      .catch((err) => console.error('[Settings] Failed to load video source:', err));

    fetch(`${API_BASE_URL}/api/available-videos`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`Server responded with ${res.status}`))))
      .then((data) => setDemoVideos(data.videos || []))
      .catch((err) => console.error('[Settings] Failed to load available videos:', err));
  }, []);

  const switchVideoSource = async (mode, filename) => {
    if (videoSourceBusy) return;

    setVideoSourceBusy(true);
    setVideoSourceError(null);
    try {
      const body = { mode };
      if (mode === 'demo' && filename) body.filename = filename;

      const res = await fetch(`${API_BASE_URL}/api/video-source`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`Server responded with ${res.status}`);
      setVideoSource(await res.json());
    } catch (err) {
      console.error('[Settings] Failed to switch video source:', err);
      setVideoSourceError('Could not switch video source – check backend');
    } finally {
      setVideoSourceBusy(false);
    }
  };

  const handleVideoSourceToggle = () => {
    if (!videoSource) return;
    const nextMode = videoSource.mode === 'live' ? 'demo' : 'live';
    switchVideoSource(nextMode, videoSource.filename);
  };

  const handleDemoVideoChange = (e) => {
    switchVideoSource('demo', e.target.value);
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveStatus(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ thresholds, notifications }),
      });
      if (!res.ok) throw new Error(`Server responded with ${res.status}`);
      setSaveStatus('success');
    } catch (err) {
      console.error('[Settings] Save failed:', err);
      setSaveStatus('error');
    } finally {
      setIsSaving(false);
      setTimeout(() => setSaveStatus(null), 4000);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-12">
      
      {/* Header */}
      <div className="flex justify-between items-center border-b border-slate-800 pb-6">
        <div>
          <h2 className="text-3xl font-bold text-white">System Configuration</h2>
          <p className="text-slate-400 mt-1">Manage AI sensitivity, notifications, and device status.</p>
        </div>
        <div className="flex items-center gap-3">
          {saveStatus === 'success' && (
            <span className="flex items-center gap-1.5 text-emerald-400 text-sm font-medium">
              <CheckCircle size={16} /> Saved successfully
            </span>
          )}
          {saveStatus === 'error' && (
            <span className="flex items-center gap-1.5 text-red-400 text-sm font-medium">
              <XCircle size={16} /> Save failed – check backend
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-xl flex items-center gap-2 font-medium transition-all shadow-lg shadow-indigo-500/20 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving ? <RefreshCw className="animate-spin" size={20}/> : <Save size={20} />}
            {isSaving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* 1. AI Sensitivity Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-3 bg-indigo-500/10 rounded-lg text-indigo-400">
              <Shield size={24} />
            </div>
            <div>
              <h3 className="text-xl font-bold text-white">AI Sensitivity Thresholds</h3>
              <p className="text-sm text-slate-500">Minimum confidence score to trigger an alarm</p>
            </div>
          </div>

          <div className="space-y-8">
            <ThresholdSlider 
              label="Person Detection" 
              value={thresholds.person} 
              onChange={(v) => setThresholds({...thresholds, person: v})}
              color="text-indigo-400"
            />
            <ThresholdSlider 
              label="Vehicle Detection" 
              value={thresholds.vehicle} 
              onChange={(v) => setThresholds({...thresholds, vehicle: v})}
              color="text-blue-400"
            />
            <ThresholdSlider 
              label="Animal Detection" 
              value={thresholds.animal} 
              onChange={(v) => setThresholds({...thresholds, animal: v})}
              color="text-emerald-400"
            />
          </div>
        </div>

        {/* 2. Notifications Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-3 bg-rose-500/10 rounded-lg text-rose-400">
              <Bell size={24} />
            </div>
            <div>
              <h3 className="text-xl font-bold text-white">Alert Preferences</h3>
              <p className="text-sm text-slate-500">Customize how you receive alerts</p>
            </div>
          </div>

          <div className="space-y-6">
            <ToggleOption 
              icon={Volume2} 
              label="Sound Alerts" 
              desc="Play a siren sound on high-priority threats"
              active={notifications.sound}
              onToggle={() => setNotifications({...notifications, sound: !notifications.sound})}
            />
            <ToggleOption 
              icon={Mail} 
              label="Email Reports" 
              desc="Send daily summary to admin@company.com"
              active={notifications.email}
              onToggle={() => setNotifications({...notifications, email: !notifications.email})}
            />
            <ToggleOption 
              icon={Server} 
              label="Desktop Notifications" 
              desc="Show popup bubbles when browser is minimized"
              active={notifications.desktop}
              onToggle={() => setNotifications({...notifications, desktop: !notifications.desktop})}
            />
          </div>
        </div>

        {/* 2.5 Video Source Toggle */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl lg:col-span-2">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-indigo-500/10 rounded-lg text-indigo-400">
                <Video size={24} />
              </div>
              <div>
                <h3 className="text-xl font-bold text-white">Video Source</h3>
                <p className="text-sm text-slate-500">Switch between a simulated live feed and the demo showcase video</p>
              </div>
            </div>
            {videoSource && (
              <div className="flex items-center gap-2">
                <div className={`w-2.5 h-2.5 rounded-full ${videoSource.running ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 'bg-red-500'}`}></div>
                <span className="text-sm font-medium text-slate-400">{videoSource.running ? 'Running' : 'Stopped'}</span>
              </div>
            )}
          </div>

          {videoSource ? (
            <>
              <ToggleOption
                icon={videoSource.mode === 'demo' ? PlayCircle : Video}
                label={videoSource.mode === 'demo' ? 'Demo Mode' : 'Live Feed'}
                desc={
                  videoSource.mode === 'demo'
                    ? 'Playing the showcase video from Firebase Storage'
                    : 'Looping the local live-feed video file'
                }
                active={videoSource.mode === 'demo'}
                onToggle={handleVideoSourceToggle}
              />
              {videoSource.mode === 'demo' && demoVideos.length > 0 && (
                <div className="mt-4 pl-14">
                  <label className="block text-xs font-medium text-slate-500 mb-1.5">
                    Demo Scenario
                  </label>
                  <select
                    value={videoSource.filename || ''}
                    onChange={handleDemoVideoChange}
                    disabled={videoSourceBusy}
                    className="w-full sm:w-80 bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {demoVideos.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {videoSourceBusy && (
                <p className="text-xs text-slate-500 mt-3 flex items-center gap-1.5">
                  <RefreshCw className="animate-spin" size={14} /> Switching video source…
                </p>
              )}
              {videoSourceError && (
                <p className="text-xs text-red-400 mt-3 flex items-center gap-1.5">
                  <XCircle size={14} /> {videoSourceError}
                </p>
              )}
              <p className="text-xs text-slate-600 mt-3 font-mono truncate">{videoSource.source}</p>
            </>
          ) : (
            <p className="text-sm text-slate-500">Loading video source status…</p>
          )}
        </div>

        {/* 3. Camera Management */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl lg:col-span-2">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-3 bg-emerald-500/10 rounded-lg text-emerald-400">
              <Camera size={24} />
            </div>
            <div>
              <h3 className="text-xl font-bold text-white">Connected Cameras</h3>
              <p className="text-sm text-slate-500">Manage device names and network status</p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-950 text-slate-400 text-sm uppercase">
                <tr>
                  <th className="p-4 rounded-tl-lg">Status</th>
                  <th className="p-4">Camera Name</th>
                  <th className="p-4">IP Address</th>
                  <th className="p-4 text-right rounded-tr-lg">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-slate-300">
                {cameras.map((cam) => (
                  <tr key={cam.id} className="hover:bg-slate-800/50 transition-colors">
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <div className={`w-2.5 h-2.5 rounded-full ${cam.status === 'Online' ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 'bg-red-500'}`}></div>
                        <span className="text-sm font-medium">{cam.status}</span>
                      </div>
                    </td>
                    <td className="p-4 font-medium text-white">{cam.name}</td>
                    <td className="p-4 font-mono text-sm text-slate-500">{cam.ip}</td>
                    <td className="p-4 text-right">
                      <button className="text-indigo-400 hover:text-white text-sm font-medium hover:underline">Edit Config</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* 4. System Maintenance (Danger Zone) */}
        <div className="bg-slate-900 border border-red-900/30 rounded-2xl p-6 shadow-xl lg:col-span-2 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-32 bg-red-600/5 blur-[100px] rounded-full pointer-events-none"></div>
          
          <div className="flex items-center gap-3 mb-6 relative z-10">
            <div className="p-3 bg-red-500/10 rounded-lg text-red-500">
              <Cpu size={24} />
            </div>
            <div>
              <h3 className="text-xl font-bold text-white">System Maintenance</h3>
              <p className="text-sm text-slate-500">Advanced system operations</p>
            </div>
          </div>

          <div className="flex gap-4 relative z-10">
            <button className="px-5 py-2.5 bg-slate-800 border border-slate-700 hover:bg-slate-700 text-white rounded-lg transition-colors">
              Reboot System
            </button>
            <button className="px-5 py-2.5 bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 text-red-500 rounded-lg transition-colors">
              Clear All Logs
            </button>
            <button className="px-5 py-2.5 bg-slate-800 border border-slate-700 hover:bg-slate-700 text-white rounded-lg transition-colors ml-auto">
              Check Updates
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

// --- רכיבים פנימיים לשימוש חוזר ---

const ThresholdSlider = ({ label, value, onChange, color }) => (
  <div>
    <div className="flex justify-between mb-2">
      <span className="text-slate-300 font-medium">{label}</span>
      <span className={`font-bold ${color}`}>{value}%</span>
    </div>
    <input 
      type="range" 
      min="0" 
      max="100" 
      value={value} 
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
    />
  </div>
);

const ToggleOption = ({ icon: Icon, label, desc, active, onToggle }) => (
  <div className="flex items-center justify-between group cursor-pointer" onClick={onToggle}>
    <div className="flex items-center gap-4">
      <div className={`p-2 rounded-lg transition-colors ${active ? 'bg-indigo-500/20 text-indigo-400' : 'bg-slate-800 text-slate-500'}`}>
        <Icon size={20} />
      </div>
      <div>
        <p className={`font-medium transition-colors ${active ? 'text-white' : 'text-slate-400'}`}>{label}</p>
        <p className="text-xs text-slate-500">{desc}</p>
      </div>
    </div>
    <div className={`w-12 h-6 rounded-full p-1 transition-colors duration-300 ${active ? 'bg-indigo-600' : 'bg-slate-700'}`}>
      <div className={`w-4 h-4 bg-white rounded-full shadow-md transform transition-transform duration-300 ${active ? 'translate-x-6' : 'translate-x-0'}`}></div>
    </div>
  </div>
);

export default Settings;