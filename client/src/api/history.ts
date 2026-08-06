import { http } from './http';
import { isBackendAvailable } from './probe';
import type { HistoryPage, ContractLookup } from '../types';
import { loadLocalHistory, removeLocalHistory } from '../utils/localStore';

export async function getHistory(page = 1, pageSize = 10000): Promise<HistoryPage> {
  if (await isBackendAvailable()) {
    try {
      const res = await http.get<{ data: HistoryPage }>(`/history?page=${page}&pageSize=${pageSize}`);
      return res.data;
    } catch {
      // 后端异常时回退本地
    }
  }
  const list = loadLocalHistory();
  const start = (page - 1) * pageSize;
  return {
    list: list.slice(start, start + pageSize),
    total: list.length,
    page,
    pageSize,
  };
}

export async function deleteHistory(id: number): Promise<void> {
  if (await isBackendAvailable()) {
    try {
      await http.delete<void>(`/history/${id}`);
      return;
    } catch {
      // 后端异常时回退本地
    }
  }
  removeLocalHistory(id);
}

/** 按销售姓名返回该销售的所有合同号（供合同号下拉，自动根据姓名调出该销售所有合同） */
export async function getContractOptions(customerName: string): Promise<string[]> {
  if (await isBackendAvailable()) {
    try {
      const res = await http.get<{ data: string[] }>(
        `/history/contracts?customerName=${encodeURIComponent(customerName)}`
      );
      return res.data;
    } catch {
      // 后端异常时回退本地
    }
  }
  // 本地兜底
  const list = loadLocalHistory().filter((r) => r.customerName === customerName);
  return [...new Set(list.map((r) => r.contractNo).filter(Boolean))].sort();
}

/** 按合同号查询最新记录（自动带出姓名、合同级信息与已录笔数） */
export async function lookupContract(contractNo: string): Promise<ContractLookup | null> {
  if (await isBackendAvailable()) {
    try {
      const res = await http.get<{ data: ContractLookup | null }>(
        `/history/contract?contractNo=${encodeURIComponent(contractNo)}`
      );
      return res.data;
    } catch {
      // 后端异常时回退本地
    }
  }
  // 本地兜底：在 localStorage 历史中查找
  const list = loadLocalHistory();
  const found = list.find((r) => r.contractNo === contractNo);
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
