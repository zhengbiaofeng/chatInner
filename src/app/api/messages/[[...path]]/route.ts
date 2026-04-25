import { NextResponse } from 'next/server';
import { readDb } from '@/lib/db';
import { getUserFromReq } from '@/lib/auth';

export async function GET(req: Request, { params }: { params: Promise<{ path?: string[] }> }) {
  const user = await getUserFromReq(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const roomId = (await params).path?.[0];
  if (!roomId) return NextResponse.json({ error: 'Missing room ID' }, { status: 400 });

  const db = await readDb();
  // Fetch messages for specific room
  const msgs = db.messages.filter(m => m.room === roomId);
  return NextResponse.json({ messages: msgs });
}
