import { http } from './http';
import { withFallback } from './withFallback';
import type { HistoryPage, ContractLookup } from '../types';
import { loadLocalHistory, removeLocalHistory } from '../utils/localStore';

export async function getHistory(page = 1, pageSize = 10000): Promise<HistoryPage> {
  return withFallback(
    async () => (await http.get<{ data: HistoryPage }>(`/history?page=${page}&pageSize=${pageSize}`)).data,
    () => {
      const list = loadLocalHistory();
      const start = (page - 1) * pageSize;
      return { list: list.slice(start, start + pageSize), total: list.length, page, pageSize };
    }
  );
}

export async function deleteHistory(id: number): Promise<void> {
  return withFallback(
    () => http.delete<void>(`/history/${id}`),
    () => {
      removeLocalHistory(id);
    }
  );
}

/** 按销售姓名返回该销售的所有合同号（供合同号下拉，自动根据姓名调出该销售所有合同） */
export async function getContractOptions(customerName: string): Promise<string[]> {
  return withFallback(
    async () =>
      (await http.get<{ data: string[] }>(`/history/contracts?customerName=${encodeURIComponent(customerName)}`)).data,
    () => {
      const list = loadLocalHistory().filter((r) => r.customerName === customerName);
      return [...new Set(list.map((r) => r.contractNo).filter(Boolean))].sort();
    }
  );
}

/** 按合同号查询最新记录（自动带出姓名、合同级信息与已录笔数） */
export async function lookupContract(contractNo: string): Promise<ContractLookup | null> {
  return withFallback(
    async () =>
      (await http.get<{ data: ContractLookup | null }>(`/history/contract?contractNo=${encodeURIComponent(contractNo)}`)).data,
    () => {
      const found = loadLocalHistory().find((r) => r.contractNo === contractNo);
      if (!found) return null;
      return {
        contractNo: found.contractNo,
        customerName: found.customerName,
        paymentPlan: found.paymentPlan,
        positionPersons: found.positionPersons,
        salesAmount: found.result.salesAmount,
        salesAmountOrig: found.result.salesAmountOrig,
        salesCurrency: found.result.salesCurrency,
        salesRate: found.result.salesRate,
        salesFees: found.result.salesFees,
        salesCost: found.result.salesCost,
        templateName: found.result.settingsSnapshot?.name,
        templateId: found.result.settingsSnapshot?.id,
        lastPlanIndex: found.planIndex,
        totalPlanCount: found.totalPlanCount,
      };
    }
  );
}
