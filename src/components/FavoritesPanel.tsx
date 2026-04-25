'use client';

import { useEffect, useState } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import { useUIStore } from '@/store/useUIStore';
import { Favorite, FavoriteSingle, FavoriteCollection } from '@/types';
import { Star, Download, Trash2, Layers } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';

export default function FavoritesPanel() {
  const { user } = useAuthStore();
  const { activePanel } = useUIStore();
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchFavorites = async () => {
    try {
      const res = await fetch('/api/favorites');
      const data = await res.json();
      if (res.ok) setFavorites(data.favorites);
    } catch (e) {}
  };

  useEffect(() => {
    if (activePanel === 'favorites') fetchFavorites();
  }, [activePanel]);

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/favorites/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setFavorites(favorites.filter(f => f.id !== id));
        toast.success('FAVORITE DELETED');
      }
    } catch (e) {}
  };

  const handleExport = () => {
    window.open('/api/favorites/export', '_blank');
  };

  return (
    <div className="h-full flex flex-col font-mono text-sm bg-cyber-black/90 backdrop-blur-md border-l border-cyber-cyan/30">
      <div className="p-4 border-b border-cyber-cyan/30 flex items-center justify-between">
        <h2 className="text-cyber-cyan font-bold uppercase tracking-widest flex items-center gap-2">
          <Star className="w-5 h-5" />
          FAVORITES
        </h2>
        <button onClick={handleExport} className="text-cyber-cyan hover:text-white p-1 hover:bg-cyber-cyan/20 rounded transition-colors" title="Export as Markdown">
          <Download className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
        <AnimatePresence>
          {favorites.map(fav => {
            const isCollection = fav.type === 'collection';
            const coll = isCollection ? (fav as FavoriteCollection) : null;
            const single = !isCollection ? (fav as FavoriteSingle) : null;
            
            return (
              <motion.div
                key={fav.id}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="p-3 border border-cyber-cyan/20 bg-cyber-dark/50 hover:border-cyber-cyan/60 transition-all relative group"
              >
                <button
                  onClick={() => handleDelete(fav.id)}
                  className="absolute top-2 right-2 text-cyber-pink opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-cyber-pink/20 rounded"
                >
                  <Trash2 className="w-4 h-4" />
                </button>

                {isCollection ? (
                  <div>
                    <div className="flex items-center gap-2 text-cyber-cyan font-bold mb-2">
                      <Layers className="w-4 h-4" />
                      {coll?.title}
                    </div>
                    <div className="text-xs text-cyber-gray mb-3">{coll?.messages.length} MESSAGES</div>
                    <div className="space-y-2 pl-4 border-l-2 border-cyber-gray/30">
                      {coll?.messages.slice(0, 3).map(m => (
                        <div key={m.id} className="text-xs">
                          <span className="text-cyber-purple">[{m.username}]</span> {m.text?.substring(0, 50)}{m.text?.length! > 50 ? '...' : ''}
                        </div>
                      ))}
                      {coll?.messages.length! > 3 && <div className="text-xs text-cyber-gray">...and {coll?.messages.length! - 3} more</div>}
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="text-xs text-cyber-purple mb-1 font-bold">[{single?.message.username}]</div>
                    <div className="text-white text-sm break-words whitespace-pre-wrap">{single?.message.text}</div>
                    {single?.message.attachments?.map(a => (
                      <div key={a.id} className="text-xs text-cyber-cyan mt-1 truncate">📎 {a.name}</div>
                    ))}
                  </div>
                )}
                <div className="text-[10px] text-cyber-gray mt-3 text-right">
                  {new Date(fav.createdAt).toLocaleString()}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
