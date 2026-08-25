import { Router } from 'express';
import { getDb } from '../db/database.js';
import { scheduleBackup } from '../services/backup.js';
import { readSettings, getTemplate } from '../db/seed.js';
import { calculateCommission } from '../services/calculator.js';
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

/** 合同行 → 前端对象 */
function mapContractRow(r: Record<string, unknown>) {
  return {
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
  };
}

/** 合同修改后重算该合同已保存的历史记录（明细/统计随合同主数据同步：金额、比例、提成、岗位分配等） */
export function recomputeContractHistory(
  db: ReturnType<typeof getDb>,
  c: {
    contractNo: string;
    customerName: string;
    templateId: string;
    salesCurrency: Currency;
    salesAmountOrig: number;
    rate: number;
    fees: SalesFee[];
    positionPersons: Record<string, string>;
    plan: PaymentPlanItem[];
    totalPlanCount: number;
  }
): void {
  const salesAmount = Math.round(c.salesAmountOrig * c.rate * 100) / 100;
  const salesCost = Math.round(c.fees.reduce((s, f) => s + (f.amountCNY || 0), 0) * 100) / 100;
  const settings = readSettings();
  const template = getTemplate(settings, c.templateId);
  const rows = db
    .prepare(
      `SELECT id, payment_plan_json, plan_index, total_plan_count FROM calculation_history WHERE contract_no = ?`
    )
    .all(c.contractNo) as Array<{
    id: number;
    payment_plan_json: string;
    plan_index: number;
    total_plan_count: number;
  }>;
  const upd = db.prepare(
    `UPDATE calculation_history SET
       customer_name = ?, payment_plan_json = ?, position_persons_json = ?, plan_index = ?, total_plan_count = ?,
       contract_total_commission = ?, commission = ?, sales_amount = ?, sales_cost = ?, base_amount = ?, total_commission = ?,
       settings_snapshot = ?, result_json = ?
     WHERE id = ?`
  );
  for (const r of rows) {
    // 原记录信息（保留已收状态与备注）
    let origReceived = true;
    let origNote = '';
    try {
      const orig = JSON.parse(r.payment_plan_json) as PaymentPlanItem[];
      origReceived = orig[0]?.received === true;
      origNote = orig[0]?.note ?? '';
    } catch {
      // 忽略
    }
    // 计划内笔次：收款记录同步为新计划的对应笔（金额/比例/人民币）；追加笔（超出计划）保持原记录
    let payment: PaymentPlanItem;
    let ratio = 1;
    const planItem = c.plan[r.plan_index - 1];
    if (planItem) {
      payment = {
        month: planItem.month,
        currency: planItem.currency,
        amount: Math.round((planItem.amount ?? 0) * 100) / 100,
        rate: planItem.rate ?? (c.salesCurrency === 'CNY' ? 1 : c.rate),
        amountCNY: planItem.amountCNY ?? 0,
        received: origReceived,
        ratio: planItem.ratio,
        note: origNote || (planItem.note ?? ''),
      };
      ratio = planItem.ratio ?? 1;
    } else {
      try {
        const orig = JSON.parse(r.payment_plan_json) as PaymentPlanItem[];
        payment = orig[0] ?? { month: '', currency: c.salesCurrency, amount: 0, rate: c.rate, amountCNY: 0, received: true };
        ratio = orig[0]?.ratio ?? 1;
      } catch {
        payment = { month: '', currency: c.salesCurrency, amount: 0, rate: c.rate, amountCNY: 0, received: true };
      }
    }
    const totalPlanCount = Math.max(r.plan_index, c.totalPlanCount);
    const result = calculateCommission({ salesAmount, salesCost }, template);
    result.positionPersons = c.positionPersons;
    result.salesAmountOrig = Math.round(c.salesAmountOrig * 100) / 100;
    result.salesCurrency = c.salesCurrency;
    result.salesRate = c.salesCurrency === 'CNY' ? 1 : c.rate;
    result.salesFees = c.fees;
    result.planIndex = r.plan_index;
    result.totalPlanCount = totalPlanCount;
    result.commission = Math.round(result.totalCommission * ratio * 100) / 100;
    upd.run(
      c.customerName,
      JSON.stringify([payment]),
      JSON.stringify(c.positionPersons),
      r.plan_index,
      totalPlanCount,
      result.totalCommission,
      result.commission,
      result.salesAmount,
      result.salesCost,
      result.baseAmount,
      result.totalCommission,
      JSON.stringify(result.settingsSnapshot),
      JSON.stringify(result),
      r.id
    );
  }
}

