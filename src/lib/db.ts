import fs from 'fs/promises';
import path from 'path';
import { DbSchema } from '@/types';

const DB_PATH = path.join(process.cwd(), 'data', 'db.json');

let lock = Promise.resolve();

export async function readDb(): Promise<DbSchema> {
  try {
    const data = await fs.readFile(DB_PATH, 'utf-8');
    const parsed = JSON.parse(data) as Partial<DbSchema>;
    return {
      users: parsed.users || [],
      messages: parsed.messages || [],
      attachments: parsed.attachments || [],
      todos: parsed.todos || [],
      favorites: parsed.favorites || []
    };
  } catch (e) {
    return { users: [], messages: [], attachments: [], todos: [], favorites: [] };
  }
}

export async function writeDb(db: DbSchema): Promise<void> {
  await fs.writeFile(DB_PATH, JSON.stringify(db, null, 2), 'utf-8');
}

export async function updateDb<T>(
  updater: (db: DbSchema) => Promise<{ db: DbSchema; result?: T } | DbSchema> | ({ db: DbSchema; result?: T } | DbSchema)
): Promise<T | void> {
  const next = lock.then(async () => {
    const db = await readDb();
    const res = await updater(db);
    if (res && 'db' in res) {
      await writeDb(res.db);
      return res.result;
    } else {
      await writeDb(res as DbSchema);
    }
  }).catch(err => {
    console.error('DB Update Error:', err);
    throw err;
  });
  lock = next.then(() => {}).catch(() => {});
  return next;
}
