import { NextResponse } from 'next/server';
import { readDb, updateDb } from '@/lib/db';
import { getUserFromReq } from '@/lib/auth';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { User, UserPublic } from '@/types';

function genId() { return uuidv4().replace(/-/g, ''); }

export async function GET(req: Request) {
  const user = await getUserFromReq(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = await readDb();
  const usersPublic: UserPublic[] = db.users.map(u => ({
    id: u.id,
    username: u.username,
    role: u.role,
    createdAt: u.createdAt
  }));
  return NextResponse.json({ users: usersPublic });
}

export async function POST(req: Request, { params }: { params: Promise<{ path?: string[] }> }) {
  const user = await getUserFromReq(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json();
  const username = (body.username || '').trim();
  if (!username) return NextResponse.json({ error: '用户名不能为空' }, { status: 400 });
  if (username.length < 2 || username.length > 20) return NextResponse.json({ error: '用户名长度2-20' }, { status: 400 });

  const pwd = body.password || '123456';
  const role = body.role === 'admin' ? 'admin' : 'user';

  try {
    const newUser = await updateDb(async (db) => {
      if (db.users.some(u => u.username === username)) {
        throw new Error('用户名已存在');
      }
      const hash = await bcrypt.hash(pwd, 10);
      const u: User = {
        id: genId(),
        username,
        passwordHash: hash,
        role,
        createdAt: Date.now()
      };
      db.users.push(u);
      return { db, result: { id: u.id, username: u.username, role: u.role, createdAt: u.createdAt } };
    });
    return NextResponse.json({ user: newUser });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ path?: string[] }> }) {
  const user = await getUserFromReq(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  
  const path = (await params).path?.[0];
  if (path === 'password') {
    const body = await req.json();
    const { oldPassword, newPassword } = body;
    if (!newPassword || newPassword.length < 6) {
      return NextResponse.json({ error: '新密码至少6位' }, { status: 400 });
    }
    
    try {
      await updateDb(async (db) => {
        const u = db.users.find(x => x.id === user.id);
        if (!u) throw new Error('User not found');
        const match = await bcrypt.compare(oldPassword, u.passwordHash);
        if (!match) throw new Error('旧密码错误');
        u.passwordHash = await bcrypt.hash(newPassword, 10);
        return db;
      });
      return NextResponse.json({ ok: true });
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
  }

  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ path?: string[] }> }) {
  const user = await getUserFromReq(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const id = (await params).path?.[0];
  if (!id) return NextResponse.json({ error: 'Missing ID' }, { status: 400 });

  try {
    await updateDb(async (db) => {
      const idx = db.users.findIndex(u => u.id === id);
      if (idx === -1) throw new Error('用户不存在');
      if (db.users[idx].role === 'admin' && db.users.filter(u => u.role === 'admin').length <= 1) {
        throw new Error('不能删除最后一个管理员账号');
      }
      db.users.splice(idx, 1);
      return db;
    });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
