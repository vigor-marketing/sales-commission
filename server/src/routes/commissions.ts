import { Router } from 'express';
import { getDb } from '../db/database.js';
import { readSettings } from '../db/seed.js';

export const commissionsRouter = Router();

/**
 * GET /api/commissions/persons
 * 返回所有可选销售人员（供下拉选择）：
 * 数据库历史记录中出现过的 customer_name + contracts 主数据中的 customer_name + 系统设置人员名单（staffList），合并去重。
 */
commissionsRouter.get('/persons', (_req, res) => {
  const db = getDb();
  const fromHistory = db
    .prepare(`SELECT DISTINCT customer_name FROM calculation_history WHERE customer_name IS NOT NULL AND customer_name != ''`)
    .all() as Array<{ customer_name: string }>;
  const fromContracts = db
    .prepare(`SELECT DISTINCT customer_name FROM contracts WHERE customer_name IS NOT NULL AND customer_name != ''`)
    .all() as Array<{ customer_name: string }>;

  const persons = new Set<string>([...fromHistory, ...fromContracts].map((r) => r.customer_name));
  try {
    const settings = readSettings();
    for (const name of settings.staffList ?? []) {
      if (name && name.trim()) persons.add(name.trim());
    }
  } catch {
    // 设置读取失败时仅用历史人员
  }
  res.json({ data: [...persons].sort((a, b) => a.localeCompare(b, 'zh-CN')) });
});
