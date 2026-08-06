# -*- coding: utf-8 -*-
import sqlite3, json, subprocess

DB = r'E:\WorkBuddy存储\2026-08-03-10-32-41\sales-commission\server\data\commission.db'
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

def post(body):
    r = subprocess.run(['curl', '-s', '-X', 'POST', 'http://localhost:3001/api/calculate',
                        '-H', 'Content-Type: application/json', '-d', json.dumps(body, ensure_ascii=False)],
                       capture_output=True, text=True)
    try:
        d = json.loads(r.stdout)
        return d.get('error', 'OK')
    except Exception:
        return 'RAW: ' + r.stdout[:120]

ok = post({
  'customerName': '李四', 'contractNo': '26VD-TMP',
  'salesAmount': 50000, 'salesCurrency': 'USD', 'salesRate': 7.25,
  'salesFees': [{'currency':'CNY','amount':10000,'rate':1,'amountCNY':10000,'note':'差旅'}],
  'payment': {'month':'2026-08','currency':'USD','amount':30000,'rate':7.25,'amountCNY':217500,'received':True,'ratio':0.6},
  'planIndex': 1, 'totalPlanCount': 2,
  'positionPersons': {'销售人员':'李四','技术人员':'张三'}
})
print('1. 一致保存(第1笔) ->', 'PASS' if ok == 'OK' else 'FAIL ' + str(ok))

bad = post({
  'customerName': '李四', 'contractNo': '26VD-TMP',
  'salesAmount': 50000, 'salesCurrency': 'USD', 'salesRate': 7.25,
  'salesFees': [], 'payment': {'month':'2026-09','currency':'USD','amount':29000,'rate':7.25,'amountCNY':210250,'received':True,'ratio':0.6},
  'planIndex': 2, 'totalPlanCount': 2, 'positionPersons': {}
})
print('2. 不一致保存(第2笔29000) ->', 'PASS(422拒绝)' if '完全一致' in str(bad) else 'FAIL ' + str(bad))

# 3. 检查第 1 笔已保存
rows = db.execute('SELECT plan_index, commission FROM calculation_history WHERE contract_no=? ORDER BY plan_index', ('26VD-TMP',)).fetchall()
print('3. history:', rows)
