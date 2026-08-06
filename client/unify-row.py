import io

p = r'E:\WorkBuddy存储\2026-08-03-10-32-41\sales-commission\client\src\components\calculator\InputForm.tsx'
s = io.open(p, encoding='utf-8').read()

old_block_start = """        ) : payment ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              flexWrap: 'wrap',
              padding: '10px 12px',
              background: '#f7f9ff',
              borderRadius: 8,
              border: '1px solid #e8edf7',
            }}
          >
            <span style={{ fontSize: 12, color: '#e37318', fontWeight: 700, minWidth: 58, whiteSpace: 'nowrap' }}>
              本次收款
            </span>
            <DatePicker
              value={payment.month}
              onChange={handlePaymentMonth}
              mode="month"
              placeholder="收款月份"
              style={{ width: 120 }}
              allowInput
              clearable={false}
            />
            <Select
              value={payment.currency}
              onChange={(v) =>
                updatePayment({
                  currency: (v ?? 'USD') as Currency,
                  rate: (v ?? 'USD') === 'CNY' ? 1 : payment.rate || defaultRate((v ?? 'USD') as Currency),
                })
              }
              style={{ width: 128 }}
              options={Object.entries(CURRENCY_LABELS).map(([value, label]) => ({ value, label }))}
            />
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
              <Input
                value={payment.ratio !== undefined ? String(Math.round(payment.ratio * 10000) / 100) : ''}
                onChange={(v) => {
                  const pct = Number(v);
                  if (Number.isFinite(pct) && pct >= 0 && pct <= 100) {
                    updatePayment({ ratio: Math.round(pct * 10000) / 10000 / 100 });
                  }
                }}
                placeholder="比例"
                style={{ width: 72 }}
                size="medium"
                tips="输入比例，金额自动计算（该笔占合同收款比例 %）"
              />
              <span style={{ fontSize: 13, color: '#6b7588' }}>%</span>
            </div>
            {/* 金额：按比例自动计算（只读） */}
            <span style={{ fontSize: 13, color: '#6b7588', whiteSpace: 'nowrap' }}>金额</span>
            <span
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: '#4a5568',
                minWidth: 90,
                fontVariantNumeric: 'tabular-nums',
                whiteSpace: 'nowrap',
              }}
            >
              {fmtMoney(payment.amount)} {payment.currency}
            </span>
            {payment.currency !== 'CNY' && (
              <>
                <span style={{ fontSize: 13, color: '#6b7588', whiteSpace: 'nowrap' }}>×汇率</span>
                <Input
                  value={String(payment.rate)}
                  onChange={(v) => updatePayment({ rate: Number(v) > 0 ? Number(v) : payment.rate })}
                  placeholder="汇率"
                  style={{ width: 100 }}
                  size="medium"
                  tips="每笔汇率可单独修改（改汇率只影响原币显示）"
                />
              </>
            )}
            <span style={{ fontSize: 13, color: '#4a5568', whiteSpace: 'nowrap' }}>=</span>
            <span
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: '#0052d9',
                minWidth: 100,
                fontVariantNumeric: 'tabular-nums',
                whiteSpace: 'nowrap',
              }}
            >
              ¥ {fmtMoney(payCNY)}
            </span>"""

new_block_start = """        ) : payment ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              flexWrap: 'wrap',
              padding: '10px 12px',
              background: '#f7f9ff',
              borderRadius: 8,
              border: '1px solid #e8edf7',
            }}
          >
            {/* 与「合同录入 → 收款计划」排版一致：第X笔 → 比例% → 月份 → 币种 → 金额 → ×汇率 → = → 人民币 → 已收 */}
            <span style={{ fontSize: 12, color: '#8a94a6', minWidth: 44, whiteSpace: 'nowrap' }}>
              第{planIndex}笔
            </span>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
              <Input
                value={payment.ratio !== undefined ? String(Math.round(payment.ratio * 10000) / 100) : ''}
                onChange={(v) => {
                  const pct = Number(v);
                  if (Number.isFinite(pct) && pct >= 0 && pct <= 100) {
                    updatePayment({ ratio: Math.round(pct * 10000) / 10000 / 100 });
                  }
                }}
                placeholder="比例"
                style={{ width: 84 }}
                size="medium"
                tips="输入比例，金额自动计算（该笔占合同收款比例 %）"
              />
              <span style={{ fontSize: 13, color: '#6b7588' }}>%</span>
            </div>
            <DatePicker
              value={payment.month}
              onChange={handlePaymentMonth}
              mode="month"
              placeholder="收款月份"
              style={{ width: 110 }}
              allowInput
              clearable={false}
            />
            <Select
              value={payment.currency}
              onChange={(v) =>
                updatePayment({
                  currency: (v ?? 'USD') as Currency,
                  rate: (v ?? 'USD') === 'CNY' ? 1 : payment.rate || defaultRate((v ?? 'USD') as Currency),
                })
              }
              style={{ width: 110 }}
              options={Object.entries(CURRENCY_LABELS).map(([value, label]) => ({ value, label }))}
            />
            {/* 金额：按比例自动计算（只读，与录入页同列顺序） */}
            <span style={{ fontSize: 13, color: '#6b7588', whiteSpace: 'nowrap' }}>金额</span>
            <span
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: '#4a5568',
                minWidth: 100,
                fontVariantNumeric: 'tabular-nums',
                whiteSpace: 'nowrap',
              }}
            >
              {fmtMoney(payment.amount)} {payment.currency}
            </span>
            {payment.currency !== 'CNY' && (
              <>
                <span style={{ fontSize: 13, color: '#6b7588', whiteSpace: 'nowrap' }}>×汇率</span>
                <Input
                  value={String(payment.rate)}
                  onChange={(v) => updatePayment({ rate: Number(v) > 0 ? Number(v) : payment.rate })}
                  placeholder="汇率"
                  style={{ width: 80 }}
                  size="medium"
                  tips="每笔汇率可单独修改（改汇率只影响原币显示）"
                />
              </>
            )}
            <span style={{ fontSize: 13, color: '#4a5568', whiteSpace: 'nowrap' }}>=</span>
            <span
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: '#0052d9',
                minWidth: 90,
                fontVariantNumeric: 'tabular-nums',
                whiteSpace: 'nowrap',
              }}
            >
              ¥ {fmtMoney(payCNY)}
            </span>"""

assert old_block_start in s, 'old block not found'
s = s.replace(old_block_start, new_block_start)
io.open(p, 'w', encoding='utf-8').write(s)
print('这笔收款行已与录入页排版统一')
