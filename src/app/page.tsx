'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/useAuthStore';
import { useUIStore } from '@/store/useUIStore';
import Header from '@/components/Header';
import ChatArea from '@/components/ChatArea';
import Sidebar from '@/components/Sidebar';
import TodoPanel from '@/components/TodoPanel';
import FavoritesPanel from '@/components/FavoritesPanel';
import NotificationProvider from '@/components/NotificationProvider';
import { motion, AnimatePresence } from 'framer-motion';

export default function Home() {
  const router = useRouter();
  const { token, user } = useAuthStore();
  const { activePanel } = useUIStore();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (!token) {
      router.push('/login');
    }
  }, [token, router]);

  if (!mounted || !token || !user) return null;

  return (
    <div className="h-screen w-screen flex flex-col bg-cyber-black text-white overflow-hidden relative">
      <NotificationProvider />
      
      {/* Scanline overlay */}
      <div className="pointer-events-none fixed inset-0 z-50 opacity-10 bg-[linear-gradient(transparent_50%,rgba(0,0,0,0.25)_50%)] bg-[length:100%_4px]" />
      
      <Header />

      <div className="flex-1 flex overflow-hidden relative z-10">
        <Sidebar />
        {/* Main Chat Area */}
        <div className="flex-1 min-w-0 h-full relative transition-all duration-300 ease-in-out">
          <ChatArea />
        </div>

        {/* Sidebar Panel (Todos or Favorites) */}
        <AnimatePresence initial={false}>
          {activePanel !== 'none' && (
            <motion.div
              initial={{ width: 0, opacity: 0, x: 50 }}
              animate={{ width: 320, opacity: 1, x: 0 }}
              exit={{ width: 0, opacity: 0, x: 50 }}
              transition={{ type: 'spring', bounce: 0, duration: 0.4 }}
              className="h-full shrink-0 z-20 border-l border-cyber-cyan/30 bg-cyber-dark/90 shadow-[-10px_0_30px_rgba(10,12,16,0.8)] overflow-hidden"
            >
              <div className="w-[320px] h-full">
                {activePanel === 'todos' && <TodoPanel />}
                {activePanel === 'favorites' && <FavoritesPanel />}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
