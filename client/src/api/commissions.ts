import { http } from './http';
import { isBackendAvailable } from './probe';
import { loadLocalHistory } from '../utils/localStore';

/** 单条提成明细（一个合同/订单） */
export interface CommissionRow {
  id: number;
  customerName: string;
  month: string;
  contractNo: string;
  templateName: string;
  totalCommission: number;
  createdAt: string;
}

/** 提成统计响应 */
export interface CommissionsData {
  year: string;
  month: string;
  filters: { year: string; month: string; customerName: string };
  list: CommissionRow[];
  summary: {
    total: number;
    count: number;
    byPerson: Record<string, number>;
    byMonth: Record<string, number>;
  };
  /** 按人 × 岗位汇总 */
  personPosition: Array<{
    person: string;
    positions: Record<string, number>;
    total: number;
  }>;
  /** 出现过的所有岗位名 */
  allPositions: string[];
}

export async function getCommissions(filter: {
  year?: string;
  month?: string;
  customerName?: string;
} = {}): Promise<CommissionsData> {
  if (await isBackendAvailable()) {
    const qs = new URLSearchParams();
    if (filter.year) qs.set('year', filter.year);
    if (filter.month) qs.set('month', filter.month);
    if (filter.customerName) qs.set('customerName', filter.customerName);
    const res = await http.get<{ data: CommissionsData }>(`/commissions?${qs.toString()}`);
    return res.data;
  }
  // 本地兜底
  const now = new Date();
  const year = filter.year ?? String(now.getFullYear());
  const list = loadLocalHistory()
    .filter((r) => r.customerName)
    .filter((r) => (r.createdAt ?? '').slice(0, 4) === year || !year)
    .filter((r) => !filter.month || (r.createdAt ?? '').slice(0, 7) === filter.month)
    .filter((r) => !filter.customerName || (r.customerName ?? '').includes(filter.customerName))
    .map((r) => ({
      id: r.id,
      customerName: r.customerName ?? '',
      month: (r.createdAt ?? '').slice(0, 7),
      contractNo: r.contractNo ?? '',
      templateName: (r.settingsSnapshot as { name?: string })?.name ?? '',
      totalCommission: r.totalCommission,
      createdAt: r.createdAt,
    }));
  const byPerson: Record<string, number> = {};
  const byMonth: Record<string, number> = {};
  let total = 0;
  for (const item of list) {
    byPerson[item.customerName] = Math.round(((byPerson[item.customerName] ?? 0) + item.totalCommission) * 100) / 100;
    byMonth[item.month] = Math.round(((byMonth[item.month] ?? 0) + item.totalCommission) * 100) / 100;
    total = Math.round((total + item.totalCommission) * 100) / 100;
  }
  // 本地兜底：按人×岗位汇总（从历史 positionPersons + positionTotals 反推）
  const personPositionMap: Record<string, Record<string, number>> = {};
  const allPositions = new Set<string>();
  for (const r of loadLocalHistory()) {
    const pp = r.positionPersons ?? r.result.positionPersons ?? {};
    const pt = r.result.positionTotals ?? {};
    for (const [pos, amt] of Object.entries(pt)) {
      const person = pp[pos] || '未分配';
      personPositionMap[person] = personPositionMap[person] ?? {};
      personPositionMap[person][pos] = Math.round(((personPositionMap[person][pos] ?? 0) + amt) * 100) / 100;
      allPositions.add(pos);
    }
  }
  const personPosition = Object.entries(personPositionMap)
    .map(([person, positions]) => ({
      person,
      positions,
      total: Math.round(Object.values(positions).reduce((a, b) => a + b, 0) * 100) / 100,
    }))
    .sort((a, b) => b.total - a.total);
  return {
    year,
    month: filter.month ?? '',
    filters: { year, month: filter.month ?? '', customerName: filter.customerName ?? '' },
    list,
    summary: { total, count: list.length, byPerson, byMonth },
    personPosition,
    allPositions: [...allPositions],
  };
}

/**
 * 获取所有可选销售人员（下拉用）：
 * 后端优先从数据库历史记录 + 系统设置名单合并；后端不可用时用本地兜底。
 */
export async function getCommissionPersons(): Promise<string[]> {
  if (await isBackendAvailable()) {
    const res = await http.get<{ data: string[] }>('/commissions/persons');
    return res.data;
  }
  // 本地兜底：localStorage 历史中出现的人员
  const persons = new Set<string>();
  for (const r of loadLocalHistory()) {
    if (r.customerName) persons.add(r.customerName);
  }
  return [...persons].sort((a, b) => a.localeCompare(b, 'zh-CN'));
}
