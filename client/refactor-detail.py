p = r'E:\WorkBuddy存储\2026-08-03-10-32-41\sales-commission\client\src\pages\ContractDetailPage.tsx'
s = open(p, encoding='utf-8').read()

# 1. import ContractInfoCard
old_imp = "import PersonCommissionTable from '../components/calculator/PersonCommissionTable';"
new_imp = "import PersonCommissionTable from '../components/calculator/PersonCommissionTable';\nimport ContractInfoCard from '../components/ContractInfoCard';"
assert old_imp in s
s = s.replace(old_imp, new_imp)

# 2. 顶部按钮加「提成统计」入口
old_btn = """          {records.length > 0 && (
            <Button variant="outline" onClick={() => exportHistoryBatch(records)}>
              导出该合同全部记录
            </Button>
          )}"""
new_btn = """          {records.length > 0 && (
            <>
              <Button variant="outline" onClick={() => navigate('/contract-statistics/' + encodeURIComponent(c.contractNo))}>
                提成统计
              </Button>
              <Button variant="outline" onClick={() => exportHistoryBatch(records)}>
                导出该合同全部记录
              </Button>
            </>
          )}"""
assert old_btn in s
s = s.replace(old_btn, new_btn)

# 3. 替换合同主数据区块为 ContractInfoCard
start_marker = "      {/* 合同主数据 */}"
end_marker = "      )}\n\n      {/* 多笔提成明细 */}"
i_start = s.find(start_marker)
i_end = s.find(end_marker, i_start)
assert i_start != -1 and i_end != -1, 'main data block not found'
s = s[:i_start] + "      <ContractInfoCard contract={c} settings={settings} />\n\n" + s[i_end + len(end_marker):]

# 4. 删除底部"前往提成计算"链接
old_tail = """      {/* 快捷入口 */}
      <div style={{ marginTop: 12, fontSize: 13 }}>
        <Link to="/calculate" style={{ color: '#0052d9' }}>→ 前往「提成计算」继续录入该合同收款</Link>
      </div>
    </div>"""
new_tail = """    </div>"""
assert old_tail in s
s = s.replace(old_tail, new_tail)

open(p, 'w', encoding='utf-8').write(s)
print('ContractDetailPage 改造完成')
