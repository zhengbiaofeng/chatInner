const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");

require("dotenv").config();

const express = require("express");
const http = require("http");
const multer = require("multer");
const mime = require("mime-types");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { Server } = require("socket.io");

const { JsonStore } = require("./store");
const { requireAuth, verifySocket } = require("./auth");

const DEFAULT_PORT = Number(process.env.PORT || 32123);
// When packaged by pkg, __dirname points to snapshot (read-only).
// So we store data next to the exe by default.
const BASE_DIR = process.pkg ? path.dirname(process.execPath) : __dirname;
const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(BASE_DIR, process.env.DATA_DIR)
  : path.join(BASE_DIR, "data");
const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
const DB_FILE = path.join(DATA_DIR, "db.json");
const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB || 500);

function genId() {
  // Node 18+ supports randomUUID; fallback to randomBytes just in case.
  return (crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString("hex")).replace(/-/g, "");
}

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function logErrorToFile(prefix, err) {
  try {
    const p = path.join(BASE_DIR, "error.log");
    const time = new Date().toISOString();
    const msg =
      `[${time}] ${prefix}\n` +
      (err && err.stack ? err.stack : String(err)) +
      "\n\n";
    fs.appendFileSync(p, msg, "utf-8");
  } catch {
    // ignore
  }
}

process.on("uncaughtException", (err) => {
  console.error("uncaughtException:", err);
  logErrorToFile("uncaughtException", err);
  // Let process exit to avoid inconsistent state.
  process.exit(1);
});

process.on("unhandledRejection", (err) => {
  console.error("unhandledRejection:", err);
  logErrorToFile("unhandledRejection", err);
  process.exit(1);
});

async function ensureDirs() {
  await fsp.mkdir(DATA_DIR, { recursive: true });
  await fsp.mkdir(UPLOAD_DIR, { recursive: true });
}

async function getOrCreateJwtSecret() {
  const secretFile = path.join(DATA_DIR, "jwt_secret.txt");
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  if (fs.existsSync(secretFile)) {
    return (await fsp.readFile(secretFile, "utf-8")).trim();
  }
  const s = `intranet-chat_${genId()}`;
  await fsp.writeFile(secretFile, s, "utf-8");
  return s;
}

function safeFilename(name) {
  // Keep it readable, remove path separators and some dangerous chars.
  return String(name)
    .replace(/[/\\]/g, "_")
    .replace(/[^\w.\- ()[\]{}@+,&]/g, "_")
    .slice(0, 180);
}

function normalizeOriginalName(name) {
  // Some Windows environments may decode multipart filename as latin1, causing mojibake.
  // Try latin1->utf8 conversion if it looks suspicious.
  const s = String(name || "");
  const looksMojibake = /[ÃÂÐÑæøåäöü]/.test(s) || /[\u00c0-\u00ff]/.test(s);
  if (!looksMojibake) return s;
  try {
    const converted = Buffer.from(s, "latin1").toString("utf8");
    // Heuristic: if converted contains CJK or replacement chars disappear, prefer it.
    const score = (x) =>
      (x.match(/[\u4e00-\u9fff]/g) || []).length * 3 -
      (x.match(/[�]/g) || []).length * 5 -
      (x.match(/[\u00c0-\u00ff]/g) || []).length;
    return score(converted) > score(s) ? converted : s;
  } catch {
    return s;
  }
}

