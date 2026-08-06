# 销售提成系统 — 代码质量评估与团队技术提升方案

> 作者：资深开发工程师  |  日期：2026-08-04
> 范围：sales-commission（React 18 + TypeScript + TDesign + Express + SQLite）

---

## 一、现状评估（基于代码事实，非泛泛而谈）

### ✅ 做得好的（值得保持的工程实践）

| 实践 | 证据 |
|---|---|
| 前后端分离，接口清晰 | `/api/calculate|contracts|history|payments|commissions|settings|feeNames` 模块化路由 |
| 组件复用 | `ContractForm` 被「合同录入」和「合同管理」双页面共用 |
| 校验双保险 | 收款比例 100%、金额上限等前端拦截 + 后端 400/409 双重校验 |
| 数据模型有演进 | schema 迁移函数兼容旧库（旧单模板 → 新 templates 数组） |
| 表单联动计算 | 收款计划「比例 × 总金额 = 金额 × 汇率 = 人民币」双向联动（改金额反推比例） |

### ⚠️ 风险与问题（按严重程度排序）

**P0 — 类型安全缺口**
- `client/tsconfig.json` **未开启 strict**（server 已开）→ 前端大量隐式 `any`、`null` 未收窄，重构时是最大事故源。

**P0 — 零测试**
- 项目 **0 个测试文件**。而提成计算、比例分摊、合同去重统计都是**金钱逻辑**——改一行公式可能算错钱，没有任何回归保护。

**P0 — 死代码 437 行**
- `PaymentPlanEditor.tsx`（349 行）、`PositionPersonsEditor.tsx`（88 行）**无人引用**，是历次重构遗留。死代码会误导新人、增加维护成本。

**P1 — 双重数据源隐患**
- 前端 8 个 API 文件全部有 `isBackendAvailable()` 本地兜底分支（localStorage 计算+写历史）。
- 风险：后端短暂不可用时写入本地历史，恢复后**两份历史数据并存**，业务人员无法区分；且本地兜底是**另一套计算实现**（calcCore），两套逻辑可能算出差价。

**P1 — 无代码规范**
- 无 ESLint / Prettier / EditorConfig；各文件缩进、引号、命名风格不统一，评审成本高。

**P2 — 大文件**
- `ContractForm.tsx` 465 行、`InputForm.tsx` 439 行——表单业务集中，可拆子组件，但不紧急。

---

## 二、代码质量改进清单（可执行，分优先级）

### 🔴 P0 — 本周内完成

1. **开启前端 strict**
   ```jsonc
   // client/tsconfig.json
   { "compilerOptions": { "strict": true, "noUnusedLocals": true, "noUnusedParameters": true } }
   ```
   一次性修完 `tsc` 报错（预计 30~80 处），之后新代码 0 any。

2. **删除死代码**
   `rm PaymentPlanEditor.tsx PositionPersonsEditor.tsx`，并清掉对应类型/样式残留。

3. **收窄本地兜底（二选一）**
   - 推荐：**移除** localStorage 兜底计算，后端不可用时直接报错提示「服务暂不可用」，保证单一数据源；
   - 若保留：改为**只读降级**（仅显示上次结果，不写入本地历史）。

### 🟡 P1 — 两周内完成

4. **为核心金钱逻辑补测试（Vitest）**
   - `server/src/routes/calculate.ts`：总提成 = (业绩 − 费用) × 比例；这笔提成 = 总提成 × 该笔比例
   - `server/src/routes/commissions.ts`：按合同去重统计、按人×岗位矩阵、岗位人员回退
   - `server/src/routes/contracts.ts`：合同号唯一 upsert、收款计划比例和 = 100%
   - 覆盖边界：负数、超比例、汇率 0、人民币业绩、多币种费用
   - 目标：核心逻辑覆盖率 ≥ 90%

5. **引入 ESLint + Prettier**
   - 规则集：`typescript-eslint` recommended + `react-hooks` + import 排序；格式化统一单引号、尾逗号、2 空格。

### 🟢 P2 — 持续改进

6. **大组件拆分**：ContractForm 拆为 `SalesPerformanceSection / FeesSection / PaymentPlanSection / PositionPersonsSection`。
7. **共享校验层**：引入 `zod` 定义收款/费用/合同 schema，前后端各一个来源（`shared/` 目录），消灭「前端拦了后端没拦」类遗漏。
8. **API 错误规范化**：统一 `{ error: { code, message } }` 结构，前端按 code 处理（重复合同 409、比例超限 400 等），页面显示友好文案。
9. **Git 规范 + Code Review 流程**（见下）。

---

## 三、团队技术提升路径（怎么落地，不是口号）

### 1. 工程规范先行（1 周）
建 `docs/engineering-conventions.md`，写清楚：
- 组件规范：Props 接口必写、函数组件、受控表单模式（参照 ContractForm）
- 命名规范：组件 PascalCase、工具 camelCase、API 文件按资源命名
- 表单联动模式：比例驱动 / 金额反推比例的 setActive 拦截模式（本项目已有范例）
- 状态管理：无 Redux，页面级 useState + 受控组件（保持，别引入全局状态库）
- API 约定：REST 资源式、错误结构统一

### 2. 类型安全红线（立即生效）
- `strict` 开启后：**新代码禁止 `any`**（PR 评审一票否决）
- 共享类型放 `shared/types.ts`，前后端 import，避免两端类型漂移（本项目两端已有 `types.ts` 重复定义——合并）

### 3. 测试文化（从金钱逻辑开始 TDD）
- 团队第一个测试：`calculate.test.ts`——把「100000 USD × 7.25 − 50000 费用 = 675000 × 2% = 13500」写成用例
- 每次改计算公式/比例逻辑，**先写/改测试再改代码**
- 目标：`npm test` 成为提交前必跑命令

### 4. Code Review 制度化
- 小步提交：一个 PR ≤ 300 行改动
- Review Checklist（贴在 wiki/README）：
  - [ ] strict 通过、无 any
  - [ ] 新增逻辑有测试
  - [ ] 金额计算用分位取整（Math.round(x*100)/100）而非浮点直算
  - [ ] 后端校验覆盖了所有前端入口（不能只靠前端拦截）
  - [ ] 无 console.log / 临时调试代码
- 每周一次 30 分钟代码走查（Team Code Review），轮流主持

### 5. 每周技术分享（选题参考）
- TypeScript 类型体操（收窄、泛型、zod）
- React 受控组件与表单状态管理模式
- SQLite 事务与并发写（本项目单文件 DB，注意批量写入性能）
- 提成计算金额精度：浮点陷阱与分位取整

### 6. 度量与复盘
- 每迭代看 4 个指标：`tsc strict` 0 错误 / 测试通过数 / ESLint 0 error / 死代码行数
- 用这 4 个数字开复盘会，比主观感觉有说服力

---

## 四、我可以立即帮你执行的（P0 演示）

1. 开启前端 strict 并修复全部类型错误（一次性）
2. 删除两个死组件（437 行）
3. 写第一份核心计算测试（calculate + commissions 去重），示范测试怎么写
4. 配置 ESLint + Prettier

需要的话直接说「开始执行 P0」，我按顺序落地。
