# 销售提成计算系统

独立工具项目，用于根据《销售人员手册》提成规则计算并分配销售提成。

## 功能

- **首页（提成计算）**：输入销售业绩（未税）与销售费用，自动按 9 个流程节点 × N 个岗位的规则计算提成，并展示明细矩阵与历史记录
- **第二页（系统设置）**：配置总提成比例、流程节点比例、岗位分配比例；支持增删流程节点、增删岗位；实时比例和校验

## 业务规则

核心公式：**总提成 =（销售业绩（未税）− 销售费用）× 总提成比例**

总提成按**权重归一化**分配到各岗位 → 聚合为流程节点小计：
- 岗位金额 = 总提成 × (岗位比例 / 总权重)
- 节点小计 = 该节点内岗位金额之和
- 最后一个岗位吸收分位舍入差，保证 `Σ岗位金额 == 总提成` 严格成立

## 技术栈

- 前端：React 18 + TypeScript + Vite 6 + TDesign React 1.16
- 后端：Express 4 + better-sqlite3 12（Windows 预编译二进制）
- 数据库：SQLite（设置参数 + 计算历史）

## 启动方式

```bash
# 安装依赖（首次）
cd sales-commission
npm install                # 根目录
npm --prefix server install
npm --prefix client install

# 一键启动前后端（开发模式）
npm run dev
# 前端：http://localhost:5173
# 后端：http://localhost:3001

# 生产模式
npm run build              # 构建前端到 client/dist
npm start                  # 由 server 同时托管 client/dist 与 API
```

## 目录结构

```
sales-commission/
├── server/                # Express + better-sqlite3
│   ├── src/
│   │   ├── index.ts
│   │   ├── types.ts
│   │   ├── db/{database,schema,seed}.ts
│   │   ├── services/calculator.ts     # 计算核心
│   │   ├── routes/{settings,calculate,history}.ts
│   │   └── utils/validation.ts        # 比例校验
│   └── data/commission.db             # 运行时生成
└── client/                # React + TDesign
    └── src/
        ├── App.tsx        # 路由布局
        ├── pages/{CalculatorPage,SettingsPage}.tsx
        ├── components/calculator/{InputForm,SummaryCards,ResultTable,HistoryTable}.tsx
        ├── components/settings/{TotalRateEditor,NodeEditor,RatioWarn}.tsx
        ├── api/{http,settings,calculate,history}.ts
        └── utils/format.ts
```

## API

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/settings` | 读取当前配置 |
| PUT | `/api/settings` | 保存配置（返回 warnings 列表，校验不阻断） |
| POST | `/api/calculate` | 计算并自动写入历史 |
| GET | `/api/history?page=&pageSize=` | 历史分页 |
| DELETE | `/api/history/:id` | 删除历史 |
| GET | `/api/health` | 健康检查 |
| POST | `/api/v1/events` | 工作台受控推送 `contract.signed.v1`、`payment.confirmed.v1`；仅写入同步快照，不改写财务核算数据 |
| GET | `/api/v1/snapshots` | 读取已接收的合同/回款同步快照，用于工作台联调与审计 |

## 工作台事件接入

提成系统是财务核算数据的唯一维护方。工作台只能向 `POST /api/v1/events` 推送销售合同签订和回款确认事件，系统会按 `eventId` 幂等保存到独立同步快照；不会自动创建或覆盖提成合同、费率、岗位人员、收款计划或计算历史。

部署时必须设置 `WORKBENCH_API_TOKEN`，工作台调用须携带 `X-Workbench-Token`。未配置令牌时接口会拒绝所有事件，避免财务数据入口暴露。

## 默认数据

`server/src/db/seed.ts` 提供 9 个流程节点 × 7 个岗位的默认配置（参考 Excel 5.7.3.3 节）。首次启动自动写入。
