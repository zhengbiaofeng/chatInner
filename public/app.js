const $ = (id) => document.getElementById(id);

const state = {
  token: localStorage.getItem("token") || "",
  user: null,
  socket: null,
  // pendingAttachments items:
  // - uploading: { tempId, name, isImage, urlPreview?, progress, xhr, uploading:true }
  // - completed: { id, name, mime, size, isImage, url, uploading:false }
  pendingAttachments: [],
  allowSelfRegister: false
};

function setView(name) {
  $("setupView").classList.toggle("hidden", name !== "setup");
  $("loginView").classList.toggle("hidden", name !== "login");
  $("registerView").classList.toggle("hidden", name !== "register");
  $("chatView").classList.toggle("hidden", name !== "chat");
  const header = $("header");
  if (header) header.classList.toggle("hidden", name !== "chat");
}

let errorTimeouts = {};

function setError(id, msg) {
  const el = $(id);
  if (!el) return;
  el.textContent = msg || "";
  
  if (msg) {
    if (errorTimeouts[id]) clearTimeout(errorTimeouts[id]);
    errorTimeouts[id] = setTimeout(() => {
      el.textContent = "";
    }, 4000);
  }
}

async function api(path, { method = "GET", body, isForm = false } = {}) {
  const headers = {};
  if (!isForm) headers["Content-Type"] = "application/json";
  if (state.token) headers["Authorization"] = `Bearer ${state.token}`;
  const res = await fetch(path, {
    method,
    headers,
    body: isForm ? body : body ? JSON.stringify(body) : undefined
  });
  const ct = res.headers.get("content-type") || "";
  const data = ct.includes("application/json") ? await res.json() : await res.text();
  if (!res.ok) {
    const err = typeof data === "string" ? data : data.error || "请求失败";
    throw new Error(err);
  }
  return data;
}

