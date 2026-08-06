import { Router } from 'express';
import { getDb } from '../db/database.js';
import { scheduleBackup } from '../services/backup.js';
import type { Currency, SalesFee, PaymentPlanItem } from '../types.js';

export const contractsRouter = Router();

const VALID_CURRENCIES: Currency[] = ['CNY', 'USD', 'EUR'];
const MAX_PLAN = 4;

function sanitizeFees(raw: unknown): { fees: SalesFee[]; total: number; error?: string } {
  if (raw === undefined || raw === null) return { fees: [], total: 0 };
  if (!Array.isArray(raw)) return { fees: [], total: 0, error: 'salesFees 必须是数组' };
  const fees: SalesFee[] = [];
  let total = 0;
  for (const item of raw) {
    const obj = item as Record<string, unknown>;
    const currency = obj.currency as Currency;
    const amount = Number(obj.amount);
    const rate = Number(obj.rate);
    if (!VALID_CURRENCIES.includes(currency)) return { fees: [], total: 0, error: '费用币种仅支持 CNY / USD / EUR' };
    if (!Number.isFinite(amount) || amount < 0) return { fees: [], total: 0, error: '费用金额必须是非负数字' };
    if (!Number.isFinite(rate) || rate <= 0) return { fees: [], total: 0, error: '费用汇率必须大于 0' };
    const amountCNY = currency === 'CNY' ? Math.round(amount * 100) / 100 : Math.round(amount * rate * 100) / 100;
    fees.push({ currency, amount: Math.round(amount * 100) / 100, rate, amountCNY, note: typeof obj.note === 'string' ? obj.note.trim() : '' });
    total += amountCNY;
  }
  return { fees, total: Math.round(total * 100) / 100 };
}

function sanitizePlan(raw: unknown): { plan: PaymentPlanItem[]; error?: string } {
  if (raw === undefined || raw === null) return { plan: [] };
  if (!Array.isArray(raw)) return { plan: [], error: 'paymentPlan 必须是数组' };
  if (raw.length > MAX_PLAN) return { plan: [], error: `收款计划最多 ${MAX_PLAN} 笔` };
  const plan: PaymentPlanItem[] = [];
  for (const item of raw) {
    const obj = item as Record<string, unknown>;
    const month = typeof obj.month === 'string' ? obj.month.trim() : '';
    const currency = obj.currency as Currency;
    const amount = Number(obj.amount);
    const rate = Number(obj.rate);
    const received = obj.received === true;
    const ratioRaw = Number(obj.ratio);
    const ratio = Number.isFinite(ratioRaw) && ratioRaw > 0 ? ratioRaw : undefined;
    if (!/^\d{4}-\d{2}$/.test(month)) return { plan: [], error: '收款月份格式应为 YYYY-MM' };
    if (!VALID_CURRENCIES.includes(currency)) return { plan: [], error: '币种仅支持 CNY / USD / EUR' };
    if (!Number.isFinite(amount) || amount < 0) return { plan: [], error: '收款金额必须是非负数字' };
    if (!Number.isFinite(rate) || rate <= 0) return { plan: [], error: '汇率必须大于 0' };
    if (ratio !== undefined && (ratio <= 0 || ratio > 1)) return { plan: [], error: '收款比例必须在 0%~100% 之间' };
    const amountCNY = currency === 'CNY' ? Math.round(amount * 100) / 100 : Math.round(amount * rate * 100) / 100;
    plan.push({ month, currency, amount: Math.round(amount * 100) / 100, rate, amountCNY, received, ratio, note: typeof obj.note === 'string' ? obj.note.trim() : '' });
  }
  // 比例和校验：若任意笔含 ratio，则和必须 = 100%
  if (plan.length > 0 && plan.some((p) => p.ratio !== undefined)) {
    const sum = plan.reduce((s, p) => s + (p.ratio ?? 0), 0);
    if (Math.abs(sum - 1) > 1e-4) {
      return { plan: [], error: `收款计划比例之和 ${(sum * 100).toFixed(2)}%，必须等于 100%` };
    }
  }
  return { plan };
}

