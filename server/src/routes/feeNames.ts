import { Router } from 'express';
import { getDb } from '../db/database.js';
import { scheduleBackup } from '../services/backup.js';

/** 销售费用名称字典管理 */
export const feeNamesRouter = Router();

/** 默认费用名称（首次启动写入） */
const DEFAULT_FEE_NAMES = ['出差费', '招待费', '交通费', '办公费', '业务费', '其他'];

/** 初始化字典默认项（仅在空表时插入） */
function ensureDefaultFeeNames(): void {
  const db = getDb();
  const count = (db.prepare('SELECT COUNT(*) AS c FROM fee_names').get() as { c: number }).c;
  if (count === 0) {
    const insert = db.prepare('INSERT INTO fee_names (name, sort_order) VALUES (?, ?)');
    DEFAULT_FEE_NAMES.forEach((n, i) => insert.run(n, i));
  }
}

/** GET /api/feeNames — 返回费用名称字典（按 sort_order + id 排序） */
feeNamesRouter.get('/', (_req, res) => {
  ensureDefaultFeeNames();
  const db = getDb();
  const rows = db.prepare(`SELECT id, name, sort_order, created_at FROM fee_names ORDER BY sort_order ASC, id ASC`).all() as Array<{ id: number; name: string; sort_order: number; created_at: string }>;
  res.json({ data: rows.map((r) => ({ id: r.id, name: r.name, sortOrder: r.sort_order, createdAt: r.created_at })) });
});

/** POST /api/feeNames — 新增费用名称 */
feeNamesRouter.post('/', (req, res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  if (!name) {
    res.status(400).json({ error: '费用名称不能为空' });
    return;
  }
  const db = getDb();
  // 重复名称去重：明确返回 409，前端提示"已存在"（避免"已添加但列表没变"的错觉）
  const existing = db.prepare('SELECT id, name, sort_order FROM fee_names WHERE name = ?').get(name) as { id: number; name: string; sort_order: number } | undefined;
  if (existing) {
    res.status(409).json({ error: `费用名称「${name}」已存在` });
    return;
  }
  const maxOrder = (db.prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM fee_names').get() as { m: number }).m;
  const info = db.prepare('INSERT INTO fee_names (name, sort_order) VALUES (?, ?)').run(name, maxOrder + 1);
  const row = db.prepare('SELECT id, name, sort_order, created_at FROM fee_names WHERE id = ?').get(info.lastInsertRowid) as { id: number; name: string; sort_order: number; created_at: string };
  scheduleBackup();
  res.json({ data: { id: row.id, name: row.name, sortOrder: row.sort_order, createdAt: row.created_at } });
});

/** DELETE /api/feeNames/:id */
feeNamesRouter.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: '无效的 id' });
    return;
  }
  const db = getDb();
  const info = db.prepare('DELETE FROM fee_names WHERE id = ?').run(id);
  if (info.changes === 0) {
    res.status(404).json({ error: '费用名称不存在' });
    return;
  }
  scheduleBackup();
  res.status(204).end();
});