function fmtTime(ts) {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function fmtDate(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function withToken(url) {
  if (!url) return url;
  if (!state.token) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}token=${encodeURIComponent(state.token)}`;
}

function renderPending() {
  const wrap = $("pendingUploads");
  wrap.innerHTML = "";
  state.pendingAttachments.forEach((a) => {
    const item = document.createElement("div");
    item.className = "pendingItem";
    const left = document.createElement("div");
    left.className = "pendingLeft";
    if (a.isImage) {
      const img = document.createElement("img");
      img.className = "pendingThumb";
      img.src = a.uploading ? (a.urlPreview || "") : withToken(a.url);
      img.alt = a.name;
      left.appendChild(img);
    }
    const sub = document.createElement("div");
    sub.className = "pendingSub";
    const name = document.createElement("div");
    name.className = "pendingName";
    name.textContent = a.name + (a.uploading ? "（上传中）" : "");
    sub.appendChild(name);
    if (a.uploading) {
      const bar = document.createElement("div");
      bar.className = "progressBar";
      const inner = document.createElement("div");
      inner.className = "progressInner";
      inner.style.width = `${Math.max(0, Math.min(100, Number(a.progress || 0)))}%`;
      bar.appendChild(inner);
      const txt = document.createElement("div");
      txt.className = "progressText";
      txt.textContent = `${Math.max(0, Math.min(100, Number(a.progress || 0))).toFixed(0)}%`;
      sub.appendChild(bar);
      sub.appendChild(txt);
    }
    left.appendChild(sub);
    const right = document.createElement("button");
    right.className = "btn btn-small btn-secondary";
    right.textContent = a.uploading ? "取消" : "移除";
    right.onclick = () => {
      if (a.uploading && a.xhr) {
        try {
          a.xhr.abort();
        } catch {
          // ignore
        }
      }
      state.pendingAttachments = state.pendingAttachments.filter((x) => (x.id || x.tempId) !== (a.id || a.tempId));
      renderPending();
    };
    item.appendChild(left);
    item.appendChild(right);
    wrap.appendChild(item);
  });
}

function genTempId() {
  return `${Date.now().toString(16)}_${Math.random().toString(16).slice(2)}`;
}

async function uploadWithProgress(file) {
  setError("chatError", "");
  const tempId = genTempId();
  const isImage = file.type && file.type.startsWith("image/");
  const urlPreview = isImage ? URL.createObjectURL(file) : "";
  const item = {
    tempId,
    name: file.name || "clipboard-image.png",
    isImage,
    urlPreview,
    uploading: true,
    progress: 0,
    xhr: null
  };
  state.pendingAttachments.push(item);
  renderPending();

  return new Promise((resolve, reject) => {
    const fd = new FormData();
    fd.append("file", file);

    const xhr = new XMLHttpRequest();
    item.xhr = xhr;
    xhr.open("POST", "/api/upload", true);
    if (state.token) xhr.setRequestHeader("Authorization", `Bearer ${state.token}`);

    xhr.upload.onprogress = (evt) => {
      if (!evt.lengthComputable) return;
      item.progress = (evt.loaded / evt.total) * 100;
      renderPending();
    };

    xhr.onerror = () => reject(new Error("上传失败"));
    xhr.onabort = () => reject(new Error("已取消上传"));
    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText || "{}");
        if (xhr.status < 200 || xhr.status >= 300) {
          reject(new Error(data.error || "上传失败"));
          return;
        }
        const att = data.attachment;
        // Update item in place to "completed"
        delete item.tempId;
        item.id = att.id;
        item.name = att.name;
        item.mime = att.mime;
        item.size = att.size;
        item.isImage = att.isImage;
        item.url = att.url;
        item.uploading = false;
        item.progress = 100;
        item.xhr = null;
        if (item.urlPreview) {
          try {
            URL.revokeObjectURL(item.urlPreview);
          } catch {}
          item.urlPreview = "";
        }
        renderPending();
        resolve(att);
      } catch {
        reject(new Error("上传响应解析失败"));
      }
    };

    xhr.send(fd);
  }).catch((err) => {
    state.pendingAttachments = state.pendingAttachments.filter((x) => (x.id || x.tempId) !== (item.id || item.tempId));
    if (item.urlPreview) {
      try {
        URL.revokeObjectURL(item.urlPreview);
      } catch {}
    }
    renderPending();
    throw err;
  });
}

function renderRichText(text, container) {
  const t = String(text || "");
  const trimmed = t.trim();

  // JSON pretty print
  if ((trimmed.startsWith("{") || trimmed.startsWith("[")) && trimmed.length <= 200000) {
    try {
      const obj = JSON.parse(trimmed);
      const pre = document.createElement("pre");
      pre.className = "codeBlock";
      const code = document.createElement("code");
      code.textContent = JSON.stringify(obj, null, 2);
      pre.appendChild(code);
      container.appendChild(pre);
      return;
    } catch {
      // fall through
    }
  }

  // Code fences
  if (t.includes("```")) {
    const parts = t.split("```");
    parts.forEach((part, idx) => {
      if (!part) return;
      if (idx % 2 === 0) {
        const div = document.createElement("div");
        div.className = "msgText";
        div.textContent = part;
        container.appendChild(div);
      } else {
        // Allow optional language in first line
        const lines = part.replace(/^\n/, "").split("\n");
        if (lines.length && /^[a-zA-Z0-9+#._-]{1,16}$/.test(lines[0].trim())) {
          lines.shift();
        }
        const pre = document.createElement("pre");
        pre.className = "codeBlock";
        const code = document.createElement("code");
        code.textContent = lines.join("\n");
        pre.appendChild(code);
        container.appendChild(pre);
      }
    });
    return;
  }

  const div = document.createElement("div");
  div.className = "msgText";
  div.textContent = t;
  container.appendChild(div);
}

function addMessage(m) {
  const box = $("messages");
  const el = document.createElement("div");
  el.className = "msg";
  
  if (state.user && m.userId === state.user.id) {
    el.classList.add("msg-me");
  } else {
    el.classList.add("msg-other");
  }

  const head = document.createElement("div");
  head.className = "msgHead";
  head.textContent = `${m.username} · ${fmtTime(m.createdAt)}`;

  const body = document.createElement("div");
  body.className = "msgBody";
  if (m.text) {
    renderRichText(m.text, body);
  }

  if (m.sticker) {
    const img = document.createElement("img");
    img.className = "stickerMsg";
    img.src = m.sticker;
    img.alt = "sticker";
    img.onclick = () => window.open(m.sticker, "_blank");
    body.appendChild(img);
  }

  if (Array.isArray(m.attachments) && m.attachments.length) {
    const attWrap = document.createElement("div");
    attWrap.className = "atts";
    m.attachments.forEach((a) => {
      const href = withToken(a.url);
      if (a.isImage) {
        const img = document.createElement("img");
        img.className = "thumb";
        img.src = href;
        img.alt = a.name;
        img.title = a.name;
        img.onclick = () => window.open(href, "_blank");
        attWrap.appendChild(img);
      } else {
        const link = document.createElement("a");
        link.href = href;
        link.target = "_blank";
        link.rel = "noreferrer";
        link.textContent = `📎 ${a.name}`;
        attWrap.appendChild(link);
      }
    });
    body.appendChild(attWrap);
  }

  el.appendChild(head);
  el.appendChild(body);
  box.appendChild(el);
  box.scrollTop = box.scrollHeight;
}

async function init() {
  // Load server config
  try {
    const cfg = await api("/api/config");
    state.allowSelfRegister = !!cfg.allowSelfRegister;
  } catch {
    state.allowSelfRegister = false;
  }
  $("goRegisterBtn").classList.toggle("hidden", !state.allowSelfRegister);
  $("registerHint").classList.toggle("hidden", state.allowSelfRegister);

  // Decide whether setup is needed.
  const { needSetup } = await api("/api/need-setup").catch(() => ({ needSetup: false }));
  if (needSetup) {
    setView("setup");
  } else if (!state.token) {
    setView("login");
  } else {
    await enterChat();
  }
}

async function doSetup() {
  setError("setupError", "");
  const username = $("setupUsername").value.trim();
  const password = $("setupPassword").value;
  try {
    await api("/api/setup", { method: "POST", body: { username, password } });
    setView("login");
  } catch (e) {
    setError("setupError", e.message);
  }
}

async function doLogin() {
  setError("loginError", "");
  const username = $("loginUsername").value.trim();
  const password = $("loginPassword").value;
  try {
    const r = await api("/api/login", { method: "POST", body: { username, password } });
    state.token = r.token;
    localStorage.setItem("token", state.token);
    await enterChat();
  } catch (e) {
    setError("loginError", e.message);
  }
}

async function doRegister() {
  setError("regError", "");
  const username = $("regUsername").value.trim();
  const password = $("regPassword").value;
  try {
    const r = await api("/api/register", { method: "POST", body: { username, password } });
    state.token = r.token;
    localStorage.setItem("token", state.token);
    await enterChat();
  } catch (e) {
    setError("regError", e.message);
  }
}

async function enterChat() {
  // Step 1: validate token
  let me;
  try {
    me = await api("/api/me");
  } catch {
    state.token = "";
    localStorage.removeItem("token");
    setView("login");
    return;
  }

  // Step 2: enter UI
  state.user = me.user;
  $("me").textContent = `你好，${state.user.username}`;
  $("logoutBtn").classList.remove("hidden");
  setView("chat");
  const isAdmin = state.user.role === "admin";
  $("adminToggleBtn").classList.toggle("hidden", !isAdmin);
  // Default: keep admin panel collapsed to focus on chat
  $("adminPanel").classList.add("hidden");
  if (state.user.role === "admin") {
    await refreshUsers().catch(() => {});
  }

  // Step 3: history/socket failures should NOT kick user back to login
  try {
    await loadHistory();
  } catch (e) {
    setError("chatError", `加载历史失败：${e.message || e}`);
  }
  try {
    connectSocket();
  } catch (e) {
    setError("chatError", `连接失败：${e.message || e}`);
  }
  refreshTodos();
}

async function loadHistory() {
  $("messages").innerHTML = "";
  const { messages } = await api("/api/history?limit=100");
  messages.forEach(addMessage);
}

function connectSocket() {
  if (state.socket) state.socket.disconnect();
  state.socket = io({
    auth: { token: state.token }
  });
  state.socket.on("connect_error", (err) => {
    setError("chatError", `连接失败：${err.message || err}`);
  });
  state.socket.on("chat:message", (m) => addMessage(m));
}

async function doUpload(file) {
  await uploadWithProgress(file);
}

function doSend() {
  setError("chatError", "");
  const text = $("messageInput").value.trim();
  const uploadingCount = state.pendingAttachments.filter((a) => a.uploading).length;
  if (uploadingCount > 0) {
    setError("chatError", `还有 ${uploadingCount} 个文件正在上传，请稍候...`);
    return;
  }
  const attachmentIds = state.pendingAttachments.map((a) => a.id).filter(Boolean);
  if (!text && attachmentIds.length === 0) return;

  state.socket.emit("chat:message", { text, attachmentIds }, (ack) => {
    if (!ack?.ok) setError("chatError", ack?.error || "发送失败");
  });
  $("messageInput").value = "";
  state.pendingAttachments = [];
  renderPending();
}

function sendSticker(url) {
  setError("chatError", "");
  if (!state.socket) return;
  state.socket.emit("chat:message", { sticker: url }, (ack) => {
    if (!ack?.ok) setError("chatError", ack?.error || "发送失败");
  });
  closeEmojiPanel();
}

async function doCreateUser() {
  setError("adminError", "");
  const username = $("newUsername").value.trim();
  const password = $("newPassword").value;
  try {
    await api("/api/admin/create-user", { method: "POST", body: { username, password } });
    $("newUsername").value = "";
    $("newPassword").value = "";
    setError("adminError", "创建成功");
    setTimeout(() => setError("adminError", ""), 1500);
    await refreshUsers();
  } catch (e) {
    setError("adminError", e.message);
  }
}

// 记录当前编辑的用户 ID
let currentEditUserId = null;

async function doDeleteUser(id, username) {
  if (!confirm(`确定要删除用户 "${username}" 吗？此操作不可恢复。`)) return;
  try {
    await api(`/api/admin/users/${id}`, { method: "DELETE" });
    await refreshUsers();
  } catch (e) {
    // 复用通用的 setError 逻辑，将错误显示在输入框下方的 chatError 或者管理面板内的 adminError
    const errorContainerId = $("adminPanel").classList.contains("hidden") ? "chatError" : "adminError";
    setError(errorContainerId, `删除失败: ${e.message}`);
  }
}

function openEditModal(id, username) {
  currentEditUserId = id;
  $("editUsername").value = username;
  $("editPassword").value = "";
  $("editUserError").textContent = "";
  $("editUserModal").classList.remove("hidden");
}

function closeEditModal() {
  currentEditUserId = null;
  $("editUserModal").classList.add("hidden");
}

async function saveEditUser() {
  if (!currentEditUserId) return;
  const username = $("editUsername").value.trim();
  const password = $("editPassword").value;
  
  const body = {};
  if (username) body.username = username;
  if (password) body.password = password;

  try {
    await api(`/api/admin/users/${currentEditUserId}`, { method: "PUT", body });
    closeEditModal();
    await refreshUsers();
  } catch (e) {
    $("editUserError").textContent = e.message;
  }
}

$("cancelEditUserBtn").onclick = closeEditModal;
$("saveEditUserBtn").onclick = saveEditUser;

async function refreshUsers() {
  const wrap = $("usersList");
  if (!wrap) return;
  wrap.innerHTML = "";
  const r = await api("/api/admin/users");
  const users = Array.isArray(r.users) ? r.users : [];
  users.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  users.forEach((u) => {
    const row = document.createElement("div");
    row.className = "userRow";
    
    const left = document.createElement("div");
    left.className = "userInfo";
    left.textContent = `${u.username}${u.role === "admin" ? "（管理员）" : ""}`;
    
    const right = document.createElement("div");
    right.className = "userMeta";
    
    const dateSpan = document.createElement("span");
    dateSpan.textContent = fmtDate(u.createdAt);
    right.appendChild(dateSpan);

    const editBtn = document.createElement("button");
    editBtn.className = "btn btn-small btn-secondary";
    editBtn.textContent = "编辑";
    editBtn.style.marginLeft = "10px";
    editBtn.onclick = () => openEditModal(u.id, u.username);
    right.appendChild(editBtn);

    const delBtn = document.createElement("button");
    delBtn.className = "btn btn-small";
    delBtn.style.backgroundColor = "#ef4444";
    delBtn.style.color = "#fff";
    delBtn.style.marginLeft = "6px";
    delBtn.textContent = "删除";
    delBtn.onclick = () => doDeleteUser(u.id, u.username);
    right.appendChild(delBtn);

    row.appendChild(left);
    row.appendChild(right);
    wrap.appendChild(row);
  });
}

function logout() {
  state.token = "";
  localStorage.removeItem("token");
  state.user = null;
  if (state.socket) state.socket.disconnect();
  $("logoutBtn").classList.add("hidden");
  $("adminToggleBtn").classList.add("hidden");
  $("me").textContent = "";
  setView("login");
}

// ---- Bind UI ----
$("setupBtn").onclick = doSetup;
$("loginBtn").onclick = doLogin;
$("goRegisterBtn").onclick = () => setView("register");
$("backToLoginBtn").onclick = () => setView("login");
$("regBtn").onclick = doRegister;
$("createUserBtn").onclick = doCreateUser;
$("refreshUsersBtn").onclick = () => refreshUsers().catch((e) => setError("adminError", e.message));
$("sendBtn").onclick = doSend;
$("logoutBtn").onclick = logout;
$("uploadBtn").onclick = () => $("fileInput").click();
$("emojiBtn").onclick = () => {
  const panel = $("emojiPanel");
  if (panel.classList.contains("hidden")) openEmojiPanel();
  else closeEmojiPanel();
};
$("emojiClose").onclick = closeEmojiPanel;
$("fileInput").onchange = async (e) => {
  const file = e.target.files?.[0];
  e.target.value = "";
  if (!file) return;
  try {
    await doUpload(file);
  } catch (err) {
    setError("chatError", err.message || "上传失败");
  }
};

$("messageInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    doSend();
  }
});

