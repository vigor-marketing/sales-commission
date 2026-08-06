import type { CalculationResult, CalculateInput, Template } from '../types.js';
import { validateTemplate } from '../utils/validation.js';

/** 金额四舍五入到分（EPSILON 方向修正，避免 1.005×100=100.4999… 边界不进位） */
export function round2(n: number): number {
  const dir = n >= 0 ? Number.EPSILON : -Number.EPSILON;
  return Math.round((n + dir) * 100) / 100;
}

/**
 * 提成计算核心（纯函数，无副作用）。
 *
 * 公式：总提成 = (销售业绩(未税) - 销售费用) × 总提成比例
 * 总提成按岗位比例（权重）分配到各岗位，再聚合为流程节点小计。
 * 采用「按权重归一化」：无论节点/岗位比例之和是否为 100%，
 * 总提成始终被完整分配（不会超分/少分）。
 * 金额统一 round2，节点暴露 allocatedDiff（分位舍入差）。
 */
export function calculateCommission(
  input: CalculateInput,
  template: Template
): CalculationResult {
  const baseAmount = round2(input.salesAmount - input.salesCost);
  const totalCommission = round2(baseAmount * template.totalRate);

  // 计算总权重 = 全部岗位比例之和（权重可为任意正数）
  let totalWeight = 0;
  const nodePositionEntries: Array<{ node: Template['nodes'][number]; entries: Array<[string, number]> }> =
    template.nodes.map((node) => {
      const entries = Object.entries(node.positions);
      for (const [, ratio] of entries) {
        totalWeight += ratio;
      }
      return { node, entries };
    });
  const weight = totalWeight > 0 ? totalWeight : 1;

  // 岗位金额 = 总提成 × (岗位比例 / 总权重)
  // 全局尾差吸收：所有岗位按比例算出后，最后一个岗位吸收总提成与已分配之和的分位差，
  // 保证岗位分配总额恒等于总提成
  const allEntries: Array<{ nodeId: string; pos: string; ratio: number }> = [];
  const nodePositionsMap: Record<string, Record<string, number>> = {};
  for (const { node, entries } of nodePositionEntries) {
    const positions: Record<string, number> = {};
    let nodeAmount = 0;
    for (const [pos, ratio] of entries) {
      const amt = round2((totalCommission * ratio) / weight);
      positions[pos] = amt;
      nodeAmount += amt;
      allEntries.push({ nodeId: node.id, pos, ratio });
    }
    nodePositionsMap[node.id] = positions;
    // 节点小计按岗位金额求和（非直接吸收）
    void nodeAmount;
  }

  // 全局尾差吸收：最后一个岗位补差额，使岗位总额 = 总提成
  if (allEntries.length > 0) {
    const allocated = allEntries.reduce((sum, e) => sum + nodePositionsMap[e.nodeId][e.pos], 0);
    const diff = round2(totalCommission - allocated);
    const last = allEntries[allEntries.length - 1];
    nodePositionsMap[last.nodeId][last.pos] = round2(
      nodePositionsMap[last.nodeId][last.pos] + diff
    );
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

  // 岗位汇总
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
