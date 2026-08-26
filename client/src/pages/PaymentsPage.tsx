/** 提成统计页：
 * - 默认当年所有合同所有人员
 * - 筛选：年份/月份/姓名/岗位（姓名 = 合同 customerName 或 positionPersons 人员）
 * - 提成明细：二级展示 —— 第一级按合同汇总（销售人员信息），点合同号进入该合同统计页看分人分笔数明细
 * - 按月统计表：按月聚合（年-月 + 合同数 + 笔数 + 涉及人员 + 提成合计）
 */
import { useEffect, useState, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Select, Button, Table, MessagePlugin } from 'tdesign-react';
import type { HistoryRecord, PaymentPlanItem, Settings } from '../types';
import { getHistory } from '../api/history';
import { getCommissionPersons } from '../api/commissions';
import { getSettings } from '../api/settings';
import { fmtMoney } from '../utils/format';

interface CommissionRow {
  id: number;
  contractNo: string;
  customerName: string;
  planIndex: number;
  month: string;
  templateName: string;
  /** 提成月份（从 plan[0].month 提取） */
  person: string;
  position: string;
  amount: number;
  totalCommission: number;
  /** 实际结汇汇率（该笔收款记录） */
  rate?: number;
  createdAt: string;
}

interface MonthRow {
  month: string;
  count: number;
  people: number;
  total: number;
}

/** 第一级：按合同汇总（销售人员信息） */
interface ContractSummaryRow {
  contractNo: string;
  customerName: string;
  templateName: string;
  /** 已录笔数 */
  planCount: number;
  /** 涉及人数 */
  personCount: number;
  /** 提成总额（¥） */
  amount: number;
}

/** 人员 × 月份：该人员所有相关合同的提成汇总 */
interface PersonMonthRow {
  id: string;
  person: string;
  month: string;
  /** 涉及合同数 */
  contractCount: number;
  /** 提成合计（¥） */
  amount: number;
}

const SALES_POSITIONS = ['销售人员', '销售主管', '项目管理人员', '销售助理'];

