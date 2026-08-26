import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Button, Table, MessagePlugin } from 'tdesign-react';
import type { Contract, HistoryRecord, Settings } from '../types';
import { getContract } from '../api/contracts';
import { getHistory } from '../api/history';
import { getSettings } from '../api/settings';
import { fmtMoney } from '../utils/format';
import { exportHistoryBatch } from '../utils/export';
import PersonCommissionTable from '../components/calculator/PersonCommissionTable';
import ContractInfoCard from '../components/ContractInfoCard';

/** 该合同提成统计页：合同主数据（与合同明细一致）+ 多笔提成明细 + 按人提成明细（每位成员 × 每笔 × 岗位） */
export default function ContractStatisticsPage() {
  const { contractNo = '' } = useParams<{ contractNo: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // 来源路由：from=detail（合同明细页进入）→ 返回合同明细；其他（提成计算/直接访问）→ 返回提成计算
  const from = searchParams.get('from');
  const backTarget = (no: string) =>
    from === 'detail'
      ? '/contract-detail/' + encodeURIComponent(no)
      : '/calculate?contract=' + encodeURIComponent(no);
  const backLabel = from === 'detail' ? '← 返回合同明细' : '← 返回提成计算';
  const [contract, setContract] = useState<Contract | null>(null);
  const [records, setRecords] = useState<HistoryRecord[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!contractNo) return;
    setLoading(true);
    try {
      const [c, hist, s] = await Promise.all([
        getContract(contractNo),
        getHistory(1, 10000).catch(() => ({ list: [] as HistoryRecord[] })),
        getSettings().catch(() => null),
      ]);
      if (!c) {
        MessagePlugin.warning(`合同 ${contractNo} 不存在`);
        return;
      }
      setContract(c);
      setSettings(s);
      setRecords(
        hist.list.filter((r) => r.contractNo === contractNo && r.paymentPlan.length > 0)
      );
    } catch (e) {
      MessagePlugin.error(e instanceof Error ? e.message : '加载合同失败');
    } finally {
      setLoading(false);
    }
  }, [contractNo]);

  useEffect(() => {
    load();
  }, [load]);

  const c = contract;
  if (!c) {
    return (
      <div className="page-container">
        <div className="page-header">
          <h2 className="page-title">该合同提成统计</h2>
        </div>
        <div className="section-card" style={{ textAlign: 'center', padding: '48px 24px' }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>📊</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#1a1a1a', marginBottom: 4 }}>
            {loading ? '加载中…' : `合同 ${contractNo} 不存在`}
          </div>
          <div style={{ marginTop: 12 }}>
            <Button variant="outline" onClick={() => navigate(backTarget(contractNo))}>
              {backLabel}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const sumCommission = records.reduce((s, r) => s + (r.commission ?? 0), 0);
  const contractTotalCommission = records[0]?.contractTotalCommission ?? records[0]?.totalCommission ?? 0;
  const personCount = new Set(
    records.flatMap((r) =>
      Object.values(r.result?.positionPersons ?? r.positionPersons ?? {})
    )
  ).size;

  const recordColumns = [
    { colKey: 'planIndex', title: '第几笔', width: 70, align: 'center' as const, cell: ({ row }: { row: HistoryRecord }) => <span style={{ fontWeight: 600 }}>第{row.planIndex ?? 1}笔</span> },
    { colKey: 'month', title: '收款月份', width: 90, align: 'center' as const, cell: ({ row }: { row: HistoryRecord }) => row.paymentPlan[0]?.month ?? '—' },
    { colKey: 'amount', title: '原币金额', width: 110, align: 'right' as const, cell: ({ row }: { row: HistoryRecord }) => { const p = row.paymentPlan[0]; return p ? `${fmtMoney(p.amount)} ${p.currency}` : '—'; } },
    { colKey: 'rate', title: '实际结汇汇率', width: 100, align: 'center' as const, cell: ({ row }: { row: HistoryRecord }) => { const p = row.paymentPlan[0]; return p && p.currency !== 'CNY' && p.rate ? <span style={{ fontVariantNumeric: 'tabular-nums' }}>{Number(p.rate).toFixed(2)}</span> : '—'; } },
    { colKey: 'amountCNY', title: '实际收汇金额（¥）', width: 115, align: 'right' as const, cell: ({ row }: { row: HistoryRecord }) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(row.paymentPlan[0]?.amountCNY ?? 0)}</span> },
    { colKey: 'ratio', title: '比例', width: 65, align: 'center' as const, cell: ({ row }: { row: HistoryRecord }) => { const r = row.paymentPlan[0]?.ratio; return r !== undefined ? `${(r * 100).toFixed(1)}%` : '—'; } },
    { colKey: 'received', title: '状态', width: 60, align: 'center' as const, cell: () => <span style={{ color: '#00a870', fontWeight: 600 }}>已收</span> },
    { colKey: 'commission', title: '这笔提成（¥）', width: 110, align: 'right' as const, cell: ({ row }: { row: HistoryRecord }) => <span style={{ color: '#0052d9', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(row.commission ?? 0)}</span> },
    { colKey: 'ctc', title: '合同总提成（¥）', width: 115, align: 'right' as const, cell: ({ row }: { row: HistoryRecord }) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(row.contractTotalCommission ?? row.totalCommission ?? 0)}</span> },
    { colKey: 'createdAt', title: '保存时间', width: 145, cell: ({ row }: { row: HistoryRecord }) => <span style={{ color: '#6b7588', fontSize: 12 }}>{row.createdAt}</span> },
  ];

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h2 className="page-title">该合同提成统计：{c.contractNo}</h2>
          <div className="page-subtitle">
            合同信息（与合同明细一致） + 多笔提成明细 + 按人提成明细（每位成员 × 每笔 × 岗位）
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="outline" onClick={() => navigate(backTarget(c.contractNo))}>
            {backLabel}
          </Button>
          {records.length > 0 && (
            <Button variant="outline" onClick={() => exportHistoryBatch(records)}>
              导出该合同全部记录
            </Button>
          )}
        </div>
      </div>

      {/* 合同信息（与合同明细完全一致） */}
      <ContractInfoCard contract={c} settings={settings} />

      {/* 统计概览 */}
      <div className="section-card">
        <div className="section-title">统计概览</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 160px', padding: '10px 14px', background: '#e8f0ff', border: '1px solid #cfe0ff', borderRadius: 8 }}>
            <div style={{ fontSize: 11, color: '#5b6b85', marginBottom: 2 }}>累计业绩</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#0052d9', fontVariantNumeric: 'tabular-nums' }}>
              ¥ {fmtMoney((c.salesCurrency === 'CNY' ? 1 : c.salesRate || 1) * c.salesAmountOrig)}
            </div>
          </div>
          <div style={{ flex: '1 1 160px', padding: '10px 14px', background: '#e8f7ef', border: '1px solid #b6e5c8', borderRadius: 8 }}>
            <div style={{ fontSize: 11, color: '#5b6b85', marginBottom: 2 }}>各笔提成合计</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#00a870', fontVariantNumeric: 'tabular-nums' }}>
              ¥ {fmtMoney(sumCommission)}
            </div>
          </div>
          <div style={{ flex: '1 1 160px', padding: '10px 14px', background: '#f2f3f7', border: '1px solid #e3e6ee', borderRadius: 8 }}>
            <div style={{ fontSize: 11, color: '#5b6b85', marginBottom: 2 }}>合同总提成</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#1a1a1a', fontVariantNumeric: 'tabular-nums' }}>
              ¥ {fmtMoney(contractTotalCommission)}
            </div>
          </div>
          <div style={{ flex: '1 1 160px', padding: '10px 14px', background: '#fff6e8', border: '1px solid #ffe1b8', borderRadius: 8 }}>
            <div style={{ fontSize: 11, color: '#5b6b85', marginBottom: 2 }}>涉及人员</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#e37318', fontVariantNumeric: 'tabular-nums' }}>
              {personCount} 人
            </div>
          </div>
        </div>
      </div>

      {/* 多笔提成明细 */}
      <div className="section-card">
        <div className="section-title">
          <span>多笔提成明细（{records.length} 笔）</span>
        </div>
        <Table
          className="table-responsive"
          rowKey="id"
          data={records}
          columns={recordColumns}
          bordered
          hover
          stripe
          size="small"
          tableLayout="auto"
          empty={'该合同暂无提成计算记录'}
        />
      </div>

      {/* 按人提成明细（每位成员 × 每笔 × 岗位，确保每人都展开到岗位级） */}
      {records.length > 0 && (
        <div className="section-card">
          <PersonCommissionTable records={records} />
        </div>
      )}
    </div>
  );
}
