/**
 * 提成计算核心测试（金钱逻辑，必须回归保护）
 * 覆盖：基本公式（手册 5.7.3.3）、岗位分配尾差吸收、两位小数精度、权重归一化、边界
 */
import { describe, it, expect } from 'vitest';
import { calculateCommission, round2 } from './calculator.js';
import type { Template } from '../types.js';

/** 构造测试模板：2 节点 × 3 岗位（比例故意非 100%，验证归一化） */
function makeTemplate(overrides?: Partial<Template>): Template {
  return {
    id: 'test',
    name: '测试表',
    totalRate: 0.02,
    nodes: [
      {
        id: 'n1',
        name: '节点一',
        nodeRatio: 0.5,
        positions: { 销售人员: 0.06, 技术人员: 0.04 },
      },
      {
        id: 'n2',
        name: '节点二',
        nodeRatio: 0.5,
        positions: { 项目经理: 0.03, 技术人员: 0.02 },
      },
    ],
    positionOrder: ['销售人员', '技术人员', '项目经理'],
    defaultRates: { CNY: 1, USD: 7.2, EUR: 7.8 },
    ...overrides,
  };
}

describe('round2 两位小数', () => {
  it('四舍五入到分', () => {
    expect(round2(13500.005)).toBe(13500.01);
    expect(round2(0.1 + 0.2)).toBe(0.3);
    expect(round2(1.004)).toBe(1.0);
    expect(round2(1.005)).toBe(1.01);
  });

  it('负值也正确舍入', () => {
    expect(round2(-1.005)).toBe(-1.01);
    expect(round2(-1.004)).toBe(-1.0);
  });
});

describe('基本公式：总提成 =（业绩 − 费用）× 总比例（手册 5.7.3.3）', () => {
  it('业绩 ¥725,000 − 费用 ¥50,000 = 基数 ¥675,000 × 2% = ¥13,500', () => {
    const r = calculateCommission({ salesAmount: 725000, salesCost: 50000 }, makeTemplate());
    expect(r.baseAmount).toBe(675000);
    expect(r.totalCommission).toBe(13500);
  });

  it('无费用：业绩 × 比例', () => {
    const r = calculateCommission({ salesAmount: 100000, salesCost: 0 }, makeTemplate());
    expect(r.baseAmount).toBe(100000);
    expect(r.totalCommission).toBe(2000);
  });

  it('零业绩零费用 → 0', () => {
    const r = calculateCommission({ salesAmount: 0, salesCost: 0 }, makeTemplate());
    expect(r.baseAmount).toBe(0);
    expect(r.totalCommission).toBe(0);
    expect(r.nodeRows.reduce((s, n) => s + n.nodeAmount, 0)).toBe(0);
  });

  it('费用大于业绩 → 负基数负提成（不阻断，由业务层拦截）', () => {
    const r = calculateCommission({ salesAmount: 1000, salesCost: 2000 }, makeTemplate());
    expect(r.baseAmount).toBe(-1000);
    expect(r.totalCommission).toBe(-20);
  });
});

describe('岗位分配：尾差吸收保证岗位总额 = 总提成', () => {
  it('各岗位金额之和恒等于总提成（含分位误差）', () => {
    const cases = [
      { salesAmount: 725000, salesCost: 50000 },
      { salesAmount: 999999.99, salesCost: 123.45 },
      { salesAmount: 0.01, salesCost: 0 },
      { salesAmount: 100000000, salesCost: 1 },
    ];
    for (const c of cases) {
      const r = calculateCommission(c, makeTemplate());
      const posSum = round2(
        Object.values(r.positionTotals).reduce((a, b) => a + b, 0)
      );
      expect(posSum).toBe(r.totalCommission);
      // 每个岗位金额都是两位小数
      for (const amt of Object.values(r.positionTotals)) {
        expect(Math.round(amt * 100) / 100).toBe(amt);
      }
    }
  });

  it('节点小计 = 该节点岗位金额之和（节点 allocatedDiff 恒 0）', () => {
    const r = calculateCommission({ salesAmount: 725000, salesCost: 50000 }, makeTemplate());
    for (const row of r.nodeRows) {
      const posSum = round2(Object.values(row.positions).reduce((a, b) => a + b, 0));
      expect(row.nodeAmount).toBe(posSum);
      expect(row.allocatedDiff).toBe(0);
    }
  });

  it('岗位比例之和非 100%（此处 15%）→ 权重归一化，总提成仍完整分配', () => {
    const r = calculateCommission({ salesAmount: 675000, salesCost: 0 }, makeTemplate());
    // 岗位比例和 = 0.06+0.04+0.03+0.02 = 0.15
    const posSum = round2(Object.values(r.positionTotals).reduce((a, b) => a + b, 0));
    expect(r.totalCommission).toBe(13500);
    expect(posSum).toBe(13500);
  });
});

describe('节点比例', () => {
  it('nodeRatio 透传（不参与金额分配，仅展示）', () => {
    const r = calculateCommission({ salesAmount: 100000, salesCost: 0 }, makeTemplate());
    expect(r.nodeRows.map((n) => n.nodeName)).toEqual(['节点一', '节点二']);
    expect(r.nodeRows[0].nodeRatio).toBe(0.5);
  });
});

describe('空节点模板', () => {
  it('无节点 → 总提成正常，岗位为空', () => {
    const t = makeTemplate({ nodes: [] });
    const r = calculateCommission({ salesAmount: 100000, salesCost: 0 }, t);
    expect(r.totalCommission).toBe(2000);
    expect(r.nodeRows).toEqual([]);
    expect(r.positionTotals).toEqual({});
  });

  it('总比例 0 → 总提成 0，不崩溃', () => {
    const t = makeTemplate({ totalRate: 0 });
    const r = calculateCommission({ salesAmount: 100000, salesCost: 0 }, t);
    expect(r.totalCommission).toBe(0);
  });
});
