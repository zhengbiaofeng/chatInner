'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/useAuthStore';
import { Terminal, Lock, ChevronRight } from 'lucide-react';
import { motion } from 'framer-motion';
import toast, { Toaster } from 'react-hot-toast';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { login } = useAuthStore();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) return;
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      
      if (!res.ok) {
        toast.error(data.error || '登录失败');
        return;
      }
      
      login(data.token, data.user);
      toast.success('ACCESS GRANTED');
      router.push('/');
    } catch (err) {
      toast.error('网络错误');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-cyber-black text-cyber-cyan font-mono">
      {/* Background Grid */}
      <div className="absolute inset-0 z-0 pointer-events-none opacity-20">
        <div className="w-full h-full" style={{ backgroundImage: 'linear-gradient(var(--color-cyber-cyan) 1px, transparent 1px), linear-gradient(90deg, var(--color-cyber-cyan) 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
      </div>

      {/* Login Card */}
      <motion.div 
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="relative z-10 w-full max-w-md p-8 glass-panel glow-border rounded-none border-l-4 border-l-cyber-cyan"
      >
        <div className="flex items-center gap-3 mb-8">
          <Terminal className="w-8 h-8 text-cyber-cyan animate-pulse" />
          <div>
            <h1 className="text-2xl font-bold tracking-widest text-white">NEXUS<span className="text-cyber-cyan">.CHAT</span></h1>
            <p className="text-xs text-cyber-gray tracking-widest uppercase">Intranet Comm System v2.0</p>
          </div>
        </div>

        <form onSubmit={handleLogin} className="space-y-6">
          <div className="space-y-2">
            <label className="text-xs text-cyber-gray uppercase tracking-widest flex items-center gap-2">
              <ChevronRight className="w-3 h-3" />
              Username_
            </label>
            <input 
              type="text" 
              value={username}
              onChange={e => setUsername(e.target.value)}
              className="w-full bg-cyber-black/50 border border-cyber-gray/30 text-white p-3 focus:outline-none focus:border-cyber-cyan focus:ring-1 focus:ring-cyber-cyan transition-all font-mono"
              placeholder="Enter operator ID"
              required
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs text-cyber-gray uppercase tracking-widest flex items-center gap-2">
              <ChevronRight className="w-3 h-3" />
              Security_Key_
            </label>
            <div className="relative">
              <input 
                type="password" 
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full bg-cyber-black/50 border border-cyber-gray/30 text-white p-3 pr-10 focus:outline-none focus:border-cyber-cyan focus:ring-1 focus:ring-cyber-cyan transition-all font-mono tracking-widest"
                placeholder="••••••••"
                required
              />
              <Lock className="w-4 h-4 text-cyber-gray absolute right-3 top-3.5" />
            </div>
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className="w-full mt-4 bg-cyber-cyan/10 hover:bg-cyber-cyan/20 border border-cyber-cyan text-cyber-cyan font-bold uppercase tracking-widest py-3 transition-all relative overflow-hidden group"
          >
            <span className="relative z-10 flex items-center justify-center gap-2">
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-cyber-cyan border-t-transparent rounded-full animate-spin" />
                  AUTHENTICATING...
                </>
              ) : (
                'INITIALIZE CONNECTION'
              )}
            </span>
            <div className="absolute inset-0 -translate-x-full group-hover:animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-cyber-cyan/20 to-transparent" />
          </button>
        </form>

        <div className="mt-6 border-t border-cyber-gray/30 pt-4 text-center">
          <p className="text-[10px] text-cyber-gray font-mono">
            UNAUTHORIZED ACCESS IS STRICTLY PROHIBITED
            <br />
            SECURE CONNECTION ESTABLISHED
          </p>
        </div>
      </motion.div>
      <Toaster position="top-center" toastOptions={{
        style: { background: '#0B0C10', border: '1px solid #66FCF1', color: '#66FCF1', borderRadius: '0' }
      }} />
    </div>
  );
}
