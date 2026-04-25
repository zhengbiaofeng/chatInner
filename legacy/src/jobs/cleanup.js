const fs = require("fs");
const path = require("path");

function startCleanupJob(store, uploadDir) {
  // 每小时执行一次清理
  const CLEANUP_INTERVAL = 60 * 60 * 1000;

  setInterval(async () => {
    try {
      await store.update(async (db) => {
        const usedAttIds = new Set();

        // 收集所有在消息中仍在使用的附件ID
        for (const msg of db.messages) {
          if (Array.isArray(msg.attachments)) {
            for (const a of msg.attachments) {
              usedAttIds.add(a.id);
            }
          }
        }

        // 找出 db.attachments 中不再被使用的孤儿附件
        const orphans = db.attachments.filter(a => !usedAttIds.has(a.id));

        if (orphans.length === 0) return db;

        console.log(`[Cleanup] Found ${orphans.length} orphaned attachments. Cleaning up...`);

        // 删除物理文件
        for (const a of orphans) {
          const filePath = path.join(uploadDir, a.storedName);
          if (fs.existsSync(filePath)) {
            try {
              fs.unlinkSync(filePath);
            } catch (err) {
              console.error(`[Cleanup] Failed to delete file ${filePath}:`, err);
            }
          }
        }

        // 从 db.attachments 中移除
        db.attachments = db.attachments.filter(a => usedAttIds.has(a.id));
        return db;
      });
    } catch (err) {
      console.error("[Cleanup] Error during cleanup job:", err);
    }
  }, CLEANUP_INTERVAL);

  console.log("[Cleanup] Job scheduled (runs every 1 hour).");
}

module.exports = { startCleanupJob };
