import io

p = r'E:\WorkBuddy存储\2026-08-03-10-32-41\sales-commission\client\src\components\calculator\InputForm.tsx'
s = io.open(p, encoding='utf-8').read()

# 旧：单笔录入区 291-440（包含 {/* 第四步... */} 到第一个保存按钮区块之前）
# 找到开始标记
old_start_marker = "      {/* 第四步：这笔收款（按照合同收款计划逐笔收款） */}"
old_end_marker = "      </div>\n    </div>\n  );\n}\n"
idx_start = s.find(old_start_marker)
idx_end = s.find(old_end_marker, idx_start)
assert idx_start != -1 and idx_end != -1, 'markers not found'
old_block = s[idx_start:idx_end + len(old_end_marker)]
print('old block lines:', old_block.count('\n'))

# 新区块（替换）：批量录入区
new_block = '''      {/* ③ 收款计划批量录入：导入合同所有计划笔次，已收冻结，未收可按比例/金额编辑 */}
      <div style={{ borderTop: '1px dashed #e3e8f0', paddingTop: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 4 }}>
          <span style={{ fontWeight: 600, fontSize: 14, color: '#4a5568', whiteSpace: 'nowrap' }}>
            ③ 收款计划批量录入
            {contractNo
              ? `（共 ${paymentPlans.length} 笔，${savedRecords.length} 笔已收）`
              : ''}
          </span>
          <span style={{ fontSize: 12, color: '#9aa3b5' }}>
            导入合同所有计划笔次；已收笔冻结（不可改），未收笔可按比例或具体金额写入金额；保存即标记已收
          </span>
        </div>

        {!contractNo ? (
          <div style={{ color: '#9aa3b5', fontSize: 13, padding: '10px 0' }}>
            请先选择合同号，再录入收款
          </div>
        ) : paymentPlans.length === 0 ? (
          <div style={{ color: '#e37318', fontSize: 13, padding: '10px 0' }}>
            该合同暂无收款计划，请先到「合同录入」页添加
          </div>
        ) : (
          <div>
            {paymentPlans.map((plan, idx) => {
              const savedIdx = savedRecords.find((r) => r.planIndex === idx + 1);
              const isSaved = !!savedIdx;
              const rowAmount = localRows[idx]?.amount ?? plan.amount;
              const rowRatio = localRows[idx]?.ratio ?? plan.ratio ?? 0;
              const rowMonth = localRows[idx]?.month ?? plan.month;
              const rowCurrency = localRows[idx]?.currency ?? plan.currency;
              const rowRate = localRows[idx]?.rate ?? plan.rate;
              const rowCNY = rowCurrency === 'CNY' ? rowAmount : Math.round(rowAmount * rowRate * 100) / 100;
              const paidCount = savedRecords.length;
              return (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    flexWrap: 'wrap',
                    padding: '10px 12px',
                    marginBottom: 6,
                    background: isSaved ? '#f5f7f5' : '#f7f9ff',
                    border: isSaved ? '1px solid #d8e3d8' : '1px solid #e8edf7',
                    borderRadius: 8,
                    opacity: isSaved ? 0.85 : 1,
                  }}
                >
                  <span style={{ fontSize: 12, color: '#8a94a6', minWidth: 44, fontWeight: 600 }}>
                    第{idx + 1}笔
                  </span>
                  <DatePicker
                    value={rowMonth}
                    onChange={(v) => updateLocalRow(idx, { month: typeof v === 'string' ? v : String(v ?? '') })}
                    mode="month"
                    placeholder="月份"
                    style={{ width: 110 }}
                    allowInput
                    clearable={false}
                    size="small"
                    disabled={isSaved}
                  />
                  <InputNumber
                    value={Math.round((rowRatio ?? 0) * 10000) / 100}
                    onChange={(v) => {
                      const pct = Number(v);
                      if (Number.isFinite(pct) && pct >= 0 && pct <= 100) {
                        const r = Math.round(pct * 10000) / 10000 / 100;
                        updateLocalRow(idx, {
                          ratio: r,
                          amount: Math.round((cnyAmount * r) * 100) / 100,
                        });
                      }
                    }}
                    placeholder="比例"
                    min={0}
                    max={100}
                    step={1}
                    size="small"
                    theme="column"
                    style={{ width: 84 }}
                    suffix="%"
                    disabled={isSaved}
                  />
                  <Select
                    value={rowCurrency}
                    onChange={(v) => updateLocalRow(idx, { currency: (v ?? 'USD') as Currency, rate: (v ?? 'USD') === 'CNY' ? 1 : rowRate || defaultRate((v ?? 'USD') as Currency) })}
                    style={{ width: 110 }}
                    size="small"
                    options={Object.entries(CURRENCY_LABELS).map(([value, label]) => ({ value, label }))}
                    disabled={isSaved}
                  />
                  <InputNumber
                    value={rowAmount}
                    onChange={(v) => {
                      const amt = Number(v);
                      if (Number.isFinite(amt) && amt >= 0) {
                        const ratio = cnyAmount > 0 ? Math.round((amt / cnyAmount) * 10000) / 10000 : 0;
                        updateLocalRow(idx, { amount: amt, ratio });
                      }
                    }}
                    placeholder="原币金额"
                    min={0}
                    size="small"
                    theme="column"
                    style={{ width: 140 }}
                    disabled={isSaved}
                  />
                  {rowCurrency !== 'CNY' && (
                    <>
                      <span style={{ fontSize: 12, color: '#6b7588' }}>×汇率</span>
                      <InputNumber
                        value={rowRate}
                        onChange={(v) => updateLocalRow(idx, { rate: Number(v) > 0 ? Number(v) : rowRate })}
                        placeholder="汇率"
                        min={0}
                        step={0.01}
                        size="small"
                        theme="normal"
                        style={{ width: 80 }}
                        disabled={isSaved}
                      />
                    </>
                  )}
                  <span style={{ fontSize: 12, color: '#4a5568' }}>=</span>
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: isSaved ? '#4a5568' : '#0052d9',
                      minWidth: 90,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    ¥ {fmtMoney(rowCNY)}
                  </span>
                  <span
                    style={{
                      marginLeft: 'auto',
                      padding: '3px 10px',
                      borderRadius: 4,
                      fontSize: 12,
                      fontWeight: 700,
                      background: isSaved ? '#e8f7ef' : '#fff6e8',
                      color: isSaved ? '#00a870' : '#e37318',
                      border: isSaved ? '1px solid #b6e5c8' : '1px solid #ffe1b8',
                      whiteSpace: 'nowrap',
                    }}
                    title={isSaved ? `该笔已收款，提成 ¥ ${(savedIdx?.commission ?? 0).toFixed(2)}` : '待录入（可勾选批量保存）'}
                  >
                    {isSaved ? `已收 ✓ ¥ ${(savedIdx?.commission ?? 0).toFixed(2)} 提成` : '待录入'}
                  </span>
                </div>
              );
            })}
            <div
              style={{
                marginTop: 10,
                padding: '10px 14px',
                background: '#f7f9ff',
                border: '1px solid #e8edf7',
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                flexWrap: 'wrap',
              }}
            >
              <span style={{ fontSize: 13, color: '#4a5568' }}>
                未收笔合计（输入比例/金额自动联动，比例 ≤ {Math.min(99.99, 100 - savedRecords.length * 0).toFixed(0)}% 留余量）
              </span>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#0052d9' }}>
                ¥ {fmtMoney(
                  localRows.reduce((s, r, i) => {
                    if (savedRecords.find((sr) => sr.planIndex === i + 1)) return s;
                    return s + (r.currency === 'CNY' ? r.amount : Math.round(r.amount * r.rate * 100) / 100);
                  }, 0)
                )}
              </span>
              <Button
                theme="primary"
                size="large"
                loading={batchSaving}
                onClick={handleSaveSelected}
                disabled={paymentPlans.length === savedRecords.length}
                style={{ minWidth: 160 }}
              >
                保存所有未收笔（{paymentPlans.length - savedRecords.length}）
              </Button>
              <span style={{ fontSize: 12, color: '#9aa3b5' }}>
                逐笔 POST：每笔成功后刷新明细；金额合计建议 = 合同业绩（已收 + 未收 = 100%）
              </span>
            </div>
          </div>
        )}
      </div>

      {/* 旧单笔编辑已废弃，保留兼容占位 */}'''

# 替换
s = s.replace(old_block, new_block)
io.open(p, 'w', encoding='utf-8').write(s)
print('InputForm: 单笔区 → 批量录入区（已替换）')
