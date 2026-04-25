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
    
    socket.join('general');
    socket.emit('server:hello', { user, room: 'general' });

    socket.on('chat:message', async (payload, ack) => {
      try {
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
            room: 'general',
            userId: user.id,
            username: user.username,
            text,
            sticker: validSticker ? sticker : '',
            attachments: atts,
            createdAt: Date.now()
          };
          db.messages.push(m);
          if (db.messages.length > 2000) db.messages = db.messages.slice(-2000);
          return { db, result: m };
        });

        if (newMsg) {
          io.to('general').emit('chat:message', newMsg);
          io.to('general').emit('notification:new', newMsg);
        }
        
        if (ack) ack({ ok: true });
      } catch (e: any) {
        if (ack) ack({ ok: false, error: e.message || '发送失败' });
      }
    });

    socket.on('disconnect', () => {
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
