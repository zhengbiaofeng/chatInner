import fs from 'fs/promises';
import path from 'path';
import { DbSchema } from '@/types';

const DB_PATH = path.join(process.cwd(), 'data', 'db.json');

let lock = Promise.resolve();

export async function readDb(): Promise<DbSchema> {
  try {
    const data = await fs.readFile(DB_PATH, 'utf-8');
    const parsed = JSON.parse(data) as Partial<DbSchema>;
    
    // Ensure NexusBot exists
    let users = parsed.users || [];
    if (!users.some(u => u.username === 'NexusBot')) {
      users.push({
        id: 'nexus-bot-00000000000000000000',
        username: 'NexusBot',
        passwordHash: 'not_applicable',
        role: 'admin',
        createdAt: 0
      });
    }

    return {
      users,
      channels: parsed.channels || [
        { id: 'general', name: '总台 (GENERAL)', type: 'public', creatorId: 'system', createdAt: Date.now() }
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
          id: 'nexus-bot-00000000000000000000',
          username: 'NexusBot',
          passwordHash: 'not_applicable',
          role: 'admin',
          createdAt: 0
        }
      ], 
      channels: [{ id: 'general', name: '总台 (GENERAL)', type: 'public', creatorId: 'system', createdAt: Date.now() }], 
      messages: [], 
      attachments: [], 
      todos: [], 
      favorites: [] 
    };
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
