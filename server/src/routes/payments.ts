import { Router } from 'express';
import { getDb } from '../db/database.js';
import type { PaymentPlanItem, PaymentRow } from '../types.js';

export const paymentsRouter = Router();

/**
 * GET /api/payments?month=2026-08&contractNo=&customerName=&page=&pageSize=
 * 统计收款：每笔收款计划展开为一行（合同号、姓名、月份、币种、原币金额、汇率、人民币金额）。
 * 可按月份（默认当月）、合同号模糊、姓名模糊筛选。
 */
paymentsRouter.get('/', (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(10000, Math.max(1, Number(req.query.pageSize) || 100));

  // 默认筛选当月（YYYY-MM）
  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const month = typeof req.query.month === 'string' && req.query.month.trim()
    ? req.query.month.trim()
    : defaultMonth;
  const contractNo = typeof req.query.contractNo === 'string' ? req.query.contractNo.trim() : '';
  const customerName = typeof req.query.customerName === 'string' ? req.query.customerName.trim() : '';
  // 合同号多选（逗号分隔）：contractNos=HT-001,HT-002
  const contractNos = typeof req.query.contractNos === 'string'
    ? req.query.contractNos.split(',').map((s) => s.trim()).filter(Boolean)
    : [];
  // 收款状态筛选：all | received | unreceived
  const status = typeof req.query.status === 'string' ? req.query.status.trim() : 'all';

  const db = getDb();

  // 从历史记录中筛选出含收款计划的记录
  let sql = `
    SELECT id, contract_no, customer_name, payment_plan_json, plan_index, total_plan_count, created_at
    FROM calculation_history
    WHERE payment_plan_json IS NOT NULL AND payment_plan_json != '[]'
  `;
  const params: unknown[] = [];
  if (contractNo) {
    sql += ` AND contract_no LIKE ?`;
    params.push(`%${contractNo}%`);
  }
  if (contractNos.length > 0) {
    sql += ` AND contract_no IN (${contractNos.map(() => '?').join(',')})`;
    params.push(...contractNos);
  }
  if (customerName) {
    sql += ` AND customer_name LIKE ?`;
    params.push(`%${customerName}%`);
  }
  sql += ` ORDER BY id DESC`;

  const rows = db.prepare(sql).all(...params) as Array<{
    id: number;
    contract_no: string;
    customer_name: string;
    payment_plan_json: string;
    plan_index: number;
    total_plan_count: number;
    created_at: string;
  }>;

  // 展开收款计划并按月份过滤
  const allPayments: PaymentRow[] = [];
  for (const r of rows) {
    let plan: PaymentPlanItem[] = [];
    try {
      plan = JSON.parse(r.payment_plan_json) as PaymentPlanItem[];
    } catch {
      plan = [];
    }
    // 新模型：记录级 plan_index/total_plan_count；旧模型：按数组位置编号
    const isNew = r.plan_index > 0 && r.total_plan_count > 0;
    const totalCount = isNew ? r.total_plan_count : Math.max(1, plan.length);
    for (let pi = 0; pi < plan.length; pi++) {
      const item = plan[pi];
      if (item.month !== month) continue;
      const received = item.received === true;
      if (status === 'received' && !received) continue;
      if (status === 'unreceived' && received) continue;
      const planIndex = isNew ? r.plan_index : pi + 1;
      allPayments.push({
        id: r.id,
        contractNo: r.contract_no,
        customerName: r.customer_name,
        month: item.month,
        currency: item.currency,
        amount: item.amount,
        rate: item.rate,
        amountCNY: item.amountCNY,
        received,
        /** 该合同收款计划中的第几笔（1~4） */
        planIndex,
        /** 是否全款（该合同收款计划仅一笔） */
        fullPayment: totalCount === 1,
        ratio: item.ratio,
        totalPlanCount: totalCount,
        note: item.note,
        createdAt: r.created_at,
      });
    }
  }

  const total = allPayments.length;
  const start = (page - 1) * pageSize;
  const list = allPayments.slice(start, start + pageSize);

  // 汇总
  const totalAmountCNY = allPayments.reduce((s, p) => s + (p.amountCNY || 0), 0);
  const currencySummary: Record<string, { amount: number; amountCNY: number }> = {};
  for (const p of allPayments) {
    const cur = currencySummary[p.currency] ?? { amount: 0, amountCNY: 0 };
    cur.amount += p.amount || 0;
    cur.amountCNY += p.amountCNY || 0;
    currencySummary[p.currency] = cur;
  }

  res.json({
    data: {
      list,
      total,
      page,
      pageSize,
      month,
      filters: { month, contractNo, customerName },
      summary: {
        totalAmountCNY: Math.round(totalAmountCNY * 100) / 100,
        count: total,
        byCurrency: currencySummary,
      },
    },
  });
});