function toggleAdminPanel(show) {
  const panel = $("adminPanel");
  const isHidden = panel.classList.contains("hidden");
  const next = typeof show === "boolean" ? show : isHidden;
  panel.classList.toggle("hidden", !next);
  if (next) {
    refreshUsers().catch(() => {});
  }
}

$("adminToggleBtn").onclick = () => toggleAdminPanel();
$("adminCollapseBtn").onclick = () => toggleAdminPanel(false);

// Paste images directly from clipboard into pending uploads
$("messageInput").addEventListener("paste", async (e) => {
  const items = e.clipboardData?.items;
  if (!items) return;
  const images = [];
  for (const it of items) {
    if (it.type && it.type.startsWith("image/")) {
      const f = it.getAsFile();
      if (f) images.push(f);
    }
  }
  if (!images.length) return;
  for (const f of images) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await uploadWithProgress(f);
    } catch (err) {
      setError("chatError", err.message || "粘贴图片上传失败");
      break;
    }
  }
});

// Emoji panel positioning (popover above emoji button)
function positionEmojiPanel() {
  const panel = $("emojiPanel");
  const btn = $("emojiBtn");
  if (panel.classList.contains("hidden")) return;
  const r = btn.getBoundingClientRect();
  // Temporarily show to measure
  panel.style.left = "0px";
  panel.style.top = "0px";
  const margin = 10;
  const w = panel.offsetWidth || 420;
  const h = panel.offsetHeight || 260;

  let left = r.left;
  left = Math.min(left, window.innerWidth - w - margin);
  left = Math.max(margin, left);

  let top = r.top - h - 10;
  if (top < margin) top = r.bottom + 10; // fallback below button
  top = Math.min(top, window.innerHeight - h - margin);
  top = Math.max(margin, top);

  panel.style.left = `${Math.round(left)}px`;
  panel.style.top = `${Math.round(top)}px`;
}

