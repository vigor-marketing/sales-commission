import { useEffect, useState, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Table, Button, Popconfirm, MessagePlugin } from 'tdesign-react';
import type { Contract, Settings, FeeName, HistoryRecord } from '../types';
import { getContracts, upsertContract, deleteContract } from '../api/contracts';
import { getFeeNames } from '../api/feeNames';
import { getSettings } from '../api/settings';
import { getCommissionPersons } from '../api/commissions';
import { getHistory } from '../api/history';
import { fmtMoney } from '../utils/format';
import { exportContractsCSV } from '../utils/export';
import ContractForm from '../components/contracts/ContractForm';

function emptyContract(): Omit<Contract, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    contractNo: '',
    customerName: '',
    templateId: '',
    salesCurrency: 'USD',
    salesAmountOrig: 0,
    salesRate: 7.2,
    salesFees: [],
    paymentPlan: [],
    positionPersons: {},
    totalPlanCount: 1,
  };
}

/** 每个合同的关联情况（从计算历史聚合） */
interface ContractStatus {
  savedCount: number;
  receivedCNY: number;
  unreceivedCNY: number;
  commissionCNY: number;
  /** 累计收款比例（各笔 ratio 之和，小数 0~1） */
  paidRatio: number;
}

/** 合同管理页：合同列表（含收款进度/提成情况）+ 修改（保存后同步到其他部分） */
export default function ContractsManagePage() {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [feeNames, setFeeNames] = useState<FeeName[]>([]);
  const [persons, setPersons] = useState<string[]>([]);
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [active, setActive] = useState<Omit<Contract, 'id' | 'createdAt' | 'updatedAt'>>(emptyContract());
  const [editingNo, setEditingNo] = useState<string>('');
  // 多选导出：选中的合同 id 集合（空 = 导出全部）
  const [selectedRowKeys, setSelectedRowKeys] = useState<Array<string | number>>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, s, fns, p, h] = await Promise.all([
        getContracts(),
        getSettings(),
        getFeeNames(),
        getCommissionPersons(),
        getHistory(1, 10000),
      ]);
      setContracts(list);
      if (s) setSettings(s);
      setFeeNames(fns);
      setPersons(p);
      setHistory(h.list);
    } catch (e) {
      MessagePlugin.error(e instanceof Error ? e.message : '加载合同失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const personOptions = [...new Set([...persons, ...(settings?.staffList ?? [])])];

  /** 按合同聚合历史情况 */
  const statusMap = new Map<string, ContractStatus>();
  for (const r of history) {
    const key = r.contractNo;
    const cur = statusMap.get(key) ?? { savedCount: 0, receivedCNY: 0, unreceivedCNY: 0, commissionCNY: 0, paidRatio: 0 };
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
    statusMap.set(key, cur);
  }

  const existingContractNos = useMemo(
    () => new Set((contracts ?? []).map((c) => c.contractNo).filter(Boolean)),
    [contracts]
  );

  const handleSelect = (c: Contract) => {
    setEditingNo(c.contractNo);
    setActive({
      contractNo: c.contractNo,
      customerName: c.customerName,
      templateId: c.templateId,
      salesCurrency: c.salesCurrency,
      salesAmountOrig: c.salesAmountOrig,
      salesRate: c.salesRate,
      salesFees: c.salesFees,
      paymentPlan: c.paymentPlan,
      positionPersons: c.positionPersons,
      totalPlanCount: c.totalPlanCount,
    });
  };

  const handleNew = () => {
    setEditingNo('');
    setActive(emptyContract());
  };

  /** 保存修改：只更新合同主数据（contracts 表），计算历史快照不动 */
  const handleSave = async () => {
    if (!active.contractNo.trim()) {
      MessagePlugin.warning('请输入合同号');
      return;
    }
    if (!active.customerName.trim()) {
      MessagePlugin.warning('请输入销售姓名');
      return;
    }
    if (active.salesAmountOrig < 0) {
      MessagePlugin.warning('业绩金额必须 ≥ 0');
      return;
    }
    setSaving(true);
    try {
      // 修改模式：携带原合同号，后端允许更新自身（合同号唯一性由后端校验）
      const saved = await upsertContract({ ...active, originalContractNo: editingNo });
      MessagePlugin.success(`已更新合同 ${saved.contractNo}，已同步到提成计算/统计`);
      setEditingNo(saved.contractNo);
      await load();
    } catch (e) {
      MessagePlugin.error(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!editingNo) return;
    try {
      await deleteContract(editingNo);
      MessagePlugin.success(`已删除合同 ${editingNo}`);
      handleNew();
      await load();
    } catch (e) {
      MessagePlugin.error(e instanceof Error ? e.message : '删除失败');
    }
  };

  const columns = [
    { colKey: 'row-select', type: 'multiple' as const, width: 46 },
    { colKey: 'contractNo', title: '合同号', width: 130, cell: ({ row }: { row: Contract }) => <Link to={`/contract-detail/${encodeURIComponent(row.contractNo)}`} style={{ color: '#0052d9', fontWeight: 600 }}>{row.contractNo}</Link> },
    { colKey: 'customerName', title: '销售姓名', width: 90, cell: ({ row }: { row: Contract }) => row.customerName },
    { colKey: 'salesAmount', title: '业绩', width: 120, align: 'right' as const, cell: ({ row }: { row: Contract }) => `${row.salesAmountOrig.toLocaleString()} ${row.salesCurrency}` },
    { colKey: 'fees', title: '费用（¥）', width: 100, align: 'right' as const, cell: ({ row }: { row: Contract }) => fmtMoney(row.salesFees.reduce((s, f) => s + (f.amountCNY || 0), 0)) },
    {
      colKey: 'plan', title: '收款进度', width: 200, cell: ({ row }: { row: Contract }) => {
        const st = statusMap.get(row.contractNo);
        const saved = st?.savedCount ?? 0;
        const total = row.totalPlanCount ?? 1;
        // 收完判定：累计收款比例 = 100%（多笔累加 = 合同金额）；旧数据无 ratio 时用已收金额 ≈ 合同业绩人民币
        const salesCNY =
          (row.salesCurrency === 'CNY' ? 1 : row.salesRate) * row.salesAmountOrig;
        const ratioOk = (st?.paidRatio ?? 0) >= 0.9999;
        const amountOk = salesCNY > 0 && (st?.receivedCNY ?? 0) >= salesCNY - 0.01;
        const done = ratioOk || amountOk;
        const paidPct = st?.paidRatio !== undefined ? Math.min(100, Math.round(st.paidRatio * 10000) / 100) : null;
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ color: done ? '#00a870' : (saved > 0 ? '#e37318' : '#9aa3b5') }}>
                已录 {saved}/{total} 笔
              </span>
              {paidPct !== null && (
                <span style={{ color: done ? '#00a870' : '#e37318', fontWeight: 600 }}>
                  累计收款 {paidPct.toFixed(1)}%
                </span>
              )}
              {done ? (
                <span className="tag-currency tag-CNY">已收完</span>
              ) : (
                saved > 0 && <span className="tag-currency tag-EUR">未收满</span>
              )}
            </div>
            {saved > 0 && (
              <span style={{ color: '#6b7588' }}>
                收 ¥{fmtMoney(st?.receivedCNY ?? 0)} / 未收 ¥{fmtMoney(st?.unreceivedCNY ?? 0)}
              </span>
            )}
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
        <Button size="small" variant="text" theme="primary" onClick={() => handleSelect(row)}>修改</Button>
      ),
    },
  ];

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h2 className="page-title">合同管理</h2>
          <div className="page-subtitle">
            合同列表与收款进度总览；修改合同后自动同步到提成计算 / 统计（已保存的计算历史保持原快照）
          </div>
        </div>
      </div>

      {/* 合同列表（含关联情况） */}
      <div className="section-card">
        <div className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span>合同列表（{contracts.length}）</span>
          <span style={{ fontSize: 12, color: '#9aa3b5' }}>
            {selectedRowKeys.length > 0 ? `已选 ${selectedRowKeys.length} 个合同` : '勾选后可导出所选合同明细'}
          </span>
          <span style={{ flex: 1 }} />
          <Button
            size="small"
            variant="outline"
            disabled={contracts.length === 0}
            onClick={() => {
              const names: Record<string, string> = {};
              for (const t of settings?.templates ?? []) names[t.id] = t.name;
              // 勾选导出所选；未勾选导出全部（均为合同明细，13 列全字段）
              const selected =
                selectedRowKeys.length > 0
                  ? contracts.filter((c) => selectedRowKeys.includes(c.id))
                  : contracts;
              exportContractsCSV(selected, names);
            }}
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
          empty={'暂无合同，请先到「合同录入」页创建'}
          selectedRowKeys={selectedRowKeys}
          onSelectChange={(keys) => setSelectedRowKeys(keys as Array<string | number>)}
        />
      </div>

      {/* 修改合同 */}
      <div className="section-card">
        <div className="section-title">
          <span>{editingNo ? `修改合同：${editingNo}` : '选择合同进行修改'}</span>
          {editingNo && <Button size="small" variant="text" onClick={handleNew}>取消修改</Button>}
        </div>
        {editingNo ? (
          <>
            <ContractForm
              active={active}
              onChange={setActive}
              settings={settings}
              feeNames={feeNames}
              onFeeNamesChange={setFeeNames}
              personOptions={personOptions}
              editing
              existingContractNos={existingContractNos}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16 }}>
              <Button theme="primary" loading={saving} onClick={handleSave} style={{ minWidth: 160 }}>
                保存修改（同步到其他部分）
              </Button>
              <Popconfirm content="确认删除该合同？" onConfirm={handleDelete}>
                <Button variant="outline" theme="danger">删除该合同</Button>
              </Popconfirm>
              <span style={{ fontSize: 12, color: '#9aa3b5', whiteSpace: 'nowrap' }}>
                修改后提成计算页带出的合同信息将同步更新；已保存的历史记录不重算
              </span>
            </div>
          </>
        ) : (
          <div style={{ color: '#9aa3b5', fontSize: 13, padding: '24px 0', textAlign: 'center' }}>
            点击上方列表中的「修改」按钮编辑合同
          </div>
        )}
      </div>
    </div>
  );
}