(async () => {
  try {
    await ensureDirs();
    const jwtSecret = await getOrCreateJwtSecret();

    const store = new JsonStore(DB_FILE);
    await store.init();

    const app = express();
    const server = http.createServer(app);
    const io = new Server(server, { cors: { origin: true, credentials: true } });

    // Large uploads may take time on intranet; disable default timeouts.
    server.requestTimeout = 0; // Node 18+
    server.headersTimeout = 0;
    server.keepAliveTimeout = 0;

    app.use(express.json({ limit: "1mb" }));

    // 允许同事自助注册（可选）：在 .env 里设置 ALLOW_SELF_REGISTER=1
    const ALLOW_SELF_REGISTER = String(process.env.ALLOW_SELF_REGISTER || "").trim() === "1";

    // Basic health check
    app.get("/health", (req, res) => res.json({ ok: true, ts: Date.now() }));

    // Static frontend (works in pkg snapshot via pkg.assets)
    app.use("/", express.static(path.join(__dirname, "public")));

    // Public config for frontend
    app.get("/api/config", (req, res) => {
      res.json({
        allowSelfRegister: ALLOW_SELF_REGISTER,
        maxUploadMB: MAX_UPLOAD_MB
      });
    });

    // ---- Auth / Setup ----
    app.get("/api/need-setup", asyncHandler(async (req, res) => {
      const db = await store.read();
      res.json({ needSetup: db.users.length === 0 });
    }));

    app.post("/api/setup", asyncHandler(async (req, res) => {
      const { username, password } = req.body || {};
      if (!username || !password) return res.status(400).json({ error: "缺少用户名或密码" });

      const updated = await store.update(async (db) => {
        if (db.users.length > 0) return db;
        const id = genId();
        const passwordHash = await bcrypt.hash(password, 10);
        // First user is admin by default
        db.users.push({ id, username, passwordHash, role: "admin", createdAt: Date.now() });
        return db;
      });

      if (updated.users.length !== 1) {
        return res.status(409).json({ error: "已完成初始化，无需重复设置" });
      }
      res.json({ ok: true });
    }));

    app.post("/api/login", asyncHandler(async (req, res) => {
      const { username, password } = req.body || {};
      if (!username || !password) return res.status(400).json({ error: "缺少用户名或密码" });

      const db = await store.read();
      const user = db.users.find((u) => u.username === username);
      if (!user) return res.status(401).json({ error: "用户名或密码错误" });
      const ok = await bcrypt.compare(password, user.passwordHash);
      if (!ok) return res.status(401).json({ error: "用户名或密码错误" });

      const token = jwt.sign(
        { id: user.id, username: user.username, role: user.role || "user" },
        jwtSecret,
        { expiresIn: "7d" }
      );
      res.json({ token, user: { id: user.id, username: user.username, role: user.role || "user" } });
    }));

    app.get("/api/me", requireAuth(jwtSecret), asyncHandler(async (req, res) => {
      res.json({ user: req.user });
    }));

    // ---- User management ----

    function requireAdmin(req, res, next) {
      if (req.user?.role === "admin") return next();
      return res.status(403).json({ error: "需要管理员权限" });
    }

    // 管理员查看已创建的账号列表
    app.get("/api/admin/users", requireAuth(jwtSecret), requireAdmin, asyncHandler(async (req, res) => {
      const db = await store.read();
      res.json({
        users: db.users.map((u) => ({
          id: u.id,
          username: u.username,
          role: u.role || "user",
          createdAt: u.createdAt
        }))
      });
    }));

    // 管理员创建账号（推荐方式）
    app.post("/api/admin/create-user", requireAuth(jwtSecret), requireAdmin, asyncHandler(async (req, res) => {
      const { username, password } = req.body || {};
      if (!username || !password) return res.status(400).json({ error: "缺少用户名或密码" });
      const uname = String(username).trim();
      if (!uname) return res.status(400).json({ error: "用户名不能为空" });

      await store.update(async (db) => {
        if (db.users.some((u) => u.username === uname)) {
          const e = new Error("用户名已存在");
          e.statusCode = 409;
          throw e;
        }
        const id = genId();
        const passwordHash = await bcrypt.hash(password, 10);
        db.users.push({ id, username: uname, passwordHash, role: "user", createdAt: Date.now() });
        return db;
      });
      res.json({ ok: true });
    }));

    // 自助注册（可选开关）
    app.post("/api/register", asyncHandler(async (req, res) => {
      if (!ALLOW_SELF_REGISTER) return res.status(403).json({ error: "当前未开启自助注册" });
      const { username, password } = req.body || {};
      if (!username || !password) return res.status(400).json({ error: "缺少用户名或密码" });
      const uname = String(username).trim();
      if (!uname) return res.status(400).json({ error: "用户名不能为空" });

      const db2 = await store.update(async (db) => {
        if (db.users.some((u) => u.username === uname)) {
          const e = new Error("用户名已存在");
          e.statusCode = 409;
          throw e;
        }
        const id = genId();
        const passwordHash = await bcrypt.hash(password, 10);
        db.users.push({ id, username: uname, passwordHash, role: "user", createdAt: Date.now() });
        return db;
      });
      // auto login
      const user = db2.users.find((u) => u.username === uname);
      const token = jwt.sign(
        { id: user.id, username: user.username, role: user.role || "user" },
        jwtSecret,
        { expiresIn: "7d" }
      );
      res.json({ token, user: { id: user.id, username: user.username, role: user.role || "user" } });
    }));

    // ---- Upload ----
    const upload = multer({
      storage: multer.diskStorage({
        destination: (req, file, cb) => cb(null, UPLOAD_DIR),
        filename: (req, file, cb) => {
          const id = genId();
          const n = normalizeOriginalName(file.originalname);
          cb(null, `${id}__${safeFilename(n)}`);
        }
      }),
      limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024 }
    });

    app.post("/api/upload", requireAuth(jwtSecret), upload.single("file"), asyncHandler(async (req, res) => {
      const f = req.file;
      if (!f) return res.status(400).json({ error: "未收到文件" });

      const id = f.filename.split("__")[0];
      const originalName = normalizeOriginalName(f.originalname);
      const mimeType = f.mimetype || mime.lookup(originalName) || "application/octet-stream";
      const isImage = String(mimeType).startsWith("image/");

      await store.update(async (db) => {
        db.attachments.push({
          id,
          originalName,
          storedName: f.filename,
          mime: mimeType,
          size: f.size,
          uploaderId: req.user.id,
          createdAt: Date.now()
        });
        return db;
      });

      res.json({
        attachment: {
          id,
          name: originalName,
          mime: mimeType,
          size: f.size,
          isImage,
          url: `/file/${encodeURIComponent(id)}`
        }
      });
    }));

    app.get("/file/:id", requireAuth(jwtSecret), asyncHandler(async (req, res) => {
      const id = String(req.params.id || "");
      const db = await store.read();
      const att = db.attachments.find((a) => a.id === id);
      if (!att) return res.status(404).send("Not found");

      const filePath = path.join(UPLOAD_DIR, att.storedName);
      if (!fs.existsSync(filePath)) return res.status(404).send("Not found");

      res.setHeader("Content-Type", att.mime || "application/octet-stream");
      // Inline images, download others.
      const isImage = String(att.mime || "").startsWith("image/");
      const dispositionType = isImage ? "inline" : "attachment";
      const fallbackName = safeFilename(att.originalName).replace(/"/g, "_") || "download";
      res.setHeader(
        "Content-Disposition",
        `${dispositionType}; filename="${fallbackName}"; filename*=UTF-8''${encodeURIComponent(att.originalName)}`
      );
      fs.createReadStream(filePath).pipe(res);
    }));

    // ---- Message history ----
    app.get("/api/history", requireAuth(jwtSecret), asyncHandler(async (req, res) => {
      const limit = Math.max(1, Math.min(200, Number(req.query.limit || 50)));
      const db = await store.read();
      const msgs = db.messages.slice(-limit);
      res.json({ messages: msgs });
    }));

    // ---- Socket.IO ----
    io.use(verifySocket(jwtSecret));
    io.on("connection", (socket) => {
      socket.join("general");
      socket.emit("server:hello", { user: socket.user, room: "general" });

      socket.on("chat:message", async (payload, ack) => {
        try {
          const text = String(payload?.text || "").trim();
          const attachmentIds = Array.isArray(payload?.attachmentIds) ? payload.attachmentIds : [];
          const sticker = typeof payload?.sticker === "string" ? payload.sticker.trim() : "";
          const validSticker =
            sticker &&
            sticker.startsWith("/stickers/") &&
            (sticker.endsWith(".svg") || sticker.endsWith(".png") || sticker.endsWith(".jpg") || sticker.endsWith(".jpeg")) &&
            sticker.length < 120;

          if (!text && attachmentIds.length === 0 && !validSticker) return;

          const msg = await store.update(async (db) => {
            const atts = attachmentIds
              .map((id) => db.attachments.find((a) => a.id === id))
              .filter(Boolean)
              .map((a) => ({
                id: a.id,
                name: a.originalName,
                mime: a.mime,
                size: a.size,
                isImage: String(a.mime || "").startsWith("image/"),
                url: `/file/${encodeURIComponent(a.id)}`
              }));

            const m = {
              id: genId(),
              room: "general",
              userId: socket.user.id,
              username: socket.user.username,
              text,
              sticker: validSticker ? sticker : "",
              attachments: atts,
              createdAt: Date.now()
            };
            db.messages.push(m);
            // Keep last 2000 messages to avoid unbounded growth by default.
            if (db.messages.length > 2000) db.messages = db.messages.slice(-2000);
            return db;
          });

          // Last message is the one we pushed.
          const m = msg.messages[msg.messages.length - 1];
          io.to("general").emit("chat:message", m);
          ack?.({ ok: true });
        } catch (e) {
          ack?.({ ok: false, error: "发送失败" });
        }
      });
    });

    // Express error handler (avoid browser ERR_EMPTY_RESPONSE)
    // eslint-disable-next-line no-unused-vars
    app.use((err, req, res, next) => {
      console.error("Express error:", err);
      logErrorToFile("Express error", err);
      if (res.headersSent) return next(err);
      const status = Number(err?.statusCode || err?.status || 500);
      res.status(status).json({ error: err?.message || "服务器内部错误（请查看 error.log）" });
    });

    const os = require("os");
    const net = require("net");
    const getLanIps = () => {
      const nets = os.networkInterfaces();
      const ips = [];
      for (const name of Object.keys(nets)) {
        for (const n of nets[name] || []) {
          if (n.family === "IPv4" && !n.internal) ips.push(n.address);
        }
      }
      return ips;
    };

    const canListen = (port) =>
      new Promise((resolve) => {
        const tester = net
          .createServer()
          .once("error", () => resolve(false))
          .once("listening", () => tester.close(() => resolve(true)))
          .listen(port, "0.0.0.0");
      });

    let port = DEFAULT_PORT;
    for (let i = 0; i < 30; i++) {
      // eslint-disable-next-line no-await-in-loop
      const ok = await canListen(port);
      if (ok) break;
      console.log(`端口 ${port} 被占用，尝试切换到 ${port + 1} ...`);
      port += 1;
    }

    server.listen(port, "0.0.0.0", () => {
      const ips = getLanIps();
      console.log(`Intranet Chat listening on http://0.0.0.0:${port}`);
      if (ips.length) {
        console.log("可在内网访问：");
        ips.forEach((ip) => console.log(`  http://${ip}:${port}`));
      } else {
        console.log(`本机访问： http://127.0.0.1:${port}`);
      }
      console.log(`Base dir: ${BASE_DIR}`);
      console.log(`Data dir: ${DATA_DIR}`);
      console.log(`Max upload: ${MAX_UPLOAD_MB} MB`);
      if (ALLOW_SELF_REGISTER) console.log("自助注册：已开启（/api/register）");
    });
  } catch (err) {
    console.error("Fatal startup error:", err);
    logErrorToFile("Fatal startup error", err);
    process.exit(1);
  }
})();