function openEmojiPanel() {
  const panel = $("emojiPanel");
  panel.classList.remove("hidden");
  requestAnimationFrame(positionEmojiPanel);
}

function closeEmojiPanel() {
  $("emojiPanel").classList.add("hidden");
}

// Close when clicking outside
document.addEventListener("click", (e) => {
  const panel = $("emojiPanel");
  if (panel.classList.contains("hidden")) return;
  const btn = $("emojiBtn");
  const t = e.target;
  if (panel.contains(t) || btn.contains(t)) return;
  closeEmojiPanel();
});

window.addEventListener("resize", () => positionEmojiPanel());
window.addEventListener("scroll", () => positionEmojiPanel(), true);

function initEmojiPanel() {
  const emojis = ["😀","😄","😂","😉","😍","😘","🤔","😅","😭","😡","👍","👏","🙏","🎉","🔥","🚀","✅","❤️"];
  const list = $("emojiList");
  list.innerHTML = "";
  emojis.forEach((ch) => {
    const b = document.createElement("button");
    b.className = "btn btn-secondary emojiBtn";
    b.type = "button";
    b.textContent = ch;
    b.onclick = () => {
      const inp = $("messageInput");
      inp.value = (inp.value || "") + ch;
      inp.focus();
    };
    list.appendChild(b);
  });

  const stickers = [
    "/stickers/01_smile.svg",
    "/stickers/02_laugh.svg",
    "/stickers/03_thumbsup.svg",
    "/stickers/04_heart.svg",
    "/stickers/05_ok.svg",
    "/stickers/06_party.svg",
    "/stickers/07_clap.svg",
    "/stickers/08_think.svg",
    "/stickers/09_cry.svg",
    "/stickers/10_angry.svg",
    "/stickers/11_fire.svg",
    "/stickers/12_rocket.svg"
  ];
  const sWrap = $("stickerList");
  sWrap.innerHTML = "";
  stickers.forEach((url) => {
    const d = document.createElement("div");
    d.className = "stickerItem";
    const img = document.createElement("img");
    img.src = url;
    img.alt = "sticker";
    d.appendChild(img);
    d.onclick = () => sendSticker(url);
    sWrap.appendChild(d);
  });
}

