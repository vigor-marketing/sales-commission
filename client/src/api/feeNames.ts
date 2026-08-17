import { http } from './http';
import { isBackendAvailable } from './probe';
import type { FeeName } from '../types';

export async function getFeeNames(): Promise<FeeName[]> {
  if (await isBackendAvailable()) {
    const res = await http.get<{ data: FeeName[] }>('/feeNames');
    return res.data;
  }
  // 兜底默认（与后端 ensureDefaultFeeNames 一致）
  return [
    { id: 1, name: '出差费', sortOrder: 0, createdAt: '' },
    { id: 2, name: '招待费', sortOrder: 1, createdAt: '' },
    { id: 3, name: '交通费', sortOrder: 2, createdAt: '' },
    { id: 4, name: '办公费', sortOrder: 3, createdAt: '' },
    { id: 5, name: '业务费', sortOrder: 4, createdAt: '' },
    { id: 6, name: '其他', sortOrder: 5, createdAt: '' },
  ];
}

export async function createFeeName(name: string): Promise<FeeName | null> {
  if (await isBackendAvailable()) {
    const res = await http.post<{ data: FeeName }>('/feeNames', { name });
    return res.data;
  }
  return null;
}

export async function deleteFeeName(id: number): Promise<void> {
  if (await isBackendAvailable()) {
    await http.delete<void>(`/feeNames/${id}`);
  }
}