/** GET /api/contracts?page=&pageSize=&search= — 分页+搜索；无分页参数时返回全量（向后兼容） */
contractsRouter.get('/', (req, res) => {
  const db = getDb();
  const pageRaw = Number(req.query.page);
  const pageSizeRaw = Number(req.query.pageSize);
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const paginated = Number.isInteger(pageRaw) && pageRaw > 0 && Number.isInteger(pageSizeRaw) && pageSizeRaw > 0;

  const where = search ? ' WHERE contract_no LIKE ? OR customer_name LIKE ?' : '';
  const params: unknown[] = search ? [`%${search}%`, `%${search}%`] : [];

  if (paginated) {
    const total = (db.prepare(`SELECT COUNT(*) AS c FROM contracts${where}`).get(...params) as { c: number }).c;
    const rows = db
      .prepare(
        `SELECT id, contract_no, customer_name, template_id, sales_currency, sales_amount_orig, sales_rate,
                sales_fees_json, payment_plan_json, position_persons_json, total_plan_count, note, created_at, updated_at
         FROM contracts${where} ORDER BY updated_at DESC LIMIT ? OFFSET ?`
      )
      .all(...params, pageSizeRaw, (pageRaw - 1) * pageSizeRaw) as Array<Record<string, unknown>>;
    res.json({ data: { list: rows.map(mapContractRow), total } });
    return;
  }

  const rows = db
    .prepare(
      `SELECT id, contract_no, customer_name, template_id, sales_currency, sales_amount_orig, sales_rate,
              sales_fees_json, payment_plan_json, position_persons_json, total_plan_count, note, created_at, updated_at
       FROM contracts${where} ORDER BY updated_at DESC`
    )
    .all(...params) as Array<Record<string, unknown>>;
  res.json({ data: rows.map(mapContractRow) });
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
  // 合同号唯一性：新建（未传 originalContractNo）时合同号必须不存在；修改（改名）时目标合同号不得与其它合同冲突
  const originalContractNo = typeof req.body?.originalContractNo === 'string' ? req.body.originalContractNo.trim() : '';

  if (originalContractNo) {
    // ---- 修改模式 ----
    const oldRow = db
      .prepare('SELECT id FROM contracts WHERE contract_no = ?')
      .get(originalContractNo) as { id: number } | undefined;
    if (!oldRow) {
      res.status(404).json({ error: `原合同「${originalContractNo}」不存在` });
      return;
    }
    const dup = db
      .prepare('SELECT id FROM contracts WHERE contract_no = ?')
      .get(contractNo) as { id: number } | undefined;
    if (dup && dup.id !== oldRow.id) {
      res.status(409).json({ error: `合同号「${contractNo}」已存在，禁止修改为该合同号（合同号必须唯一）` });
      return;
    }
    // 合同号改名：同步历史记录 / 平台快照中的 contract_no，避免关联信息挂在旧合同号上
    const rename = contractNo !== originalContractNo;
    const tx = db.transaction(() => {
      if (rename) {
        db.prepare('UPDATE contracts SET contract_no = ? WHERE contract_no = ?').run(contractNo, originalContractNo);
        db.prepare('UPDATE calculation_history SET contract_no = ? WHERE contract_no = ?').run(contractNo, originalContractNo);
        db.prepare('UPDATE platform_contract_snapshots SET contract_no = ? WHERE contract_no = ?').run(contractNo, originalContractNo);
      }
      db.prepare(
        `UPDATE contracts SET
           customer_name = ?, template_id = ?, sales_currency = ?, sales_amount_orig = ?, sales_rate = ?,
           sales_fees_json = ?, payment_plan_json = ?, position_persons_json = ?, total_plan_count = ?, note = ?,
           updated_at = datetime('now','localtime')
         WHERE contract_no = ?`
      ).run(
        customerName,
        templateId,
        salesCurrency,
        salesAmountOrig,
        rate,
        JSON.stringify(fees),
        JSON.stringify(plan),
        JSON.stringify(positionPersons),
        totalPlanCount,
        note,
        contractNo
      );
      // 合同修改后：重算该合同已保存的历史记录（提成明细/统计随合同主数据同步）
      recomputeContractHistory(db, {
        contractNo,
        customerName,
        templateId,
        salesCurrency,
        salesAmountOrig,
        rate,
        fees,
        positionPersons,
        plan,
        totalPlanCount,
      });
    });
    tx();
    scheduleBackup();
  } else {
    // ---- 新建模式：合同号不得已存在 ----
    const dup = db.prepare('SELECT id FROM contracts WHERE contract_no = ?').get(contractNo);
    if (dup) {
      res.status(409).json({ error: `合同号「${contractNo}」已存在，禁止新建（合同号必须唯一）` });
      return;
    }
    db.prepare(
      `INSERT INTO contracts
        (contract_no, customer_name, template_id, sales_currency, sales_amount_orig, sales_rate,
         sales_fees_json, payment_plan_json, position_persons_json, total_plan_count, note, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now','localtime'))`
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
  }

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
