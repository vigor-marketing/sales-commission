import { http } from './http';
import { isBackendAvailable } from './probe';
import { loadLocalContracts, saveLocalContract, removeLocalContract } from '../utils/localStore';
import type { Contract } from '../types';

export async function getContracts(): Promise<Contract[]> {
  if (await isBackendAvailable()) {
    const res = await http.get<{ data: Contract[] }>('/contracts');
    return res.data;
  }
  return loadLocalContracts();
}

export async function getContract(contractNo: string): Promise<Contract | null> {
  if (await isBackendAvailable()) {
    const res = await http.get<{ data: Contract | null }>(
      `/contracts/${encodeURIComponent(contractNo)}`
    );
    return res.data;
  }
  const list = loadLocalContracts();
  return list.find((c) => c.contractNo === contractNo) ?? null;
}

export async function upsertContract(
  contract: Omit<Contract, 'id' | 'createdAt' | 'updatedAt'> & { originalContractNo?: string }
): Promise<Contract> {
  if (await isBackendAvailable()) {
    const res = await http.put<{ data: Contract }>('/contracts', contract);
    return res.data;
  }
  return saveLocalContract(contract);
}

export async function deleteContract(contractNo: string): Promise<void> {
  if (await isBackendAvailable()) {
    await http.delete<void>(`/contracts/${encodeURIComponent(contractNo)}`);
    return;
  }
  removeLocalContract(contractNo);
}
