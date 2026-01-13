import {React, useState, useEffect} from 'react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { ShieldCheck, AlertTriangle, Activity, Eye } from 'lucide-react';
const Dashboard = () => {

  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date()); // עדכון ה-State גורם לרינדור מחדש
    }, 1000);

    // ניקוי הטיימר כשהקומפוננטה יורדת מהמסך (מונע זליגת זיכרון)
    return () => clearInterval(timer);
  }, []);
  // נתוני דמה לגרף (בהמשך נביא אותם מהשרת)
  const data = [
    { name: '08:00', total: 12, falseAlarm: 2 },
    { name: '10:00', total: 19, falseAlarm: 5 },
    { name: '12:00', total: 35, falseAlarm: 12 },
    { name: '14:00', total: 28, falseAlarm: 4 },
    { name: '16:00', total: 42, falseAlarm: 8 },
    { name: '18:00', total: 95, falseAlarm: 15 },
    { name: '20:00', total: 30, falseAlarm: 3 },
  ];

  return (
    <div className="w-full space-y-6">
      
      {/* 1. כותרת עליונה */}
      <div>
        <h2 className="text-2xl font-bold text-white">System Overview</h2>
        <p className="text-slate-400">Real-time surveillance statistics</p>
      </div>

      {/* 2. כרטיסי סטטיסטיקה (Stats Cards) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          title="Total Alerts" 
          value="124" 
          subValue="+12% from yesterday" 
          icon={Activity} 
          color="blue" 
        />
        <StatCard 
          title="False Alarms" 
          value="38" 
          subValue="30% of total alerts" 
          icon={AlertTriangle} 
          color="red" 
        />
        <StatCard 
          title="Verified Threats" 
          value="86" 
          subValue="Auto-confirmed by AI" 
          icon={ShieldCheck} 
          color="green" 
        />
        <StatCard 
          title="Active Cameras" 
          value="8/8" 
          subValue="All systems online" 
          icon={Eye} 
          color="indigo" 
        />
      </div>

      {/* 3. אזור הגרפים */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-96">
        
        {/* גרף ראשי - מגמת דיוק */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl">
          <h3 className="text-lg font-semibold text-white mb-6">Detection Accuracy Trend</h3>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data}>
                <defs>
                  <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="name" stroke="#64748b" />
                <YAxis stroke="#64748b" />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', color: '#fff' }} 
                />
                <Area 
                  type="monotone" 
                  dataKey="total" 
                  stroke="#6366f1" 
                  strokeWidth={3}
                  fillOpacity={1} 
                  fill="url(#colorTotal)" 
                />
                <Line 
                  type="monotone" 
                  dataKey="falseAlarm" 
                  stroke="#ef4444" 
                  strokeWidth={2} 
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* גרף משני / מידע נוסף */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl">
          <h3 className="text-lg font-semibold text-white mb-4">System Health</h3>
          <div className="space-y-6 mt-8">
            <HealthBar label="Server Load" percent={45} color="bg-emerald-500" />
            <HealthBar label="Database Storage" percent={72} color="bg-yellow-500" />
            <HealthBar label="AI Model Latency" percent={20} color="bg-blue-500" />
            <HealthBar label="Network Traffic" percent={60} color="bg-purple-500" />
          </div>
          
          <div className="mt-8 p-4 bg-slate-800/50 rounded-lg border border-slate-700">
            <p className="text-sm text-slate-400">Last system check:</p>
            <p className="text-white font-mono">{new Date().toLocaleString()}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

// רכיבי עזר קטנים לשימוש בתוך הדשבורד
const StatCard = ({ title, value, subValue, icon: Icon, color }) => {
  const colorClasses = {
    blue: "bg-blue-500/10 text-blue-500",
    red: "bg-red-500/10 text-red-500",
    green: "bg-emerald-500/10 text-emerald-500",
    indigo: "bg-indigo-500/10 text-indigo-500",
  };

  return (
    <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl hover:shadow-lg transition-all hover:scale-[1.02]">
      <div className="flex justify-between items-start mb-4">
        <div>
          <p className="text-slate-400 text-sm font-medium">{title}</p>
          <h4 className="text-3xl font-bold text-white mt-1">{value}</h4>
        </div>
        <div className={`p-3 rounded-lg ${colorClasses[color]}`}>
          <Icon size={24} />
        </div>
      </div>
      <p className="text-xs text-slate-500">{subValue}</p>
    </div>
  );
};

const HealthBar = ({ label, percent, color }) => (
  <div>
    <div className="flex justify-between text-sm mb-1">
      <span className="text-slate-300">{label}</span>
      <span className="text-slate-400">{percent}%</span>
    </div>
    <div className="w-full bg-slate-800 rounded-full h-2">
      <div 
        className={`h-2 rounded-full ${color}`} 
        style={{ width: `${percent}%` }}
      ></div>
    </div>
  </div>
);

export default Dashboard;