import { http } from './http';
import { withFallback } from './withFallback';
import { loadLocalContracts, saveLocalContract, removeLocalContract } from '../utils/localStore';
import type { Contract } from '../types';

export async function getContracts(): Promise<Contract[]> {
  return withFallback(
    async () => (await http.get<{ data: Contract[] }>('/contracts')).data,
    () => loadLocalContracts()
  );
}

export interface ContractsPageResult {
  list: Contract[];
  total: number;
}

/** 分页查询合同（合同管理列表用），支持按合同号/姓名模糊搜索 */
export async function getContractsPage(params: {
  page: number;
  pageSize: number;
  search?: string;
}): Promise<ContractsPageResult> {
  const qs = new URLSearchParams({ page: String(params.page), pageSize: String(params.pageSize) });
  if (params.search?.trim()) qs.set('search', params.search.trim());
  return withFallback(
    async () =>
      (await http.get<{ data: ContractsPageResult }>(`/contracts?${qs.toString()}`)).data,
    () => {
      const all = loadLocalContracts();
      const kw = params.search?.trim() ?? '';
      const filtered = kw
        ? all.filter(
            (c) => (c.contractNo ?? '').includes(kw) || (c.customerName ?? '').includes(kw)
          )
        : all;
      const start = (params.page - 1) * params.pageSize;
      return { list: filtered.slice(start, start + params.pageSize), total: filtered.length };
    }
  );
}

export async function getContract(contractNo: string): Promise<Contract | null> {
  return withFallback(
    async () =>
      (await http.get<{ data: Contract | null }>(`/contracts/${encodeURIComponent(contractNo)}`)).data,
    () => loadLocalContracts().find((c) => c.contractNo === contractNo) ?? null
  );
}

export async function upsertContract(
  contract: Omit<Contract, 'id' | 'createdAt' | 'updatedAt'> & { originalContractNo?: string }
): Promise<Contract> {
  return withFallback(
    async () => (await http.put<{ data: Contract }>('/contracts', contract)).data,
    () => saveLocalContract(contract)
  );
}

export async function deleteContract(contractNo: string): Promise<void> {
  return withFallback(
    () => http.delete<void>(`/contracts/${encodeURIComponent(contractNo)}`),
    () => {
      removeLocalContract(contractNo);
    }
  );
}
