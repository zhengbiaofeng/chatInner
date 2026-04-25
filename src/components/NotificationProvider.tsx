'use client';

import { useEffect, useState } from 'react';
import { useUIStore } from '@/store/useUIStore';

export default function NotificationProvider() {
  const { unreadCount, clearUnread } = useUIStore();
  const [originalTitle, setOriginalTitle] = useState('');
  const [flashInterval, setFlashInterval] = useState<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setOriginalTitle(document.title || 'NEXUS.CHAT');
  }, []);

  useEffect(() => {
    if (unreadCount > 0) {
      let showUnread = true;
      const interval = setInterval(() => {
        document.title = showUnread ? `[NEW MSG] ${originalTitle}` : originalTitle;
        showUnread = !showUnread;
      }, 1000);
      setFlashInterval(interval);

      // Try to play sound
      try {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, ctx.currentTime); // A5
        osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.1);
        
        gain.gain.setValueAtTime(0, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.1, ctx.currentTime + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
        
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.5);
      } catch (e) {
        // Ignore audio context errors
      }

      return () => clearInterval(interval);
    } else {
      if (flashInterval) clearInterval(flashInterval);
      document.title = originalTitle;
    }
  }, [unreadCount, originalTitle]);

  useEffect(() => {
    const handleFocus = () => {
      clearUnread();
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [clearUnread]);

  return null;
}
