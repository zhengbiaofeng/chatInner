import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { Server as SocketIOServer } from 'socket.io';
import { ServerToClientEvents, ClientToServerEvents, InterServerEvents, SocketData, ChatMessage } from './src/types';
import { verifyToken } from './src/lib/auth';
import { readDb, updateDb } from './src/lib/db';
import crypto from 'crypto';

const dev = process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

function genId() { return crypto.randomBytes(16).toString('hex'); }

app.prepare().then(() => {
  const server = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url!, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error occurred handling', req.url, err);
      res.statusCode = 500;
      res.end('internal server error');
    }
  });

  const io = new SocketIOServer<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>(server, {
    path: '/api/socket',
    addTrailingSlash: false,
    cors: { origin: '*' },
  });

  // Track users per room: Map<roomId, Map<socketId, UserPublic>>
  const roomUsers = new Map<string, Map<string, any>>();

  const broadcastRoomUsers = (roomId: string) => {
    const usersMap = roomUsers.get(roomId);
    if (!usersMap) return;
    // Deduplicate by user ID
    const uniqueUsers = new Map<string, any>();
    usersMap.forEach((u) => uniqueUsers.set(u.id, u));
    io.to(roomId).emit('channel:users', { roomId, users: Array.from(uniqueUsers.values()) });
  };

  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error('Authentication error'));
    const user = verifyToken(token);
    if (!user) return next(new Error('Authentication error'));
    socket.data.user = user;
    next();
  });

  io.on('connection', (socket) => {
    const user = socket.data.user;
    if (!user) return socket.disconnect();
    
    console.log(`🟢 Socket connected: ${user.username} (${socket.id})`);
    
    // Auto-join general room on connection
    socket.join('general');
    if (!roomUsers.has('general')) roomUsers.set('general', new Map());
    roomUsers.get('general')!.set(socket.id, user);
    
    socket.emit('server:hello', { user, room: 'general' });
    broadcastRoomUsers('general');

    socket.on('channel:join', (roomId, ack) => {
      socket.join(roomId);
      if (!roomUsers.has(roomId)) roomUsers.set(roomId, new Map());
      roomUsers.get(roomId)!.set(socket.id, user);
      broadcastRoomUsers(roomId);
      if (ack) ack({ ok: true });
    });

    socket.on('channel:leave', (roomId) => {
      socket.leave(roomId);
      const roomMap = roomUsers.get(roomId);
      if (roomMap) {
        roomMap.delete(socket.id);
        broadcastRoomUsers(roomId);
      }
    });

    socket.on('chat:message', async (payload, ack) => {
      try {
        const roomId = payload.roomId || 'general';
        const text = String(payload?.text || '').trim();
        const attachmentIds = Array.isArray(payload?.attachmentIds) ? payload.attachmentIds : [];
        const sticker = typeof payload?.sticker === 'string' ? payload.sticker.trim() : '';
        const validSticker = sticker && sticker.startsWith('/stickers/') && sticker.length < 120;

        if (!text && attachmentIds.length === 0 && !validSticker) return;

        const newMsg = await updateDb<ChatMessage>(async (db) => {
          const atts = attachmentIds
            .map((id) => db.attachments.find((a) => a.id === id))
            .filter((a): a is NonNullable<typeof a> => Boolean(a))
            .map((a) => ({
              id: a.id,
              name: a.originalName,
              mime: a.mime,
              size: a.size,
              isImage: String(a.mime || '').startsWith('image/'),
              url: `/file/${encodeURIComponent(a.id)}`
            }));

          const m: ChatMessage = {
            id: genId(),
            room: roomId,
            userId: user.id,
            username: user.username,
            text,
            sticker: validSticker ? sticker : '',
            attachments: atts,
            createdAt: Date.now(),
            isRecalled: false,
            readBy: [user.id] // Creator automatically reads their own message
          };
          db.messages.push(m);
          // Only keep 2000 messages total across all rooms to avoid unbounded growth
          if (db.messages.length > 2000) db.messages = db.messages.slice(-2000);
          return { db, result: m };
        });

        if (newMsg) {
          io.to(roomId).emit('chat:message', newMsg);
          io.to(roomId).emit('notification:new', newMsg);
        }
        
        if (ack) ack({ ok: true });
      } catch (e: any) {
        if (ack) ack({ ok: false, error: e.message || '发送失败' });
      }
    });

    socket.on('chat:recall', async (payload, ack) => {
      try {
        const { messageId } = payload;
        if (!messageId) throw new Error('Missing messageId');

        const updatedMsg = await updateDb<ChatMessage>(async (db) => {
          const m = db.messages.find(x => x.id === messageId);
          if (!m) throw new Error('Message not found');

          // Check permissions: only admin or the creator can recall
          // Check time limit: 2 minutes (120000 ms) for normal users. Admins can recall anytime.
          if (user.role !== 'admin') {
            if (m.userId !== user.id) throw new Error('No permission to recall this message');
            if (Date.now() - m.createdAt > 120000) throw new Error('Time limit exceeded (2 minutes)');
          }

          m.isRecalled = true;
          m.text = '[操作员已销毁一条加密信息]';
          m.attachments = [];
          m.sticker = '';

          return { db, result: m };
        });

        if (updatedMsg) {
          io.to(updatedMsg.room).emit('chat:message:update', updatedMsg);
        }
        
        if (ack) ack({ ok: true });
      } catch (e: any) {
        if (ack) ack({ ok: false, error: e.message || '撤回失败' });
      }
    });

    socket.on('chat:read', async (payload) => {
      try {
        const { messageId } = payload;
        if (!messageId) return;

        const updatedMsg = await updateDb<ChatMessage>(async (db) => {
          const m = db.messages.find(x => x.id === messageId);
          if (!m) return { db };

          if (!m.readBy) m.readBy = [];
          if (!m.readBy.includes(user.id)) {
            m.readBy.push(user.id);
            return { db, result: m };
          }
          return { db };
        });

        if (updatedMsg) {
          // Broadcast update so others see the read receipt increment
          io.to(updatedMsg.room).emit('chat:message:update', updatedMsg);
        }
      } catch (e) {
        console.error('Error marking message as read', e);
      }
    });

    socket.on('disconnect', () => {
      roomUsers.forEach((usersMap, roomId) => {
        if (usersMap.has(socket.id)) {
          usersMap.delete(socket.id);
          broadcastRoomUsers(roomId);
        }
      });
      console.log(`🔴 Socket disconnected: ${user.username} (${socket.id})`);
    });
  });

  server.once('error', (err) => {
    console.error(err);
    process.exit(1);
  });

  server.listen(port, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
  });
});
