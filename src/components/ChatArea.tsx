'use client';

import { useEffect, useRef, useState } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import { useUIStore } from '@/store/useUIStore';
import { ChatMessage, Attachment, UserPublic } from '@/types';
import { Send, Paperclip, Loader2, Image as ImageIcon, FileText, Check, Star, Users, Trash, Eye } from 'lucide-react';
import { io, Socket } from 'socket.io-client';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

let socket: Socket | null = null;

export default function ChatArea() {
  const { user, token } = useAuthStore();
  const { incrementUnread, activeChannel } = useUIStore();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<UserPublic[]>([]);
  const [showOnline, setShowOnline] = useState(false);
  const [input, setInput] = useState('');
  const [uploading, setUploading] = useState(false);
  const [selectedMsgs, setSelectedMsgs] = useState<Set<string>>(new Set());
  const [isCollecting, setIsCollecting] = useState(false);
  const [collectionTitle, setCollectionTitle] = useState('');
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch initial messages when channel changes
  useEffect(() => {
    if (!token || !activeChannel.id) return;
    const fetchMessages = async () => {
      try {
        const res = await fetch(`/api/messages/${activeChannel.id}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setMessages(data.messages);
        }
      } catch (e) {}
    };
    fetchMessages();
  }, [activeChannel.id, token]);

  useEffect(() => {
    if (!token || !user) return;

    socket = io({
      path: '/api/socket',
      auth: { token },
      transports: ['websocket', 'polling']
    });

    socket.on('server:hello', () => {
      // Join active channel
      socket?.emit('channel:join', activeChannel.id);
    });

    socket.on('chat:message', (msg: ChatMessage) => {
      if (msg.room !== activeChannel.id) return;
      setMessages(prev => {
        if (prev.some(m => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
      
      // Auto-scroll on new messages if we're near the bottom
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 50);
      
      if (msg.userId !== user.id && document.visibilityState !== 'visible') {
        incrementUnread();
      }
    });

    socket.on('chat:message:update', (msg: ChatMessage) => {
      if (msg.room !== activeChannel.id) return;
      setMessages(prev => prev.map(m => m.id === msg.id ? msg : m));
      // Auto-scroll for stream updates
      messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
    });

    socket.on('channel:users', (data: { roomId: string; users: UserPublic[] }) => {
      if (data.roomId === activeChannel.id) {
        setOnlineUsers(data.users);
      }
    });

    return () => {
      if (socket) socket.disconnect();
    };
  }, [token, user, activeChannel.id, incrementUnread]);

  // Re-join channel when active channel changes
  useEffect(() => {
    if (socket && socket.connected) {
      socket.emit('channel:leave', activeChannel.id); // Try to leave previous
      socket.emit('channel:join', activeChannel.id);
    }
  }, [activeChannel.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-read messages when visible
  useEffect(() => {
    if (!socket || !user) return;
    const unreadMsgs = messages.filter(m => !m.readBy?.includes(user.id) && m.userId !== user.id && !m.isRecalled);
    
    unreadMsgs.forEach(m => {
      socket?.emit('chat:read', { messageId: m.id });
    });
  }, [messages, user]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !socket) return;
    
    socket.emit('chat:message', { roomId: activeChannel.id, text: input }, (res: any) => {
      if (!res.ok) toast.error(res.error || 'Failed to send message');
    });
    setInput('');
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    const formData = new FormData();
    Array.from(files).forEach(file => formData.append('files', file));

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      const attachmentIds = data.attachments.map((a: any) => a.id);
      if (socket) {
        socket.emit('chat:message', { roomId: activeChannel.id, attachmentIds });
      }
      toast.success('FILES TRANSMITTED');
    } catch (err: any) {
      toast.error(err.message || 'UPLOAD FAILED');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const toggleSelect = (id: string) => {
    const newSet = new Set(selectedMsgs);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedMsgs(newSet);
  };

  const handleSaveCollection = async () => {
    if (selectedMsgs.size === 0) return;
    if (selectedMsgs.size === 1) {
      // Single
      try {
        const res = await fetch('/api/favorites', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ messageId: Array.from(selectedMsgs)[0] })
        });
        if (res.ok) {
          toast.success('FAVORITE SAVED');
          setIsCollecting(false);
          setSelectedMsgs(new Set());
        } else {
          const d = await res.json();
          toast.error(d.error);
        }
      } catch (e) {}
    } else {
      // Multi
      if (!collectionTitle.trim()) {
        toast.error('ENTER COLLECTION TITLE');
        return;
      }
      try {
        const res = await fetch('/api/favorites', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ messageIds: Array.from(selectedMsgs), title: collectionTitle })
        });
        if (res.ok) {
          toast.success('COLLECTION SAVED');
          setIsCollecting(false);
          setSelectedMsgs(new Set());
          setCollectionTitle('');
        } else {
          const d = await res.json();
          toast.error(d.error);
        }
      } catch (e) {}
    }
  };

  const handleRecall = (messageId: string) => {
    if (!socket) return;
    socket.emit('chat:recall', { messageId }, (res: any) => {
      if (!res.ok) toast.error(res.error || 'Failed to recall');
    });
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-cyber-black relative overflow-hidden font-mono">
      {/* HUD Background Grid */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.03] bg-[linear-gradient(var(--color-cyber-cyan)_1px,transparent_1px),linear-gradient(90deg,var(--color-cyber-cyan)_1px,transparent_1px)] bg-[size:40px_40px] z-0"></div>

      {/* Top Info Bar */}
      <div className="h-10 border-b border-cyber-cyan/20 bg-cyber-dark/80 flex items-center justify-between px-4 z-10 text-xs relative">
        <div className="flex items-center gap-3">
          <span className="text-cyber-cyan flex items-center gap-2">
            <div className="w-2 h-2 bg-cyber-cyan rounded-full animate-pulse shadow-[0_0_8px_var(--color-cyber-cyan)]" />
            {activeChannel.name}
          </span>
          <span className="text-cyber-gray">|</span>
          <button 
            onClick={() => setShowOnline(!showOnline)}
            className="text-cyber-gray hover:text-white transition-colors flex items-center gap-1"
          >
            <Users className="w-3 h-3" /> {onlineUsers.length} ONLINE
          </button>
        </div>
        
        {/* Online Users Dropdown */}
        <AnimatePresence>
          {showOnline && (
            <motion.div 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="absolute top-10 left-4 w-48 bg-cyber-black/95 border border-cyber-cyan/30 shadow-lg p-2 z-50 max-h-60 overflow-y-auto"
            >
              {onlineUsers.map(u => (
                <div key={u.id} className="flex items-center gap-2 py-1 px-2 hover:bg-cyber-cyan/10">
                  <div className="w-1.5 h-1.5 bg-cyber-green rounded-full shadow-[0_0_5px_var(--color-cyber-green)]" />
                  <span className={u.id === user?.id ? 'text-cyber-cyan' : 'text-gray-300'}>{u.username}</span>
                  {u.role === 'admin' && <span className="text-[9px] bg-cyber-purple/20 text-cyber-purple px-1 ml-auto">ADMIN</span>}
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
        
        <div className="flex items-center gap-4">
          {isCollecting ? (
            <div className="flex items-center gap-2">
              <span className="text-cyber-cyan">{selectedMsgs.size} SELECTED</span>
              {selectedMsgs.size > 1 && (
                <input 
                  type="text" 
                  placeholder="Collection Title" 
                  value={collectionTitle}
                  onChange={e => setCollectionTitle(e.target.value)}
                  className="bg-cyber-black border border-cyber-cyan/50 text-white px-2 py-0.5 outline-none w-32"
                />
              )}
              <button onClick={handleSaveCollection} className="bg-cyber-cyan/20 text-cyber-cyan px-2 py-0.5 border border-cyber-cyan hover:bg-cyber-cyan hover:text-black transition-colors">
                SAVE
              </button>
              <button onClick={() => {setIsCollecting(false); setSelectedMsgs(new Set());}} className="text-cyber-pink px-2 hover:bg-cyber-pink/20 transition-colors">
                CANCEL
              </button>
            </div>
          ) : (
            <button onClick={() => setIsCollecting(true)} className="text-cyber-gray hover:text-cyber-cyan transition-colors flex items-center gap-1">
              <Star className="w-3 h-3" /> COLLECT
            </button>
          )}
        </div>
      </div>

      {/* Message List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6 z-10 custom-scrollbar scroll-smooth">
        <AnimatePresence initial={false}>
          {messages.map((msg, idx) => {
            const isMe = msg.userId === user?.id;
            const isSelected = selectedMsgs.has(msg.id);
            
            return (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} group`}
              >
                <div className="flex items-center gap-2 mb-1 opacity-70 group-hover:opacity-100 transition-opacity">
                  {!isMe && <span className="text-xs text-cyber-purple font-bold">[{msg.username}]</span>}
                  <span className="text-[10px] text-cyber-gray">{new Date(msg.createdAt).toLocaleTimeString()}</span>
                  {isMe && <span className="text-xs text-cyber-green font-bold">[{msg.username}]</span>}
                </div>

                <div className="flex items-start gap-2 max-w-[80%] relative">
                  {isCollecting && !isMe && !msg.isRecalled && (
                    <button onClick={() => toggleSelect(msg.id)} className="mt-2 text-cyber-gray hover:text-cyber-cyan">
                      {isSelected ? <Check className="w-4 h-4 text-cyber-cyan" /> : <div className="w-4 h-4 border border-cyber-gray" />}
                    </button>
                  )}

                  <div className={`p-3 relative group/msg ${isMe ? 'bg-cyber-dark/80 border border-cyber-cyan/30 text-cyber-cyan glow-border' : 'bg-cyber-gray/30 border border-transparent text-gray-300'} ${msg.isRecalled ? 'opacity-50 italic' : ''}`}>
                    {/* Corner accents */}
                    <div className={`absolute top-0 left-0 w-1.5 h-1.5 border-t border-l ${isMe ? 'border-cyber-cyan' : 'border-cyber-gray'}`} />
                    <div className={`absolute bottom-0 right-0 w-1.5 h-1.5 border-b border-r ${isMe ? 'border-cyber-cyan' : 'border-cyber-gray'}`} />

                    {/* Recall Button (Hover) */}
                    {isMe && !msg.isRecalled && !isCollecting && (
                      <button 
                        onClick={() => handleRecall(msg.id)}
                        className="absolute -top-3 -right-2 opacity-0 group-hover/msg:opacity-100 transition-opacity bg-cyber-pink/20 text-cyber-pink border border-cyber-pink px-1 text-[9px] hover:bg-cyber-pink hover:text-white"
                      >
                        RECALL
                      </button>
                    )}

                    {msg.text && (
                      <div className="prose prose-invert max-w-none prose-p:leading-relaxed prose-pre:bg-cyber-black prose-pre:border prose-pre:border-cyber-gray/30 text-sm">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.text}</ReactMarkdown>
                      </div>
                    )}
                    
                    {msg.attachments?.length > 0 && !msg.isRecalled && (
                      <div className="mt-2 space-y-2">
                        {msg.attachments.map(att => (
                          <a 
                            key={att.id} 
                            href={att.url} 
                            target="_blank" 
                            rel="noreferrer"
                            className="flex items-center gap-2 p-2 bg-cyber-black/50 border border-cyber-gray/30 hover:border-cyber-cyan/50 transition-colors text-xs"
                          >
                            {att.isImage ? <ImageIcon className="w-4 h-4 text-cyber-pink" /> : <FileText className="w-4 h-4 text-cyber-blue" />}
                            <span className="truncate max-w-[200px]">{att.name}</span>
                            <span className="text-[10px] text-cyber-gray">{(att.size / 1024).toFixed(1)}KB</span>
                          </a>
                        ))}
                      </div>
                    )}
                    
                    {/* Read Receipt */}
                    {isMe && !msg.isRecalled && (
                      <div className="absolute -bottom-4 right-0 text-[9px] text-cyber-gray flex items-center gap-1">
                        <Eye className="w-3 h-3" />
                        {msg.readBy ? msg.readBy.length : 1}
                      </div>
                    )}
                  </div>

                  {isCollecting && isMe && !msg.isRecalled && (
                    <button onClick={() => toggleSelect(msg.id)} className="mt-2 text-cyber-gray hover:text-cyber-cyan">
                      {isSelected ? <Check className="w-4 h-4 text-cyber-cyan" /> : <div className="w-4 h-4 border border-cyber-gray" />}
                    </button>
                  )}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 bg-cyber-dark/80 border-t border-cyber-cyan/20 z-10">
        <form onSubmit={handleSend} className="flex gap-3 items-end">
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileUpload} 
            className="hidden" 
            multiple 
          />
          <button 
            type="button" 
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="p-3 bg-cyber-black border border-cyber-gray/50 text-cyber-gray hover:text-cyber-cyan hover:border-cyber-cyan transition-all"
          >
            {uploading ? <Loader2 className="w-5 h-5 animate-spin text-cyber-cyan" /> : <Paperclip className="w-5 h-5" />}
          </button>
          
          <div className="flex-1 relative group">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend(e);
                }
              }}
              placeholder="TRANSMIT MESSAGE..."
              className="w-full bg-cyber-black/80 border border-cyber-gray/50 text-white p-3 pr-10 focus:outline-none focus:border-cyber-cyan glow-border resize-none h-[48px] max-h-[120px] custom-scrollbar"
              rows={1}
            />
            {/* Typing indicator scanning line */}
            <div className="absolute bottom-0 left-0 h-[1px] bg-cyber-cyan w-0 group-focus-within:w-full transition-all duration-500" />
          </div>

          <button 
            type="submit" 
            disabled={!input.trim() || uploading}
            className="p-3 bg-cyber-cyan/10 border border-cyber-cyan text-cyber-cyan hover:bg-cyber-cyan hover:text-black transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send className="w-5 h-5" />
          </button>
        </form>
      </div>
    </div>
  );
}
