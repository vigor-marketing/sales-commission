import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button, Table, MessagePlugin } from 'tdesign-react';
import type { Contract, HistoryRecord, Settings } from '../types';
import { getContract } from '../api/contracts';
import { getHistory } from '../api/history';
import { getSettings } from '../api/settings';
import { fmtMoney } from '../utils/format';
import { exportHistoryBatch } from '../utils/export';
import PersonCommissionTable from '../components/calculator/PersonCommissionTable';
import ContractInfoCard from '../components/ContractInfoCard';

/** 合同明细页：点击合同号进入，展示合同主数据 + 该合同多笔提成 + 按人汇总 */
export default function ContractDetailPage() {
  const { contractNo = '' } = useParams<{ contractNo: string }>();
  const navigate = useNavigate();
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
          <h2 className="page-title">合同明细</h2>
        </div>
        <div className="section-card" style={{ textAlign: 'center', padding: '48px 24px' }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>📄</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#1a1a1a', marginBottom: 4 }}>
            {loading ? '加载中…' : `合同 ${contractNo} 不存在`}
          </div>
          <div style={{ marginTop: 12 }}>
            <Button variant="outline" onClick={() => navigate('/contracts-manage')}>
              返回合同管理
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const sumCommission = records.reduce((s, r) => s + (r.commission ?? 0), 0);

  const recordColumns = [
    { colKey: 'planIndex', title: '第几笔', width: 70, align: 'center' as const, cell: ({ row }: { row: HistoryRecord }) => <span style={{ fontWeight: 600 }}>第{row.planIndex ?? 1}笔</span> },
    { colKey: 'month', title: '收款月份', width: 90, align: 'center' as const, cell: ({ row }: { row: HistoryRecord }) => row.paymentPlan[0]?.month ?? '—' },
    { colKey: 'amount', title: '原币金额', width: 110, align: 'right' as const, cell: ({ row }: { row: HistoryRecord }) => { const p = row.paymentPlan[0]; return p ? `${fmtMoney(p.amount)} ${p.currency}` : '—'; } },
    { colKey: 'rate', title: '实际结汇汇率', width: 100, align: 'center' as const, cell: ({ row }: { row: HistoryRecord }) => { const p = row.paymentPlan[0]; return p && p.currency !== 'CNY' && p.rate ? <span style={{ fontVariantNumeric: 'tabular-nums' }}>{Number(p.rate).toFixed(2)}</span> : '—'; } },
    { colKey: 'amountCNY', title: '实际收汇金额（¥）', width: 115, align: 'right' as const, cell: ({ row }: { row: HistoryRecord }) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(row.paymentPlan[0]?.amountCNY ?? 0)}</span> },
    { colKey: 'ratio', title: '比例', width: 65, align: 'center' as const, cell: ({ row }: { row: HistoryRecord }) => { const r = row.paymentPlan[0]?.ratio; return r !== undefined ? `${(r * 100).toFixed(1)}%` : '—'; } },
    { colKey: 'received', title: '状态', width: 60, align: 'center' as const, cell: () => <span style={{ color: '#00a870', fontWeight: 600 }}>已收</span> },
    { colKey: 'commission', title: '这笔提成（¥）', width: 110, align: 'right' as const, cell: ({ row }: { row: HistoryRecord }) => <span style={{ color: '#0052d9', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(row.commission ?? 0)}</span> },
    { colKey: 'note', title: '备注', width: 140, cell: ({ row }: { row: HistoryRecord }) => { const n = row.paymentPlan[0]?.note; return n ? <span style={{ color: '#e37318', fontSize: 12 }}>{n}</span> : '—'; } },
    { colKey: 'createdAt', title: '保存时间', width: 145, cell: ({ row }: { row: HistoryRecord }) => <span style={{ color: '#6b7588', fontSize: 12 }}>{row.createdAt}</span> },
  ];

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h2 className="page-title">合同明细：{c.contractNo}</h2>
          <div className="page-subtitle">合同主数据 + 该合同所有收款笔次的提成 + 按人汇总</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="outline" onClick={() => navigate('/contracts-manage')}>
            ← 返回合同管理
          </Button>
          {records.length > 0 && (
            <>
              <Button variant="outline" onClick={() => navigate('/contract-statistics/' + encodeURIComponent(c.contractNo) + '?from=detail')}>
                提成统计
              </Button>
              <Button variant="outline" onClick={() => exportHistoryBatch(records)}>
                导出该合同全部记录
              </Button>
            </>
          )}
        </div>
      </div>

      <ContractInfoCard contract={c} settings={settings} />

      {/* 多笔提成明细 */}
      <div className="section-card">
        <div className="section-title">
          <span>该合同多笔提成明细（{records.length} 笔）</span>
          {records.length > 0 && (
            <span style={{ fontSize: 12, color: '#0052d9', fontWeight: 700, marginLeft: 10 }}>
              各笔提成合计：¥ {fmtMoney(sumCommission)}
            </span>
          )}
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
          empty={'该合同暂无提成计算记录（请到「提成计算」页录入并保存）'}
        />
      </div>

      {/* 按人汇总（每位成员 × 每笔 × 岗位展开） */}
      {records.length > 0 && (
        <div className="section-card">
          <PersonCommissionTable records={records} />
        </div>
      )}
    </div>
  );
}
