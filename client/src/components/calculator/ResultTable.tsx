import { Table } from 'tdesign-react';
import type { CalculationResult } from '../../types';
import { fmtMoney, fmtPct } from '../../utils/format';

interface Props {
  result: CalculationResult;
}

interface Row {
  id: string;
  index: number;
  nodeName: string;
  nodeRatio: string;
  nodeAmount: string;
  [pos: string]: string | number;
}

export default function ResultTable({ result }: Props) {
  const positionOrder = result.settingsSnapshot.positionOrder;
  const positionPersons = result.positionPersons ?? {};

  const data: Row[] = result.nodeRows.map((row, idx) => {
    const rec: Row = {
      id: row.nodeId,
      index: idx + 1,
      nodeName: row.nodeName,
      nodeRatio: fmtPct(row.nodeRatio),
      nodeAmount: fmtMoney(row.nodeAmount),
    };
    for (const pos of positionOrder) {
      const v = row.positions[pos];
      rec[pos] = v === undefined || v === 0 ? '—' : fmtMoney(v);
    }
    return rec;
  });

  const columns = [
    {
      colKey: 'index',
      title: '#',
      width: 42,
      align: 'center' as const,
    },
    { colKey: 'nodeName', title: '流程节点', width: 180 },
    {
      colKey: 'nodeRatio',
      title: '节点比例',
      width: 80,
      align: 'right' as const,
      cell: ({ row }: { row: Row }) => (
        <span style={{ color: '#4a5568', fontWeight: 500 }}>{row.nodeRatio}</span>
      ),
    },
    ...positionOrder.map((pos) => {
      const person = positionPersons[pos];
      return {
        colKey: pos,
        title: person ? `${pos}（${person}）` : pos,
        width: 128,
        align: 'right' as const,
        cell: ({ row }: { row: Row }) => (
          <span style={row[pos] === '—' ? { color: '#c0c8d6' } : { color: '#333', fontVariantNumeric: 'tabular-nums' }}>
            {row[pos]}
          </span>
        ),
      };
    }),
    {
      colKey: 'nodeAmount',
      title: '节点小计',
      width: 116,
      align: 'right' as const,
      cell: ({ row }: { row: Row }) => (
        <span style={{ fontWeight: 600, color: '#1a1a1a' }}>{row.nodeAmount}</span>
      ),
    },
  ];

  const footerData: Row[] = [
    {
      id: 'summary',
      index: 0,
      nodeName: '岗位合计',
      nodeRatio: '100%',
      nodeAmount: fmtMoney(result.totalCommission),
      ...Object.fromEntries(
        positionOrder.map((pos) => [
          pos,
          (result.positionTotals[pos] ?? 0) === 0 ? '—' : fmtMoney(result.positionTotals[pos] ?? 0),
        ])
      ),
    },
  ];

  return (
    <div className="section-card">
      <div className="section-title">
        <span>提成明细（岗位 × 流程节点）</span>
        <span style={{ fontSize: 12, fontWeight: 400, color: '#9aa3b5' }}>
          数值单位：元（¥）
        </span>
      </div>
      <Table
        rowKey="id"
        data={data}
        columns={columns}
        bordered
        hover
        stripe
        size="medium"
        footData={footerData}
        tableLayout="fixed"
      />
    </div>
  );
}
