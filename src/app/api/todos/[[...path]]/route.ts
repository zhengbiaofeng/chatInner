import { NextResponse } from 'next/server';
import { readDb, updateDb } from '@/lib/db';
import { getUserFromReq } from '@/lib/auth';
import { v4 as uuidv4 } from 'uuid';

function genId() { return uuidv4().replace(/-/g, ''); }

export async function GET(req: Request) {
  const user = await getUserFromReq(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = await readDb();
  return NextResponse.json({ todos: db.todos || [] });
}

export async function POST(req: Request) {
  const user = await getUserFromReq(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  if (!body.content || typeof body.content !== 'string' || !body.content.trim()) {
    return NextResponse.json({ error: '内容不能为空' }, { status: 400 });
  }

  const newTodo = await updateDb(async (db) => {
    let assigneeName = undefined;
    if (body.assigneeId) {
      const a = db.users.find(u => u.id === body.assigneeId);
      if (a) assigneeName = a.username;
    }
    const t = {
      id: genId(),
      content: body.content.trim(),
      completed: false,
      creatorId: user.id,
      creatorName: user.username,
      assigneeId: body.assigneeId || undefined,
      assigneeName,
      createdAt: Date.now(),
      completedAt: null
    };
    db.todos.push(t);
    return { db, result: t };
  });

  return NextResponse.json({ todo: newTodo });
}

export async function PUT(req: Request, { params }: { params: Promise<{ path?: string[] }> }) {
  const user = await getUserFromReq(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  
  const id = (await params).path?.[0];
  if (!id) return NextResponse.json({ error: 'Missing ID' }, { status: 400 });

  const body = await req.json();

  const updated = await updateDb(async (db) => {
    const t = db.todos.find(x => x.id === id);
    if (!t) throw new Error('Not found');
    t.completed = !!body.completed;
    t.completedAt = t.completed ? Date.now() : null;
    return { db, result: t };
  });

  return NextResponse.json({ todo: updated });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ path?: string[] }> }) {
  const user = await getUserFromReq(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const id = (await params).path?.[0];
  if (!id) return NextResponse.json({ error: 'Missing ID' }, { status: 400 });

  await updateDb(async (db) => {
    db.todos = db.todos.filter(x => x.id !== id);
    return db;
  });

  return NextResponse.json({ ok: true });
}
