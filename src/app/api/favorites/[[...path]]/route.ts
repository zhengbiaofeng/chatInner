import { NextResponse } from 'next/server';
import { readDb, updateDb } from '@/lib/db';
import { getUserFromReq } from '@/lib/auth';
import { v4 as uuidv4 } from 'uuid';
import { Favorite, FavoriteSingle, FavoriteCollection } from '@/types';

function genId() { return uuidv4().replace(/-/g, ''); }

export async function GET(req: Request, { params }: { params: Promise<{ path?: string[] }> }) {
  const user = await getUserFromReq(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const path = (await params).path?.[0];

  if (path === 'export') {
    const db = await readDb();
    const favs = (db.favorites || []).filter(f => f.userId === user.id);
    favs.sort((a, b) => b.createdAt - a.createdAt);

    let md = `# 我的精华收藏库\n导出时间：${new Date().toLocaleString()}\n\n---\n\n`;
    if (favs.length === 0) {
      md += "暂无收藏记录。\n";
    }

    favs.forEach(f => {
      if (!f.type || f.type === 'single') {
        const m = (f as FavoriteSingle).message;
        if (!m) return;
        const mDate = new Date(m.createdAt).toLocaleString();
        md += `> **[${m.username}]** ${mDate}\n>\n`;
        if (m.text) {
          const lines = m.text.split('\n').map(l => `> ${l}`).join('\n');
          md += `${lines}\n>\n`;
        }
        if (m.attachments && m.attachments.length > 0) {
          m.attachments.forEach(a => {
            md += `> 📎 [附件: ${a.name}](${a.url})\n`;
          });
        }
        md += `\n---\n\n`;
      } else if (f.type === 'collection') {
        const c = f as FavoriteCollection;
        const cDate = new Date(c.createdAt).toLocaleString();
        md += `## 📚 合集: ${c.title}\n收藏时间：${cDate}\n\n`;
        if (c.messages && c.messages.length > 0) {
          c.messages.forEach(m => {
            const mDate = new Date(m.createdAt).toLocaleString();
            md += `> **[${m.username}]** ${mDate}\n`;
            if (m.text) {
              const lines = m.text.split('\n').map(l => `> ${l}`).join('\n');
              md += `>\n${lines}\n`;
            }
            if (m.attachments && m.attachments.length > 0) {
              md += `>\n`;
              m.attachments.forEach(a => {
                md += `> 📎 [附件: ${a.name}](${a.url})\n`;
              });
            }
            md += `>\n`;
          });
        }
        md += `\n---\n\n`;
      }
    });

    return new NextResponse(md, {
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Content-Disposition': 'attachment; filename="my-favorites.md"'
      }
    });
  }

  // Get favorites list
  const db = await readDb();
  const favs = (db.favorites || []).filter(f => f.userId === user.id);
  favs.sort((a, b) => b.createdAt - a.createdAt);
  return NextResponse.json({ favorites: favs });
}

export async function POST(req: Request) {
  const user = await getUserFromReq(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { messageId, messageIds, title } = body;

  try {
    const newFav = await updateDb<Favorite>(async (db) => {
      if (!db.favorites) db.favorites = [];

      if (messageIds && Array.isArray(messageIds) && messageIds.length > 0) {
        const msgs = db.messages.filter(m => messageIds.includes(m.id));
        if (msgs.length === 0) throw new Error("选中的消息不存在或已被撤回");
        msgs.sort((a, b) => a.createdAt - b.createdAt);
        
        const fav: FavoriteCollection = {
          id: genId(),
          userId: user.id,
          type: 'collection',
          title: title || "未命名合集",
          messages: JSON.parse(JSON.stringify(msgs)),
          createdAt: Date.now()
        };
        db.favorites.push(fav);
        return { db, result: fav };
      } else if (messageId) {
        if (db.favorites.some(f => f.userId === user.id && f.type === 'single' && (f as FavoriteSingle).message?.id === messageId)) {
          throw new Error("已经收藏过了");
        }
        const msg = db.messages.find(m => m.id === messageId);
        if (!msg) throw new Error("消息不存在或已被撤回");
        
        const fav: FavoriteSingle = {
          id: genId(),
          userId: user.id,
          type: 'single',
          message: JSON.parse(JSON.stringify(msg)),
          createdAt: Date.now()
        };
        db.favorites.push(fav);
        return { db, result: fav };
      } else {
        throw new Error("缺少参数");
      }
    });
    return NextResponse.json({ favorite: newFav });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ path?: string[] }> }) {
  const user = await getUserFromReq(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const id = (await params).path?.[0];

  if (id === 'admin') {
    if (user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    await updateDb(async (db) => {
      db.favorites = [];
      return db;
    });
    return NextResponse.json({ ok: true });
  }

  if (!id) return NextResponse.json({ error: 'Missing ID' }, { status: 400 });

  await updateDb(async (db) => {
    if (!db.favorites) db.favorites = [];
    db.favorites = db.favorites.filter(f => !(f.id === id && f.userId === user.id));
    return db;
  });

  return NextResponse.json({ ok: true });
}