/** GET /api/contracts — 返回所有合同（含主数据） */
contractsRouter.get('/', (_req, res) => {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id, contract_no, customer_name, template_id, sales_currency, sales_amount_orig, sales_rate,
              sales_fees_json, payment_plan_json, position_persons_json, total_plan_count, note, created_at, updated_at
       FROM contracts ORDER BY updated_at DESC`
    )
    .all() as Array<Record<string, unknown>>;
  const list = rows.map((r) => ({
    id: r.id,
    contractNo: r.contract_no,
    customerName: r.customer_name,
    templateId: r.template_id,
    salesCurrency: r.sales_currency,
    salesAmountOrig: r.sales_amount_orig,
    salesRate: r.sales_rate,
    salesFees: JSON.parse(r.sales_fees_json as string) || [],
    paymentPlan: JSON.parse(r.payment_plan_json as string) || [],
    positionPersons: JSON.parse(r.position_persons_json as string) || {},
    totalPlanCount: r.total_plan_count,
    note: r.note,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
  res.json({ data: list });
});

/** GET /api/contracts/:contractNo — 返回单个合同 */
contractsRouter.get('/:contractNo', (req, res) => {
  const no = decodeURIComponent(req.params.contractNo).trim();
  const db = getDb();
  const row = db
    .prepare(
      `SELECT id, contract_no, customer_name, template_id, sales_currency, sales_amount_orig, sales_rate,
              sales_fees_json, payment_plan_json, position_persons_json, total_plan_count, note, created_at, updated_at
       FROM contracts WHERE contract_no = ?`
    )
    .get(no) as Record<string, unknown> | undefined;
  if (!row) {
    res.json({ data: null });
    return;
  }
  res.json({
    data: {
      id: row.id,
      contractNo: row.contract_no,
      customerName: row.customer_name,
      templateId: row.template_id,
      salesCurrency: row.sales_currency,
      salesAmountOrig: row.sales_amount_orig,
      salesRate: row.sales_rate,
      salesFees: JSON.parse(row.sales_fees_json as string) || [],
      paymentPlan: JSON.parse(row.payment_plan_json as string) || [],
      positionPersons: JSON.parse(row.position_persons_json as string) || {},
      totalPlanCount: row.total_plan_count,
      note: row.note,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    },
  });
});

/** PUT /api/contracts — 录入或更新合同（按 contract_no 主键） */
contractsRouter.put('/', (req, res) => {
  const contractNo = typeof req.body?.contractNo === 'string' ? req.body.contractNo.trim() : '';
  const customerName = typeof req.body?.customerName === 'string' ? req.body.customerName.trim() : '';
  if (!contractNo) {
    res.status(400).json({ error: '合同号不能为空' });
    return;
  }
  if (!customerName) {
    res.status(400).json({ error: '销售姓名不能为空' });
    return;
  }
  const templateId = typeof req.body?.templateId === 'string' ? req.body.templateId : '';
  const salesCurrency = (req.body?.salesCurrency as Currency) || 'USD';
  if (!VALID_CURRENCIES.includes(salesCurrency)) {
    res.status(400).json({ error: '业绩币种仅支持 CNY / USD / EUR' });
    return;
  }
  const salesAmountOrig = Number(req.body?.salesAmountOrig);
  const salesRate = Number(req.body?.salesRate);
  if (!Number.isFinite(salesAmountOrig) || salesAmountOrig < 0) {
    res.status(400).json({ error: '业绩金额必须为非负数字' });
    return;
  }
  if (salesCurrency !== 'CNY' && (!Number.isFinite(salesRate) || salesRate <= 0)) {
    res.status(400).json({ error: '非人民币业绩需提供有效汇率（> 0）' });
    return;
  }
  const rate = salesCurrency === 'CNY' ? 1 : salesRate;

  const { fees, total: feesTotal, error: feesErr } = sanitizeFees(req.body?.salesFees);
  if (feesErr) {
    res.status(400).json({ error: feesErr });
    return;
  }
  const { plan, error: planErr } = sanitizePlan(req.body?.paymentPlan);
  if (planErr) {
    res.status(400).json({ error: planErr });
    return;
  }
  const totalPlanCount = Math.max(1, plan.length);

  const positionPersons: Record<string, string> = {};
  if (req.body?.positionPersons && typeof req.body.positionPersons === 'object') {
    for (const [pos, name] of Object.entries(req.body.positionPersons as Record<string, unknown>)) {
      const n = typeof name === 'string' ? name.trim() : '';
      // 过滤空串与前端清除 Select 产生的字符串 'null'
      if (pos && n && n !== 'null') positionPersons[pos] = n;
    }
  }
  const note = typeof req.body?.note === 'string' ? req.body.note.trim() : '';

  // 业绩人民币（仅校验不存）
  const salesAmountCNY = Math.round(salesAmountOrig * rate * 100) / 100;
  if (feesTotal > salesAmountCNY + 0.01) {
    res.status(400).json({ error: `费用合计（¥ ${feesTotal.toFixed(2)}）不能大于销售业绩（¥ ${salesAmountCNY.toFixed(2)}）` });
    return;
  }

  const db = getDb();
  // 合同号唯一性：新建（未传 originalContractNo）时合同号必须不存在；修改时目标合同号也不得与其它合同冲突
  const originalContractNo = typeof req.body?.originalContractNo === 'string' ? req.body.originalContractNo.trim() : '';
  const dup = db.prepare('SELECT id FROM contracts WHERE contract_no = ?').get(contractNo) as { id: number } | undefined;
  if (dup) {
    if (!originalContractNo) {
      res.status(409).json({ error: `合同号「${contractNo}」已存在，禁止新建（合同号必须唯一）` });
      return;
    }
    if (originalContractNo !== contractNo) {
      res.status(409).json({ error: `合同号「${contractNo}」已存在，禁止修改为该合同号（合同号必须唯一）` });
      return;
    }
  }

  // upsert：contract_no UNIQUE（此处已通过唯一性校验，仅用于同合同号覆盖更新 = 修改自身）
  db.prepare(
    `INSERT INTO contracts
      (contract_no, customer_name, template_id, sales_currency, sales_amount_orig, sales_rate,
       sales_fees_json, payment_plan_json, position_persons_json, total_plan_count, note, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now','localtime'))
     ON CONFLICT(contract_no) DO UPDATE SET
       customer_name = excluded.customer_name,
       template_id = excluded.template_id,
       sales_currency = excluded.sales_currency,
       sales_amount_orig = excluded.sales_amount_orig,
       sales_rate = excluded.sales_rate,
       sales_fees_json = excluded.sales_fees_json,
       payment_plan_json = excluded.payment_plan_json,
       position_persons_json = excluded.position_persons_json,
       total_plan_count = excluded.total_plan_count,
       note = excluded.note,
       updated_at = datetime('now','localtime')`
  ).run(
    contractNo,
    customerName,
    templateId,
    salesCurrency,
    salesAmountOrig,
    rate,
    JSON.stringify(fees),
    JSON.stringify(plan),
    JSON.stringify(positionPersons),
    totalPlanCount,
    note
  );

  const row = db.prepare(`SELECT id, contract_no, customer_name, template_id, sales_currency, sales_amount_orig, sales_rate,
              sales_fees_json, payment_plan_json, position_persons_json, total_plan_count, note, created_at, updated_at
       FROM contracts WHERE contract_no = ?`).get(contractNo) as Record<string, unknown>;
  res.json({
    data: {
      id: row.id,
      contractNo: row.contract_no,
      customerName: row.customer_name,
      templateId: row.template_id,
      salesCurrency: row.sales_currency,
      salesAmountOrig: row.sales_amount_orig,
      salesRate: row.sales_rate,
      salesFees: JSON.parse(row.sales_fees_json as string) || [],
      paymentPlan: JSON.parse(row.payment_plan_json as string) || [],
      positionPersons: JSON.parse(row.position_persons_json as string) || {},
      totalPlanCount: row.total_plan_count,
      note: row.note,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    },
  });
});

/** DELETE /api/contracts/:contractNo */
contractsRouter.delete('/:contractNo', (req, res) => {
  const no = decodeURIComponent(req.params.contractNo).trim();
  const db = getDb();
  const info = db.prepare('DELETE FROM contracts WHERE contract_no = ?').run(no);
  if (info.changes === 0) {
    res.status(404).json({ error: '合同不存在' });
    return;
  }
  // 级联删除该合同的收款历史（避免孤儿记录残留统计/明细）
  db.prepare('DELETE FROM calculation_history WHERE contract_no = ?').run(no);
  // 数据变更 → 触发云端备份
  scheduleBackup();
  res.status(204).end();
});
