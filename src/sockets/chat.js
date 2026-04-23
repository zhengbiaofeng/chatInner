const { verifySocket } = require("../../auth");
const crypto = require("crypto");

function genId() {
  return (crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString("hex")).replace(/-/g, "");
}

module.exports = function setupSocket(io, store, config) {
  const { jwtSecret } = config;

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
};