// ==== Todos / Blackboard ====
$("addTodoBtn").onclick = async () => {
  $("boardModal").classList.remove("hidden");
  $("newTodoInput").value = "";
  
  // 填充指派下拉框
  try {
    const res = await api("/api/admin/users");
    const select = $("newTodoAssignee");
    select.innerHTML = '<option value="">(不指定)</option>';
    if (res.users) {
      res.users.forEach(u => {
        const opt = document.createElement("option");
        opt.value = u.id;
        opt.textContent = u.username;
        select.appendChild(opt);
      });
    }
  } catch (e) {
    console.error("Failed to fetch users for assignee:", e);
  }
};

$("closeBoardBtn").onclick = () => {
  $("boardModal").classList.add("hidden");
};

$("refreshBoardBtn").onclick = () => {
  refreshTodos();
};

$("exportBoardBtn").onclick = () => {
  const token = localStorage.getItem("token");
  if (token) window.open(`/api/todos/export?token=${token}`);
};

$("submitTodoBtn").onclick = async () => {
  const input = $("newTodoInput");
  const assigneeSelect = $("newTodoAssignee");
  const val = input.value.trim();
  const assigneeId = assigneeSelect.value;
  if (!val) return;
  try {
    await api("/api/todos", { method: "POST", body: { content: val, assigneeId } });
    $("boardModal").classList.add("hidden");
    await refreshTodos();
  } catch (e) {
    alert("添加失败：" + e.message);
  }
};

