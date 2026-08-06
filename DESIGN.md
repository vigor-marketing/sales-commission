# 销售提成计算系统 — 设计与实现文档

> 版本：v1.0 ｜ 日期：2026-08-03 ｜ 状态：已完成并部署

---

## 目录

1. [项目概述](#1-项目概述)
2. [业务规则](#2-业务规则)
3. [技术架构](#3-技术架构)
4. [页面设计](#4-页面设计)
5. [数据模型](#5-数据模型)
6. [API 设计](#6-api-设计)
7. [计算核心逻辑](#7-计算核心逻辑)
8. [导出功能](#8-导出功能)
9. [校验规则](#9-校验规则)
10. [部署与启动](#10-部署与启动)
11. [目录结构](#11-目录结构)
12. [关键实现要点](#12-关键实现要点)
13. [版本迭代记录](#13-版本迭代记录)

---

## 1. 项目概述

**销售提成计算系统**是独立工具项目（不与 enterprise-crm 混合），用于根据《外贸销售人员手册》第 5.7.3.3 节规则，计算销售提成并按流程节点 × 岗位维度分配。

**核心能力：**

| 能力 | 说明 |
|---|---|
| 提成计算 | 输入销售业绩（未税）+ 销售费用，按公式计算总提成 |
| 岗位分配 | 按 9 个流程节点 × N 个岗位的权重比例分配提成 |
| 参数配置 | 可配置总提成比例、节点比例、岗位比例，支持增删节点/岗位 |
| 历史记录 | 每次计算自动保存，支持复用、删除、导出 |
| 数据导出 | 单条明细导出 + 批量汇总导出（CSV，Excel 直接打开） |

**用户访问地址（本地部署）：** http://localhost:3001/

---

## 2. 业务规则

### 2.1 核心公式

```
总提成 =（销售业绩（未税）− 销售费用）× 总提成比例
```

- 默认总提成比例：**2%**
- 提成基数 = 销售业绩（未税）− 销售费用

### 2.2 分配规则（参考 Excel 5.7.3.3 节）

总提成按 **9 个流程节点** 分配，每个节点内再按 **岗位权重** 分配。原表默认数据如下（岗位比例之和 = 节点比例，业务逻辑自洽）：

| # | 流程节点 | 节点比例 | 运营人员 | 销售人员 | 销售主管 | 项目管理人员 | 技术人员 | 总经理参与 | 销售助理 |
|---|---------|---------|---------|---------|---------|------------|---------|-----------|---------|
| 1 | 客户信息收集 | 5% | 5% | | | | | | |
| 2 | 筛选客户/项目洽谈 | 10% | | 10% | | | | | |
| 3 | 提交技术方案及确认 | 20% | | 10% | | | 10% | | |
| 4 | 难点，关系攻克 | 10% | | 2% | | | | 8% | |
| 5 | 项目评审 | 8% | | 2% | | | 3% | 3% | |
| 6 | 项目跟进-合同签订 | 30% | | 20% | 10% | | | | |
| 7 | 生产跟进-产品交付 | 12% | | 2% | | | 8% | | 2% |
| 8 | 验收-收款 | 10% | | 5% | | 5% | | | |
| 9 | 售后服务 | 5% | | | | 5% | | | |

> **业务认知**：原表节点比例之和为 110%（非 100%），这是公司设计原貌，不作为错误处理。系统采用**权重归一化**分配，保证总提成始终 100% 被完整分配。

### 2.3 分配算法（权重归一化）

```
岗位金额 = 总提成 ×（岗位比例 / 总权重）
节点小计 = 该节点内所有岗位金额之和
```

- 总权重 = 全部岗位比例之和（可为任意正数，默认 110%）
- 最后一个岗位吸收分位舍入差，保证 `Σ岗位金额 == Σ节点小计 == 总提成` 严格成立

---

## 3. 技术架构

```
┌─────────────────────────────────────────────────┐
│                  浏览器（React SPA）              │
│  CalculatorPage  │  SettingsPage                │
│  TDesign UI 组件  │  fetch → /api 或前端兜底      │
└──────────┬──────────────────────────────────────┘
           │ HTTP /api（开发期 Vite 代理 :5173→:3001）
┌──────────▼──────────────────────────────────────┐
│              Express 后端（端口 3001）            │
│  routes: settings / calculate / history / health │
│  services/calculator.ts（计算核心）               │
└──────────┬──────────────────────────────────────┘
           │ better-sqlite3（同步 API，WAL 模式）
┌──────────▼──────────────────────────────────────┐
│            SQLite 数据库（server/data/）          │
│  settings 表 + calculation_history 表            │
└─────────────────────────────────────────────────┘
```

**技术栈：**

| 层 | 技术 | 版本 |
|---|---|---|
| 前端 | React + TypeScript | React 18.3 |
| 构建 | Vite | 6.x |
| UI 组件库 | TDesign React | 1.16.x |
| 路由 | react-router-dom | 6.x |
| 后端 | Express | 4.x |
| 数据库 | better-sqlite3 | 12.x |
| 数据库文件 | SQLite（WAL 模式） | — |

**双模式运行：**
- **后端可用**：优先走 API，历史存 SQLite
- **静态部署/后端不可用**：前端自动探测 `/api/health` 失败后，用内置 `calcCore.ts` 计算 + localStorage 持久化

---

## 4. 页面设计

### 4.1 整体布局（App.tsx）

```
┌─────────────────────────────────────────────┐
│ [¥] 销售提成计算系统    Commission Calculator │  ← 品牌区（渐变 ¥ 图标 + 标题）
│    提成计算  |  系统设置                       │  ← 顶部水平导航
├─────────────────────────────────────────────┤
│               页面内容（Content）             │
└─────────────────────────────────────────────┘
```

- 顶部 Header 固定（sticky），60px 高，白底 + 阴影
- 路由：`/` → 提成计算，`/settings` → 系统设置
- 品牌图标：34×34 圆角渐变蓝底 + ¥ 符号

### 4.2 首页 — 提成计算（CalculatorPage）

```
┌─────────────────────────────────────────────┐
│ 提成计算                                      │
│ 输入销售业绩与费用，按流程节点自动分配各岗位提成  │
│ 计算公式：总提成 =（销售业绩（未税）− 销售费用）× 总提成比例（默认 2%） │  ← 公式条
├─────────────────────────────────────────────┤
│ 计算参数                                      │
│ [销售业绩（未税）: 1000000] [销售费用: 100000]  │
│ [计算提成] [清空]                              │  ← 输入区（含费用>业绩警告）
├─────────────────────────────────────────────┤
│ 销售业绩 1000000.00 │ 销售费用 100000.00      │
│ 提成基数 900000.00  │ 总提成 18000.00 ★渐变主卡 │  ← 4 张汇总卡
├─────────────────────────────────────────────┤
│ ⚠️ 警告条（仅配置异常时显示）                   │
├─────────────────────────────────────────────┤
│ 提成明细（岗位 × 流程节点）                     │
│ #│节点│比例│运营│销售│...│节点小计             │  ← 明细矩阵（动态列）
│ 1│客户信息收集│5%│818.18│—│...│818.18         │
│ ...9 行...                                    │
│ 岗位合计│100%│818.18│8345.44│...│18000.00     │  ← 合计行（加粗高亮）
├─────────────────────────────────────────────┤
│ 计算历史                    [批量导出 CSV]     │
│ ID│业绩│费用│基数│总提成│时间│复用/导出/删除    │  ← 全量加载、一页展示
│ ...全部记录...                                │
└─────────────────────────────────────────────┘
```

**交互逻辑：**
- 首次进入自动用默认值（100万/10万）计算一次展示结果
- 输入校验：非数字提示、负数拦截、费用>业绩时实时警告
- 计算完成后自动滚动到结果区
- 点击历史"复用输入"回填输入框并回到顶部
- 每次计算自动写入历史（`POST /api/calculate` 内部完成）

### 4.3 第二页 — 系统设置（SettingsPage）

```
┌─────────────────────────────────────────────┐
│ 系统设置                    [保存设置]（右上）  │
│ 配置总提成比例与各流程节点的岗位分配比例         │
├─────────────────────────────────────────────┤
│ 基础参数                                      │
│ 总提成比例: [2] %   当前：2%（默认 2%）        │
│ 公式：总提成 =（销售业绩−销售费用）× 2.00%      │  ← 公式条
├─────────────────────────────────────────────┤
│ 流程节点与岗位分配                             │
│ [输入新岗位名称] [添加岗位] [添加流程节点] [恢复默认] │  ← 工具栏
│ ✅ 比例校验通过条（或 ⚠️ 警告条）              │
│ 流程节点│节点比例│运营│销售│...│平衡校验│操作   │  ← 11 列，一页完整显示
│ 客户信息收集│5%│5%│—│...│● 平衡│删除          │
│ ...9 行...（每行岗位比例可编辑 InputNumber）   │
└─────────────────────────────────────────────┘
```

**交互逻辑：**
- 所有编辑实时更新 React state，dirty 时保存按钮提示"有未保存修改"
- 添加岗位：输入名称 + 回车或按钮，重复名称拦截
- 添加节点：追加一行（默认比例 0），提示设置比例
- 删除节点：至少保留 1 行，超 1 行才允许删除
- 恢复默认：重置为 Excel 9 节点 7 岗位数据（需手动保存）
- 保存：`PUT /api/settings`，返回 warnings 不阻断保存
- 平衡校验：每行"节点内岗位比例之和 = 节点比例"显示 ● 绿点（平衡）或橙色（差 X%）

---

## 5. 数据模型

### 5.1 设置结构（settings 表 + JSON 列）

```ts
interface PositionMap {
  [positionName: string]: number;      // 岗位名 → 比例（小数）
}

interface FlowNode {
  id: string;                          // 'n1' ~ 'n9' 或运行时生成的 'n_时间戳'
  name: string;                        // 节点名，如 "客户信息收集"
  nodeRatio: number;                   // 节点比例（小数，如 0.05）
  positions: PositionMap;              // 岗位分配：岗位名 → 比例
}

interface Settings {
  totalRate: number;                   // 总提成比例（默认 0.02）
  nodes: FlowNode[];                   // 流程节点列表（默认 9 个）
  positionOrder: string[];             // 岗位列顺序（默认 7 个）
}
```

### 5.2 SQLite 表结构

```sql
-- 设置表（单行约束，id 恒为 1）
CREATE TABLE IF NOT EXISTS settings (
  id          INTEGER PRIMARY KEY CHECK (id = 1),
  total_rate  REAL NOT NULL DEFAULT 0.02,
  nodes_json  TEXT NOT NULL,           -- JSON: { nodes, positionOrder }
  updated_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- 计算历史表
CREATE TABLE IF NOT EXISTS calculation_history (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  sales_amount      REAL NOT NULL,     -- 销售业绩（未税）
  sales_cost        REAL NOT NULL,     -- 销售费用
  base_amount       REAL NOT NULL,     -- 提成基数
  total_commission  REAL NOT NULL,     -- 总提成
  settings_snapshot TEXT NOT NULL,     -- 计算时所用配置快照 JSON
  result_json       TEXT NOT NULL,     -- 计算结果明细 JSON
  created_at        TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_history_created ON calculation_history(created_at DESC);
```

> **快照设计**：`settings_snapshot` 保存计算时的完整配置，历史记录永远可还原当时口径（即使后来修改了参数）。

---

## 6. API 设计

| 方法 | 路径 | 功能 | 请求体 | 响应 |
|---|---|---|---|---|
| GET | `/api/health` | 健康检查 | — | `{ ok: true, time }` |
| GET | `/api/settings` | 读取当前配置 | — | `{ data: Settings }` |
| PUT | `/api/settings` | 保存配置（覆盖式） | 完整 `Settings` | `{ data, warnings[] }` |
| POST | `/api/calculate` | 计算并自动写历史 | `{ salesAmount, salesCost }` | `{ data: CalculationResult }` |
| GET | `/api/history?page=&pageSize=` | 历史分页（上限 10000） | — | `{ data: { list, total, page, pageSize } }` |
| DELETE | `/api/history/:id` | 删除单条历史 | — | 204 |

### 计算结果结构

```ts
interface CalculationResult {
  salesAmount: number;
  salesCost: number;
  baseAmount: number;                    // 提成基数
  totalCommission: number;               // 总提成
  settingsSnapshot: Settings;            // 配置快照
  nodeRows: NodeResultRow[];             // 节点明细
  positionTotals: Record<string, number>;// 岗位汇总
  warnings: string[];                    // 校验警告（默认数据为空）
}

interface NodeResultRow {
  nodeId: string;
  nodeName: string;
  nodeRatio: number;
  nodeAmount: number;                    // 节点小计
  positions: Record<string, number>;     // 岗位金额
  allocatedDiff: number;                 // 分位舍入差
}
```

---

## 7. 计算核心逻辑

### 7.1 算法（services/calculator.ts）

```
1. baseAmount      = round2(salesAmount - salesCost)
2. totalCommission = round2(baseAmount × totalRate)
3. totalWeight     = Σ 全部岗位比例
4. 岗位金额 = round2(totalCommission × 岗位比例 / totalWeight)
5. 节点小计 = Σ 该节点岗位金额（round2）
6. 全局尾差吸收：最后一个岗位金额 += (totalCommission − Σ已分配)
   → 保证 Σ岗位金额 == Σ节点小计 == totalCommission
```

### 7.2 精度处理

- 所有金额统一 `round2`（`Math.round(x * 100) / 100`），禁止裸浮点
- 分位舍入差显式暴露在 `allocatedDiff` 字段
- 最后一个岗位吸收尾差，财务上总账恒平

### 7.3 数值验证示例（默认配置）

输入：业绩 1,000,000，费用 100,000，比例 2%

```
基数 = 900,000
总提成 = 18,000.00
运营人员 818.18 │ 销售人员 8,345.44 │ 销售主管 1,636.36 │ 项目管理人员 1,636.39
技术人员 3,436.36 │ 总经理参与 1,800.00 │ 销售助理 327.27
Σ = 18,000.00 ✓（与总提成严格相等）
```

---

## 8. 导出功能

### 8.1 单条导出（行内「导出」按钮）

文件：`提成明细_<id>_<时间>.csv`

```
销售提成计算明细
计算时间,2026-08-03 13:25:17
销售业绩（未税）,1000000.00
销售费用,100000.00
提成基数,900000.00
总提成（比例 2.00%）,18000.00

流程节点,节点比例,运营人员,销售人员,...,节点小计
客户信息收集,5.00%,818.18,,,,,818.18
...9 行...
岗位合计,100%,818.18,8345.44,...,18000.00
```

### 8.2 批量导出（「批量导出 CSV」按钮）

文件：`提成历史汇总_<N>条_<时间>.csv`

```
ID,计算时间,销售业绩（未税）,销售费用,提成基数,总提成,运营人员,销售人员,...
21,2026-08-03 13:25:17,1000000.00,100000.00,900000.00,18000.00,818.18,8345.44,...
20,2026-08-03 13:20:38,...
```

### 8.3 实现要点（utils/export.ts）

- UTF-8 BOM 头，Excel 直接打开中文不乱码
- 数字**不带千分位逗号**（避免与 CSV 分隔符冲突）
- RFC 4180 转义（逗号/引号/换行加引号包裹）
- 批量导出按最新配置的岗位顺序展示

---

## 9. 校验规则

### 9.1 比例校验（validateSettings）

**保留的警告（数据真正不一致时）：**

| 检查项 | 示例 |
|---|---|
| 节点内岗位比例之和 ≠ 节点比例 | 节点「难点，关系攻克」内岗位比例之和 15% ≠ 节点比例 10% |
| 比例超出 0%~100% | 节点「客户信息收集」比例 120% 超出合理范围 |
| 节点名称为空 | 存在未命名的流程节点 |
| 总提成比例超出 0%~100% | 总提成比例 150% 超出合理范围 |

**已移除的警告（业务上认为原表正确）：**

| 原警告 | 说明 |
|---|---|
| 全部节点比例之和 ≠ 100% | 原表合计 110% 为公司设计原貌，不视为错误 |
| 全部岗位比例之和 ≠ 100% | 同上 |

### 9.2 输入校验（计算页）

- 金额必须为有效数字，否则提示"请输入有效的金额数字"
- 金额不能为负数
- 销售费用 > 销售业绩时实时显示橙色警告

### 9.3 设置页保存流程

- 前端实时校验（`calcCore.ts` 与后端 `validation.ts` 同构，规则不漂移）
- 校验不通过 → 橙色警告条 + 保存按钮仍可用
- 保存成功 → 绿色消息；有警告 → 橙色消息提示查看

---

## 10. 部署与启动

### 10.1 本地开发（一键启动）

```bash
cd "E:\WorkBuddy存储\2026-08-03-10-32-41\sales-commission"
npm run dev
# 前端：http://localhost:5173（Vite dev server + API 代理）
# 后端：http://localhost:3001
```

### 10.2 本地部署（生产模式，推荐）

```bash
npm run build        # 构建前端到 client/dist
npm start            # server 同时托管 client/dist 与 API
# 访问：http://localhost:3001/
```

### 10.3 静态单文件部署

```bash
cd client
npm run build
node scripts/make-standalone.mjs   # 生成 dist/standalone.html（939KB 单文件）
# 浏览器直接打开 standalone.html 即可（file:// 协议，前端兜底计算 + localStorage）
```

### 10.4 端口配置

- 后端默认 3001，可用 `PORT=3002 npm start` 更换
- 前端开发 5173，可改 `client/vite.config.ts`

---

## 11. 目录结构

```
sales-commission/
├── package.json                     # 根：concurrently 一键启动
├── README.md                        # 使用说明
├── screenshots/                     # 页面截图
├── server/                          # Express 后端
│   ├── package.json                 # express@4, better-sqlite3@^12, cors
│   ├── tsconfig.json
│   ├── data/commission.db           # SQLite（运行时生成）
│   └── src/
│       ├── index.ts                 # 入口：初始化 → 路由 → listen + 静态托管
│       ├── types.ts                 # 共享类型
│       ├── db/
│       │   ├── database.ts          # better-sqlite3 连接单例 + WAL
│       │   ├── schema.ts            # 幂等建表
│       │   └── seed.ts              # 默认 9 节点 7 岗位种子 + 读写设置
│       ├── services/calculator.ts   # ★ 计算核心（权重归一化 + 尾差吸收）
│       ├── routes/
│       │   ├── settings.ts          # GET/PUT /api/settings
│       │   ├── calculate.ts         # POST /api/calculate（计算+自动入库）
│       │   └── history.ts           # GET/DELETE /api/history
│       └── utils/validation.ts      # 比例校验
└── client/                          # React 前端
    ├── package.json                 # react@18, react-router-dom@6, tdesign-react
    ├── vite.config.ts               # /api 代理 + emptyOutDir:false
    ├── index.html
    ├── scripts/make-standalone.mjs  # 单文件打包脚本
    └── src/
        ├── main.tsx                 # 挂载 + HashRouter/BrowserRouter 兼容
        ├── App.tsx                  # 布局 + 路由
        ├── api/                     # http/settings/calculate/history/probe
        ├── types/index.ts
        ├── utils/
        │   ├── format.ts            # 千分位/百分比格式化
        │   ├── calcCore.ts          # ★ 前端计算核心（与后端同构，静态兜底）
        │   ├── localStore.ts        # localStorage 持久化（静态模式）
        │   └── export.ts            # CSV 导出（单条/批量）
        ├── pages/
        │   ├── CalculatorPage.tsx   # ★ 首页：提成计算
        │   └── SettingsPage.tsx     # ★ 第二页：系统设置
        ├── components/
        │   ├── calculator/          # InputForm/SummaryCards/ResultTable/HistoryTable
        │   └── settings/            # TotalRateEditor/NodeEditor/RatioWarn
        └── styles/global.css        # 设计系统
```

---

## 12. 关键实现要点

### 12.1 TDesign React 引入

```tsx
import { Button } from 'tdesign-react';          // 组件按需 tree-shaking
import 'tdesign-react/es/style/index.css';       // ★ 必须：全量样式
import zhCN from 'tdesign-react/es/locale/zh_CN'; // 中文 locale
<ConfigProvider globalConfig={zhCN}>...</ConfigProvider>
```

- React 用 18.3 规避 react-19-adapter 问题
- 水平菜单用 `Menu.HeadMenu`（不是 `Menu` + mode）

### 12.2 路由兼容

```tsx
const Router = window.location.protocol === 'file:' ? HashRouter : BrowserRouter;
```

- BrowserRouter 在 file:// 协议下不可用，HashRouter 兜底

### 12.3 金额精度

- `round2` 统一处理，禁止裸浮点比较
- 尾差吸收保证总账恒平

### 12.4 Vite 构建沙箱兼容

```ts
build: { emptyOutDir: false }
```

- 沙箱环境禁止 rmSync，构建前手动清理 dist

### 12.5 better-sqlite3

- v12.x 有 Windows x64 预编译二进制，Node 22 零编译
- `db.pragma('journal_mode = WAL')` 提升并发

---

## 13. 版本迭代记录

| 版本 | 内容 |
|---|---|
| v1.0 | 初始交付：双页面 + Express + SQLite + 权重归一化计算 |
| v1.1 | 本地部署 http://localhost:3001/，前端兜底（calcCore + localStorage） |
| v1.2 | UI 全面升级：品牌区、公式条、渐变主卡、状态点、进度条 |
| v1.3 | 历史记录单条/批量导出 CSV；全量加载一页展示 |
| v1.4 | 按原表认知修正：移除"比例和 ≠ 100%"警告，保留节点内校验 |
| v1.5 | 设置页表格 11 列压缩至 1130px 一页完整显示；移除进度条 |
