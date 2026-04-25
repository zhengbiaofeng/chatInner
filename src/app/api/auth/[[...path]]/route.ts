import { NextResponse } from 'next/server';
import { readDb } from '@/lib/db';
import { signToken, getUserFromReq } from '@/lib/auth';
import bcrypt from 'bcryptjs';

export async function POST(req: Request, { params }: { params: Promise<{ path?: string[] }> }) {
  const path = (await params).path?.[0];

  if (path === 'login') {
    try {
      const body = await req.json();
      const { username, password } = body;

      if (!username || !password) {
        return NextResponse.json({ error: 'Missing username or password' }, { status: 400 });
      }

      const db = await readDb();
      const user = db.users.find((u) => u.username === username);
      if (!user) {
        return NextResponse.json({ error: 'User not found' }, { status: 401 });
      }

      const match = await bcrypt.compare(password, user.passwordHash);
      if (!match) {
        return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
      }

      const userPublic = { id: user.id, username: user.username, role: user.role, createdAt: user.createdAt };
      const token = signToken(userPublic);

      return NextResponse.json({ token, user: userPublic });
    } catch (e) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }
  }

  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}

export async function GET(req: Request, { params }: { params: Promise<{ path?: string[] }> }) {
  const path = (await params).path?.[0];

  if (path === 'me') {
    const user = await getUserFromReq(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ user });
  }

  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}