$("newTodoInput").onkeydown = (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    $("submitTodoBtn").click();
  }
};

let currentEditTodoId = null;
let currentDeleteTodoId = null;

$("closeEditTodoBtn").onclick = () => {
  $("editTodoModal").classList.add("hidden");
  currentEditTodoId = null;
};

$("saveTodoBtn").onclick = async () => {
  if (!currentEditTodoId) return;
  const content = $("editTodoInput").value.trim();
  const assigneeId = $("editTodoAssignee").value;
  if (!content) return;
  
  try {
    await api(`/api/todos/${currentEditTodoId}`, { method: "PUT", body: { content, assigneeId } });
    $("editTodoModal").classList.add("hidden");
    currentEditTodoId = null;
    refreshTodos();
  } catch (e) {
    alert("修改失败：" + e.message);
  }
};

$("cancelDeleteTodoBtn").onclick = () => {
  $("deleteTodoModal").classList.add("hidden");
  currentDeleteTodoId = null;
};

$("confirmDeleteTodoBtn").onclick = async () => {
  if (!currentDeleteTodoId) return;
  try {
    await api(`/api/todos/${currentDeleteTodoId}`, { method: "DELETE" });
    $("deleteTodoModal").classList.add("hidden");
    currentDeleteTodoId = null;
    refreshTodos();
  } catch (e) {
    alert("删除失败：" + e.message);
  }
};

