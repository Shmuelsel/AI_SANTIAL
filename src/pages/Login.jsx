import React, { useState } from 'react';
import { Lock, User, ShieldCheck, ChevronRight } from 'lucide-react';
// 1. ייבוא הפונקציות של פיירבייס
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from '../firebase'; // וודא שהנתיב נכון

const Login = ({ onLogin }) => {
  const [email, setEmail] = useState(''); // שינינו מ-username ל-email
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => { // שים לב ל-async
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      // 2. הפקודה שבודקת מול פיירבייס האם המשתמש קיים
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      
      console.log("Logged in user:", user.uid);
      
      // כאן אפשר להוסיף שליפה מהדאטה-בייס אם רוצים לבדוק תפקיד (Role)
      // אבל בשלב הזה - עצם זה שהצלחנו להתחבר זה מספיק
      
      onLogin(); // מעביר אותנו לדשבורד
      
    } catch (error) {
      console.error("Login error:", error.code);
      // טיפול בשגיאות נפוצות
      if (error.code === 'auth/invalid-credential') {
        setError('Incorrect email or password.');
      } else if (error.code === 'auth/too-many-requests') {
        setError('Access temporarily blocked due to many failed attempts.');
      } else {
        setError('Login failed. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 relative overflow-hidden">
      {/* ... (הרקע נשאר אותו דבר) ... */}

      <div className="w-full max-w-md bg-slate-900/60 backdrop-blur-xl border border-slate-800 p-8 rounded-2xl shadow-2xl relative z-10">
        
        {/* ... (הלוגו והכותרת נשארים אותו דבר) ... */}

        <form onSubmit={handleSubmit} className="space-y-6">
          
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider ml-1">Email Address</label>
            <div className="relative group">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-indigo-400 transition-colors" size={20} />
              <input 
                type="email" // חשוב לשנות ל-email
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-slate-800/50 border border-slate-700 text-white pl-10 pr-4 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all placeholder:text-slate-600"
                placeholder="agent@secureguard.com"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider ml-1">Passcode</label>
            <div className="relative group">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-indigo-400 transition-colors" size={20} />
              <input 
                type="password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-slate-800/50 border border-slate-700 text-white pl-10 pr-4 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all placeholder:text-slate-600"
                placeholder="••••••••"
                required
              />
            </div>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm p-3 rounded-lg flex items-center gap-2 animate-in slide-in-from-top-2">
              <span className="w-1.5 h-1.5 bg-red-500 rounded-full"></span>
              {error}
            </div>
          )}

          <button 
            type="submit" 
            disabled={isLoading}
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-3 rounded-xl transition-all shadow-lg active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-70"
          >
            {isLoading ? (
              <span className="animate-pulse">Verifying Credentials...</span>
            ) : (
              <>
                Initialize System <ChevronRight size={20} />
              </>
            )}
          </button>
        </form>
        {/* ... (Footer נשאר אותו דבר) ... */}
      </div>
    </div>
  );
};

export default Login;