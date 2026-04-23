const jwt = require("jsonwebtoken");

function getTokenFromReq(req) {
  const h = req.headers.authorization || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  // Also allow token in query string for file preview/download in browser
  // (img/a tags cannot set Authorization header easily)
  if (m) return m[1];
  const q = req.query && (req.query.token || req.query.access_token);
  if (typeof q === "string" && q.trim()) return q.trim();
  return null;
}

function requireAuth(jwtSecret) {
  return (req, res, next) => {
    const token = getTokenFromReq(req);
    if (!token) return res.status(401).json({ error: "未登录" });
    try {
      const payload = jwt.verify(token, jwtSecret);
      req.user = payload; // { id, username }
      next();
    } catch {
      return res.status(401).json({ error: "登录已过期或无效" });
    }
  };
}

function verifySocket(jwtSecret) {
  return (socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error("未登录"));
    try {
      const payload = jwt.verify(token, jwtSecret);
      socket.user = payload;
      next();
    } catch {
      next(new Error("登录无效"));
    }
  };
}

module.exports = { requireAuth, verifySocket };
