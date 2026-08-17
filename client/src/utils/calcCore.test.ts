/**
 * 前端兜底计算核心测试：锁定与后端 services/calculator.ts 的一致性，
 * 防止两套实现再次分叉（历史上 round2 曾缺 EPSILON 修正，导致 1.005 边界少算 1 分）。
 */
import { describe, it, expect } from 'vitest';
import { round2, calculateCommission, defaultTemplates } from './calcCore';

describe('round2（必须与后端 services/calculator.ts 一致）', () => {
  it('1.005 边界四舍五入进到 1.01（EPSILON 修正）', () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2(1.004)).toBe(1.0);
    expect(round2(0.1 + 0.2)).toBe(0.3);
    expect(round2(13500.005)).toBe(13500.01);
  });

  it('负值边界同样正确', () => {
    expect(round2(-1.005)).toBe(-1.01);
    expect(round2(-1.004)).toBe(-1.0);
  });
});

describe('calculateCommission（与后端同构）', () => {
  it('业绩 725000 − 费用 50000 = 675000 × 2% = 13500', () => {
    const tpl = defaultTemplates()[0];
    const r = calculateCommission({ salesAmount: 725000, salesCost: 50000 }, tpl);
    expect(r.baseAmount).toBe(675000);
    expect(r.totalCommission).toBe(13500);
  });

  it('岗位金额之和恒等于总提成（尾差吸收）', () => {
    const tpl = defaultTemplates()[0];
    const r = calculateCommission({ salesAmount: 999999.99, salesCost: 123.45 }, tpl);
    const posSum = round2(Object.values(r.positionTotals).reduce((a, b) => a + b, 0));
    expect(posSum).toBe(r.totalCommission);
  });
});
