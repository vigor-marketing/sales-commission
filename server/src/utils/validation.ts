import type { Template } from '../types.js';

/** 浮点比较容差 */
const EPS = 1e-9;

function near(a: number, b: number): boolean {
  return Math.abs(a - b) < EPS;
}

/**
 * 校验单个表格模板的比例。
 *
 * 系统按「权重归一化」分配总提成：岗位金额 = 总提成 × 岗位比例 / 总权重。
 * 仅校验每个节点内"岗位比例之和 = 节点比例"以及数值范围是否合理。
 *
 * 返回警告列表（不阻断保存），空数组表示全部通过。
 */
export function validateTemplate(t: Template): string[] {
  const warnings: string[] = [];

  if (t.totalRate < 0 || t.totalRate > 1) {
    warnings.push(`模板「${t.name}」总提成比例 ${fmtPct(t.totalRate)} 超出合理范围 0%~100%`);
  }

  for (const node of t.nodes) {
    if (!node.name.trim()) {
      warnings.push(`模板「${t.name}」存在未命名的流程节点`);
    }
    if (node.nodeRatio < 0 || node.nodeRatio > 1) {
      warnings.push(`模板「${t.name}」节点「${node.name}」比例 ${fmtPct(node.nodeRatio)} 超出合理范围 0%~100%`);
    }

    let posSum = 0;
    for (const [pos, ratio] of Object.entries(node.positions)) {
      if (ratio < 0 || ratio > 1) {
        warnings.push(`模板「${t.name}」节点「${node.name}」岗位「${pos}」比例 ${fmtPct(ratio)} 超出合理范围 0%~100%`);
      }
      posSum += ratio;
    }
    if (!near(posSum, node.nodeRatio)) {
      warnings.push(
        `模板「${t.name}」节点「${node.name}」内岗位比例之和 ${fmtPct(posSum)} ≠ 节点比例 ${fmtPct(node.nodeRatio)}`
      );
    }
  }

  return warnings;
}

function fmtPct(v: number): string {
  return `${(v * 100).toFixed(2)}%`;
}
