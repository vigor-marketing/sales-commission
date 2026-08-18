import { http } from './http';
import { withFallback } from './withFallback';
import type { PaymentsPageData } from '../types';
import { loadLocalHistory } from '../utils/localStore';

export interface PaymentFilter {
  month?: string;
  contractNo?: string;
  contractNos?: string[];
  customerName?: string;
  status?: 'all' | 'received' | 'unreceived';
  page?: number;
  pageSize?: number;
}

export async function getPayments(filter: PaymentFilter = {}): Promise<PaymentsPageData> {
  return withFallback(
    async () => {
      const qs = new URLSearchParams();
      if (filter.month) qs.set('month', filter.month);
      if (filter.contractNo) qs.set('contractNo', filter.contractNo);
      if (filter.contractNos && filter.contractNos.length > 0) {
        qs.set('contractNos', filter.contractNos.join(','));
      }
      if (filter.customerName) qs.set('customerName', filter.customerName);
      if (filter.status && filter.status !== 'all') qs.set('status', filter.status);
      if (filter.page) qs.set('page', String(filter.page));
      if (filter.pageSize) qs.set('pageSize', String(filter.pageSize));
      return (await http.get<{ data: PaymentsPageData }>(`/payments?${qs.toString()}`)).data;
    },
    () => {
      // 本地兜底：从 localStorage 历史展开收款计划
      const now = new Date();
      const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const month = filter.month ?? defaultMonth;
      const status = filter.status ?? 'all';
      const list = loadLocalHistory();
      const allPayments = list.flatMap((r) =>
        (r.paymentPlan ?? [])
          .map((p, idx) => ({ p, planIndex: idx + 1 }))
          .filter(({ p }) => p.month === month)
          .filter(() => !filter.contractNo || (r.contractNo ?? '').includes(filter.contractNo))
          .filter(
            () =>
              !filter.contractNos ||
              filter.contractNos.length === 0 ||
              filter.contractNos.includes(r.contractNo ?? '')
          )
          .filter(() => !filter.customerName || (r.customerName ?? '').includes(filter.customerName))
          .filter(({ p }) => {
            const received = p.received === true;
            if (status === 'received' && !received) return false;
            if (status === 'unreceived' && received) return false;
            return true;
          })
          .map(({ p, planIndex }) => ({
            id: r.id,
            contractNo: r.contractNo ?? '',
            customerName: r.customerName ?? '',
            month: p.month,
            currency: p.currency,
            amount: p.amount,
            rate: p.rate,
            amountCNY: p.amountCNY,
            received: p.received === true,
            planIndex,
            fullPayment: (r.paymentPlan ?? []).length === 1,
            ratio: p.ratio,
            createdAt: r.createdAt,
          }))
      );
      const page = filter.page ?? 1;
      const pageSize = filter.pageSize ?? 100;
      return {
        list: allPayments.slice((page - 1) * pageSize, page * pageSize),
        total: allPayments.length,
        page,
        pageSize,
        month,
        filters: { month, contractNo: filter.contractNo ?? '', customerName: filter.customerName ?? '' },
        summary: {
          totalAmountCNY: Math.round(allPayments.reduce((s, p) => s + (p.amountCNY || 0), 0) * 100) / 100,
          count: allPayments.length,
          byCurrency: allPayments.reduce<Record<string, { amount: number; amountCNY: number }>>((acc, p) => {
            const cur = acc[p.currency] ?? { amount: 0, amountCNY: 0 };
            cur.amount += p.amount || 0;
            cur.amountCNY += p.amountCNY || 0;
            acc[p.currency] = cur;
            return acc;
          }, {}),
        },
      };
    }
  );
}

/** 返回有收款记录的所有月份 */
export async function getPaymentMonths(): Promise<string[]> {
  return withFallback(
    async () => (await http.get<{ data: string[] }>('/payments/months')).data,
    () => {
      const now = new Date();
      const current = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const months = new Set<string>([current]);
      for (const r of loadLocalHistory()) {
        for (const p of r.paymentPlan ?? []) months.add(p.month);
      }
      return [...months].sort().reverse();
    }
  );
}

/** 年度看板数据 */
export interface YearlyData {
  year: number;
  months: Array<{ month: string; amountCNY: number; count: number }>;
  totalCNY: number;
}

/** 获取年度各月收款汇总 */
export async function getYearly(year: number): Promise<YearlyData> {
  return withFallback(
    async () => (await http.get<{ data: YearlyData }>(`/payments/yearly?year=${year}`)).data,
    () => {
      // 本地兜底
      const byMonth: Record<string, { month: string; amountCNY: number; count: number }> = {};
      let totalCNY = 0;
      for (const r of loadLocalHistory()) {
        for (const p of r.paymentPlan ?? []) {
          if (!p.month.startsWith(`${year}-`)) continue;
          const cur = byMonth[p.month] ?? { month: p.month, amountCNY: 0, count: 0 };
          cur.amountCNY += p.amountCNY || 0;
          cur.count += 1;
          byMonth[p.month] = cur;
          totalCNY += p.amountCNY || 0;
        }
      }
      const months: Array<{ month: string; amountCNY: number; count: number }> = [];
      for (let m = 1; m <= 12; m++) {
        const key = `${year}-${String(m).padStart(2, '0')}`;
        months.push(byMonth[key] ?? { month: key, amountCNY: 0, count: 0 });
      }
      return { year, months, totalCNY: Math.round(totalCNY * 100) / 100 };
    }
  );
}

/** 返回所有出现过的合同号 */
export async function getContractOptions(): Promise<string[]> {
  return withFallback(
    async () => (await http.get<{ data: string[] }>('/payments/contracts')).data,
    () => {
      const set = new Set<string>();
      for (const r of loadLocalHistory()) {
        if (r.contractNo) set.add(r.contractNo);
      }
      return [...set].sort();
    }
  );
}
