import { http } from './http';
import { withFallback } from './withFallback';
import type { CalculationResult, CalculateRequest } from '../types';
import { calculateCommission, defaultSettings, getTemplate } from '../utils/calcCore';
import { loadLocalSettings, addLocalHistory } from '../utils/localStore';

export async function runCalculation(req: CalculateRequest): Promise<CalculationResult> {
  return withFallback(
    async () => (await http.post<{ data: CalculationResult }>('/calculate', req)).data,
    () => {
      // 前端兜底：用本地配置（按 templateId 选模板）计算并写入本地历史
      const settings = loadLocalSettings() ?? defaultSettings();
      const template = getTemplate(settings, req.templateId);
      const pay = req.payment;
      const isPay = pay !== undefined;
      // 新模型（单笔收款）：提成基数 = 实际汇率 × 美元收款金额；旧模型：合同人民币 − 费用
      const salesAmount = isPay
        ? pay.currency === 'CNY'
          ? Math.round((pay.amount ?? 0) * 100) / 100
          : Math.round((pay.amount ?? 0) * (pay.rate ?? 1) * 100) / 100
        : req.salesAmount;
      const salesCost = isPay ? 0 : req.salesFees?.reduce((s, f) => s + (f.amountCNY || 0), 0) ?? req.salesCost ?? 0;
      const result = calculateCommission({ salesAmount, salesCost }, template);
      result.positionPersons = req.positionPersons;
      result.salesAmountOrig = req.salesAmount;
      result.salesCurrency = req.salesCurrency ?? 'USD';
      result.salesRate = req.salesRate ?? 7.2;
      result.salesFees = req.salesFees ?? [];
      result.planIndex = req.planIndex ?? 1;
      result.totalPlanCount = req.totalPlanCount ?? 1;
      result.commission = isPay ? result.totalCommission : Math.round(result.totalCommission * (req.payment?.ratio ?? 1) * 100) / 100;
      addLocalHistory(result, {
        contractNo: req.contractNo,
        customerName: req.customerName,
        paymentPlan: req.payment ? [req.payment] : req.paymentPlan ?? [],
        positionPersons: req.positionPersons,
      });
      return result;
    }
  );
}
