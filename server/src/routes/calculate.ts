import { Router } from 'express';
import { readSettings, getTemplate } from '../db/seed.js';
import { getDb } from '../db/database.js';
import { calculateCommission } from '../services/calculator.js';
import { scheduleBackup } from '../services/backup.js';
import type { PaymentPlanItem, Currency, SalesFee } from '../types.js';

export const calculateRouter = Router();

const VALID_CURRENCIES: Currency[] = ['CNY', 'USD', 'EUR'];
const MAX_PLAN_ITEMS = 4;

/** 规范化单笔收款（新模型：一笔收款一条记录） */
function sanitizePayment(raw: unknown): { payment?: PaymentPlanItem; error?: string } {
  if (raw === undefined || raw === null) return {};
  const obj = raw as Record<string, unknown>;
  const month = typeof obj.month === 'string' ? obj.month.trim() : '';
  const currency = obj.currency as Currency;
  const amount = Number(obj.amount);
  const rate = Number(obj.rate);
  const received = obj.received === true;
  const ratioRaw = Number(obj.ratio);
  const ratio = Number.isFinite(ratioRaw) && ratioRaw > 0 ? ratioRaw : undefined;

  if (!/^\d{4}-\d{2}$/.test(month)) {
    return { error: '收款月份格式应为 YYYY-MM，如 2026-08' };
  }
  if (!VALID_CURRENCIES.includes(currency)) {
    return { error: '币种仅支持 CNY / USD / EUR' };
  }
  if (!Number.isFinite(amount) || amount < 0) {
    return { error: '收款金额必须是非负数字' };
  }
  if (!Number.isFinite(rate) || rate <= 0) {
    return { error: '汇率必须大于 0' };
  }
  if (ratio === undefined || ratio <= 0 || ratio > 1) {
    return { error: '收款比例必须在 0%~100% 之间' };
  }

  const amountCNY = currency === 'CNY' ? Math.round(amount * 100) / 100 : Math.round(amount * rate * 100) / 100;
  return {
    payment: {
      month,
      currency,
      amount: Math.round(amount * 100) / 100,
      rate,
      amountCNY,
      received,
      ratio,
      note: typeof obj.note === 'string' ? obj.note.trim() : '',
    },
  };
}

/** 规范化收款计划（旧模型兼容：数组，一次一合同） */
function sanitizePlan(raw: unknown): { plan: PaymentPlanItem[]; error?: string } {
  if (raw === undefined || raw === null) return { plan: [] };
  if (!Array.isArray(raw)) return { plan: [], error: 'paymentPlan 必须是数组' };
  if (raw.length > MAX_PLAN_ITEMS) {
    return { plan: [], error: `收款计划最多 ${MAX_PLAN_ITEMS} 笔` };
  }
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
    if (!/^\d{4}-\d{2}$/.test(month)) return { plan: [], error: '收款月份格式应为 YYYY-MM，如 2026-08' };
    if (!VALID_CURRENCIES.includes(currency)) return { plan: [], error: '币种仅支持 CNY / USD / EUR' };
    if (!Number.isFinite(amount) || amount < 0) return { plan: [], error: '收款金额必须是非负数字' };
    if (!Number.isFinite(rate) || rate <= 0) return { plan: [], error: '汇率必须大于 0' };
    if (ratio !== undefined && (ratio <= 0 || ratio > 1)) return { plan: [], error: '收款比例必须在 0%~100% 之间' };
    const amountCNY = currency === 'CNY' ? Math.round(amount * 100) / 100 : Math.round(amount * rate * 100) / 100;
    plan.push({ month, currency, amount: Math.round(amount * 100) / 100, rate, amountCNY, received, ratio });
  }
  if (plan.length > 0 && plan.some((p) => p.ratio !== undefined)) {
    const sum = plan.reduce((s, p) => s + (p.ratio ?? 0), 0);
    if (Math.abs(sum - 1) > 1e-4) {
      return {
        plan: [],
        error: `收款比例之和为 ${(sum * 100).toFixed(2)}%，必须等于 100% 才能计算（当前${sum > 1 ? '超出' : '不足'}）`,
      };
    }
  }
  return { plan };
}

