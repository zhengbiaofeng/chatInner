import { NextResponse } from 'next/server';
import { readDb, updateDb } from '@/lib/db';
import { getUserFromReq } from '@/lib/auth';
import { DbAttachment } from '@/types';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs/promises';
import path from 'path';

function genId() { return uuidv4().replace(/-/g, ''); }

const UPLOADS_DIR = path.join(process.cwd(), 'data', 'uploads');

export async function POST(req: Request) {
  const user = await getUserFromReq(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const formData = await req.formData();
    const files = formData.getAll('files');
    if (!files || files.length === 0) {
      return NextResponse.json({ error: 'No files uploaded' }, { status: 400 });
    }

    // Ensure uploads directory exists
    await fs.mkdir(UPLOADS_DIR, { recursive: true });

    const attachments: DbAttachment[] = [];
    for (const entry of files) {
      const file = entry as File;
      const buffer = Buffer.from(await file.arrayBuffer());
      const id = genId();
      const originalName = file.name;
      const mime = file.type || 'application/octet-stream';
      const size = file.size;
      const storedName = `${id}__${originalName}`;
      
      await fs.writeFile(path.join(UPLOADS_DIR, storedName), buffer);

      attachments.push({
        id,
        originalName,
        storedName,
        mime,
        size,
        uploaderId: user.id,
        createdAt: Date.now()
      });
    }

    await updateDb(async (db) => {
      db.attachments.push(...attachments);
      return db;
    });

    return NextResponse.json({
      attachments: attachments.map(a => ({
        id: a.id,
        name: a.originalName,
        mime: a.mime,
        size: a.size,
        isImage: String(a.mime || '').startsWith('image/'),
        url: `/file/${encodeURIComponent(a.id)}`
      }))
    });

  } catch (e: any) {
    return NextResponse.json({ error: 'Upload failed: ' + e.message }, { status: 500 });
  }
}
