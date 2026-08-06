# -*- coding: utf-8 -*-
import sqlite3, json, subprocess

DB = r'E:\WorkBuddy存储\2026-08-03-10-32-41\sales-commission\server\data\commission.db'
db = sqlite3.connect(DB)
# 重置（删掉第 1 笔，重新开始干净验证）
db.execute('DELETE FROM calculation_history WHERE contract_no=?', ('26VD-TMP',))
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

# ① 第 1 笔一致保存（ratio 0.6）→ 200
ok = post({
  'customerName': '李四', 'contractNo': '26VD-TMP',
  'salesAmount': 50000, 'salesCurrency': 'USD', 'salesRate': 7.25,
  'salesFees': [{'currency':'CNY','amount':10000,'rate':1,'amountCNY':10000,'note':'差旅'}],
  'payment': {'month':'2026-08','currency':'USD','amount':30000,'rate':7.25,'amountCNY':217500,'received':True,'ratio':0.6},
  'planIndex': 1, 'totalPlanCount': 2,
  'positionPersons': {'销售人员':'李四','技术人员':'张三'}
})
print('1. 第1笔一致保存(30000/0.6) ->', 'PASS' if ok == 'OK' else 'FAIL ' + str(ok))

# ② 第 2 笔：金额与计划不一致（29000 ≠ 20000），比例 0.4 正确 → 应 422 一致性
bad = post({
  'customerName': '李四', 'contractNo': '26VD-TMP',
  'salesAmount': 50000, 'salesCurrency': 'USD', 'salesRate': 7.25,
  'salesFees': [], 'payment': {'month':'2026-09','currency':'USD','amount':29000,'rate':7.25,'amountCNY':210250,'received':True,'ratio':0.4},
  'planIndex': 2, 'totalPlanCount': 2, 'positionPersons': {}
})
print('2. 第2笔金额不一致(29000) ->', 'PASS(422一致性拒绝)' if '完全一致' in str(bad) else 'FAIL ' + str(bad))

# ③ 第 2 笔一致保存（20000/0.4）→ 200
ok2 = post({
  'customerName': '李四', 'contractNo': '26VD-TMP',
  'salesAmount': 50000, 'salesCurrency': 'USD', 'salesRate': 7.25,
  'salesFees': [], 'payment': {'month':'2026-09','currency':'USD','amount':20000,'rate':7.25,'amountCNY':145000,'received':True,'ratio':0.4},
  'planIndex': 2, 'totalPlanCount': 2, 'positionPersons': {}
})
print('3. 第2笔一致保存(20000/0.4) ->', 'PASS' if ok2 == 'OK' else 'FAIL ' + str(ok2))

rows = db.execute('SELECT plan_index, commission FROM calculation_history WHERE contract_no=? ORDER BY plan_index', ('26VD-TMP',)).fetchall()
print('4. history:', rows)
