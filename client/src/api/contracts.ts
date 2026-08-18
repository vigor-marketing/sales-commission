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
