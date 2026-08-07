import { Router } from 'express';
import { getDb } from '../db/database.js';
import { scheduleBackup } from '../services/backup.js';

export const historyRouter = Router();

/** GET /api/history?page=1&pageSize=20 — 历史分页（按时间倒序），pageSize 上限 10000 支持全量 */
historyRouter.get('/', (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(10000, Math.max(1, Number(req.query.pageSize) || 20));
  const offset = (page - 1) * pageSize;

  const db = getDb();
  const total = (db.prepare('SELECT COUNT(*) AS c FROM calculation_history').get() as { c: number }).c;
  const rows = db
    .prepare(
      `SELECT id, contract_no, customer_name, payment_plan_json, position_persons_json,
              plan_index, total_plan_count, contract_total_commission, commission,
              sales_amount, sales_cost, base_amount, total_commission, settings_snapshot, result_json, created_at
       FROM calculation_history
       ORDER BY id DESC
       LIMIT ? OFFSET ?`
    )
    .all(pageSize, offset) as Array<Record<string, unknown>>;

  const list = rows.map((r) => {
    let positionPersons: Record<string, string> = {};
    try {
      positionPersons = JSON.parse(r.position_persons_json as string) || {};
    } catch {
      positionPersons = {};
    }
    let result: Record<string, unknown> = {};
    try {
      result = JSON.parse(r.result_json as string) || {};
    } catch {
      result = {};
    }
    return {
      id: r.id,
      contractNo: r.contract_no,
      customerName: r.customer_name,
      paymentPlan: JSON.parse(r.payment_plan_json as string),
      positionPersons,
      planIndex: r.plan_index,
      totalPlanCount: r.total_plan_count,
      contractTotalCommission: r.contract_total_commission,
      commission: r.commission,
      salesAmount: r.sales_amount,
      salesCost: r.sales_cost,
      baseAmount: r.base_amount,
      totalCommission: r.total_commission,
      settingsSnapshot: JSON.parse(r.settings_snapshot as string),
      result,
      createdAt: r.created_at,
    };
  });

  res.json({ data: { list, total, page, pageSize } });
});

/**
 * GET /api/history/contracts?customerName=xxx
 * 按销售姓名返回该销售的所有合同号（去重、排序），供合同号下拉（自动根据姓名调出该销售所有合同）。
 * 来源：contracts 主数据表 + 计算历史，合并去重。
 */
historyRouter.get('/contracts', (req, res) => {
  const customerName = typeof req.query.customerName === 'string' ? req.query.customerName.trim() : '';
  if (!customerName) {
    res.json({ data: [] });
    return;
  }
  const db = getDb();
  const fromContracts = db
    .prepare(`SELECT DISTINCT contract_no FROM contracts WHERE customer_name = ? AND contract_no IS NOT NULL AND contract_no != ''`)
    .all(customerName) as Array<{ contract_no: string }>;
  const fromHistory = db
    .prepare(
      `SELECT DISTINCT contract_no FROM calculation_history
       WHERE customer_name = ? AND contract_no IS NOT NULL AND contract_no != ''`
    )
    .all(customerName) as Array<{ contract_no: string }>;
  const merged = new Set<string>([...fromContracts, ...fromHistory].map((r) => r.contract_no));
  res.json({ data: [...merged].sort((a, b) => a.localeCompare(b, 'zh-CN')) });
});

/**
 * GET /api/history/contract?contractNo=xxx
 * 按合同号查询最新一条记录（供输入自动带出：姓名、业绩币种/金额/汇率、费用、岗位人员、已录笔数）
 * 返回：{ data: {...} | null }
 */
historyRouter.get('/contract', (req, res) => {
  const contractNo = typeof req.query.contractNo === 'string' ? req.query.contractNo.trim() : '';
  if (!contractNo) {
    res.json({ data: null });
    return;
  }
  const db = getDb();
  const row = db
    .prepare(
      `SELECT id, contract_no, customer_name, payment_plan_json, position_persons_json,
              plan_index, total_plan_count, result_json
       FROM calculation_history
       WHERE contract_no = ?
       ORDER BY id DESC
       LIMIT 1`
    )
    .get(contractNo) as
    | {
        id: number;
        contract_no: string;
        customer_name: string;
        payment_plan_json: string;
        position_persons_json: string;
        plan_index: number;
        total_plan_count: number;
        result_json: string;
      }
    | undefined;

  if (!row) {
    res.json({ data: null });
    return;
  }
  let plan: unknown[] = [];
  try {
    plan = JSON.parse(row.payment_plan_json);
  } catch {
    plan = [];
  }
  let positionPersons: Record<string, string> = {};
  try {
    positionPersons = JSON.parse(row.position_persons_json) || {};
  } catch {
    positionPersons = {};
  }
  let result: Record<string, unknown> = {};
  try {
    result = JSON.parse(row.result_json) || {};
  } catch {
    result = {};
  }
  res.json({
    data: {
      contractNo: row.contract_no,
      customerName: row.customer_name,
      paymentPlan: plan,
      positionPersons,
      // 合同级信息（最新一条）：业绩币种/金额/汇率、费用、模板
      salesAmount: result.salesAmount ?? null,
      salesAmountOrig: result.salesAmountOrig ?? null,
      salesCurrency: result.salesCurrency ?? 'USD',
      salesRate: result.salesRate ?? 7.2,
      salesFees: result.salesFees ?? [],
      salesCost: result.salesCost ?? 0,
      templateName: (result.settingsSnapshot as { name?: string } | undefined)?.name ?? '',
      templateId: (result.settingsSnapshot as { id?: string } | undefined)?.id ?? '',
      // 已录笔数
      lastPlanIndex: row.plan_index,
      totalPlanCount: row.total_plan_count,
    },
  });
});

/** DELETE /api/history/:id — 删除单条历史 */
historyRouter.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: '无效的 id' });
    return;
  }
  const db = getDb();
  const info = db.prepare('DELETE FROM calculation_history WHERE id = ?').run(id);
  if (info.changes === 0) {
    res.status(404).json({ error: '记录不存在' });
    return;
  }
  scheduleBackup();
  res.status(204).end();
});