export default function PaymentsPage() {
  const [records, setRecords] = useState<HistoryRecord[]>([]);
  const [persons, setPersons] = useState<string[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(false);
  const [year, setYear] = useState<string>(String(new Date().getFullYear()));
  // 默认全年（月份筛选由用户自行选择，避免把非当月收款隐藏造成困惑）
  const [month, setMonth] = useState<string>('');
  const [customerName, setCustomerName] = useState<string>('');
  const [position, setPosition] = useState<string>('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [hist, ps, st] = await Promise.all([
        getHistory(1, 10000).catch(() => ({ list: [] as HistoryRecord[] })),
        getCommissionPersons().catch(() => [] as string[]),
        getSettings().catch(() => null),
      ]);
      setRecords(hist.list);
      setPersons(ps);
      setSettings(st);
    } catch (e) {
      MessagePlugin.error(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /** 直接从 result.settingsSnapshot 取模板名（HistoryRecord 没有顶层 templateId 字段） */
  const tnameOf = (r: HistoryRecord): string => r.result?.settingsSnapshot?.name ?? '';

  /** 把 history records 展开为按人×岗位的提成明细行（含 plan.totalCommission + positionTotals） */
  const allRows: CommissionRow[] = useMemo(() => {
    const rows: CommissionRow[] = [];
    for (const r of records) {
      const monthFromPlan = (r.paymentPlan?.[0] as PaymentPlanItem | undefined)?.month ?? (r.createdAt ?? '').slice(0, 7);
      const posTotals = r.result?.positionTotals ?? {};
      const posPersons = r.result?.positionPersons ?? r.positionPersons ?? {};
      const tname = tnameOf(r);
      for (const [pos, amt] of Object.entries(posTotals)) {
        const person = posPersons[pos] || '未分配';
        rows.push({
          // 序号兜底（避免原复合 id 在极端情况下冲突）
          id: rows.length + 1,
          contractNo: r.contractNo,
          customerName: r.customerName,
          planIndex: r.planIndex ?? 1,
          month: monthFromPlan,
          templateName: tname,
          person,
          position: pos,
          amount: amt,
          totalCommission: r.totalCommission,
          rate: r.paymentPlan?.[0]?.rate,
          createdAt: r.createdAt,
        });
      }
    }
    return rows;
  }, [records]);

  // 候选姓名 = 客户名 + positionPersons 人员 + 数据库人员（去重）
  const allPersonOptions = useMemo(() => {
    const set = new Set<string>();
    records.forEach((r) => {
      if (r.customerName) set.add(r.customerName);
      const pp = r.result?.positionPersons ?? r.positionPersons ?? {};
      Object.values(pp).forEach((p) => p && set.add(p));
    });
    persons.forEach((p) => set.add(p));
    (settings?.staffList ?? []).forEach((p) => set.add(p));
    return [...set].sort();
  }, [records, persons, settings]);

  // 候选岗位 = 系统设置模板定义的所有岗位（并集）+ 历史记录里出现过的岗位（兜底，含改名/已删岗位）
  const allPositionOptions = useMemo(() => {
    const set = new Set<string>();
    SALES_POSITIONS.forEach((p) => set.add(p));
    (settings?.templates ?? []).forEach((t) => (t.positionOrder ?? []).forEach((p) => set.add(p)));
    records.forEach((r) => {
      const pt = r.result?.positionTotals ?? {};
      Object.keys(pt).forEach((p) => set.add(p));
      const pp = r.result?.positionPersons ?? {};
      Object.keys(pp).forEach((p) => set.add(p));
    });
    return [...set].sort();
  }, [records, settings]);

  // 逐级筛选：选岗位后，姓名候选限定为该岗位人员（未选岗位 = 全部人员）
  const personOptionsFiltered = useMemo(() => {
    if (!position) return allPersonOptions;
    const set = new Set<string>();
    for (const r of allRows) {
      if (r.position === position && r.person && r.person !== '未分配') set.add(r.person);
    }
    records.forEach((r) => {
      const pp = r.result?.positionPersons ?? r.positionPersons ?? {};
      const nm = pp[position];
      if (nm) set.add(nm);
    });
    return [...set].sort();
  }, [allRows, allPersonOptions, records, position]);





  // 过滤
  const filtered = useMemo(() => {
    return allRows.filter((r) => {
      if (year) {
        if (!r.month.startsWith(year)) return false;
        if (month && r.month !== month) return false;
      }
      if (customerName) {
        // 单人筛选：只显示该人在该合同的提成（合同级 customerName + positionPersons 中该人）
        if (r.customerName !== customerName && r.person !== customerName) return false;
      }
      if (position && r.position !== position) return false;
      return true;
    });
  }, [allRows, year, month, customerName, position]);

  // 按月聚合
  const monthRows: MonthRow[] = useMemo(() => {
    const map = new Map<string, { count: number; people: Set<string>; total: number }>();
    for (const r of filtered) {
      const m = r.month;
      const e = map.get(m) ?? { count: 0, people: new Set(), total: 0 };
      e.count += 1;
      e.people.add(r.person);
      e.total = Math.round((e.total + r.amount) * 100) / 100;
      map.set(m, e);
    }
    return [...map.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([m, v]) => ({ month: m, count: v.count, people: v.people.size, total: v.total }));
  }, [filtered]);

  const totalAmount = Math.round(filtered.reduce((s, r) => s + r.amount, 0) * 100) / 100;
  const contractCount = new Set(filtered.map((r) => r.contractNo)).size;

  // 第一级：按合同汇总（合同号 → 销售人员 + 笔数 + 涉及人数 + 提成总额）
  const contractRows = useMemo(() => {
    const map = new Map<
      string,
      { contractNo: string; customerName: string; templateName: string; plans: Set<number>; persons: Set<string>; amount: number }
    >();
    for (const r of filtered) {
      const e =
        map.get(r.contractNo) ?? {
          contractNo: r.contractNo,
          customerName: r.customerName,
          templateName: r.templateName,
          plans: new Set<number>(),
          persons: new Set<string>(),
          amount: 0,
        };
      e.plans.add(r.planIndex);
      e.persons.add(r.person);
      e.amount = Math.round((e.amount + r.amount) * 100) / 100;
      map.set(r.contractNo, e);
    }
    return [...map.values()]
      .map((e) => ({
        contractNo: e.contractNo,
        customerName: e.customerName,
        templateName: e.templateName,
        planCount: e.plans.size,
        personCount: e.persons.size,
        amount: e.amount,
      }))
      .sort((a, b) => b.amount - a.amount);
  }, [filtered]);

  const contractColumns = [
    { colKey: 'contractNo', title: '合同号', width: 140, cell: ({ row }: { row: ContractSummaryRow }) => <Link to={`/contract-statistics/${encodeURIComponent(row.contractNo)}`} style={{ color: '#0052d9', fontWeight: 600 }}>{row.contractNo || '—'}</Link> },
    { colKey: 'customerName', title: '销售姓名', width: 90, cell: ({ row }: { row: ContractSummaryRow }) => row.customerName || '—' },
    { colKey: 'templateName', title: '表格类型', width: 130, cell: ({ row }: { row: ContractSummaryRow }) => row.templateName || '—' },
    { colKey: 'planCount', title: '笔数', width: 70, align: 'center' as const, cell: ({ row }: { row: ContractSummaryRow }) => row.planCount },
    { colKey: 'personCount', title: '涉及人数', width: 90, align: 'center' as const, cell: ({ row }: { row: ContractSummaryRow }) => `${row.personCount} 人` },
    { colKey: 'amount', title: '提成总额（¥）', width: 140, align: 'right' as const, cell: ({ row }: { row: ContractSummaryRow }) => <span style={{ color: '#0052d9', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(row.amount)}</span> },
  ];

  // 人员 × 月份：该人员所有相关合同的提成汇总（随姓名/岗位筛选联动）
  const personMonthRows = useMemo(() => {
    const map = new Map<string, { person: string; month: string; contracts: Set<string>; amount: number }>();
    for (const r of filtered) {
      const key = `${r.person}|${r.month}`;
      const e =
        map.get(key) ?? { person: r.person, month: r.month, contracts: new Set<string>(), amount: 0 };
      e.contracts.add(r.contractNo);
      e.amount = Math.round((e.amount + r.amount) * 100) / 100;
      map.set(key, e);
    }
    return [...map.values()]
      .map((e) => ({
        id: `${e.person}|${e.month}`,
        person: e.person,
        month: e.month,
        contractCount: e.contracts.size,
        amount: e.amount,
      }))
      .sort((a, b) => a.person.localeCompare(b.person, 'zh-CN') || b.month.localeCompare(a.month));
  }, [filtered]);

  const personMonthColumns = [
    { colKey: 'person', title: '人员', width: 110, cell: ({ row }: { row: PersonMonthRow }) => <span style={{ color: '#0052d9', fontWeight: 600 }}>{row.person}</span> },
    { colKey: 'month', title: '月份', width: 100, align: 'center' as const, cell: ({ row }: { row: PersonMonthRow }) => <span style={{ fontWeight: 600 }}>{row.month}</span> },
    { colKey: 'contractCount', title: '合同数', width: 80, align: 'center' as const, cell: ({ row }: { row: PersonMonthRow }) => row.contractCount },
    { colKey: 'amount', title: '提成合计（¥）', width: 160, align: 'right' as const, cell: ({ row }: { row: PersonMonthRow }) => <span style={{ color: '#00a870', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(row.amount)}</span> },
  ];

  const monthColumns = [
    { colKey: 'month', title: '月份', width: 120, align: 'center' as const, cell: ({ row }: { row: MonthRow }) => <span style={{ fontWeight: 600 }}>{row.month}</span> },
    { colKey: 'count', title: '笔次', width: 80, align: 'center' as const, cell: ({ row }: { row: MonthRow }) => row.count },
    { colKey: 'people', title: '涉及人员', width: 100, align: 'center' as const, cell: ({ row }: { row: MonthRow }) => `${row.people} 人` },
    { colKey: 'total', title: '提成合计（¥）', width: 160, align: 'right' as const, cell: ({ row }: { row: MonthRow }) => <span style={{ color: '#00a870', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(row.total)}</span> },
  ];

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h2 className="page-title">提成统计</h2>
          <div className="page-subtitle">按月汇总 + 每合同每笔每岗位的提成明细（支持按月份/岗位 → 姓名逐级筛选）</div>
        </div>
        <Button variant="outline" onClick={load} loading={loading}>刷新</Button>
      </div>

      {/* 筛选条：年度 / 月份（默认全年）/ 岗位（在前）→ 姓名（在后，逐级联动） */}
      <div className="filter-bar" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="filter-label">年度</span>
          <Select
            value={year}
            onChange={(v) => setYear(String(v ?? ''))}
            style={{ width: 120 }}
            options={[String(new Date().getFullYear() - 1), String(new Date().getFullYear()), String(new Date().getFullYear() + 1)].map((y) => ({ value: y, label: y }))}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="filter-label">月份</span>
          <Select
            value={month}
            onChange={(v) => setMonth(String(v ?? ''))}
            style={{ width: 140 }}
            clearable
            options={Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`).map((m) => ({ value: m, label: m }))}
            placeholder="全年"
          />
        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="filter-label">岗位</span>
          <Select
            value={position || undefined}
            onChange={(v) => {
              setPosition(v == null ? '' : String(v));
              setCustomerName(''); // 逐级筛选：切岗位时重置姓名
            }}
            placeholder={allPositionOptions.length > 0 ? `选择岗位（共 ${allPositionOptions.length} 个）` : '选择岗位'}
            clearable
            style={{ width: 180 }}
            options={allPositionOptions.map((n) => ({ value: n, label: n }))}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="filter-label">姓名</span>
          <Select
            value={customerName || undefined}
            onChange={(v) => setCustomerName(v == null ? '' : String(v))}
            placeholder={
              personOptionsFiltered.length > 0
                ? `选择或输入（共 ${personOptionsFiltered.length} 人）`
                : position
                  ? '该岗位暂无人员'
                  : '输入姓名'
            }
            filterable
            clearable
            style={{ width: 180 }}
            options={personOptionsFiltered.map((n) => ({ value: n, label: n }))}
          />
        </div>
        <Button size="small" variant="outline" onClick={() => { setMonth(''); setCustomerName(''); setPosition(''); }}>
          清空筛选
        </Button>
      </div>

      {/* 精简概览（删除"提成总计"大卡和"按人合计"Tag 列表） */}
      <div className="summary-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
        <div className="summary-card">
          <div className="label">合同数</div>
          <div className="value">{contractCount}</div>
        </div>
        <div className="summary-card">
          <div className="label">提成合计（筛选后）</div>
          <div className="value" style={{ color: '#0052d9', fontVariantNumeric: 'tabular-nums' }}>¥ {fmtMoney(totalAmount)}</div>
        </div>
      </div>

      {/* 按月统计 */}
      <div className="section-card">
        <div className="section-title">
          <span>按月统计（{year} 年）</span>
          <span style={{ fontSize: 12, fontWeight: 400, color: '#9aa3b5' }}>
            {filtered.length === 0 ? '当前筛选无数据' : `共 ${monthRows.length} 个月 ${filtered.length} 笔提成`}
          </span>
        </div>
        <Table
          className="table-responsive"
          rowKey="month"
          data={monthRows}
          columns={monthColumns}
          bordered
          hover
          stripe
          size="small"
          tableLayout="auto"
          empty={loading ? '加载中…' : '当前筛选无数据'}
        />
      </div>

      {/* 人员按月提成汇总：该人员所有相关合同按月份的提成合计 */}
      <div className="section-card">
        <div className="section-title">
          <span>人员按月提成汇总</span>
          <span style={{ fontSize: 12, fontWeight: 400, color: '#9aa3b5' }}>
            {customerName ? `（姓名：${customerName}）` : ''}
            {position ? `（岗位：${position}）` : ''}
            {personMonthRows.length === 0 ? '当前筛选无数据' : `共 ${personMonthRows.length} 条`}
          </span>
        </div>
        <Table
          className="table-responsive"
          rowKey="id"
          data={personMonthRows}
          columns={personMonthColumns}
          bordered
          hover
          stripe
          size="small"
          tableLayout="auto"
          empty={loading ? '加载中…' : '当前筛选无数据'}
        />
      </div>

      {/* 提成明细（第一级：按合同汇总）—— 点合同号进入该合同统计页查看分人、分笔数明细 */}
      <div className="section-card">
        <div className="section-title">
          <span>
            提成明细
            {customerName ? `（姓名：${customerName}）` : ''}
            {position ? `（岗位：${position}）` : ''}
          </span>
          <span style={{ fontSize: 12, fontWeight: 400, color: '#9aa3b5' }}>
            按合同汇总；点击合同号查看该合同分人、分笔数的详细提成
          </span>
        </div>
        <Table
          className="table-responsive"
          rowKey="contractNo"
          data={contractRows}
          columns={contractColumns}
          bordered
          hover
          stripe
          size="small"
          tableLayout="auto"
          empty={loading ? '加载中…' : '当前筛选无提成记录'}
        />
      </div>
    </div>
  );
}
