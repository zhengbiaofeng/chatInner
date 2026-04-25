'use client';

import { useEffect, useState } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import { useUIStore } from '@/store/useUIStore';
import { Todo } from '@/types';
import { CheckSquare, Square, Plus, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';

export default function TodoPanel() {
  const { user } = useAuthStore();
  const { activePanel } = useUIStore();
  const [todos, setTodos] = useState<Todo[]>([]);
  const [newTodo, setNewTodo] = useState('');
  const [loading, setLoading] = useState(false);

  const fetchTodos = async () => {
    try {
      const res = await fetch('/api/todos');
      const data = await res.json();
      if (res.ok) setTodos(data.todos);
    } catch (e) {}
  };

  useEffect(() => {
    if (activePanel === 'todos') fetchTodos();
  }, [activePanel]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTodo.trim()) return;
    setLoading(true);
    try {
      const res = await fetch('/api/todos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: newTodo }),
      });
      if (res.ok) {
        setNewTodo('');
        fetchTodos();
        toast.success('TASK CREATED');
      } else {
        toast.error('FAILED TO CREATE TASK');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async (id: string, current: boolean) => {
    try {
      const res = await fetch(`/api/todos/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed: !current }),
      });
      if (res.ok) {
        setTodos(todos.map(t => t.id === id ? { ...t, completed: !current } : t));
      }
    } catch (e) {}
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/todos/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setTodos(todos.filter(t => t.id !== id));
        toast.success('TASK DELETED');
      }
    } catch (e) {}
  };

  return (
    <div className="h-full flex flex-col font-mono text-sm bg-cyber-black/90 backdrop-blur-md border-l border-cyber-cyan/30">
      <div className="p-4 border-b border-cyber-cyan/30 flex items-center justify-between">
        <h2 className="text-cyber-cyan font-bold uppercase tracking-widest flex items-center gap-2">
          <CheckSquare className="w-5 h-5" />
          TASK BOARD
        </h2>
        <span className="text-[10px] text-cyber-gray uppercase tracking-widest">{todos.filter(t => !t.completed).length} PENDING</span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
        <AnimatePresence>
          {todos.map(todo => (
            <motion.div
              key={todo.id}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className={`p-3 border transition-all ${todo.completed ? 'border-cyber-gray/30 bg-cyber-black opacity-50' : 'border-cyber-cyan/30 bg-cyber-cyan/5 hover:border-cyber-cyan/60'}`}
            >
              <div className="flex items-start gap-3">
                <button onClick={() => handleToggle(todo.id, todo.completed)} className="mt-1">
                  {todo.completed ? <CheckSquare className="w-4 h-4 text-cyber-gray" /> : <Square className="w-4 h-4 text-cyber-cyan" />}
                </button>
                <div className="flex-1 min-w-0">
                  <p className={`break-words ${todo.completed ? 'line-through text-cyber-gray' : 'text-white'}`}>{todo.content}</p>
                  <div className="text-[10px] text-cyber-gray uppercase mt-2 flex justify-between">
                    <span>CREATED BY: {todo.creatorName}</span>
                    <span>{new Date(todo.createdAt).toLocaleString()}</span>
                  </div>
                </div>
                {(user?.role === 'admin' || user?.id === todo.creatorId) && (
                  <button onClick={() => handleDelete(todo.id)} className="text-cyber-pink hover:bg-cyber-pink/20 p-1 rounded transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <div className="p-4 border-t border-cyber-cyan/30 bg-cyber-dark/50">
        <form onSubmit={handleAdd} className="flex gap-2">
          <input
            type="text"
            value={newTodo}
            onChange={e => setNewTodo(e.target.value)}
            placeholder="New Task..."
            className="flex-1 bg-cyber-black/50 border border-cyber-gray/30 text-white p-2 focus:outline-none focus:border-cyber-cyan placeholder-cyber-gray"
          />
          <button type="submit" disabled={loading} className="bg-cyber-cyan/20 border border-cyber-cyan text-cyber-cyan p-2 hover:bg-cyber-cyan/40 transition-colors flex items-center justify-center">
            {loading ? <div className="w-4 h-4 border-2 border-cyber-cyan border-t-transparent rounded-full animate-spin" /> : <Plus className="w-5 h-5" />}
          </button>
        </form>
      </div>
    </div>
  );
}
