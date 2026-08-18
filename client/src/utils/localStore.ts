/**
 * 静态部署模式的本地持久化（localStorage）
 * 当后端 API 不可用时，设置与历史记录保存在浏览器本地。
 */

import type { Settings, HistoryRecord, CalculationResult, PaymentPlanItem, Contract } from '../types';

const SETTINGS_KEY = 'sc_settings';
const HISTORY_KEY = 'sc_history';
const CONTRACTS_KEY = 'sc_contracts';

export function loadLocalSettings(): Settings | null {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Settings & {
      // 兼容旧格式（单个模板结构）
      nodes?: unknown;
      positionOrder?: unknown;
      totalRate?: unknown;
      defaultRates?: unknown;
    };
    // 新格式：含 templates
    if (parsed && Array.isArray(parsed.templates) && parsed.templates.length > 0) {
      return {
        templates: parsed.templates,
        staffList: Array.isArray(parsed.staffList) ? parsed.staffList : [],
        personPositions:
          parsed.personPositions && typeof parsed.personPositions === 'object'
            ? (parsed.personPositions as Record<string, string[]>)
            : {},
      };
    }
    // 旧格式迁移：把 nodes/positionOrder 包装成单个模板
    if (parsed && Array.isArray(parsed.nodes) && Array.isArray(parsed.positionOrder)) {
      const tpl = {
        id: 'new-customer',
        name: '新客户提成计算表',
        totalRate: Number(parsed.totalRate) || 0.02,
        nodes: parsed.nodes as Settings['templates'][number]['nodes'],
        positionOrder: parsed.positionOrder as string[],
        defaultRates: (parsed.defaultRates as Record<string, number>) ?? { CNY: 1, USD: 7.2, EUR: 7.8 },
      };
      return {
        templates: [tpl],
        staffList: Array.isArray(parsed.staffList) ? parsed.staffList : [],
        personPositions:
          parsed.personPositions && typeof parsed.personPositions === 'object'
            ? (parsed.personPositions as Record<string, string[]>)
            : {},
      };
    }
    return null;
  } catch {
    return null;
  }
}

export function saveLocalSettings(s: Settings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    // 忽略存储失败
  }
}

export function loadLocalHistory(): HistoryRecord[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as HistoryRecord[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function addLocalHistory(
  result: CalculationResult,
  req?: { contractNo?: string; customerName?: string; paymentPlan?: PaymentPlanItem[]; positionPersons?: Record<string, string> }
): void {
  try {
    const list = loadLocalHistory();
    const rec: HistoryRecord = {
      id: list.length > 0 ? Math.max(...list.map((r) => r.id)) + 1 : 1,
      contractNo: req?.contractNo ?? '',
      customerName: req?.customerName ?? '',
      paymentPlan: req?.paymentPlan ?? [],
      positionPersons: req?.positionPersons ?? result.positionPersons,
      salesAmount: result.salesAmount,
      salesCost: result.salesCost,
      baseAmount: result.baseAmount,
      totalCommission: result.totalCommission,
      settingsSnapshot: result.settingsSnapshot,
      result,
      createdAt: formatNow(),
    };
    list.unshift(rec);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, 200)));
  } catch {
    // 忽略
  }
}

export function removeLocalHistory(id: number): void {
  try {
    const list = loadLocalHistory().filter((r) => r.id !== id);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
  } catch {
    // 忽略
  }
}

function formatNow(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** 合同主数据（localStorage 本地兜底） */
export function loadLocalContracts(): Contract[] {
  try {
    const raw = localStorage.getItem(CONTRACTS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as Contract[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function saveLocalContract(contract: Omit<Contract, 'id' | 'createdAt' | 'updatedAt'>): Contract {
  const list = loadLocalContracts();
  const idx = list.findIndex((c) => c.contractNo === contract.contractNo);
  const now = formatNow();
  if (idx >= 0) {
    list[idx] = { ...list[idx], ...contract, updatedAt: now };
    localStorage.setItem(CONTRACTS_KEY, JSON.stringify(list));
    return list[idx];
  }
  const newC: Contract = {
    ...contract,
    id: list.length > 0 ? Math.max(...list.map((c) => c.id)) + 1 : 1,
    createdAt: now,
    updatedAt: now,
  };
  list.unshift(newC);
  localStorage.setItem(CONTRACTS_KEY, JSON.stringify(list));
  return newC;
}

export function removeLocalContract(contractNo: string): void {
  const list = loadLocalContracts().filter((c) => c.contractNo !== contractNo);
  localStorage.setItem(CONTRACTS_KEY, JSON.stringify(list));
}
