'use client';

import { useEffect, useRef, useState } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import { useUIStore } from '@/store/useUIStore';
import { ChatMessage, Attachment } from '@/types';
import { Send, Paperclip, Loader2, Image as ImageIcon, FileText, Check, Star } from 'lucide-react';
import { io, Socket } from 'socket.io-client';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

let socket: Socket | null = null;

export default function ChatArea() {
  const { user, token } = useAuthStore();
  const { incrementUnread, activeChatTitle } = useUIStore();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [uploading, setUploading] = useState(false);
  const [onlineCount, setOnlineCount] = useState(1);
  const [selectedMsgs, setSelectedMsgs] = useState<Set<string>>(new Set());
  const [isCollecting, setIsCollecting] = useState(false);
  const [collectionTitle, setCollectionTitle] = useState('');
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!token || !user) return;

    socket = io({
      path: '/api/socket',
      auth: { token },
      transports: ['websocket', 'polling']
    });

    socket.on('server:hello', (data) => {
      // toast.success(`CONNECTED TO ${data.room.toUpperCase()}`);
    });

    socket.on('chat:message', (msg: ChatMessage) => {
      setMessages(prev => {
        if (prev.some(m => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
      
      if (msg.userId !== user.id && document.visibilityState !== 'visible') {
        incrementUnread();
      }
    });

    return () => {
      if (socket) socket.disconnect();
    };
  }, [token, user, incrementUnread]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !socket) return;
    
    socket.emit('chat:message', { text: input }, (res: any) => {
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
        socket.emit('chat:message', { attachmentIds });
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

  return (
    <div className="flex-1 flex flex-col h-full bg-cyber-black relative overflow-hidden font-mono">
      {/* HUD Background Grid */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.03] bg-[linear-gradient(var(--color-cyber-cyan)_1px,transparent_1px),linear-gradient(90deg,var(--color-cyber-cyan)_1px,transparent_1px)] bg-[size:40px_40px] z-0"></div>

      {/* Top Info Bar */}
      <div className="h-10 border-b border-cyber-cyan/20 bg-cyber-dark/80 flex items-center justify-between px-4 z-10 text-xs">
        <div className="flex items-center gap-3">
          <span className="text-cyber-cyan flex items-center gap-2">
            <div className="w-2 h-2 bg-cyber-cyan rounded-full animate-pulse shadow-[0_0_8px_var(--color-cyber-cyan)]" />
            {activeChatTitle}
          </span>
          <span className="text-cyber-gray">|</span>
          <span className="text-cyber-gray">ENCRYPTED P2P LINK</span>
        </div>
        
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
                  {isCollecting && !isMe && (
                    <button onClick={() => toggleSelect(msg.id)} className="mt-2 text-cyber-gray hover:text-cyber-cyan">
                      {isSelected ? <Check className="w-4 h-4 text-cyber-cyan" /> : <div className="w-4 h-4 border border-cyber-gray" />}
                    </button>
                  )}

                  <div className={`p-3 relative ${isMe ? 'bg-cyber-dark/80 border border-cyber-cyan/30 text-cyber-cyan glow-border' : 'bg-cyber-gray/30 border border-transparent text-gray-300'}`}>
                    {/* Corner accents */}
                    <div className={`absolute top-0 left-0 w-1.5 h-1.5 border-t border-l ${isMe ? 'border-cyber-cyan' : 'border-cyber-gray'}`} />
                    <div className={`absolute bottom-0 right-0 w-1.5 h-1.5 border-b border-r ${isMe ? 'border-cyber-cyan' : 'border-cyber-gray'}`} />

                    {msg.text && (
                      <div className="prose prose-invert max-w-none prose-p:leading-relaxed prose-pre:bg-cyber-black prose-pre:border prose-pre:border-cyber-gray/30 text-sm">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.text}</ReactMarkdown>
                      </div>
                    )}
                    
                    {msg.attachments?.length > 0 && (
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
                  </div>

                  {isCollecting && isMe && (
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
