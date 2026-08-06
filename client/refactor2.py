import re
p = r'E:\WorkBuddy存储\2026-08-03-10-32-41\sales-commission\client\src\pages\ContractDetailPage.tsx'
s = open(p, encoding='utf-8').read()
lines = s.split('\n')

# 删除合同主数据区块 108-179（行号 1-based，python list 0-based → 107-178）
# 108: /* 合同主数据 */
# 179: 倒数第二个 )} 闭合 section-card
# 用 1-based 行号切片：删除 [108:180]
del lines[107:180]
lines.insert(107, '      <ContractInfoCard contract={c} settings={settings} />')

# 删除底部"快捷入口" 187-190
del lines[185:190]

open(p, 'w', encoding='utf-8').write('\n'.join(lines))
print('ContractDetailPage: ContractInfoCard 替换 + 底部链接删除')
