"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server.ts
var import_http = require("http");
var import_url = require("url");
var import_next = __toESM(require("next"));
var import_socket = require("socket.io");

// src/lib/auth.ts
var import_jsonwebtoken = __toESM(require("jsonwebtoken"));
var import_fs = __toESM(require("fs"));
var import_path2 = __toESM(require("path"));

// src/lib/db.ts
var import_promises = __toESM(require("fs/promises"));
var import_path = __toESM(require("path"));
var DB_PATH = import_path.default.join(process.cwd(), "data", "db.json");
var lock = Promise.resolve();
async function readDb() {
  try {
    const data = await import_promises.default.readFile(DB_PATH, "utf-8");
    const parsed = JSON.parse(data);
    let users = parsed.users || [];
    if (!users.some((u) => u.username === "NexusBot")) {
      users.push({
        id: "nexus-bot-00000000000000000000",
        username: "NexusBot",
        passwordHash: "not_applicable",
        role: "admin",
        createdAt: 0
      });
    }
    return {
      users,
      channels: parsed.channels || [
        { id: "general", name: "\u603B\u53F0 (GENERAL)", type: "public", creatorId: "system", createdAt: Date.now() }
      ],
      messages: parsed.messages || [],
      attachments: parsed.attachments || [],
      todos: parsed.todos || [],
      favorites: parsed.favorites || []
    };
  } catch (e) {
    return {
      users: [
        {
          id: "nexus-bot-00000000000000000000",
          username: "NexusBot",
          passwordHash: "not_applicable",
          role: "admin",
          createdAt: 0
        }
      ],
      channels: [{ id: "general", name: "\u603B\u53F0 (GENERAL)", type: "public", creatorId: "system", createdAt: Date.now() }],
      messages: [],
      attachments: [],
      todos: [],
      favorites: []
    };
  }
}
async function writeDb(db) {
  await import_promises.default.writeFile(DB_PATH, JSON.stringify(db, null, 2), "utf-8");
}
async function updateDb(updater) {
  const next2 = lock.then(async () => {
    const db = await readDb();
    const res = await updater(db);
    if (res && "db" in res) {
      await writeDb(res.db);
      return res.result;
    } else {
      await writeDb(res);
    }
  }).catch((err) => {
    console.error("DB Update Error:", err);
    throw err;
  });
  lock = next2.then(() => {
  }).catch(() => {
  });
  return next2;
}

// src/lib/auth.ts
var SECRET_PATH = import_path2.default.join(process.cwd(), "data", "jwt_secret.txt");
var secret = "default_jwt_secret_please_change";
try {
  secret = import_fs.default.readFileSync(SECRET_PATH, "utf-8").trim();
} catch (e) {
}
var JWT_SECRET = secret;
function verifyToken(token) {
  try {
    return import_jsonwebtoken.default.verify(token, JWT_SECRET);
  } catch (e) {
    return null;
  }
}

// server.ts
var import_crypto = __toESM(require("crypto"));

// src/lib/qwen.ts
async function streamChatWithQwen(messages, onChunk, onDone, onError) {
  const API_URL = process.env.QWEN_API_URL || "https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation";
  const API_KEY = process.env.QWEN_API_KEY || "dummy_key_please_replace";
  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
        "Accept": "text/event-stream"
      },
      body: JSON.stringify({
        model: process.env.QWEN_MODEL || "qwen-turbo",
        input: {
          messages
        },
        parameters: {
          incremental_output: true,
          result_format: "message"
        }
      })
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`API Error: ${res.status} ${errText}`);
    }
    if (!res.body) throw new Error("No response body");
    const reader = res.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let fullText = "";
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        if (line.startsWith("data:")) {
          const dataStr = line.slice(5).trim();
          if (!dataStr) continue;
          try {
            const data = JSON.parse(dataStr);
            const chunk = data.output?.choices?.[0]?.message?.content || "";
            if (chunk) {
              fullText += chunk;
              onChunk(chunk);
            }
          } catch (e) {
          }
        }
      }
    }
    onDone(fullText);
  } catch (err) {
    console.error("Qwen API Error:", err);
    if (err.message.includes("dummy_key") || err.message.includes("API Error: 401") || err.message.includes("API Error: 404")) {
      const mockResponse = `[SYSTEM_WARNING] \u5927\u6A21\u578B\u8FDE\u63A5\u5931\u8D25\u3002\u60A8\u597D\uFF0C\u6211\u662F NexusBot\u3002\u7531\u4E8E\u7BA1\u7406\u5458\u672A\u914D\u7F6E QWEN_API_KEY\uFF0C\u6211\u76EE\u524D\u5904\u4E8E\u79BB\u7EBF\u964D\u7EA7\u6A21\u5F0F\u3002\u60A8\u53EF\u4EE5\u8BBE\u7F6E\u73AF\u5883\u53D8\u91CF\u6765\u6FC0\u6D3B\u6211\u7684\u795E\u7ECF\u7F51\u7EDC\u3002`;
      let currentText = "";
      for (let i = 0; i < mockResponse.length; i++) {
        currentText += mockResponse[i];
        onChunk(mockResponse[i]);
        await new Promise((r) => setTimeout(r, 20));
      }
      onDone(currentText);
      return;
    }
    onError(err);
  }
}

