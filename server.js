const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");

require("dotenv").config();

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const crypto = require("crypto");

const { JsonStore } = require("./store");
const { requireAuth } = require("./auth");

// ---- Imports for extracted modules ----
const createApiRouter = require("./src/routes/api");
const setupSocket = require("./src/sockets/chat");
const { startCleanupJob } = require("./src/jobs/cleanup");

const DEFAULT_PORT = Number(process.env.PORT || 32123);
const BASE_DIR = process.pkg ? path.dirname(process.execPath) : __dirname;
const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(BASE_DIR, process.env.DATA_DIR)
  : path.join(BASE_DIR, "data");
const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
const DB_FILE = path.join(DATA_DIR, "db.json");
const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB || 500);
const ALLOW_SELF_REGISTER = String(process.env.ALLOW_SELF_REGISTER || "").trim() === "1";

function genId() {
  return (crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString("hex")).replace(/-/g, "");
}

function safeFilename(name) {
  return String(name)
    .replace(/[/\\]/g, "_")
    .replace(/[^\w.\- ()[\]{}@+,&]/g, "_")
    .slice(0, 180);
}

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function logErrorToFile(prefix, err) {
  try {
    const p = path.join(BASE_DIR, "error.log");
    const time = new Date().toISOString();
    const msg = `[${time}] ${prefix}\n` + (err && err.stack ? err.stack : String(err)) + "\n\n";
    fs.appendFileSync(p, msg, "utf-8");
  } catch {
    // ignore
  }
}

process.on("uncaughtException", (err) => {
  console.error("uncaughtException:", err);
  logErrorToFile("uncaughtException", err);
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

(async () => {
  try {
    await ensureDirs();
    const jwtSecret = await getOrCreateJwtSecret();

    const store = new JsonStore(DB_FILE);
    await store.init();

    const config = {
      jwtSecret,
      ALLOW_SELF_REGISTER,
      MAX_UPLOAD_MB,
      UPLOAD_DIR,
      BASE_DIR,
      DATA_DIR
    };

    const app = express();
    const server = http.createServer(app);
    const io = new Server(server, { cors: { origin: true, credentials: true } });

    server.requestTimeout = 0;
    server.headersTimeout = 0;
    server.keepAliveTimeout = 0;

    app.use(express.json({ limit: "1mb" }));

    app.get("/health", (req, res) => res.json({ ok: true, ts: Date.now() }));
    app.use("/", express.static(path.join(__dirname, "public")));

    // API Routes
    app.use("/api", createApiRouter(store, config));

    // File download/preview route
    app.get("/file/:id", requireAuth(jwtSecret), asyncHandler(async (req, res) => {
      const id = String(req.params.id || "");
      const db = await store.read();
      const att = db.attachments.find((a) => a.id === id);
      if (!att) return res.status(404).send("Not found");

      const filePath = path.join(UPLOAD_DIR, att.storedName);
      if (!fs.existsSync(filePath)) return res.status(404).send("Not found");

      res.setHeader("Content-Type", att.mime || "application/octet-stream");
      const isImage = String(att.mime || "").startsWith("image/");
      const dispositionType = isImage ? "inline" : "attachment";
      const fallbackName = safeFilename(att.originalName).replace(/"/g, "_") || "download";
      res.setHeader(
        "Content-Disposition",
        `${dispositionType}; filename="${fallbackName}"; filename*=UTF-8''${encodeURIComponent(att.originalName)}`
      );
      fs.createReadStream(filePath).pipe(res);
    }));

    // Socket.io Setup
    setupSocket(io, store, config);

    // Start background cleanup job
    startCleanupJob(store, UPLOAD_DIR);

    // Error handler
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