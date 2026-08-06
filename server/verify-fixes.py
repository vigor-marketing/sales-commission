# -*- coding: utf-8 -*-
"""验证 BUG #1 追加笔 + BUG #2 删除级联"""
import sqlite3, json, subprocess, time

DB = r'E:\WorkBuddy存储\2026-08-03-10-32-41\sales-commission\server\data\commission.db'
BASE = 'http://localhost:3001'

def api(method, path, body=None):
    cmd = ['curl', '-s', '-X', method, BASE + path, '-H', 'Content-Type: application/json']
    if body is not None:
        cmd += ['-d', json.dumps(body, ensure_ascii=False)]
    r = subprocess.run(cmd, capture_output=True, text=True)
    try:
        return json.loads(r.stdout)
    except Exception:
        return {'raw': r.stdout[:120]}

# ① 追加笔：26VD03001 已收 60%+40%=100%，追加第 3 笔 10%
d = api('POST', '/api/calculate', {
  'customerName': '王五', 'contractNo': '26VD03001',
  'salesAmount': 100000, 'salesCurrency': 'USD', 'salesRate': 7.25,
  'salesFees': [], 'payment': {'month':'2026-10','currency':'USD','amount':10000,'rate':7.25,'amountCNY':72500,'received':True,'ratio':0.1},
  'planIndex': 3, 'totalPlanCount': 2, 'positionPersons': {'销售人员':'王五'}
})
ok1 = 'data' in d
print('1. 追加第3笔(10%) ->', 'PASS(200)' if ok1 else 'FAIL ' + str(d.get('error') or d))

# ② 计划内仍校验：第 2 笔（计划内）改 30% → 超 100%（60+30=90%？不超。改 50% → 60+50=110 超）
# 已收 60%（第1笔）+ 40%（第2笔）。第 2 笔重提 50% → 60+50=110% 超 → 422
d2 = api('POST', '/api/calculate', {
  'customerName': '王五', 'contractNo': '26VD03001',
  'salesAmount': 100000, 'salesCurrency': 'USD', 'salesRate': 7.25,
  'salesFees': [], 'payment': {'month':'2026-09','currency':'USD','amount':40000,'rate':7.25,'amountCNY':290000,'received':True,'ratio':0.5},
  'planIndex': 2, 'totalPlanCount': 2, 'positionPersons': {}
})
ok2 = '完全一致' in str(d2.get('error', '')) or '超出 100%' in str(d2.get('error', ''))
print('2. 计划内第2笔改50%(超100%) ->', 'PASS(拒绝)' if ok2 else 'FAIL ' + str(d2.get('error') or d2))

# ③ 删除级联
db = sqlite3.connect(DB)
db.execute('DELETE FROM contracts WHERE contract_no=?', ('DEL-TEST',))
db.execute('DELETE FROM calculation_history WHERE contract_no=?', ('DEL-TEST',))
db.execute('''INSERT INTO contracts (contract_no, customer_name, template_id, sales_currency, sales_amount_orig, sales_rate,
  sales_fees_json, payment_plan_json, position_persons_json, total_plan_count, note)
  VALUES (?,?,?,?,?,?,?,?,?,?,?)''',
  ('DEL-TEST','王五','new-customer','USD',1000,7.25,'[]',
   json.dumps([{'month':'2026-08','currency':'USD','amount':1000,'rate':7.25,'amountCNY':7250,'received':False,'ratio':1}]),
   '{}', 1, ''))
db.commit()
api('POST', '/api/calculate', {
  'customerName': '王五', 'contractNo': 'DEL-TEST',
  'salesAmount': 1000, 'salesCurrency': 'USD', 'salesRate': 7.25,
  'salesFees': [], 'payment': {'month':'2026-08','currency':'USD','amount':1000,'rate':7.25,'amountCNY':7250,'received':True,'ratio':1},
  'planIndex': 1, 'totalPlanCount': 1, 'positionPersons': {}
})
r = subprocess.run(['curl', '-s', '-o', '/dev/null', '-w', '%{http_code}', '-X', 'DELETE', BASE + '/api/contracts/DEL-TEST'], capture_output=True, text=True)
h_before = db.execute('SELECT COUNT(*) FROM calculation_history WHERE contract_no=?', ('DEL-TEST',)).fetchone()[0]
db.commit()
print('3. 删除 DEL-TEST → HTTP', r.stdout, '| history 残留:', h_before, '->', 'PASS' if r.stdout == '204' and h_before == 0 else 'FAIL')

# 清理 26VD03001 的追加笔（第 3 笔，验证用）
db.execute('DELETE FROM calculation_history WHERE contract_no=? AND plan_index=3', ('26VD03001',))
db.commit()
print('4. 已清理 26VD03001 验证用的追加笔')
