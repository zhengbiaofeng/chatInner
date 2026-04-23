const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const mime = require("mime-types");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { requireAuth } = require("../../auth");

function genId() {
  return (crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString("hex")).replace(/-/g, "");
}

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function safeFilename(name) {
  return String(name).replace(/[/\\]/g, "_").replace(/[^\w.\- ()[\]{}@+,&]/g, "_").slice(0, 180);
}

function normalizeOriginalName(name) {
  const s = String(name || "");
  const looksMojibake = /[ÃÂÐÑæøåäöü]/.test(s) || /[\u00c0-\u00ff]/.test(s);
  if (!looksMojibake) return s;
  try {
    const converted = Buffer.from(s, "latin1").toString("utf8");
    const score = (x) => (x.match(/[\u4e00-\u9fff]/g) || []).length * 3 - (x.match(/[�]/g) || []).length * 5 - (x.match(/[\u00c0-\u00ff]/g) || []).length;
    return score(converted) > score(s) ? converted : s;
  } catch {
    return s;
  }
}

module.exports = function createApiRouter(store, config) {
  const { jwtSecret, ALLOW_SELF_REGISTER, MAX_UPLOAD_MB, UPLOAD_DIR } = config;
  const router = express.Router();

  // ---- Public Config ----
  router.get("/config", (req, res) => {
    res.json({ allowSelfRegister: ALLOW_SELF_REGISTER, maxUploadMB: MAX_UPLOAD_MB });
  });

  // ---- Auth / Setup ----
  router.get("/need-setup", asyncHandler(async (req, res) => {
    const db = await store.read();
    res.json({ needSetup: db.users.length === 0 });
  }));

  router.post("/setup", asyncHandler(async (req, res) => {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: "缺少用户名或密码" });

    const updated = await store.update(async (db) => {
      if (db.users.length > 0) return db;
      const id = genId();
      const passwordHash = await bcrypt.hash(password, 10);
      db.users.push({ id, username, passwordHash, role: "admin", createdAt: Date.now() });
      return db;
    });

    if (updated.users.length !== 1) return res.status(409).json({ error: "已完成初始化，无需重复设置" });
    res.json({ ok: true });
  }));

  router.post("/login", asyncHandler(async (req, res) => {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: "缺少用户名或密码" });

    const db = await store.read();
    const user = db.users.find((u) => u.username === username);
    if (!user) return res.status(401).json({ error: "用户名或密码错误" });
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: "用户名或密码错误" });

    const token = jwt.sign({ id: user.id, username: user.username, role: user.role || "user" }, jwtSecret, { expiresIn: "7d" });
    res.json({ token, user: { id: user.id, username: user.username, role: user.role || "user" } });
  }));

  router.get("/me", requireAuth(jwtSecret), asyncHandler(async (req, res) => {
    res.json({ user: req.user });
  }));

  // 自助注册
  router.post("/register", asyncHandler(async (req, res) => {
    if (!ALLOW_SELF_REGISTER) return res.status(403).json({ error: "当前未开启自助注册" });
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: "缺少用户名或密码" });
    const uname = String(username).trim();
    if (!uname) return res.status(400).json({ error: "用户名不能为空" });

    const db2 = await store.update(async (db) => {
      if (db.users.some((u) => u.username === uname)) {
        const e = new Error("用户名已存在"); e.statusCode = 409; throw e;
      }
      const id = genId();
      const passwordHash = await bcrypt.hash(password, 10);
      db.users.push({ id, username: uname, passwordHash, role: "user", createdAt: Date.now() });
      return db;
    });
    const user = db2.users.find((u) => u.username === uname);
    const token = jwt.sign({ id: user.id, username: user.username, role: user.role || "user" }, jwtSecret, { expiresIn: "7d" });
    res.json({ token, user: { id: user.id, username: user.username, role: user.role || "user" } });
  }));

  // ---- Admin User Management ----
  function requireAdmin(req, res, next) {
    if (req.user?.role === "admin") return next();
    return res.status(403).json({ error: "需要管理员权限" });
  }

  router.get("/admin/users", requireAuth(jwtSecret), requireAdmin, asyncHandler(async (req, res) => {
    const db = await store.read();
    res.json({ users: db.users.map((u) => ({ id: u.id, username: u.username, role: u.role || "user", createdAt: u.createdAt })) });
  }));

  router.post("/admin/create-user", requireAuth(jwtSecret), requireAdmin, asyncHandler(async (req, res) => {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: "缺少用户名或密码" });
    const uname = String(username).trim();
    if (!uname) return res.status(400).json({ error: "用户名不能为空" });

    await store.update(async (db) => {
      if (db.users.some((u) => u.username === uname)) {
        const e = new Error("用户名已存在"); e.statusCode = 409; throw e;
      }
      const id = genId();
      const passwordHash = await bcrypt.hash(password, 10);
      db.users.push({ id, username: uname, passwordHash, role: "user", createdAt: Date.now() });
      return db;
    });
    res.json({ ok: true });
  }));

  // 管理员修改账号 (更新用户名、密码)
  router.put("/admin/users/:id", requireAuth(jwtSecret), requireAdmin, asyncHandler(async (req, res) => {
    const userId = String(req.params.id);
    const { username, password } = req.body || {};
    
    await store.update(async (db) => {
      const idx = db.users.findIndex(u => u.id === userId);
      if (idx === -1) {
        const e = new Error("用户不存在"); e.statusCode = 404; throw e;
      }
      
      const u = db.users[idx];
      if (username) {
        const uname = String(username).trim();
        if (uname && uname !== u.username && db.users.some(o => o.username === uname)) {
          const e = new Error("用户名已被占用"); e.statusCode = 409; throw e;
        }
        u.username = uname;
      }
      
      if (password) {
        u.passwordHash = await bcrypt.hash(password, 10);
      }
      return db;
    });
    res.json({ ok: true });
  }));

  // 管理员删除账号
  router.delete("/admin/users/:id", requireAuth(jwtSecret), requireAdmin, asyncHandler(async (req, res) => {
    const userId = String(req.params.id);
    
    await store.update(async (db) => {
      const idx = db.users.findIndex(u => u.id === userId);
      if (idx === -1) {
        const e = new Error("用户不存在"); e.statusCode = 404; throw e;
      }
      if (db.users[idx].role === "admin" && db.users.filter(u => u.role === "admin").length <= 1) {
         const e = new Error("不能删除最后一个管理员账号"); e.statusCode = 403; throw e;
      }
      db.users.splice(idx, 1);
      return db;
    });
    res.json({ ok: true });
  }));

  // 管理员一键清空所有聊天记录
  router.delete("/admin/messages", requireAuth(jwtSecret), requireAdmin, asyncHandler(async (req, res) => {
    await store.update(async (db) => {
      db.messages = [];
      return db;
    });
    
    // 如果 req.app 挂载了 io，可以通知所有客户端清屏
    const io = req.app.get("io");
    if (io) {
      io.to("general").emit("chat:cleared");
    }

    res.json({ ok: true });
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

  router.post("/upload", requireAuth(jwtSecret), upload.single("file"), asyncHandler(async (req, res) => {
    const f = req.file;
    if (!f) return res.status(400).json({ error: "未收到文件" });

    const id = f.filename.split("__")[0];
    const originalName = normalizeOriginalName(f.originalname);
    const mimeType = f.mimetype || mime.lookup(originalName) || "application/octet-stream";
    const isImage = String(mimeType).startsWith("image/");

    await store.update(async (db) => {
      db.attachments.push({ id, originalName, storedName: f.filename, mime: mimeType, size: f.size, uploaderId: req.user.id, createdAt: Date.now() });
      return db;
    });

    res.json({ attachment: { id, name: originalName, mime: mimeType, size: f.size, isImage, url: `/file/${encodeURIComponent(id)}` } });
  }));

  // ---- Message history ----
  router.get("/history", requireAuth(jwtSecret), asyncHandler(async (req, res) => {
    const limit = Math.max(1, Math.min(200, Number(req.query.limit || 50)));
    const db = await store.read();
    const msgs = db.messages.slice(-limit);
    res.json({ messages: msgs });
  }));

  // ---- Todos / Blackboard ----
  router.get("/todos", requireAuth(jwtSecret), asyncHandler(async (req, res) => {
    const db = await store.read();
    res.json({ todos: db.todos || [] });
  }));

  router.post("/todos", requireAuth(jwtSecret), asyncHandler(async (req, res) => {
    const { content, assigneeId } = req.body || {};
    if (!content) return res.status(400).json({ error: "内容不能为空" });
    let newTodo;
    await store.update(async (db) => {
      if (!db.todos) db.todos = [];
      
      let assigneeName = null;
      if (assigneeId) {
        const u = db.users.find(x => x.id === assigneeId);
        if (u) assigneeName = u.username;
      }

      newTodo = {
        id: genId(),
        content: String(content).trim(),
        completed: false,
        creatorId: req.user.id,
        creatorName: req.user.username,
        assigneeId: assigneeId || null,
        assigneeName: assigneeName || null,
        createdAt: Date.now(),
        completedAt: null
      };
      db.todos.push(newTodo);
      return db;
    });
    res.json({ todo: newTodo });
  }));

  router.put("/todos/:id", requireAuth(jwtSecret), asyncHandler(async (req, res) => {
    const { content, completed, assigneeId } = req.body || {};
    await store.update(async (db) => {
      if (!db.todos) db.todos = [];
      const t = db.todos.find(x => x.id === req.params.id);
      if (!t) {
        const e = new Error("任务不存在"); e.statusCode = 404; throw e;
      }
      
      // 只有创建人或管理员能修改任务指派
      if (assigneeId !== undefined && (req.user.role === "admin" || req.user.id === t.creatorId)) {
        if (assigneeId === null || assigneeId === "") {
          t.assigneeId = null;
          t.assigneeName = null;
        } else {
          const u = db.users.find(x => x.id === assigneeId);
          if (u) {
            t.assigneeId = u.id;
            t.assigneeName = u.username;
          }
        }
      }

      if (content !== undefined) t.content = String(content).trim();
      if (completed !== undefined) {
        t.completed = !!completed;
        t.completedAt = t.completed ? Date.now() : null;
      }
      return db;
    });
    res.json({ ok: true });
  }));

  router.delete("/todos/:id", requireAuth(jwtSecret), asyncHandler(async (req, res) => {
    await store.update(async (db) => {
      if (!db.todos) db.todos = [];
      db.todos = db.todos.filter(x => x.id !== req.params.id);
      return db;
    });
    res.json({ ok: true });
  }));

  router.get("/todos/export", requireAuth(jwtSecret), asyncHandler(async (req, res) => {
    const db = await store.read();
    const todos = db.todos || [];
    let md = "# 团队待办任务黑板\n\n";
    const pending = todos.filter(t => !t.completed);
    const done = todos.filter(t => t.completed);

    md += "## 待办 / 进行中\n";
    if (pending.length === 0) md += "暂无待办任务。\n";
    pending.forEach(t => {
      const cDate = new Date(t.createdAt).toLocaleString();
      md += `- [ ] ${t.content} (创建人: ${t.creatorName}, 时间: ${cDate})\n`;
    });

    md += "\n## 已完成\n";
    if (done.length === 0) md += "暂无已完成任务。\n";
    done.forEach(t => {
      const fDate = new Date(t.completedAt).toLocaleString();
      md += `- [x] ~~${t.content}~~ (完成人: ${t.creatorName}, 完成时间: ${fDate})\n`;
    });

    res.setHeader("Content-Type", "text/markdown; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="team-todos.md"');
    res.send(md);
  }));

  return router;
};
