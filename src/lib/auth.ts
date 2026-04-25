import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import { UserPublic } from '@/types';
import { readDb } from './db';

const SECRET_PATH = path.join(process.cwd(), 'data', 'jwt_secret.txt');
let secret = 'default_jwt_secret_please_change';
try {
  secret = fs.readFileSync(SECRET_PATH, 'utf-8').trim();
} catch (e) {
  // Ignore
}

export const JWT_SECRET = secret;

export function signToken(user: UserPublic) {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role, createdAt: user.createdAt },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

export function verifyToken(token: string): UserPublic | null {
  try {
    return jwt.verify(token, JWT_SECRET) as UserPublic;
  } catch (e) {
    return null;
  }
}

export async function getUserFromReq(req: Request): Promise<UserPublic | null> {
  const authHeader = req.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.split(' ')[1];
  const decoded = verifyToken(token);
  if (!decoded) return null;
  
  const db = await readDb();
  const user = db.users.find(u => u.id === decoded.id);
  if (!user) return null;
  
  return { id: user.id, username: user.username, role: user.role, createdAt: user.createdAt };
}