/**
 * GET /api/payments/months — 返回有收款记录的所有月份（去重、倒序），供月份筛选下拉使用
 */
paymentsRouter.get('/months', (_req, res) => {
  const db = getDb();
  const rows = db
    .prepare(`SELECT payment_plan_json FROM calculation_history WHERE payment_plan_json IS NOT NULL AND payment_plan_json != '[]'`)
    .all() as Array<{ payment_plan_json: string }>;

  const months = new Set<string>();
  for (const r of rows) {
    try {
      const plan = JSON.parse(r.payment_plan_json) as PaymentPlanItem[];
      for (const item of plan) months.add(item.month);
    } catch {
      // 忽略脏数据
    }
  }
  res.json({ data: [...months].sort().reverse() });
});

/**
 * GET /api/payments/yearly?year=2026 — 年度看板：按月份汇总人民币收款金额
 * 返回：{ data: { year, months: [{ month, amountCNY, count }], totalCNY } }
 */
paymentsRouter.get('/yearly', (req, res) => {
  const year = Number(req.query.year) || new Date().getFullYear();
  const db = getDb();
  const rows = db
    .prepare(`SELECT payment_plan_json FROM calculation_history WHERE payment_plan_json IS NOT NULL AND payment_plan_json != '[]'`)
    .all() as Array<{ payment_plan_json: string }>;

  const byMonth: Record<string, { month: string; amountCNY: number; count: number }> = {};
  let totalCNY = 0;
  for (const r of rows) {
    let plan: PaymentPlanItem[] = [];
    try {
      plan = JSON.parse(r.payment_plan_json) as PaymentPlanItem[];
    } catch {
      plan = [];
    }
    for (const item of plan) {
      if (!item.month.startsWith(`${year}-`)) continue;
      const key = item.month;
      const cur = byMonth[key] ?? { month: key, amountCNY: 0, count: 0 };
      cur.amountCNY += item.amountCNY || 0;
      cur.count += 1;
      byMonth[key] = cur;
      totalCNY += item.amountCNY || 0;
    }
  }
  // 补全 1-12 月（无数据月份为 0）
  const months: Array<{ month: string; amountCNY: number; count: number }> = [];
  for (let m = 1; m <= 12; m++) {
    const key = `${year}-${String(m).padStart(2, '0')}`;
    months.push(byMonth[key] ?? { month: key, amountCNY: 0, count: 0 });
  }
  res.json({
    data: {
      year,
      months,
      totalCNY: Math.round(totalCNY * 100) / 100,
    },
  });
});

/**
 * GET /api/payments/contracts — 返回所有出现过的合同号（去重，倒序），供下拉多选
 */
paymentsRouter.get('/contracts', (_req, res) => {
  const db = getDb();
  const rows = db
    .prepare(`SELECT DISTINCT contract_no FROM calculation_history WHERE contract_no IS NOT NULL AND contract_no != '' ORDER BY contract_no`)
    .all() as Array<{ contract_no: string }>;
  res.json({ data: rows.map((r) => r.contract_no) });
});
