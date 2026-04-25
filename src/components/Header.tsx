'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/useAuthStore';
import { useUIStore } from '@/store/useUIStore';
import { LogOut, LayoutDashboard, Star, MessageSquare, Terminal } from 'lucide-react';
import { motion } from 'framer-motion';

export default function Header() {
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const { togglePanel, activePanel } = useUIStore();
  const [time, setTime] = useState('');

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date().toLocaleTimeString()), 1000);
    return () => clearInterval(timer);
  }, []);

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  return (
    <header className="h-16 bg-cyber-dark/80 backdrop-blur-md border-b border-cyber-cyan/20 flex items-center justify-between px-6 shrink-0 relative z-20 font-mono">
      <div className="flex items-center gap-4">
        <Terminal className="w-6 h-6 text-cyber-cyan animate-pulse" />
        <div className="flex flex-col">
          <h1 className="text-xl font-bold tracking-widest text-white">
            NEXUS<span className="text-cyber-cyan">.CHAT</span>
          </h1>
          <span className="text-[10px] text-cyber-gray uppercase tracking-widest">{time || '00:00:00'}</span>
        </div>
      </div>

      <div className="flex items-center gap-6">
        {user && (
          <div className="hidden md:flex items-center gap-2 px-3 py-1 bg-cyber-black/50 border border-cyber-cyan/30 rounded text-xs text-cyber-cyan">
            <span className="w-2 h-2 rounded-full bg-cyber-green animate-pulse" />
            <span className="uppercase tracking-widest">OP: {user.username}</span>
            <span className="text-cyber-gray px-1">|</span>
            <span className="text-cyber-purple uppercase">{user.role}</span>
          </div>
        )}

        <div className="flex items-center gap-2">
          <button
            onClick={() => togglePanel('todos')}
            className={`p-2 transition-all border ${activePanel === 'todos' ? 'border-cyber-cyan text-cyber-cyan bg-cyber-cyan/10' : 'border-transparent text-cyber-gray hover:text-white hover:border-cyber-gray/30'}`}
            title="Task Board"
          >
            <LayoutDashboard className="w-5 h-5" />
          </button>
          
          <button
            onClick={() => togglePanel('favorites')}
            className={`p-2 transition-all border ${activePanel === 'favorites' ? 'border-cyber-cyan text-cyber-cyan bg-cyber-cyan/10' : 'border-transparent text-cyber-gray hover:text-white hover:border-cyber-gray/30'}`}
            title="Favorites"
          >
            <Star className="w-5 h-5" />
          </button>

          <button
            onClick={handleLogout}
            className="p-2 text-cyber-pink hover:bg-cyber-pink/10 hover:border-cyber-pink transition-all border border-transparent ml-4 flex items-center gap-2 text-xs uppercase tracking-widest"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">DISCONNECT</span>
          </button>
        </div>
      </div>
    </header>
  );
}
