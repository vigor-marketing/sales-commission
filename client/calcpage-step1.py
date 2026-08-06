# -*- coding: utf-8 -*-
"""CalculatorPage 改造（v2）：①InputForm 受控传参 ②删明细区加统计入口 ③清理无用代码"""
import re

p = r'E:\WorkBuddy存储\2026-08-03-10-32-41\sales-commission\client\src\pages\CalculatorPage.tsx'
s = open(p, encoding='utf-8').read()

# ========== 1. import 清理 ==========
s = s.replace(
    "import { MessagePlugin, Table, Button } from 'tdesign-react';",
    "import { MessagePlugin, Button } from 'tdesign-react';"
)
s = s.replace(
    "import type { CalculationResult, PaymentPlanItem, Settings, Template, Currency, SalesFee, HistoryRecord } from '../types';",
    "import type { CalculationResult, PaymentPlanItem, Settings, Template, Currency, SalesFee } from '../types';"
)
s = s.replace("import { exportHistoryBatch } from '../utils/export';\n", "")
s = s.replace("import PersonCommissionTable from '../components/calculator/PersonCommissionTable';\n", "")
s = s.replace(
    "import { useState, useEffect, useRef, useCallback } from 'react';",
    "import { useState, useEffect, useRef, useCallback } from 'react';\nimport { useNavigate } from 'react-router-dom';"
)

# ========== 2. 删 contractRecords state ==========
s = s.replace(
    """  // 该合同所有已保存的收款记录（多笔提成同页展示，按第几笔区分）
  const [contractRecords, setContractRecords] = useState<HistoryRecord[]>([]);
""",
    ""
)

# ========== 3. 组件内加 useNavigate ==========
s = s.replace(
    "  const [customerName, setCustomerName] = useState<string>('');",
    "  const navigate = useNavigate();\n  const [customerName, setCustomerName] = useState<string>('');"
)

# ========== 4. handleContractNoChange 删 setContractRecords ==========
s = s.replace(
    """        const rows = hist.list.filter((r) => r.contractNo === no && r.paymentPlan.length > 0);
        setContractRecords(rows);
        planList = rows.map((r) => {""",
    """        const rows = hist.list.filter((r) => r.contractNo === no && r.paymentPlan.length > 0);
        planList = rows.map((r) => {"""
)

# ========== 5. handleSave 删 setContractRecords 刷新 ==========
s = s.replace(
    """        const hist = await getHistory(1, 10000);
        setContractRecords(hist.list.filter((r) => r.contractNo === contractNo && r.paymentPlan.length > 0));
        setPlanHistory(""",
    """        const hist = await getHistory(1, 10000);
        setPlanHistory("""
)

# ========== 6. 删 recordColumns + 统计常量（正则：注释开始 → paidRatioPct 行结束含空行） ==========
pat = re.compile(
    r"  // 该合同多笔提成明细：列与合计\n[\s\S]*?const paidRatioPct = Math\.min\(100, Math\.round\(paidRatioSum \* 10000\) / 100\);\n\n"
)
s2, n = pat.subn("", s)
assert n == 1, f'metrics block regex matched {n} times'
s = s2

open(p, 'w', encoding='utf-8').write(s)
print('步骤 1-6 完成')
