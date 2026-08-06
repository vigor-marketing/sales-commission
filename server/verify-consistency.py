# -*- coding: utf-8 -*-
"""验证：26VD-TMP 一致性校验（后端）+ 状态（DOM）"""
import sqlite3, json, subprocess, time, re

DB = r'E:\WorkBuddy存储\2026-08-03-10-32-41\sales-commission\server\data\commission.db'

# 1. 重置 26VD-TMP
db = sqlite3.connect(DB)
db.execute('DELETE FROM contracts WHERE contract_no=?', ('26VD-TMP',))
db.execute('DELETE FROM calculation_history WHERE contract_no=?', ('26VD-TMP',))
db.execute('''INSERT INTO contracts
  (contract_no, customer_name, template_id, sales_currency, sales_amount_orig, sales_rate,
   sales_fees_json, payment_plan_json, position_persons_json, total_plan_count, note)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''', (
  '26VD-TMP', '李四', 'new-customer', 'USD', 50000, 7.25,
  json.dumps([{'currency':'CNY','amount':10000,'rate':1,'amountCNY':10000,'note':'差旅'}], ensure_ascii=False),
  json.dumps([
    {'month':'2026-08','currency':'USD','amount':30000,'rate':7.25,'amountCNY':217500,'received':False,'ratio':0.6},
    {'month':'2026-09','currency':'USD','amount':20000,'rate':7.25,'amountCNY':145000,'received':False,'ratio':0.4},
  ], ensure_ascii=False),
  json.dumps({'销售人员':'李四','技术人员':'张三'}, ensure_ascii=False),
  2, '验证一致性'
))
db.commit()
print('26VD-TMP 就绪')

def post(body):
    r = subprocess.run(['curl', '-s', '-X', 'POST', 'http://localhost:3001/api/calculate',
                        '-H', 'Content-Type: application/json', '-d', json.dumps(body, ensure_ascii=False)],
                       capture_output=True, text=True)
    try:
        d = json.loads(r.stdout)
        return d.get('error', 'OK')
    except Exception:
        return f'RAW: {r.stdout[:120]}'

# ① 与计划一致 → 200
ok = post({
  'customerName': '李四', 'contractNo': '26VD-TMP',
  'salesAmount': 50000, 'salesCurrency': 'USD', 'salesRate': 7.25,
  'salesFees': [{'currency':'CNY','amount':10000,'rate':1,'amountCNY':10000,'note':'差旅'}],
  'payment': {'month':'2026-08','currency':'USD','amount':30000,'rate':7.25,'amountCNY':217500,'received':True,'ratio':0.6},
  'planIndex': 1, 'totalPlanCount': 2,
  'positionPersons': {'销售人员':'李四','技术人员':'张三'}
})
print('① 一致保存(第1笔) →', '✅ 成功' if ok == 'OK' else f'❌ {ok}')

# ② 与计划不一致（金额改 29000）→ 422
bad = post({
  'customerName': '李四', 'contractNo': '26VD-TMP',
  'salesAmount': 50000, 'salesCurrency': 'USD', 'salesRate': 7.25,
  'salesFees': [], 'payment': {'month':'2026-09','currency':'USD','amount':29000,'rate':7.25,'amountCNY':210250,'received':True,'ratio':0.6},
  'planIndex': 2, 'totalPlanCount': 2, 'positionPersons': {}
})
print('② 不一致保存(第2笔金额改29000) →', '✅ 被拒' if '完全一致' in str(bad) else f'❌ {bad}')