// server.ts
var dev = process.env.NODE_ENV !== "production";
var hostname = "localhost";
var port = parseInt(process.env.PORT || "3000", 10);
var app = (0, import_next.default)({ dev, hostname, port });
var handle = app.getRequestHandler();
function genId() {
  return import_crypto.default.randomBytes(16).toString("hex");
}
app.prepare().then(() => {
  const server = (0, import_http.createServer)(async (req, res) => {
    try {
      const parsedUrl = (0, import_url.parse)(req.url, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error("Error occurred handling", req.url, err);
      res.statusCode = 500;
      res.end("internal server error");
    }
  });
  const io = new import_socket.Server(server, {
    path: "/api/socket",
    addTrailingSlash: false,
    cors: { origin: "*" }
  });
  const roomUsers = /* @__PURE__ */ new Map();
  const broadcastRoomUsers = (roomId) => {
    const usersMap = roomUsers.get(roomId);
    if (!usersMap) return;
    const uniqueUsers = /* @__PURE__ */ new Map();
    usersMap.forEach((u) => uniqueUsers.set(u.id, u));
    io.to(roomId).emit("channel:users", { roomId, users: Array.from(uniqueUsers.values()) });
  };
  io.use((socket, next2) => {
    const token = socket.handshake.auth.token;
    if (!token) return next2(new Error("Authentication error"));
    const user = verifyToken(token);
    if (!user) return next2(new Error("Authentication error"));
    socket.data.user = user;
    next2();
  });
  io.on("connection", (socket) => {
    const user = socket.data.user;
    if (!user) return socket.disconnect();
    console.log(`\u{1F7E2} Socket connected: ${user.username} (${socket.id})`);
    socket.join("general");
    if (!roomUsers.has("general")) roomUsers.set("general", /* @__PURE__ */ new Map());
    roomUsers.get("general").set(socket.id, user);
    socket.emit("server:hello", { user, room: "general" });
    broadcastRoomUsers("general");
    socket.on("channel:join", (roomId, ack) => {
      socket.join(roomId);
      if (!roomUsers.has(roomId)) roomUsers.set(roomId, /* @__PURE__ */ new Map());
      roomUsers.get(roomId).set(socket.id, user);
      broadcastRoomUsers(roomId);
      if (ack) ack({ ok: true });
    });
    socket.on("channel:leave", (roomId) => {
      socket.leave(roomId);
      const roomMap = roomUsers.get(roomId);
      if (roomMap) {
        roomMap.delete(socket.id);
        broadcastRoomUsers(roomId);
      }
    });
    socket.on("chat:message", async (payload, ack) => {
      try {
        const roomId = payload.roomId || "general";
        const text = String(payload?.text || "").trim();
        const attachmentIds = Array.isArray(payload?.attachmentIds) ? payload.attachmentIds : [];
        const sticker = typeof payload?.sticker === "string" ? payload.sticker.trim() : "";
        const validSticker = sticker && sticker.startsWith("/stickers/") && sticker.length < 120;
        if (!text && attachmentIds.length === 0 && !validSticker) return;
        const newMsg = await updateDb(async (db) => {
          const atts = attachmentIds.map((id) => db.attachments.find((a) => a.id === id)).filter((a) => Boolean(a)).map((a) => ({
            id: a.id,
            name: a.originalName,
            mime: a.mime,
            size: a.size,
            isImage: String(a.mime || "").startsWith("image/"),
            url: `/file/${encodeURIComponent(a.id)}`
          }));
          const m = {
            id: genId(),
            room: roomId,
            userId: user.id,
            username: user.username,
            text,
            sticker: validSticker ? sticker : "",
            attachments: atts,
            createdAt: Date.now(),
            isRecalled: false,
            readBy: [user.id]
            // Creator automatically reads their own message
          };
          db.messages.push(m);
          if (db.messages.length > 2e3) db.messages = db.messages.slice(-2e3);
          return { db, result: m };
        });
        if (newMsg) {
          io.to(roomId).emit("chat:message", newMsg);
          io.to(roomId).emit("notification:new", newMsg);
          if (text.includes("@NexusBot")) {
            const botUser = {
              id: "nexus-bot-00000000000000000000",
              username: "NexusBot",
              role: "admin",
              createdAt: 0
            };
            const botMsgId = genId();
            let botMsgText = "";
            const initialBotMsg = {
              id: botMsgId,
              room: roomId,
              userId: botUser.id,
              username: botUser.username,
              text: "\u258A...",
              // Typing indicator
              sticker: "",
              attachments: [],
              createdAt: Date.now(),
              isRecalled: false,
              readBy: [botUser.id]
            };
            io.to(roomId).emit("chat:message", initialBotMsg);
            const promptText = text.replace(/@NexusBot/g, "").trim();
            const conversationHistory = [
              { role: "system", content: "You are NexusBot, a highly advanced AI assistant inside a cyberpunk intranet chat system. Keep your answers concise, technical, and helpful." },
              { role: "user", content: promptText || "Hello" }
            ];
            let lastUpdate = Date.now();
            let currentText = "";
            streamChatWithQwen(
              conversationHistory,
              (chunk) => {
                currentText += chunk;
                if (Date.now() - lastUpdate > 100) {
                  io.to(roomId).emit("chat:message:update", {
                    ...initialBotMsg,
                    text: currentText + "\u258A"
                  });
                  lastUpdate = Date.now();
                }
              },
              async (fullText) => {
                const finalMsg = await updateDb(async (db) => {
                  const m = {
                    ...initialBotMsg,
                    text: fullText
                  };
                  db.messages.push(m);
                  if (db.messages.length > 2e3) db.messages = db.messages.slice(-2e3);
                  return { db, result: m };
                });
                if (finalMsg) {
                  io.to(roomId).emit("chat:message:update", finalMsg);
                  io.to(roomId).emit("notification:new", finalMsg);
                }
              },
              (err) => {
                io.to(roomId).emit("chat:message:update", {
                  ...initialBotMsg,
                  text: "[SYSTEM_ERROR] Neural link disconnected. Check API configuration."
                });
              }
            );
          }
        }
        if (ack) ack({ ok: true });
      } catch (e) {
        if (ack) ack({ ok: false, error: e.message || "\u53D1\u9001\u5931\u8D25" });
      }
    });
    socket.on("chat:recall", async (payload, ack) => {
      try {
        const { messageId } = payload;
        if (!messageId) throw new Error("Missing messageId");
        const updatedMsg = await updateDb(async (db) => {
          const m = db.messages.find((x) => x.id === messageId);
          if (!m) throw new Error("Message not found");
          if (user.role !== "admin") {
            if (m.userId !== user.id) throw new Error("No permission to recall this message");
            if (Date.now() - m.createdAt > 12e4) throw new Error("Time limit exceeded (2 minutes)");
          }
          m.isRecalled = true;
          m.text = "[\u64CD\u4F5C\u5458\u5DF2\u9500\u6BC1\u4E00\u6761\u52A0\u5BC6\u4FE1\u606F]";
          m.attachments = [];
          m.sticker = "";
          return { db, result: m };
        });
        if (updatedMsg) {
          io.to(updatedMsg.room).emit("chat:message:update", updatedMsg);
        }
        if (ack) ack({ ok: true });
      } catch (e) {
        if (ack) ack({ ok: false, error: e.message || "\u64A4\u56DE\u5931\u8D25" });
      }
    });
    socket.on("chat:read", async (payload) => {
      try {
        const { messageId } = payload;
        if (!messageId) return;
        const updatedMsg = await updateDb(async (db) => {
          const m = db.messages.find((x) => x.id === messageId);
          if (!m) return { db };
          if (!m.readBy) m.readBy = [];
          if (!m.readBy.includes(user.id)) {
            m.readBy.push(user.id);
            return { db, result: m };
          }
          return { db };
        });
        if (updatedMsg) {
          io.to(updatedMsg.room).emit("chat:message:update", updatedMsg);
        }
      } catch (e) {
        console.error("Error marking message as read", e);
      }
    });
    socket.on("disconnect", () => {
      roomUsers.forEach((usersMap, roomId) => {
        if (usersMap.has(socket.id)) {
          usersMap.delete(socket.id);
          broadcastRoomUsers(roomId);
        }
      });
      console.log(`\u{1F534} Socket disconnected: ${user.username} (${socket.id})`);
    });
  });
  server.once("error", (err) => {
    console.error(err);
    process.exit(1);
  });
  server.listen(port, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
  });
});
