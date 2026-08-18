# 销售提成计算系统 — 使用与接入说明

> 更新日期：2026-08-03 ｜ 系统状态：运行中

---

## 1. 访问地址

| 场景 | 地址 | 状态 |
|---|---|---|
| 本机访问 | http://localhost:3001/ | ✅ |
| 局域网访问（同事） | http://192.168.1.117:3001/ | ✅ |
| 提成统计表 | http://192.168.1.117:3001/payments | ✅ |
| 系统设置 | http://192.168.1.117:3001/settings | ✅ |
| 健康检查 | http://192.168.1.117:3001/api/health | ✅ |

> 同一局域网内的同事，浏览器打开 `http://192.168.1.117:3001/` 即可使用。
> 若访问不到，先 `ping 192.168.1.117` 确认网络可达；部分企业 WiFi 开启了客户端隔离（AP isolation）会导致无法互通。

### 重启服务（重启电脑后需要）

```bash
cd "E:/WorkBuddy存储/2026-08-03-10-32-41/sales-commission/server"
npx tsx src/index.ts
# 然后浏览器打开 http://localhost:3001/
```

---

## 2. 技术栈

| 层 | 技术 | 版本 |
|---|---|---|
| 前端框架 | React + TypeScript | React 18.3 |
| 构建工具 | Vite | 6.x |
| UI 组件库 | TDesign React | 1.16.x |
| 路由 | react-router-dom | 6.x |
| 后端框架 | Express | 4.x |
| 数据库驱动 | better-sqlite3 | 12.x |
| 数据存储 | SQLite（WAL 模式） | — |
| 数据文件 | `server/data/commission.db` | — |
| 进程管理 | 后台 Node（端口 3001） | Node 22 |

**项目位置**：`E:\WorkBuddy存储\2026-08-03-10-32-41\sales-commission\`

```
sales-commission/
├── server/          # Express 后端（API + SQLite + 静态托管前端）
│   └── src/
│       ├── index.ts
│       ├── db/          # 建表 / 种子 / 迁移
│       ├── routes/      # settings / calculate / history / contracts / commissions / feeNames
│       ├── services/    # 计算核心（权重归一化）
│       └── utils/       # 校验
└── client/          # React 前端（TDesign）
    └── src/
        ├── pages/       # 提成计算 / 提成统计表 / 系统设置
        ├── components/  # 输入、表格、设置编辑器
        ├── api/         # fetch 封装（后端优先，静态兜底）
        └── utils/       # 计算核心 / 导出 / 本地存储
```

---

## 3. 登录方式

**当前无登录鉴权** —— 内网部署，打开地址即可直接使用，无账号密码。

- 通过「系统设置 → 人员名单」维护销售姓名，计算页下拉选择
- ⚠️ 无鉴权意味着任何能访问该地址的人都能查看/修改数据
- 当前仅限公司内网使用；如需登录可后续增加（用户名密码 / 企业微信 / 腾讯云登录）

---

## 4. API 清单（RESTful，前缀 `/api`）

| 方法 | 路径 | 功能 |
|---|---|---|
| GET | `/api/health` | 健康检查 |
| GET | `/api/settings` | 读取设置（表格类型模板 + 人员名单） |
| PUT | `/api/settings` | 保存设置（多模板，校验不阻断） |
| POST | `/api/calculate` | 计算提成并写历史（含合同号/姓名/收款计划/模板） |
| GET | `/api/history?page=&pageSize=` | 历史分页（上限 10000 支持全量） |
| GET | `/api/history/contract?contractNo=` | 按合同号查最新记录（自动带出） |
| DELETE | `/api/history/:id` | 删除单条历史 |
| GET | `/api/commissions/persons` | 可选销售人员（历史/合同/设置名单合并去重） |

### API 调用示例

**计算提成**：

```bash
curl -X POST http://localhost:3001/api/calculate \
  -H "Content-Type: application/json" \
  -d '{
    "salesAmount": 500000,
    "salesCost": 50000,
    "templateId": "old-customer",
    "contractNo": "HT-2026-004",
    "customerName": "张三",
    "paymentPlan": [
      {"month":"2026-08","currency":"USD","amount":3000,"rate":7.25,"received":true}
    ]
  }'
```

**读取设置**：

```bash
curl http://localhost:3001/api/settings
```

---

## 5. 核心业务规则

- **公式**：总提成 =（销售业绩（未税）− 销售费用）× 表格类型比例
- **表格类型**：新客户提成计算表（默认 2%）、老客户提成计算表（默认 2%，可在系统设置调整），不同订单可选不同表格
- **分配**：总提成按流程节点 × 岗位权重归一化分配，最后一个岗位吸收分位尾差，保证 Σ岗位 = Σ节点 = 总提成
- **收款计划**：最多 4 笔/合同，币种 CNY/USD/EUR，外币金额 × 汇率 = 人民币金额（每笔汇率独立可改）
- **约束**：收款合计（人民币）不能大于总金额（销售业绩）
- **历史快照**：每条记录保存当时完整模板配置，后续改比例不影响历史

---

## 6. 导出功能

| 位置 | 导出内容 | 格式 |
|---|---|---|
| 历史表「单条导出」 | 该记录完整明细（合同/姓名/收款计划/岗位矩阵） | CSV（Excel 直接打开） |
| 历史表「按合同导出」 | 同一合同号所有记录（含所有款项） | CSV |
| 历史表「批量导出 CSV」 | 全部历史汇总（含合同号/姓名/收款状态） | CSV |
| 提成统计表「导出当前筛选」 | 当前筛选条件下的收款明细 + 合计 | CSV |