async function refreshTodos() {
  const list = $("todoList");
  if (!list) return;
  list.innerHTML = "加载中...";
  try {
    const res = await api("/api/todos");
    list.innerHTML = "";
    const todos = res.todos || [];
    
    // 排序：未完成在前，已完成在后；同状态下按时间倒序
    todos.sort((a, b) => {
      if (a.completed === b.completed) {
        return b.createdAt - a.createdAt;
      }
      return a.completed ? 1 : -1;
    });

    if (todos.length === 0) {
      list.innerHTML = "<div style='color:#64748b; text-align:center; padding: 20px; font-size: 13px;'>暂无待办任务</div>";
      return;
    }

    todos.forEach(t => {
      const el = document.createElement("div");
      el.className = "todo-item";
      
      const left = document.createElement("div");
      left.className = "todo-left";
      
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.className = "todo-checkbox";
      cb.checked = t.completed;
      cb.onchange = async () => {
        await api(`/api/todos/${t.id}`, { method: "PUT", body: { completed: cb.checked } });
        refreshTodos();
      };
      
      const contentWrap = document.createElement("div");
      contentWrap.style.flex = "1";

      const content = document.createElement("div");
      content.className = "todo-content " + (t.completed ? "done" : "");
      content.textContent = t.content;
      contentWrap.appendChild(content);
      
      left.appendChild(cb);
      left.appendChild(contentWrap);
      
      const meta = document.createElement("div");
      meta.className = "todo-meta";
      
      const metaLeft = document.createElement("div");
      metaLeft.style.display = "flex";
      metaLeft.style.alignItems = "center";
      metaLeft.style.gap = "8px";

      const infoSpan = document.createElement("span");
      infoSpan.textContent = t.completed ? `已完成` : `创建: ${t.creatorName}`;
      metaLeft.appendChild(infoSpan);

      if (t.assigneeName) {
        const assignee = document.createElement("span");
        assignee.className = "todo-assignee";
        assignee.textContent = `@${t.assigneeName}`;
        metaLeft.appendChild(assignee);
      }
      
      meta.appendChild(metaLeft);

      // 操作按钮（编辑 + 删除）
      const actions = document.createElement("div");
      actions.className = "todo-actions";
      
      const editBtn = document.createElement("button");
      editBtn.className = "iconBtn";
      editBtn.title = "编辑任务";
      editBtn.style.padding = "2px";
      editBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4facfe" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>`;
      editBtn.onclick = async () => {
        currentEditTodoId = t.id;
        $("editTodoInput").value = t.content;
        
        // 填充下拉框
        try {
          const res = await api("/api/admin/users");
          const select = $("editTodoAssignee");
          select.innerHTML = '<option value="">(不指定)</option>';
          if (res.users) {
            res.users.forEach(u => {
              const opt = document.createElement("option");
              opt.value = u.id;
              opt.textContent = u.username;
              select.appendChild(opt);
            });
          }
          // 回显当前的指派人
          if (t.assigneeId) {
            select.value = t.assigneeId;
          } else {
            select.value = "";
          }
        } catch (e) {
          console.error("Failed to fetch users for edit assignee:", e);
        }

        $("editTodoModal").classList.remove("hidden");
      };
      
      const delBtn = document.createElement("button");
      delBtn.className = "iconBtn";
      delBtn.title = "删除任务";
      delBtn.style.padding = "2px";
      delBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;
      delBtn.onclick = () => {
        currentDeleteTodoId = t.id;
        $("deleteTodoModal").classList.remove("hidden");
      };
      
      actions.appendChild(editBtn);
      actions.appendChild(delBtn);
      meta.appendChild(actions);
      
      el.appendChild(left);
      el.appendChild(meta);
      list.appendChild(el);
    });
  } catch (e) {
    list.innerHTML = `<div class="error">加载失败: ${e.message}</div>`;
  }
}

// ==== Init ====
initEmojiPanel();
init();
