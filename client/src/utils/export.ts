/**
 * CSV 导出工具（UTF-8 BOM，Excel 可直接打开）
 * - 单条导出：完整明细矩阵（节点 × 岗位 + 汇总）
 * - 批量导出：所有记录汇总表（每条一行 + 岗位合计列）
 */

import type { HistoryRecord } from '../types';
import { fmtPct } from './format';

/** CSV 单元格数字格式：固定两位小数，不加千分位（避免与分隔符冲突） */
function csvNum(v: number): string {
  return v.toFixed(2);
}

/** 转义 CSV 单元格：含逗号/引号/换行时加引号包裹 */
function esc(v: string | number): string {
  const s = String(v);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** 触发浏览器下载 */
function download(filename: string, content: string): void {
  const blob = new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** 当前时间 → 文件名可用格式：20260803_1305 */
function nowFileTime(): string {
  const d = new Date();
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
}

/** 格式化历史时间戳为文件名可用格式：20260803_1305 */
function fileTime(createdAt: string): string {
  return createdAt.replace(/[-:]/g, '').replace(' ', '_');
}

/**
 * 单条记录导出：完整明细矩阵 CSV
 * 结构：
 *   [标题区] 销售提成计算明细
 *   计算时间, 2026-08-03 ...
 *   销售业绩（未税）, 1,000,000.00
 *   销售费用, 100,000.00
 *   提成基数, 900,000.00
 *   总提成（比例 2.00%）, 18,000.00
 *   [空行]
 *   流程节点, 节点比例, 岗位1, 岗位2, ..., 节点小计
 *   ...9 行明细...
 *   岗位合计, 100%, 8,345.44, ..., 18,000.00
 */
export function exportSingleRecord(rec: HistoryRecord): void {
  const r = rec.result;
  const positionOrder = r.settingsSnapshot.positionOrder;
  const lines: string[] = [];

  lines.push('销售提成计算明细');
  lines.push(`计算时间,${esc(rec.createdAt)}`);
  lines.push(`合同号,${esc(rec.contractNo || '')}`);
  lines.push(`姓名,${esc(rec.customerName || '')}`);
  // 岗位人员分配
  const positionPersons = rec.positionPersons ?? r.positionPersons ?? {};
  const assignedEntries = Object.entries(positionPersons).filter(([, n]) => n);
  if (assignedEntries.length > 0) {
    lines.push(`岗位人员,${esc(assignedEntries.map(([pos, n]) => `${pos}:${n}`).join('；'))}`);
  }
  if (rec.paymentPlan && rec.paymentPlan.length > 0) {
    lines.push('收款计划,');
    lines.push(`月份,币种,原币金额,汇率,人民币金额,是否已收`);
    for (const p of rec.paymentPlan) {
      lines.push(`${esc(p.month)},${esc(p.currency)},${esc(csvNum(p.amount))},${esc(csvNum(p.rate))},${esc(csvNum(p.amountCNY))},${p.received ? '已收' : '未收'}`);
    }
    lines.push('');
  }
  lines.push(`销售业绩（未税）,${esc(csvNum(r.salesAmount))}`);
  lines.push(`销售费用,${esc(csvNum(r.salesCost))}`);
  lines.push(`提成基数,${esc(csvNum(r.baseAmount))}`);
  lines.push(`总提成（比例 ${fmtPct(r.settingsSnapshot.totalRate)}）,${esc(csvNum(r.totalCommission))}`);
  if (r.warnings.length > 0) {
    lines.push(`提示,${esc(r.warnings.join('；'))}`);
  }
  lines.push('');

  // 明细表头（岗位列带负责人）
  lines.push(
    ['流程节点', '节点比例', ...positionOrder.map((pos) => (positionPersons[pos] ? `${pos}(${positionPersons[pos]})` : pos)), '节点小计']
      .map(esc)
      .join(',')
  );
  // 明细行
  for (const row of r.nodeRows) {
    const cells = [
      row.nodeName,
      fmtPct(row.nodeRatio),
      ...positionOrder.map((pos) => {
        const v = row.positions[pos];
        return v === undefined || v === 0 ? '' : csvNum(v);
      }),
      csvNum(row.nodeAmount),
    ];
    lines.push(cells.map(esc).join(','));
  }
  // 岗位合计行
  const sumCells = [
    '岗位合计',
    '100%',
    ...positionOrder.map((pos) => {
      const v = r.positionTotals[pos];
      return v === undefined || v === 0 ? '' : csvNum(v);
    }),
    csvNum(r.totalCommission),
  ];
  lines.push(sumCells.map(esc).join(','));

  download(`提成明细_${rec.id}_${fileTime(rec.createdAt)}.csv`, lines.join('\n'));
}

/**
 * 批量导出：所有历史记录汇总 CSV
 * 结构：ID, 计算时间, 合同号, 姓名, 收款状态, 销售业绩, 销售费用, 提成基数, 总提成, 岗位1合计, ..., 岗位N合计
 */
export function exportHistoryBatch(records: HistoryRecord[]): void {
  if (records.length === 0) {
    return;
  }
  // 取最近一条的岗位顺序（全量导出时按最新配置的岗位顺序展示）
  const positionOrder = records[0].result.settingsSnapshot.positionOrder;

  const header = [
    'ID',
    '计算时间',
    '合同号',
    '姓名',
    '收款状态',
    '销售业绩（未税）',
    '销售费用',
    '提成基数',
    '总提成',
    ...positionOrder,
  ];
  const lines = [header.map(esc).join(',')];

  for (const rec of records) {
    const r = rec.result;
    const receivedCount = (rec.paymentPlan ?? []).filter((p) => p.received).length;
    const planCount = (rec.paymentPlan ?? []).length;
    const cells = [
      rec.id,
      rec.createdAt,
      rec.contractNo || '',
      rec.customerName || '',
      planCount > 0 ? `已收${receivedCount}/${planCount}笔` : '无收款计划',
      csvNum(r.salesAmount),
      csvNum(r.salesCost),
      csvNum(r.baseAmount),
      csvNum(r.totalCommission),
      ...positionOrder.map((pos) => {
        const v = r.positionTotals[pos];
        return v === undefined || v === 0 ? '' : csvNum(v);
      }),
    ];
    lines.push(cells.map(esc).join(','));
  }

  download(`提成历史汇总_${records.length}条_${nowFileTime()}.csv`, lines.join('\n'));
}

/**
 * 导出收款统计（当前筛选结果）
 * 结构：合同号, 销售姓名, 收款月份, 币种, 原币金额, 汇率, 人民币金额, 收款状态, 计算时间
 */
export function exportPaymentsCSV(data: {
  list: Array<{
    contractNo: string;
    customerName: string;
    month: string;
    currency: string;
    amount: number;
    rate: number;
    amountCNY: number;
    received: boolean;
    planIndex?: number;
    createdAt: string;
  }>;
  summary?: { totalAmountCNY: number; count: number };
  month?: string;
}): void {
  const header = [
    '合同号',
    '收款笔次',
    '销售姓名',
    '收款月份',
    '币种',
    '原币金额',
    '汇率',
    '人民币金额（¥）',
    '收款状态',
    '计算时间',
  ];
  const lines = [header.map(esc).join(',')];

  for (const p of data.list) {
    const cells = [
      p.contractNo || '',
      p.planIndex ? `第${p.planIndex}笔` : '',
      p.customerName || '',
      p.month,
      p.currency,
      csvNum(p.amount),
      p.currency === 'CNY' ? '' : csvNum(p.rate),
      csvNum(p.amountCNY),
      p.received ? '已收' : '未收',
      p.createdAt || '',
    ];
    lines.push(cells.map(esc).join(','));
  }

  if (data.summary) {
    lines.push('');
    lines.push(`合计,${esc(`${data.summary.count} 笔`)}`);
    lines.push(`人民币合计,${esc(csvNum(data.summary.totalAmountCNY))}`);
  }

  download(`收款统计_${data.month || '全部'}_${nowFileTime()}.csv`, lines.join('\n'));
}


/**
 * 合同明细导出 CSV：对应「合同录入」表单的全部合同信息
 * 每合同多行：合同信息主行 + 每条费用 + 每笔收款计划 + 每个岗位人员，逐行展开，Excel 可读
 */
export function exportContractsCSV(
  list: Array<{
    contractNo: string;
    customerName: string;
    templateId: string;
    salesCurrency: string;
    salesAmountOrig: number;
    salesRate: number;
    salesFees: Array<{ name?: string; currency: string; amount: number; amountCNY: number }>;
    paymentPlan: Array<{ month: string; currency: string; amount: number; rate: number; amountCNY: number; received?: boolean; ratio?: number }>;
    positionPersons: Record<string, string>;
    totalPlanCount: number;
    updatedAt?: string;
  }>,
  templateNames: Record<string, string>
): void {
  const header = ['合同号', '销售姓名', '表格类型', '类别', '明细内容'];
  const lines = [header.map(esc).join(',')];

  for (const c of list) {
    const salesCNY = (c.salesCurrency === 'CNY' ? 1 : c.salesRate || 1) * c.salesAmountOrig;
    const templateName = templateNames[c.templateId] ?? c.templateId ?? '';
    const main = [
      c.contractNo,
      c.customerName,
      templateName,
      '合同信息',
      `销售业绩 ${csvNum(c.salesAmountOrig)} ${c.salesCurrency}${c.salesCurrency !== 'CNY' ? ' × ' + csvNum(c.salesRate || 1) : ''} = ¥ ${csvNum(Math.round(salesCNY * 100) / 100)}；计划 ${c.totalPlanCount ?? c.paymentPlan.length} 笔；更新时间 ${c.updatedAt ?? ''}`,
    ].map(esc).join(',');
    lines.push(main);

    // 费用：每条一行
    for (const f of c.salesFees) {
      lines.push(
        [
          c.contractNo, '', '', '费用',
          `${f.name ?? ''} ${f.currency} ${csvNum(f.amount)} = ¥ ${csvNum(f.amountCNY)}`,
        ].map(esc).join(',')
      );
    }
    // 收款计划：每笔一行
    c.paymentPlan.forEach((p, i) => {
      const ratioTxt = p.ratio !== undefined ? `${csvNum(p.ratio * 100)}% ` : '';
      lines.push(
        [
          c.contractNo, '', '', '收款计划',
          `第${i + 1}笔 ${p.month} ${ratioTxt}${p.currency} ${csvNum(p.amount)} × ${csvNum(p.rate)} = ¥ ${csvNum(p.amountCNY)}`,
        ].map(esc).join(',')
      );
    });
    // 岗位人员：每个岗位一行
    for (const [pos, name] of Object.entries(c.positionPersons || {})) {
      lines.push([c.contractNo, '', '', '岗位人员', `${pos}: ${name}`].map(esc).join(','));
    }
  }

  download('合同明细_' + nowFileTime() + '.csv', lines.join('\n'));
}
