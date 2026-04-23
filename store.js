const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");

/**
 * Very small JSON-file store (sufficient for 4-5 people in intranet).
 * Uses an in-process write queue to avoid corruption on concurrent writes.
 */
class JsonStore {
  constructor(filePath) {
    this.filePath = filePath;
    this._queue = Promise.resolve();
  }

  async init() {
    await fsp.mkdir(path.dirname(this.filePath), { recursive: true });
    if (!fs.existsSync(this.filePath)) {
      const initial = { users: [], messages: [], attachments: [] };
      await fsp.writeFile(this.filePath, JSON.stringify(initial, null, 2), "utf-8");
    }
  }

  async read() {
    const raw = await fsp.readFile(this.filePath, "utf-8");
    return JSON.parse(raw);
  }

  async write(data) {
    // Atomic-ish write: write temp then rename.
    const tmp = `${this.filePath}.tmp`;
    await fsp.writeFile(tmp, JSON.stringify(data, null, 2), "utf-8");
    await fsp.rename(tmp, this.filePath);
  }

  /**
   * Run a function with serialized access.
   * The function receives the current data, and should return updated data.
   */
  async update(mutatorFn) {
    this._queue = this._queue.then(async () => {
      const data = await this.read();
      const next = await mutatorFn(data);
      await this.write(next);
      return next;
    });
    return this._queue;
  }
}

module.exports = { JsonStore };

