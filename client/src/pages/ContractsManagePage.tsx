import { useEffect, useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Table, Button, Input, MessagePlugin } from 'tdesign-react';
import type { Contract, Settings, HistoryRecord } from '../types';
import { getContracts, getContractsPage } from '../api/contracts';
import { getSettings } from '../api/settings';
import { getHistory } from '../api/history';
import { fmtMoney } from '../utils/format';
import { exportContractsCSV } from '../utils/export';

/** 每个合同的关联情况（从计算历史聚合） */
interface ContractStatus {
  savedCount: number;
  receivedCNY: number;
  unreceivedCNY: number;
  commissionCNY: number;
  /** 累计收款比例（各笔 ratio 之和，小数 0~1） */
  paidRatio: number;
}

const PAGE_SIZE = 20;

/** 合同管理页：合同列表（分页/搜索，含收款进度/提成情况）；修改在独立编辑页 */
export default function ContractsManagePage() {
  const navigate = useNavigate();
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [keyword, setKeyword] = useState('');
  const [settings, setSettings] = useState<Settings | null>(null);
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [loading, setLoading] = useState(false);
  // 多选导出：选中的合同 id 集合（空 = 导出全部）
  const [selectedRowKeys, setSelectedRowKeys] = useState<Array<string | number>>([]);

  /** 元数据 + 历史（加载一次即可，分页不重拉） */
  useEffect(() => {
    (async () => {
      try {
        const [s, h] = await Promise.all([
          getSettings(),
          getHistory(1, 10000),
        ]);
        if (s) setSettings(s);
        setHistory(h.list);
      } catch (e) {
        MessagePlugin.error(e instanceof Error ? e.message : '加载配置失败');
      }
    })();
  }, []);

  /** 分页加载合同列表 */
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getContractsPage({ page, pageSize: PAGE_SIZE, search })
      .then((res) => {
        if (cancelled) return;
        setContracts(res.list);
        setTotal(res.total);
      })
      .catch((e) => {
        if (!cancelled) MessagePlugin.error(e instanceof Error ? e.message : '加载合同失败');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [page, search]);

  /** 按合同聚合历史情况（追加款/特殊收款仅记录，不参与进度与提成统计） */
  const statusMap = useMemo(() => {
    const map = new Map<string, ContractStatus>();
    for (const r of history) {
      // 追加款（超出计划笔数）：仅记录在明细，不参与收款进度/已收金额/提成合计
      if ((r.planIndex ?? 1) > (r.totalPlanCount ?? 1)) continue;
      const key = r.contractNo;
      const cur = map.get(key) ?? { savedCount: 0, receivedCNY: 0, unreceivedCNY: 0, commissionCNY: 0, paidRatio: 0 };
      cur.savedCount += 1;
      const p = r.paymentPlan?.[0];
      if (p) {
        const amt = p.amountCNY || 0;
        if (p.received) cur.receivedCNY += amt;
        else cur.unreceivedCNY += amt;
        // 累计收款比例（ratio 缺失的旧数据按金额占比近似，避免误判已收完）
        if (p.ratio !== undefined) cur.paidRatio += p.ratio;
      }
      cur.commissionCNY += r.commission ?? 0;
      map.set(key, cur);
    }
    return map;
  }, [history]);

  const applySearch = () => {
    setSearch(keyword.trim());
    setPage(1);
    setSelectedRowKeys([]);
  };

  const handleExport = async () => {
    if (contracts.length === 0) return;
    try {
      // 全量拉取（分页只展示当前页，导出需全部合同）
      const all = await getContracts();
      const names: Record<string, string> = {};
      for (const t of settings?.templates ?? []) names[t.id] = t.name;
      const selected =
        selectedRowKeys.length > 0
          ? all.filter((c) => selectedRowKeys.includes(c.id))
          : all;
      exportContractsCSV(selected, names);
    } catch (e) {
      MessagePlugin.error(e instanceof Error ? e.message : '导出失败');
    }
  };

  const columns = [
    { colKey: 'row-select', type: 'multiple' as const, width: 46 },
    { colKey: 'contractNo', title: '合同号', width: 130, cell: ({ row }: { row: Contract }) => <Link to={`/contract-detail/${encodeURIComponent(row.contractNo)}`} style={{ color: '#0052d9', fontWeight: 600 }}>{row.contractNo}</Link> },
    { colKey: 'customerName', title: '销售姓名', width: 90, cell: ({ row }: { row: Contract }) => row.customerName },
    {
      colKey: 'template', title: '表格类型', width: 130,
      cell: ({ row }: { row: Contract }) => {
        const t = settings?.templates.find((x) => x.id === row.templateId);
        if (t) return t.name;
        if (row.templateId) return '未知模板';
        // 空 templateId：按实际计算所用模板（默认第一个）带出
        return settings?.templates[0]?.name ?? '—';
      },
    },
    { colKey: 'salesAmount', title: '业绩', width: 120, align: 'right' as const, cell: ({ row }: { row: Contract }) => `${row.salesAmountOrig.toLocaleString()} ${row.salesCurrency}` },
    { colKey: 'fees', title: '费用（¥）', width: 100, align: 'right' as const, cell: ({ row }: { row: Contract }) => fmtMoney(row.salesFees.reduce((s, f) => s + (f.amountCNY || 0), 0)) },
    {
      colKey: 'plan', title: '收款进度', width: 170, cell: ({ row }: { row: Contract }) => {
        const st = statusMap.get(row.contractNo);
        const saved = st?.savedCount ?? 0;
        // 收完判定：累计收款比例 = 100%（多笔累加 = 合同金额）；旧数据无 ratio 时用已收金额 ≈ 合同业绩人民币
        const salesCNY =
          (row.salesCurrency === 'CNY' ? 1 : row.salesRate) * row.salesAmountOrig;
        const ratioOk = (st?.paidRatio ?? 0) >= 0.9999;
        const amountOk = salesCNY > 0 && (st?.receivedCNY ?? 0) >= salesCNY - 0.01;
        const done = ratioOk || amountOk;
        const pct = done
          ? 100
          : st?.paidRatio !== undefined
            ? Math.min(100, Math.round(st.paidRatio * 10000) / 100)
            : 0;
        const color = done ? '#00a870' : saved > 0 ? '#e37318' : '#c4c9d4';
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '2px 0' }}>
            {/* 进度条 + 百分比 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ flex: 1, height: 8, background: '#eef1f6', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 4 }} />
              </div>
              <span style={{ fontSize: 12, fontWeight: 700, color, minWidth: 42, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                {pct}%
              </span>
            </div>
            {/* 状态 + 已收金额（一行） */}
            <div style={{ fontSize: 12, color: '#6b7588', display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <span style={{ color, fontWeight: 600 }}>{done ? '已收完' : saved > 0 ? '未收满' : '未录入'}</span>
              {saved > 0 && (
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                  已收 ¥{fmtMoney(st?.receivedCNY ?? 0)}
                  {(st?.unreceivedCNY ?? 0) > 0 && <> · 未收 ¥{fmtMoney(st?.unreceivedCNY ?? 0)}</>}
                </span>
              )}
            </div>
          </div>
        );
      },
    },
    {
      colKey: 'commission', title: '已分配提成（¥）', width: 120, align: 'right' as const,
      cell: ({ row }: { row: Contract }) => {
        const st = statusMap.get(row.contractNo);
        return <span style={{ color: '#0052d9', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(st?.commissionCNY ?? 0)}</span>;
      },
    },
    {
      colKey: 'op', title: '操作', width: 80, cell: ({ row }: { row: Contract }) => (
        <Button
          size="small"
          variant="text"
          theme="primary"
          onClick={() => navigate(`/contract-edit/${encodeURIComponent(row.contractNo)}`)}
        >
          修改
        </Button>
      ),
    },
  ];

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h2 className="page-title">合同管理</h2>
          <div className="page-subtitle">
            合同列表与收款进度总览；点「修改」进入独立编辑页，修改后自动同步到提成计算 / 统计（已保存的计算历史保持原快照）
          </div>
        </div>
      </div>

      {/* 合同列表（分页 + 搜索） */}
      <div className="section-card">
        <div className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span>合同列表（共 {total} 个）</span>
          <span style={{ fontSize: 12, color: '#9aa3b5' }}>
            {selectedRowKeys.length > 0 ? `已选 ${selectedRowKeys.length} 个合同` : '勾选后可导出所选合同明细'}
          </span>
          <Input
            value={keyword}
            onChange={(v) => setKeyword(String(v))}
            placeholder="搜索合同号 / 销售姓名"
            style={{ width: 200 }}
            clearable
            onEnter={applySearch}
          />
          <Button variant="outline" size="small" onClick={applySearch}>搜索</Button>
          <span style={{ flex: 1 }} />
          <Button
            size="small"
            variant="outline"
            disabled={contracts.length === 0}
            onClick={handleExport}
          >
            {selectedRowKeys.length > 0 ? `导出所选合同明细（${selectedRowKeys.length}）` : '导出全部合同明细'}
          </Button>
        </div>
        <Table
          className="table-responsive"
          rowKey="id"
          data={contracts}
          columns={columns}
          loading={loading}
          bordered
          hover
          stripe
          size="small"
          tableLayout="auto"
          empty={'暂无合同，请先到「合同录入」页创建'}
          selectedRowKeys={selectedRowKeys}
          onSelectChange={(keys) => setSelectedRowKeys(keys as Array<string | number>)}
          pagination={{ current: page, pageSize: PAGE_SIZE, total, showJumper: true }}
          onPageChange={(pageInfo) => setPage(pageInfo.current)}
        />
      </div>
    </div>
  );
}
