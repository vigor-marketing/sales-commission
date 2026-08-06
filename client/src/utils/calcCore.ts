/**
 * 前端计算核心（与后端 services/calculator.ts + utils/validation.ts 同构）
 * 用于静态部署场景（无后端 API 时兜底计算）。
 */

import type { CalculationResult, CalculateInput, Settings, Template, FlowNode } from '../types';

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

const DEFAULT_POSITION_ORDER = [
  '运营人员',
  '销售人员',
  '销售主管',
  '项目管理人员',
  '技术人员',
  '总经理参与',
  '销售助理',
];

function defaultNodes(): FlowNode[] {
  return [
    { id: 'n1', name: '客户信息收集', nodeRatio: 0.05, positions: { 运营人员: 0.05 } },
    { id: 'n2', name: '筛选客户/项目洽谈', nodeRatio: 0.1, positions: { 销售人员: 0.1 } },
    { id: 'n3', name: '提交技术方案及确认', nodeRatio: 0.2, positions: { 销售人员: 0.1, 技术人员: 0.1 } },
    { id: 'n4', name: '难点，关系攻克', nodeRatio: 0.1, positions: { 销售人员: 0.02, 总经理参与: 0.08 } },
    { id: 'n5', name: '项目评审', nodeRatio: 0.08, positions: { 销售人员: 0.02, 技术人员: 0.03, 总经理参与: 0.03 } },
    { id: 'n6', name: '项目跟进-合同签订', nodeRatio: 0.3, positions: { 销售人员: 0.2, 销售主管: 0.1 } },
    { id: 'n7', name: '生产跟进-产品交付', nodeRatio: 0.12, positions: { 销售人员: 0.02, 技术人员: 0.08, 销售助理: 0.02 } },
    { id: 'n8', name: '验收-收款', nodeRatio: 0.1, positions: { 销售人员: 0.05, 项目管理人员: 0.05 } },
    { id: 'n9', name: '售后服务', nodeRatio: 0.05, positions: { 项目管理人员: 0.05 } },
  ];
}

/** 默认模板列表 */
export function defaultTemplates(): Template[] {
  return [
    {
      id: 'new-customer',
      name: '新客户提成计算表',
      totalRate: 0.02,
      nodes: defaultNodes(),
      positionOrder: [...DEFAULT_POSITION_ORDER],
      defaultRates: { CNY: 1, USD: 7.2, EUR: 7.8 },
    },
    {
      id: 'old-customer',
      name: '老客户提成计算表',
      totalRate: 0.02,
      nodes: defaultNodes().map((n) => ({ ...n, positions: { ...n.positions } })),
      positionOrder: [...DEFAULT_POSITION_ORDER],
      defaultRates: { CNY: 1, USD: 7.2, EUR: 7.8 },
    },
  ];
}

/** 默认设置 */
export function defaultSettings(): Settings {
  return {
    templates: defaultTemplates(),
    staffList: [],
  };
}

/** 取模板（按 id，缺省第一个） */
export function getTemplate(s: Settings, templateId?: string): Template {
  if (templateId) {
    const found = s.templates.find((t) => t.id === templateId);
    if (found) return found;
  }
  return s.templates[0] ?? defaultTemplates()[0];
}

/** 校验单个模板比例（与后端 validateTemplate 同构） */
export function validateTemplate(t: Template): string[] {
  const warnings: string[] = [];
  if (t.totalRate < 0 || t.totalRate > 1) {
    warnings.push(`模板「${t.name}」总提成比例 ${fmtPct(t.totalRate)} 超出合理范围 0%~100%`);
  }
  for (const node of t.nodes) {
    if (!node.name.trim()) warnings.push(`模板「${t.name}」存在未命名的流程节点`);
    if (node.nodeRatio < 0 || node.nodeRatio > 1) {
      warnings.push(`模板「${t.name}」节点「${node.name}」比例 ${fmtPct(node.nodeRatio)} 超出合理范围 0%~100%`);
    }
    let posSum = 0;
    for (const ratio of Object.values(node.positions)) posSum += ratio;
    if (Math.abs(posSum - node.nodeRatio) > 1e-9) {
      warnings.push(
        `模板「${t.name}」节点「${node.name}」内岗位比例之和 ${fmtPct(posSum)} ≠ 节点比例 ${fmtPct(node.nodeRatio)}`
      );
    }
  }
  return warnings;
}

/** 计算提成（与后端 calculateCommission 同构，接收模板） */
export function calculateCommission(
  input: CalculateInput,
  template: Template
): CalculationResult {
  const baseAmount = round2(input.salesAmount - input.salesCost);
  const totalCommission = round2(baseAmount * template.totalRate);

  let totalWeight = 0;
  const nodePositionEntries: Array<{ node: FlowNode; entries: Array<[string, number]> }> =
    template.nodes.map((node) => {
      const entries = Object.entries(node.positions);
      for (const [, ratio] of entries) totalWeight += ratio;
      return { node, entries };
    });
  const weight = totalWeight > 0 ? totalWeight : 1;

  const allEntries: Array<{ nodeId: string; pos: string }> = [];
  const nodePositionsMap: Record<string, Record<string, number>> = {};
  for (const { node, entries } of nodePositionEntries) {
    const positions: Record<string, number> = {};
    for (const [pos, ratio] of entries) {
      positions[pos] = round2((totalCommission * ratio) / weight);
      allEntries.push({ nodeId: node.id, pos });
    }
    nodePositionsMap[node.id] = positions;
  }

  if (allEntries.length > 0) {
    const allocated = allEntries.reduce((sum, e) => sum + nodePositionsMap[e.nodeId][e.pos], 0);
    const diff = round2(totalCommission - allocated);
    const last = allEntries[allEntries.length - 1];
    nodePositionsMap[last.nodeId][last.pos] = round2(nodePositionsMap[last.nodeId][last.pos] + diff);
  }

  const nodeRows = nodePositionEntries.map(({ node }) => {
    const positions = nodePositionsMap[node.id] ?? {};
    const nodeAmount = round2(Object.values(positions).reduce((a, b) => a + b, 0));
    const allocated = Object.values(positions).reduce((a, b) => a + b, 0);
    return {
      nodeId: node.id,
      nodeName: node.name,
      nodeRatio: node.nodeRatio,
      nodeAmount,
      positions,
      allocatedDiff: round2(nodeAmount - allocated),
    };
  });

  const positionTotals: Record<string, number> = {};
  for (const row of nodeRows) {
    for (const [pos, amt] of Object.entries(row.positions)) {
      positionTotals[pos] = round2((positionTotals[pos] ?? 0) + amt);
    }
  }

  return {
    salesAmount: input.salesAmount,
    salesCost: input.salesCost,
    baseAmount,
    totalCommission,
    settingsSnapshot: template,
    nodeRows,
    positionTotals,
    warnings: validateTemplate(template),
  };
}

function fmtPct(v: number): string {
  return `${(v * 100).toFixed(2)}%`;
}
