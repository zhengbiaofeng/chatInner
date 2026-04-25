import { NextResponse } from 'next/server';
import { readDb } from '@/lib/db';
import fs from 'fs/promises';
import path from 'path';

export async function GET(req: Request, { params }: { params: Promise<{ path?: string[] }> }) {
  const id = (await params).path?.[0];
  if (!id) return NextResponse.json({ error: 'Missing ID' }, { status: 400 });

  const db = await readDb();
  const att = db.attachments.find(a => a.id === id);
  if (!att) return NextResponse.json({ error: 'File not found' }, { status: 404 });

  const UPLOADS_DIR = path.join(process.cwd(), 'data', 'uploads');
  const filePath = path.join(UPLOADS_DIR, att.storedName);

  try {
    const fileBuffer = await fs.readFile(filePath);
    
    // Set headers
    const headers = new Headers();
    headers.set('Content-Type', att.mime || 'application/octet-stream');
    headers.set('Content-Length', att.size.toString());
    
    // Suggest download if not image/video
    if (!String(att.mime || '').startsWith('image/') && !String(att.mime || '').startsWith('video/')) {
      headers.set('Content-Disposition', `attachment; filename="${encodeURIComponent(att.originalName)}"`);
    } else {
      headers.set('Content-Disposition', `inline; filename="${encodeURIComponent(att.originalName)}"`);
    }

    return new NextResponse(fileBuffer, { headers });
  } catch (e) {
    return NextResponse.json({ error: 'Error reading file' }, { status: 500 });
  }
}
