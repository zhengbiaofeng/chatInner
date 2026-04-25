import { NextResponse } from 'next/server';
import { readDb, updateDb } from '@/lib/db';
import { getUserFromReq } from '@/lib/auth';
import { v4 as uuidv4 } from 'uuid';

function genId() { return uuidv4().replace(/-/g, ''); }

export async function GET(req: Request) {
  const user = await getUserFromReq(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = await readDb();
  // Return all public channels for now
  const publicChannels = db.channels.filter(c => c.type === 'public');
  return NextResponse.json({ channels: publicChannels });
}

export async function POST(req: Request) {
  const user = await getUserFromReq(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  if (!body.name || typeof body.name !== 'string' || !body.name.trim()) {
    return NextResponse.json({ error: '频道名称不能为空' }, { status: 400 });
  }

  const newChannel = await updateDb(async (db) => {
    const c = {
      id: genId(),
      name: body.name.trim(),
      type: 'public' as const,
      creatorId: user.id,
      createdAt: Date.now()
    };
    db.channels.push(c);
    return { db, result: c };
  });

  return NextResponse.json({ channel: newChannel });
}
