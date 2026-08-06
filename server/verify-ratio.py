# -*- coding: utf-8 -*-
"""验证 ratio 一致性校验"""
import sqlite3, json, subprocess

DB = r'E:\WorkBuddy存储\2026-08-03-10-32-41\sales-commission\server\data\commission.db'
BASE = 'http://localhost:3001'

db = sqlite3.connect(DB)
db.execute('DELETE FROM contracts WHERE contract_no=?', ('26VD-TMP',))
db.execute('DELETE FROM calculation_history WHERE contract_no=?', ('26VD-TMP',))
db.execute('''INSERT INTO contracts (contract_no, customer_name, template_id, sales_currency, sales_amount_orig, sales_rate,
  sales_fees_json, payment_plan_json, position_persons_json, total_plan_count, note)
  VALUES (?,?,?,?,?,?,?,?,?,?,?)''', ('26VD-TMP','李四','new-customer','USD',50000,7.25,
  json.dumps([{'currency':'CNY','amount':10000,'rate':1,'amountCNY':10000,'note':'差旅'}]),
  json.dumps([{'month':'2026-08','currency':'USD','amount':30000,'rate':7.25,'amountCNY':217500,'received':False,'ratio':0.6}]),
  '{}', 1, '验证ratio'))
db.commit()

def post(body):
    r = subprocess.run(['curl','-s','-X','POST',BASE+'/api/calculate','-H','Content-Type: application/json',
                        '-d', json.dumps(body, ensure_ascii=False)], capture_output=True, text=True)
    try:
        return json.loads(r.stdout)
    except Exception:
        return {'raw': r.stdout[:100]}

base = {
  'customerName': '李四', 'contractNo': '26VD-TMP',
  'salesAmount': 50000, 'salesCurrency': 'USD', 'salesRate': 7.25,
  'salesFees': [{'currency':'CNY','amount':10000,'rate':1,'amountCNY':10000,'note':'差旅'}],
  'payment': {'month':'2026-08','currency':'USD','amount':30000,'rate':7.25,'amountCNY':217500,'received':True,'ratio':0.6},
  'planIndex': 1, 'totalPlanCount': 1, 'positionPersons': {}
}

# ① ratio 改 0.5（amount 一致）→ 422
b1 = json.loads(json.dumps(base)); b1['payment']['ratio'] = 0.5
d1 = post(b1)
print('1. ratio 0.5(计划0.6) ->', 'PASS(422)' if '完全一致' in str(d1.get('error','')) else 'FAIL ' + str(d1.get('error') or d1))

# ② ratio 一致 0.6 → 200
d2 = post(base)
print('2. ratio 0.6 ->', 'PASS(200)' if 'data' in d2 else 'FAIL ' + str(d2.get('error') or d2))

db.execute('DELETE FROM contracts WHERE contract_no=?', ('26VD-TMP',))
db.execute('DELETE FROM calculation_history WHERE contract_no=?', ('26VD-TMP',))
db.commit()
print('3. 清理 26VD-TMP')
