# -*- coding: utf-8 -*-
"""PaymentsPage 筛选改造 v2：定位切片重组（姓名块 ↔ 岗位块 交换 + 姓名联动）"""
p = r'E:\WorkBuddy存储\2026-08-03-10-32-41\sales-commission\client\src\pages\PaymentsPage.tsx'
data = open(p, 'rb').read()
s = data.decode('utf-8').replace('\r\n', '\n')

DIV_OPEN = "<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>"

# 定位姓名块
name_label = s.find('<span className="filter-label">姓名</span>')
assert name_label != -1, 'name label not found'
name_div_start = s.rfind(DIV_OPEN, 0, name_label)

# 定位岗位块
pos_label = s.find('<span className="filter-label">岗位</span>')
assert pos_label != -1, 'position label not found'
pos_div_start = s.rfind(DIV_OPEN, 0, pos_label)

# 岗位块 div 结束（该 div 的闭合 </div>，找 pos_label 后的第一个 </div>）
pos_div_end = s.find('</div>', pos_label)
assert pos_div_end != -1

# 姓名块 div 结束（name_label 后的第一个 </div>）
name_div_end = s.find('</div>', name_label)
assert name_div_end != -1

# 提取原块内容（用于确定切割顺序）
assert pos_div_start < name_div_start, 'position should come first in DOM'

# 新岗位块
pos_block = """        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="filter-label">岗位</span>
          <Select
            value={position || undefined}
            onChange={(v) => {
              setPosition(v == null ? '' : String(v));
              setCustomerName(''); // 逐级筛选：切岗位时重置姓名
            }}
            placeholder={allPositionOptions.length > 0 ? `选择岗位（共 ${allPositionOptions.length} 个）` : '选择岗位'}
            clearable
            style={{ width: 180 }}
            options={allPositionOptions.map((n) => ({ value: n, label: n }))}
          />
        </div>"""
# 新姓名块（联动）
person_block = """        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="filter-label">姓名</span>
          <Select
            value={customerName || undefined}
            onChange={(v) => setCustomerName(v == null ? '' : String(v))}
            placeholder={
              personOptionsFiltered.length > 0
                ? `选择或输入（共 ${personOptionsFiltered.length} 人）`
                : position
                  ? '该岗位暂无人员'
                  : '输入姓名'
            }
            filterable
            clearable
            style={{ width: 180 }}
            options={personOptionsFiltered.map((n) => ({ value: n, label: n }))}
          />
        </div>"""

# 重组：岗位块在前、姓名块在后（覆盖原两块的区间）
s = s[:pos_div_start] + pos_block + '\n' + person_block + s[name_div_end + len('</div>'):]

# 加联动 options（在 allPositionOptions useMemo 之后）
anchor = "    return [...set].sort();\n  }, [records]);\n"
person_options = """
  // 逐级筛选：选岗位后，姓名候选限定为该岗位人员（未选岗位 = 全部人员）
  const personOptionsFiltered = useMemo(() => {
    if (!position) return allPersonOptions;
    const set = new Set<string>();
    for (const r of allRows) {
      if (r.position === position && r.person && r.person !== '未分配') set.add(r.person);
    }
    records.forEach((r) => {
      const pp = r.result?.positionPersons ?? r.positionPersons ?? {};
      const nm = pp[position];
      if (nm) set.add(nm);
    });
    return [...set].sort();
  }, [allRows, allPersonOptions, records, position]);
"""
assert anchor in s, 'anchor not found'
s = s.replace(anchor, anchor + person_options, 1)

# 注释同步
s = s.replace(
    "{/* 筛选条：年度 / 月份（默认当月）/ 姓名 / 岗位 */}",
    "{/* 筛选条：年度 / 月份（默认当月）/ 岗位（在前）→ 姓名（在后，逐级联动） */}"
)

open(p, 'w', encoding='utf-8', newline='').write(s.replace('\n', '\r\n'))
print('v2 完成：岗位在前 + 姓名联动')
