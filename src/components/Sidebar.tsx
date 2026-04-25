'use client';

import { useEffect, useState } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import { useUIStore } from '@/store/useUIStore';
import { Channel } from '@/types';
import { Hash, Plus } from 'lucide-react';
import toast from 'react-hot-toast';

export default function Sidebar() {
  const { token } = useAuthStore();
  const { activeChannel, setActiveChannel } = useUIStore();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [newChannelName, setNewChannelName] = useState('');

  const fetchChannels = async () => {
    try {
      const res = await fetch('/api/channels', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setChannels(data.channels);
      }
    } catch (e) {}
  };

  useEffect(() => {
    if (token) fetchChannels();
  }, [token]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChannelName.trim()) return;
    
    try {
      const res = await fetch('/api/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ name: newChannelName })
      });
      if (res.ok) {
        setNewChannelName('');
        setIsCreating(false);
        fetchChannels();
        toast.success('CHANNEL CREATED');
      } else {
        const data = await res.json();
        toast.error(data.error);
      }
    } catch (e) {}
  };

  return (
    <div className="w-64 bg-cyber-dark/80 border-r border-cyber-cyan/20 h-full flex flex-col font-mono text-sm shrink-0">
      <div className="p-4 border-b border-cyber-cyan/20">
        <h2 className="text-cyber-gray font-bold tracking-widest uppercase flex items-center justify-between">
          <span>CHANNELS</span>
          <button onClick={() => setIsCreating(!isCreating)} className="hover:text-cyber-cyan transition-colors">
            <Plus className="w-4 h-4" />
          </button>
        </h2>
      </div>

      {isCreating && (
        <form onSubmit={handleCreate} className="p-3 border-b border-cyber-cyan/20 bg-cyber-black/50">
          <input
            type="text"
            value={newChannelName}
            onChange={e => setNewChannelName(e.target.value)}
            placeholder="Channel Name"
            className="w-full bg-cyber-black border border-cyber-cyan/50 text-white p-2 outline-none text-xs"
            autoFocus
          />
        </form>
      )}

      <div className="flex-1 overflow-y-auto py-2 custom-scrollbar">
        {channels.map(c => (
          <button
            key={c.id}
            onClick={() => setActiveChannel(c)}
            className={`w-full flex items-center gap-2 px-4 py-2 transition-colors ${activeChannel.id === c.id ? 'bg-cyber-cyan/20 text-cyber-cyan border-l-2 border-cyber-cyan' : 'text-cyber-gray hover:bg-cyber-black hover:text-white border-l-2 border-transparent'}`}
          >
            <Hash className="w-4 h-4 opacity-70" />
            <span className="truncate">{c.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
