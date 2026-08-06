# -*- coding: utf-8 -*-
"""InputForm：全部收款计划展示（默认未收款；保存且一致才显示已收款）"""
p = r'E:\WorkBuddy存储\2026-08-03-10-32-41\sales-commission\client\src\components\calculator\InputForm.tsx'
data = open(p, 'rb').read()
s = data.decode('utf-8').replace('\r\n', '\n')

# ========== 1. paidPlans 定义 → planRows（全部计划 + paid 状态） ==========
old_def = """  // 已收计划：合同计划中 planHistory 已保存过对应 planIndex 的笔次（冻结只读）
  const paidPlanIndexes = useMemo(() => new Set(planHistory.map((h) => h.planIndex)), [planHistory]);
  const paidPlans = useMemo(
    () =>
      contractPlan
        .map((p, idx) => ({ ...p, planIndex: idx + 1 }))
        .filter((p) => paidPlanIndexes.has(p.planIndex)),
    [contractPlan, paidPlanIndexes]
  );"""
new_def = """  // 全部收款计划行（第 1 笔到最后一笔）：
  // 已收判定 = 该笔已保存 且 保存信息与合同计划一致（月份/币种/金额）；否则默认未收款
  const planRows = useMemo(
    () =>
      contractPlan.map((p, idx) => {
        const pi = idx + 1;
        const h = planHistory.find((x) => x.planIndex === pi);
        const paid =
          h !== undefined &&
          h.month === p.month &&
          h.currency === p.currency &&
          Math.abs((h.amount ?? 0) - (p.amount ?? 0)) < 0.01;
        return { ...p, planIndex: pi, paid };
      }),
    [contractPlan, planHistory]
  );"""
assert old_def in s, 'planRows def not found'
s = s.replace(old_def, new_def)

# ========== 2. 渲染块：全部计划（已收绿行 + 未收灰行），当前编辑笔跳过 ==========
old_render_start = "        {/* 已收计划（冻结只读，不允许修改） */}"
old_render_end = "        {!contractNo ? ("
i = s.find(old_render_start)
j = s.find(old_render_end)
assert i != -1 and j != -1 and j > i, f'markers i={i} j={j}'

new_render = """        {/* 自动带入的收款计划（第 1 笔到最后一笔）：已保存且与计划一致 → 已收款；否则未收款（可修改） */}
        {contractNo && planRows.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
            {planRows
              .filter((p) => p.paid || p.planIndex !== planIndex) // 当前编辑笔在下方编辑区展示
              .map((p) => (
                <div
                  key={p.planIndex}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    flexWrap: 'wrap',
                    padding: '8px 12px',
                    background: p.paid ? '#f2fbf7' : '#f8f9fb',
                    border: p.paid ? '1px solid #cfe8dc' : '1px solid #e8edf7',
                    borderRadius: 8,
                  }}
                >
                  <span style={{ fontSize: 12, color: '#5b6b85', minWidth: 44, whiteSpace: 'nowrap' }}>
                    第{p.planIndex}笔
                  </span>
                  <span style={{ fontSize: 13, color: '#4a5568', whiteSpace: 'nowrap' }}>{p.month}</span>
                  <span style={{ fontSize: 13, color: '#4a5568', fontWeight: 600, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                    {fmtMoney(p.amount)} {p.currency}
                  </span>
                  {p.ratio !== undefined && (
                    <span style={{ fontSize: 12, color: '#6b7588', whiteSpace: 'nowrap' }}>{(p.ratio * 100).toFixed(1)}%</span>
                  )}
                  {p.currency !== 'CNY' && (
                    <span style={{ fontSize: 12, color: '#8a94a6', whiteSpace: 'nowrap' }}>× {Number(p.rate).toFixed(2)} = ¥ {fmtMoney(p.amountCNY ?? 0)}</span>
                  )}
                  {p.paid ? (
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        color: '#00a870',
                        background: '#e8f7ef',
                        border: '1px solid #b6e5c8',
                        borderRadius: 9999,
                        padding: '2px 10px',
                        whiteSpace: 'nowrap',
                      }}
                      title="该笔已保存且与收款计划一致，冻结不可修改"
                    >
                      已收款
                    </span>
                  ) : (
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        color: '#9aa3b5',
                        background: '#f2f3f7',
                        border: '1px solid #e3e6ee',
                        borderRadius: 9999,
                        padding: '2px 10px',
                        whiteSpace: 'nowrap',
                      }}
                      title="未完成收款；录入该笔并保存后显示已收款"
                    >
                      未收款
                    </span>
                  )}
                </div>
              ))}
          </div>
        )}

"""
s = s[:i] + new_render + s[j:]

open(p, 'w', encoding='utf-8', newline='').write(s.replace('\n', '\r\n'))
print('planRows 改造完成：全部计划 + 已收/未收状态')
