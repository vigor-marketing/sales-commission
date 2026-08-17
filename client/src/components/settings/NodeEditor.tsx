import { Table, Input, InputNumber, Button } from 'tdesign-react';
import type { FlowNode } from '../../types';
import { fmtPct } from '../../utils/format';

interface Props {
  nodes: FlowNode[];
  positionOrder: string[];
  onChange: (nodes: FlowNode[], positionOrder: string[]) => void;
}

export default function NodeEditor({ nodes, positionOrder, onChange }: Props) {
  const updateNode = (nodeId: string, patch: Partial<FlowNode>) => {
    onChange(
      nodes.map((n) => (n.id === nodeId ? { ...n, ...patch } : n)),
      positionOrder
    );
  };

  const updatePosition = (nodeId: string, pos: string, value: number) => {
    onChange(
      nodes.map((n) => {
        if (n.id !== nodeId) return n;
        return { ...n, positions: { ...n.positions, [pos]: value } };
      }),
      positionOrder
    );
  };

  const removeNode = (nodeId: string) => {
    onChange(
      nodes.filter((n) => n.id !== nodeId),
      positionOrder
    );
  };

  const data = nodes.map((n) => {
    const posSum = Object.values(n.positions).reduce((a, b) => a + b, 0);
    const ok = Math.abs(posSum - n.nodeRatio) < 1e-9;
    return {
      id: n.id,
      name: n.name,
      nodeRatio: n.nodeRatio,
      positions: n.positions,
      posSum,
      ok,
    };
  });

  const columns = [
    {
      colKey: 'name',
      title: '流程节点',
      width: 170,
      cell: ({ row }: { row: (typeof data)[number] }) => (
        <Input
          value={row.name}
          className="node-name-input"
          onChange={(v) => updateNode(row.id, { name: String(v) })}
        />
      ),
    },
    {
      colKey: 'nodeRatio',
      title: '节点比例(%)',
      width: 120,
      cell: ({ row }: { row: (typeof data)[number] }) => (
        <InputNumber
          value={row.nodeRatio * 100}
          className="ratio-input"
          min={0}
          max={100}
          step={0.1}
          theme="column"
          onChange={(v) => {
            const num = Number(v);
            if (!Number.isNaN(num)) updateNode(row.id, { nodeRatio: num / 100 });
          }}
        />
      ),
    },
    ...positionOrder.map((pos) => ({
      colKey: `pos_${pos}`,
      title: pos,
      width: 100,
      align: 'center' as const,
      cell: ({ row }: { row: (typeof data)[number] }) => (
        <InputNumber
          value={(row.positions[pos] ?? 0) * 100}
          className="ratio-input"
          min={0}
          max={100}
          step={0.1}
          theme="column"
          onChange={(v) => {
            const num = Number(v);
            if (!Number.isNaN(num)) updatePosition(row.id, pos, num / 100);
          }}
        />
      ),
    })),
    {
      colKey: 'status',
      title: '平衡校验',
      width: 90,
      align: 'center' as const,
      cell: ({ row }: { row: (typeof data)[number] }) => (
        <span className={`status-dot ${row.ok ? 'ok' : 'warn'}`}>
          <span className="dot" />
          {row.ok ? '平衡' : `差 ${fmtPct(Math.abs(row.posSum - row.nodeRatio))}`}
        </span>
      ),
    },
    {
      colKey: 'op',
      title: '操作',
      width: 60,
      align: 'center' as const,
      cell: ({ row }: { row: (typeof data)[number] }) => (
        <Button
          size="small"
          variant="text"
          theme="danger"
          disabled={nodes.length <= 1}
          onClick={() => removeNode(row.id)}
        >
          删除
        </Button>
      ),
    },
  ];

  return (
    <Table
      rowKey="id"
      data={data}
      columns={columns}
      bordered
      hover
      stripe
      size="medium"
      className="settings-table table-responsive"
      tableLayout="auto"
    />
  );
}
