# -*- coding: utf-8 -*-
"""CalculatorPage v3b（CRLF 感知）：InputForm 受控传参 + 明细区替换为统计入口"""
p = r'E:\WorkBuddy存储\2026-08-03-10-32-41\sales-commission\client\src\pages\CalculatorPage.tsx'
data = open(p, 'rb').read()
s = data.decode('utf-8').replace('\r\n', '\n')

# ========== 1. InputForm 传参补全 ==========
old_inputform = """        <InputForm
          customerName={customerName}
          contractNo={contractNo}
          contractOptions={contractOptions}
          salesCurrency={salesCurrency}
          salesAmount={salesAmount}
          salesRate={salesRate}
          salesFees={salesFees}
          planHistory={planHistory}
          settings={settings ?? undefined}
          template={activeTemplate}
          persons={persons}
          loading={loading}
          onCustomerNameChange={handleCustomerNameChange}
          onContractNoChange={(v) => handleContractNoChange(v)}
          onNewPayment={handleNewPayment}
          onSave={handleSave}
        />"""
new_inputform = """        <InputForm
          customerName={customerName}
          contractNo={contractNo}
          contractOptions={contractOptions}
          salesCurrency={salesCurrency}
          salesAmount={salesAmount}
          salesRate={salesRate}
          salesFees={salesFees}
          planHistory={planHistory}
          settings={settings ?? undefined}
          template={activeTemplate}
          persons={persons}
          payment={payment}
          planIndex={planIndex}
          totalPlanCount={totalPlanCount}
          loading={loading}
          onCustomerNameChange={handleCustomerNameChange}
          onContractNoChange={(v) => handleContractNoChange(v)}
          onNewPayment={handleNewPayment}
          onPaymentChange={(p) => setPayment({ ...p })}
          onSave={handleSave}
        />"""
assert old_inputform in s, 'InputForm block not found'
s = s.replace(old_inputform, new_inputform)

# ========== 2. 明细区替换为统计入口 ==========
start_marker = "      {/* 该合同多笔提成明细（同页展示，按第几笔区分）+ 按人提成汇总 */}"
end_marker = "      {!result && ("
i = s.find(start_marker)
j = s.find(end_marker)
assert i != -1 and j != -1 and j > i, f'markers: i={i} j={j}'

entry = """      {/* 该合同提成统计入口（多笔明细 / 按人明细已移至独立统计页，与合同管理一致） */}
      {contractNo && (
        <div className="section-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>该合同提成统计</div>
              <div style={{ fontSize: 12, color: '#7a8499', marginTop: 2 }}>
                该合同所有收款笔次的提成明细 + 按人员 × 笔 × 岗位汇总（与合同管理页合同明细一致）
              </div>
            </div>
            <Button
              theme="primary"
              variant="outline"
              onClick={() => navigate(`/contract-statistics/${encodeURIComponent(contractNo)}`)}
            >
              查看该合同提成统计 →
            </Button>
          </div>
        </div>
      )}

"""
s = s[:i] + entry + s[j:]

# 写回：保持 CRLF
open(p, 'w', encoding='utf-8', newline='').write(s.replace('\n', '\r\n'))
print('v3b 完成：InputForm 受控传参 + 统计入口（CRLF 保持）')
