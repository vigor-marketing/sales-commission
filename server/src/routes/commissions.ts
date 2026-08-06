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

/**
 * GET /api/commissions?year=2026&month=2026-08&customerName=
 * 提成统计：明细行 = 每笔收款记录（含 planIndex/totalPlanCount/这笔提成）；
 * 汇总（总提成/按人/按岗位）按「合同」去重（同一合同多笔只计一次合同级数据），
 * 兼容旧数据（一条记录 = 一个合同）。
 */
commissionsRouter.get('/', (req, res) => {
  const now = new Date();
  const defaultYear = String(now.getFullYear());
  const year = typeof req.query.year === 'string' && req.query.year.trim()
    ? req.query.year.trim()
    : defaultYear;
  const month = typeof req.query.month === 'string' ? req.query.month.trim() : '';
  const customerName = typeof req.query.customerName === 'string' ? req.query.customerName.trim() : '';

  const db = getDb();

  let sql = `
    SELECT id, contract_no, customer_name, total_commission, commission, plan_index, total_plan_count,
           settings_snapshot, result_json, position_persons_json, created_at
    FROM calculation_history
    WHERE customer_name IS NOT NULL AND customer_name != ''
  `;
  const params: unknown[] = [];
  if (month) {
    sql += ` AND substr(created_at, 1, 7) = ?`;
    params.push(month);
  } else if (year) {
    sql += ` AND substr(created_at, 1, 4) = ?`;
    params.push(year);
  }
  if (customerName) {
    sql += ` AND customer_name LIKE ?`;
    params.push(`%${customerName}%`);
  }
  sql += ` ORDER BY created_at DESC, id DESC`;

  const rows = db.prepare(sql).all(...params) as Array<{
    id: number;
    contract_no: string;
    customer_name: string;
    total_commission: number;
    commission: number;
    plan_index: number;
    total_plan_count: number;
    settings_snapshot: string;
    result_json: string;
    position_persons_json: string;
    created_at: string;
  }>;

  // 明细行（每笔记录一行）
  const list = rows.map((r) => {
    let templateName = '';
    let result: Record<string, unknown> = {};
    try {
      result = JSON.parse(r.result_json) || {};
    } catch {
      result = {};
    }
    try {
      const snap = result.settingsSnapshot as { name?: string } | undefined;
      templateName = snap?.name ?? '';
    } catch {
      templateName = '';
    }
    return {
      id: r.id,
      customerName: r.customer_name,
      month: (r.created_at as string).slice(0, 7),
      contractNo: r.contract_no,
      templateName,
      totalCommission: Math.round(r.total_commission * 100) / 100,
      commission: Math.round(r.commission * 100) / 100,
      planIndex: r.plan_index,
      totalPlanCount: r.total_plan_count,
      createdAt: r.created_at,
    };
  });

  // 按合同去重（取最新一条的合同级数据）用于汇总
  type HistoryRow = (typeof rows)[number];
  const contractMap = new Map<string, { latest: HistoryRow; all: HistoryRow[] }>();
  for (const r of rows) {
    const existing = contractMap.get(r.contract_no);
    const entry: { latest: HistoryRow; all: HistoryRow[] } = existing ?? {
      latest: r,
      all: [],
    };
    if (r.id > entry.latest.id) entry.latest = r;
    entry.all.push(r);
    contractMap.set(r.contract_no, entry);
  }
  const contractEntries = [...contractMap.values()];

  const byPerson: Record<string, number> = {};
  const byMonth: Record<string, number> = {};
  let total = 0;
  for (const { latest } of contractEntries) {
    const c = Math.round(latest.total_commission * 100) / 100;
    byPerson[latest.customer_name] = Math.round(((byPerson[latest.customer_name] ?? 0) + c) * 100) / 100;
    byMonth[(latest.created_at as string).slice(0, 7)] = Math.round(((byMonth[(latest.created_at as string).slice(0, 7)] ?? 0) + c) * 100) / 100;
    total = Math.round((total + c) * 100) / 100;
  }

  // 按人 × 岗位汇总（合同级岗位分配；岗位人员取该合同第一条非空记录）
  const personPositionMap: Record<string, Record<string, number>> = {};
  const allPositionsSet = new Set<string>();
  for (const { latest, all } of contractEntries) {
    let positionPersons: Record<string, string> = {};
    const allRows: HistoryRow[] = [latest, ...all];
    for (const r of allRows) {
      try {
        const pp = JSON.parse(r.position_persons_json) || {};
        if (Object.keys(pp).length > 0) {
          positionPersons = pp;
          break;
        }
      } catch {
        // 忽略
      }
    }
    let positionTotals: Record<string, number> = {};
    try {
      const resJson = JSON.parse(latest.result_json) as {
        positionTotals?: Record<string, number>;
        positionPersons?: Record<string, string>;
      };
      positionTotals = resJson.positionTotals ?? {};
      if (!positionPersons || Object.keys(positionPersons).length === 0) {
        if (resJson.positionPersons && Object.keys(resJson.positionPersons).length > 0) {
          positionPersons = resJson.positionPersons;
        }
      }
    } catch {
      positionTotals = {};
    }
    for (const [pos, amt] of Object.entries(positionTotals)) {
      const person = positionPersons[pos] || '未分配';
      personPositionMap[person] = personPositionMap[person] ?? {};
      personPositionMap[person][pos] = Math.round(((personPositionMap[person][pos] ?? 0) + amt) * 100) / 100;
      allPositionsSet.add(pos);
    }
  }
  const personPosition = Object.entries(personPositionMap)
    .map(([person, positions]) => ({
      person,
      positions,
      total: Math.round(Object.values(positions).reduce((a, b) => a + b, 0) * 100) / 100,
    }))
    .sort((a, b) => b.total - a.total);

  res.json({
    data: {
      year,
      month,
      filters: { year, month, customerName },
      list,
      summary: {
        total,
        count: contractEntries.length,
        byPerson,
        byMonth,
      },
      personPosition,
      allPositions: [...allPositionsSet],
    },
  });
});