/** 规范化销售费用（多笔叠加） */
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
    fees.push({ currency, amount: Math.round(amount * 100) / 100, rate, amountCNY, note: typeof obj.note === 'string' ? obj.note : '' });
    total += amountCNY;
  }
  return { fees, total: Math.round(total * 100) / 100 };
}

/**
 * POST /api/calculate
 * 新模型请求体（一笔收款一条记录）：
 * { customerName, contractNo, salesAmount(原币), salesCurrency, salesRate,
 *   salesFees[], payment(单笔), planIndex, totalPlanCount, positionPersons, templateId }
 * 旧模型兼容：{ salesAmount(人民币), salesCost, paymentPlan[] }
 *
 * 计算：合同总提成 = (业绩人民币 − 费用合计) × 总比例；
 * 这笔提成 = 合同总提成 × 该笔比例。
 */
calculateRouter.post('/', (req, res) => {
  const contractNo = typeof req.body?.contractNo === 'string' ? req.body.contractNo.trim() : '';
  const customerName = typeof req.body?.customerName === 'string' ? req.body.customerName.trim() : '';

  // ---- 销售业绩（原币 + 币种 + 汇率 → 人民币）----
  const salesCurrency = (req.body?.salesCurrency as Currency) || 'USD';
  if (!VALID_CURRENCIES.includes(salesCurrency)) {
    res.status(400).json({ error: '业绩币种仅支持 CNY / USD / EUR' });
    return;
  }
  const salesAmountOrig = Number(req.body?.salesAmount);
  const salesRate = Number(req.body?.salesRate);
  const isNewModel = req.body?.payment !== undefined || req.body?.salesFees !== undefined;
  let salesAmount: number; // 人民币业绩
  if (salesCurrency === 'CNY') {
    salesAmount = Number.isFinite(salesAmountOrig) ? Math.round(salesAmountOrig * 100) / 100 : NaN;
  } else {
    if (!Number.isFinite(salesAmountOrig) || !Number.isFinite(salesRate) || salesRate <= 0) {
      res.status(400).json({ error: '业绩金额与汇率必须为有效数字（汇率 > 0）' });
      return;
    }
    salesAmount = Math.round(salesAmountOrig * salesRate * 100) / 100;
  }

  // ---- 销售费用（多笔叠加；兼容旧 salesCost）----
  const { fees, total: feesTotal, error: feesErr } = sanitizeFees(req.body?.salesFees);
  if (feesErr) {
    res.status(400).json({ error: feesErr });
    return;
  }
  const salesCost = fees.length > 0 ? feesTotal : Math.round((Number(req.body?.salesCost) || 0) * 100) / 100;
  if (!Number.isFinite(salesAmount) || salesAmount < 0) {
    res.status(400).json({ error: '销售业绩必须是有效数字' });
    return;
  }
  if (!Number.isFinite(salesCost) || salesCost < 0) {
    res.status(400).json({ error: '销售费用必须是有效数字' });
    return;
  }

  // ---- 岗位人员分配 ----
  const positionPersons: Record<string, string> = {};
  if (req.body?.positionPersons && typeof req.body.positionPersons === 'object') {
    for (const [pos, name] of Object.entries(req.body.positionPersons as Record<string, unknown>)) {
      const n = typeof name === 'string' ? name.trim() : '';
      // 过滤空串与前端清除 Select 产生的字符串 'null'
      if (pos && n && n !== 'null') positionPersons[pos] = n;
    }
  }

  // ---- 收款：新模型单笔 / 旧模型数组 ----
  let plan: PaymentPlanItem[] = [];
  let planIndex = 1;
  let totalPlanCount = 1;
  let commissionRatio = 1;

  if (req.body?.payment !== undefined) {
    const { payment, error: payErr } = sanitizePayment(req.body.payment);
    if (payErr) {
      res.status(400).json({ error: payErr });
      return;
    }
    if (!payment) {
      res.status(400).json({ error: '缺少这笔收款信息' });
      return;
    }
    plan = [payment];
    planIndex = Math.max(1, Number(req.body?.planIndex) || 1);
    totalPlanCount = Math.max(planIndex, Number(req.body?.totalPlanCount) || planIndex);
    commissionRatio = payment.ratio ?? 1;
    const thisRatio = payment.ratio ?? 1;
    // 追加收款（planIndex 超出合同计划笔数）不参与比例合计校验
    const db = getDb();
    let planCount = Infinity;
    try {
      const cr = db
        .prepare(`SELECT payment_plan_json FROM contracts WHERE contract_no = ?`)
        .get(contractNo) as { payment_plan_json: string } | undefined;
      if (cr?.payment_plan_json) {
        const plans = JSON.parse(cr.payment_plan_json) as unknown[];
        planCount = Array.isArray(plans) ? plans.length : Infinity;
      }
    } catch {
      // 合同不存在/解析失败：不阻断（交给后续校验）
    }
    // 校验该合同已有比例之和 + 这笔 ≤ 100%（仅计划内笔次；追加笔不受限）
    const rows = db
      .prepare(`SELECT result_json, payment_plan_json FROM calculation_history WHERE contract_no = ? AND customer_name = ?`)
      .all(contractNo, customerName) as Array<{ result_json: string; payment_plan_json: string }>;
    let savedRatio = 0;
    for (const r of rows) {
      try {
        const resJson = JSON.parse(r.result_json) as { planIndex?: number };
        // 排除当前这笔（同一 planIndex 重复提交时覆盖）
        if (resJson.planIndex === planIndex) continue;
      } catch {
        // 忽略
      }
      try {
        const plan = JSON.parse(r.payment_plan_json) as PaymentPlanItem[];
        savedRatio += plan[0]?.ratio ?? 0;
      } catch {
        // 忽略
      }
    }
    if (planIndex <= planCount && savedRatio + thisRatio > 1 + 1e-4) {
      res.status(400).json({
        error: `该合同已保存收款比例 ${(savedRatio * 100).toFixed(1)}%，加上这笔 ${(thisRatio * 100).toFixed(1)}% 超出 100%`,
      });
      return;
    }
  } else {
    // 旧模型：数组整体
    const { plan: p, error } = sanitizePlan(req.body?.paymentPlan);
    if (error) {
      res.status(400).json({ error });
      return;
    }
    plan = p;
    planIndex = 1;
    totalPlanCount = Math.max(1, plan.length);
    commissionRatio = 1;
  }

  // 校验收款金额（这笔/合计）不能大于业绩人民币
  const planCNY = plan.reduce((s, p) => s + (p.amountCNY || 0), 0);
  if (planCNY > salesAmount + 0.01) {
    res.status(400).json({
      error: `收款金额（¥ ${planCNY.toFixed(2)}）不能大于总金额（¥ ${salesAmount.toFixed(2)}），请检查收款计划`,
    });
    return;
  }

  // ---- 计算 ----
  const settings = readSettings();
  const template = getTemplate(settings, req.body?.templateId);
  const result = calculateCommission({ salesAmount, salesCost }, template);
  result.positionPersons = positionPersons;
  result.salesAmountOrig = Math.round(salesAmountOrig * 100) / 100;
  result.salesCurrency = salesCurrency;
  result.salesRate = salesCurrency === 'CNY' ? 1 : salesRate;
  result.salesFees = fees;
  result.planIndex = planIndex;
  result.totalPlanCount = totalPlanCount;
  result.commission = Math.round(result.totalCommission * commissionRatio * 100) / 100;

  // ---- 入库（同合同同笔次 = 覆盖更新，先删旧记录再插入）----
  const db = getDb();
  // 已收冻结：单笔一旦保存不可修改（保护计算历史完整性）。修改需先在历史页删除原记录再重新录入。
  const existingRow = db
    .prepare(`SELECT id, commission FROM calculation_history
              WHERE contract_no = ? AND customer_name = ? AND plan_index = ?`)
    .get(contractNo, customerName, planIndex) as { id: number; commission: number } | undefined;
  if (existingRow) {
    res.status(422).json({
      error: `该合同第 ${planIndex} 笔已收款（提成 ¥ ${(existingRow.commission ?? 0).toFixed(2)}），禁止修改。请到历史页删除原记录后重新录入`,
    });
    return;
  }

  // 一致性强校验：这笔收款必须与合同收款计划（对应笔次）一致（月份/币种/金额/比例；汇率可单独调整）
  const contractRow = db
    .prepare(`SELECT payment_plan_json FROM contracts WHERE contract_no = ?`)
    .get(contractNo) as { payment_plan_json: string } | undefined;
  if (contractRow?.payment_plan_json) {
    const plans = JSON.parse(contractRow.payment_plan_json) as Array<{ month?: string; currency?: string; amount?: number; rate?: number; ratio?: number }>;
    const plan = plans[planIndex - 1];
    const pay = req.body?.payment;
    if (plan && pay) {
      const same =
        String(pay.month ?? '') === String(plan.month ?? '') &&
        String(pay.currency ?? '') === String(plan.currency ?? '') &&
        Math.abs(Number(pay.amount) - Number(plan.amount ?? 0)) < 0.01 &&
        Math.abs(Number(pay.ratio ?? 0) - Number(plan.ratio ?? 0)) < 0.0001;
      if (!same) {
        res.status(422).json({
          error: `这笔收款必须与第 ${planIndex} 笔收款计划一致才能保存（计划：${plan.month} ${plan.currency} ${plan.amount}，比例 ${((plan.ratio ?? 0) * 100).toFixed(1)}%；汇率可单独调整）`,
        });
        return;
      }
    }
  }

  db.prepare(
    `DELETE FROM calculation_history WHERE contract_no = ? AND customer_name = ? AND plan_index = ?`
  ).run(contractNo, customerName, planIndex);
  db.prepare(
    `INSERT INTO calculation_history
      (contract_no, customer_name, payment_plan_json, position_persons_json,
       plan_index, total_plan_count, contract_total_commission, commission,
       sales_amount, sales_cost, base_amount, total_commission, settings_snapshot, result_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    contractNo,
    customerName,
    JSON.stringify(plan),
    JSON.stringify(positionPersons),
    planIndex,
    totalPlanCount,
    result.totalCommission,
    result.commission,
    result.salesAmount,
    result.salesCost,
    result.baseAmount,
    result.totalCommission,
    JSON.stringify(result.settingsSnapshot),
    JSON.stringify(result)
  );

  // ---- 该合同累计收款比例（所有已保存笔的 ratio 之和；覆盖更新后每笔一条）----
  const paidRows = db
    .prepare(`SELECT payment_plan_json FROM calculation_history WHERE contract_no = ? AND customer_name = ?`)
    .all(contractNo, customerName) as Array<{ payment_plan_json: string }>;
  let contractPaidRatio = 0;
  for (const r of paidRows) {
    try {
      const p = JSON.parse(r.payment_plan_json) as PaymentPlanItem[];
      contractPaidRatio += p[0]?.ratio ?? 1;
    } catch {
      contractPaidRatio += 1;
    }
  }
  contractPaidRatio = Math.round(contractPaidRatio * 10000) / 10000;
  result.contractPaidRatio = contractPaidRatio;
  result.contractPaidFull = contractPaidRatio >= 0.9999;

  // 数据变更 → 触发云端备份
  scheduleBackup();

  res.json({ data: result });
});
