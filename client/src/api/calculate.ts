import { http } from './http';
import { isBackendAvailable } from './probe';
import type { CalculationResult, CalculateRequest } from '../types';
import { calculateCommission, defaultSettings, getTemplate } from '../utils/calcCore';
import { loadLocalSettings, addLocalHistory } from '../utils/localStore';

export async function runCalculation(req: CalculateRequest): Promise<CalculationResult> {
  if (await isBackendAvailable()) {
    // 后端可用时直接请求；失败（如 409/422 拒绝、网络异常）直接抛出交由页面展示，
    // 不再静默回退本地计算——否则后端已拒绝但前端仍显示「保存成功」，产生双份数据源。
    const res = await http.post<{ data: CalculationResult }>('/calculate', req);
    return res.data;
  }
  // 前端兜底：用本地配置（按 templateId 选模板）计算并写入本地历史
  const settings = loadLocalSettings() ?? defaultSettings();
  const template = getTemplate(settings, req.templateId);
  const salesAmount = req.salesAmount; // 前端已换算人民币
  const salesCost = req.salesFees?.reduce((s, f) => s + (f.amountCNY || 0), 0) ?? req.salesCost ?? 0;
  const result = calculateCommission({ salesAmount, salesCost }, template);
  result.positionPersons = req.positionPersons;
  result.salesAmountOrig = req.salesAmount;
  result.salesCurrency = req.salesCurrency ?? 'USD';
  result.salesRate = req.salesRate ?? 7.2;
  result.salesFees = req.salesFees ?? [];
  result.planIndex = req.planIndex ?? 1;
  result.totalPlanCount = req.totalPlanCount ?? 1;
  result.commission = Math.round(result.totalCommission * (req.payment?.ratio ?? 1) * 100) / 100;
  addLocalHistory(result, {
    contractNo: req.contractNo,
    customerName: req.customerName,
    paymentPlan: req.payment ? [req.payment] : req.paymentPlan ?? [],
    positionPersons: req.positionPersons,
  });
  return result;
}
