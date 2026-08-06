import { useEffect, useState, useCallback } from 'react';
import { Table, Button, Popconfirm, Select, MessagePlugin } from 'tdesign-react';
import type { HistoryRecord, Settings } from '../../types';
import { getHistory, deleteHistory } from '../../api/history';
import { getSettings } from '../../api/settings';
import { getCommissionPersons } from '../../api/commissions';
import { fmtMoney } from '../../utils/format';
import { exportSingleRecord, exportHistoryBatch } from '../../utils/export';

interface Props {
  version: number;
}

export default function HistoryTable({ version }: Props) {
  const [list, setList] = useState<HistoryRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [persons, setPersons] = useState<string[]>([]);
  // 逐级筛选：先销售姓名，再该姓名的合同
  const [filterSales, setFilterSales] = useState('');
  const [filterContract, setFilterContract] = useState('');
  // 选择：单选 / 多选
  const [selectMode, setSelectMode] = useState<'single' | 'multiple'>('multiple');
  const [selectedRowKeys, setSelectedRowKeys] = useState<Array<string | number>>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getHistory(1, 10000);
      setList(res.list);
      setTotal(res.total);
    } catch (e) {
      MessagePlugin.error(e instanceof Error ? e.message : '加载历史失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    getSettings().then(setSettings).catch(() => setSettings(null));
    getCommissionPersons().then(setPersons).catch(() => setPersons([]));
  }, [version, load]);

  const staffList = settings?.staffList ?? [];
  const personOptions = [...new Set([...persons, ...staffList])];
  // 第二级：所选销售姓名的合同
  const contractOptions = [
    ...new Set(
      list
        .filter((r) => !filterSales || (r.customerName ?? '') === filterSales)
        .map((r) => r.contractNo)
        .filter(Boolean)
    ),
  ].sort();

  // 筛选后的记录
  const filtered = list.filter((r) => {
    if (filterSales && (r.customerName ?? '') !== filterSales) return false;
    if (filterContract && (r.contractNo ?? '') !== filterContract) return false;
    return true;
  });

  const selectedRecords = list.filter((r) => selectedRowKeys.includes(r.id));

  const handleDelete = async (id: number) => {
    try {
      await deleteHistory(id);
      MessagePlugin.success('已删除');
      load();
    } catch (e) {
      MessagePlugin.error(e instanceof Error ? e.message : '删除失败');
    }
  };

  /** 批量删除选中 */
  const handleDeleteSelected = async () => {
    try {
      for (const id of selectedRowKeys) {
        await deleteHistory(Number(id));
      }
      MessagePlugin.success(`已删除 ${selectedRowKeys.length} 条记录`);
      setSelectedRowKeys([]);
      load();
    } catch (e) {
      MessagePlugin.error(e instanceof Error ? e.message : '批量删除失败');
    }
  };

  /** 导出选中（多选：批量汇总；单选：该条完整明细） */
  const handleExportSelected = () => {
    if (selectedRecords.length === 0) {
      MessagePlugin.warning('请先勾选要导出的记录');
      return;
    }
    if (selectedRecords.length === 1) {
      exportSingleRecord(selectedRecords[0]);
    } else {
      exportHistoryBatch(selectedRecords);
    }
    MessagePlugin.success(`已导出 ${selectedRecords.length} 条记录`);
  };

  const handleExportFiltered = () => {
    if (filtered.length === 0) {
      MessagePlugin.warning('当前筛选条件下无记录可导出');
      return;
    }
    exportHistoryBatch(filtered);
    MessagePlugin.success(`已导出筛选结果 ${filtered.length} 条记录`);
  };

  const handleExportBatch = () => {
    if (list.length === 0) {
      MessagePlugin.warning('暂无历史记录可导出');
      return;
    }
    exportHistoryBatch(list);
    MessagePlugin.success(`已导出 ${list.length} 条记录`);
  };

  const handleExportOne = (rec: HistoryRecord) => {
    exportSingleRecord(rec);
    MessagePlugin.success(`已导出记录 #${rec.id}`);
  };

  const handleExportByContract = (rec: HistoryRecord) => {
    if (!rec.contractNo) {
      MessagePlugin.warning('该记录无合同号，无法按合同导出');
      return;
    }
    const sameContract = list.filter((r) => r.contractNo === rec.contractNo);
    if (sameContract.length === 1) {
      exportSingleRecord(sameContract[0]);
    } else {
      exportHistoryBatch(sameContract);
    }
    MessagePlugin.success(`已导出合同「${rec.contractNo}」的 ${sameContract.length} 条记录（含所有款项）`);
  };

  /** 切换选择模式：清空已选 */
  const handleModeChange = (mode: 'single' | 'multiple') => {
    setSelectMode(mode);
    setSelectedRowKeys([]);
  };

  const columns = [
    {
      colKey: 'row-select',
      type: selectMode as 'single' | 'multiple',
      width: 46,
    },
    { colKey: 'id', title: 'ID', width: 52, align: 'center' as const },
    {
      colKey: 'contractNo',
      title: '合同号',
      width: 110,
      cell: ({ row }: { row: HistoryRecord }) => (
        <span style={{ fontWeight: 600 }}>{row.contractNo || '—'}</span>
      ),
    },
    {
      colKey: 'customerName',
      title: '销售姓名',
      width: 90,
      cell: ({ row }: { row: HistoryRecord }) => row.customerName || '—',
    },
    {
      colKey: 'plan',
      title: '收款笔次',
      width: 110,
      align: 'center' as const,
      cell: ({ row }: { row: HistoryRecord }) => {
        const total = row.totalPlanCount ?? 1;
        const idx = row.planIndex ?? 1;
        const left = Math.max(0, total - idx);
        const isFull = total === 1;
        return isFull ? (
          <span className="tag-currency tag-CNY">全款</span>
        ) : (
          <span style={{ color: '#4a5568', fontSize: 13, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
            第{idx}笔 / 共{total}笔 / 剩{left}笔
          </span>
        );
      },
    },
    {
      colKey: 'commission',
      title: '这笔提成（¥）',
      width: 120,
      align: 'right' as const,
      cell: ({ row }: { row: HistoryRecord }) => (
        <span style={{ color: '#0052d9', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
          {fmtMoney(row.commission ?? row.totalCommission)}
        </span>
      ),
    },
    {
      colKey: 'totalCommission',
      title: '合同总提成',
      width: 110,
      align: 'right' as const,
      cell: ({ row }: { row: HistoryRecord }) => (
        <span style={{ color: '#4a5568', fontVariantNumeric: 'tabular-nums' }}>
          {fmtMoney(row.contractTotalCommission ?? row.totalCommission)}
        </span>
      ),
    },
    {
      colKey: 'salesAmount',
      title: '业绩（人民币）',
      width: 120,
      align: 'right' as const,
      cell: ({ row }: { row: HistoryRecord }) => fmtMoney(row.salesAmount),
    },
    {
      colKey: 'salesCost',
      title: '费用',
      width: 100,
      align: 'right' as const,
      cell: ({ row }: { row: HistoryRecord }) => fmtMoney(row.salesCost),
    },
    {
      colKey: 'createdAt',
      title: '计算时间',
      width: 155,
      cell: ({ row }: { row: HistoryRecord }) => (
        <span style={{ color: '#6b7588', fontSize: 13 }}>{row.createdAt}</span>
      ),
    },
    {
      colKey: 'op',
      title: '操作',
      width: 280,
      cell: ({ row }: { row: HistoryRecord }) => (
        <div className="history-actions">
          <Button size="small" variant="outline" onClick={() => handleExportOne(row)}>
            单条导出
          </Button>
          <Button size="small" variant="outline" theme="primary" onClick={() => handleExportByContract(row)}>
            按合同导出
          </Button>
          <Popconfirm content="确认删除该条历史记录？" onConfirm={() => handleDelete(row.id)}>
            <Button size="small" variant="outline" theme="danger">
              删除
            </Button>
          </Popconfirm>
        </div>
      ),
    },
  ];

  return (
    <div className="section-card">
      <div className="section-title">
        <span>计算历史</span>
        <div className="toolbar">
          {total > 0 && (
            <span style={{ fontSize: 12, fontWeight: 400, color: '#9aa3b5', marginRight: 4 }}>
              共 {total} 条记录{filtered.length !== total ? `（筛选后 ${filtered.length} 条）` : ''}
            </span>
          )}
          <Button
            size="small"
            variant={selectMode === 'multiple' ? 'outline' : 'text'}
            theme={selectMode === 'multiple' ? 'primary' : 'default'}
            onClick={() => handleModeChange('multiple')}
          >
            多选
          </Button>
          <Button
            size="small"
            variant={selectMode === 'single' ? 'outline' : 'text'}
            theme={selectMode === 'single' ? 'primary' : 'default'}
            onClick={() => handleModeChange('single')}
          >
            单选
          </Button>
          {selectedRowKeys.length > 0 && (
            <span style={{ fontSize: 12, color: '#0052d9', fontWeight: 600 }}>
              已选 {selectedRowKeys.length} 条
            </span>
          )}
          <Button
            size="small"
            theme="primary"
            variant="outline"
            disabled={selectedRowKeys.length === 0}
            onClick={handleExportSelected}
          >
            导出选中
          </Button>
          <Popconfirm
            content={`确认删除选中的 ${selectedRowKeys.length} 条记录？`}
            onConfirm={handleDeleteSelected}
          >
            <Button size="small" variant="outline" theme="danger" disabled={selectedRowKeys.length === 0}>
              删除选中
            </Button>
          </Popconfirm>
          <Button size="small" theme="primary" variant="outline" onClick={handleExportFiltered} disabled={filtered.length === 0}>
            导出当前筛选
          </Button>
          <Button size="small" variant="outline" onClick={handleExportBatch} disabled={list.length === 0}>
            导出全部
          </Button>
        </div>
      </div>

      {/* 逐级筛选：先销售姓名 → 再该姓名的合同 */}
      <div className="filter-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="filter-label">① 销售姓名</span>
          <Select
            value={filterSales}
            onChange={(v) => {
              setFilterSales(String(v ?? ''));
              setFilterContract(''); // 切人员后重置合同
              setSelectedRowKeys([]);
            }}
            style={{ width: 170 }}
            filterable
            creatable
            clearable
            placeholder={personOptions.length > 0 ? `全部销售（${personOptions.length} 人）` : '全部销售'}
            options={personOptions.map((n) => ({ value: n, label: n }))}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="filter-label">② 合同号</span>
          <Select
            value={filterContract}
            onChange={(v) => {
              setFilterContract(String(v ?? ''));
              setSelectedRowKeys([]);
            }}
            style={{ width: 170 }}
            filterable
            clearable
            placeholder={filterSales ? `该销售的合同（${contractOptions.length} 个）` : '先选销售姓名再筛合同'}
            disabled={!filterSales}
            options={contractOptions.map((c) => ({ value: c, label: c }))}
          />
        </div>
        {(filterContract || filterSales) && (
          <Button size="small" variant="text" onClick={() => { setFilterContract(''); setFilterSales(''); setSelectedRowKeys([]); }}>
            清除筛选
          </Button>
        )}
      </div>

      <Table
        rowKey="id"
        data={filtered}
        columns={columns}
        loading={loading}
        bordered
        hover
        stripe
        size="small"
        tableLayout="fixed"
        selectedRowKeys={selectedRowKeys}
        onSelectChange={(keys) => setSelectedRowKeys(keys)}
        empty={'暂无计算历史，录入收款并保存后自动生成'}
      />
      <div style={{ marginTop: 12, fontSize: 12, color: '#9aa3b5' }}>
        提示：多选模式可勾选多条批量导出/删除；单选模式点击行选中一条。
      </div>
    </div>
  );
}
