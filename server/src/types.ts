/**
 * 共享类型定义
 */

/** 岗位名 → 比例（小数，如 0.05） */
export interface PositionMap {
  [positionName: string]: number;
}

/** 流程节点 */
export interface FlowNode {
  id: string;
  name: string;
  /** 节点比例（小数，如 0.05） */
  nodeRatio: number;
  /** 岗位分配：岗位名 → 比例 */
  positions: PositionMap;
}

/** 表格类型模板（新客户/老客户等，每种有自己的比例配置） */
export interface Template {
  /** 模板 ID（如 new-customer / old-customer） */
  id: string;
  /** 模板名称（如"新客户提成计算表"） */
  name: string;
  /** 总提成比例（小数，如 0.02 = 2%） */
  totalRate: number;
  /** 流程节点列表 */
  nodes: FlowNode[];
  /** 岗位列顺序 */
  positionOrder: string[];
  /** 默认汇率（外币 → 人民币），计算时可逐笔修改 */
  defaultRates: Record<Currency, number>;
}

/** 系统设置 */
export interface Settings {
  /** 表格类型模板列表 */
  templates: Template[];
  /** 人员名单（销售/市场人员） */
  staffList: string[];
  /** 人员岗位分配：人员名 → 岗位数组（每人最多 2 个岗位） */
  personPositions?: Record<string, string[]>;
}

/** 单个节点的计算结果 */
export interface NodeResultRow {
  nodeId: string;
  nodeName: string;
  nodeRatio: number;
  /** 节点小计金额 */
  nodeAmount: number;
  /** 岗位名 → 岗位提成金额 */
  positions: Record<string, number>;
  /** 节点小计与岗位分配之和的舍入差（分位误差） */
  allocatedDiff: number;
}

/** 计算请求 */
export interface CalculateInput {
  /** 销售业绩（未税） */
  salesAmount: number;
  /** 销售费用 */
  salesCost: number;
}

/** 币种 */
export type Currency = 'CNY' | 'USD' | 'EUR';

/** 收款计划（单笔） */
export interface PaymentPlanItem {
  /** 月份，格式 YYYY-MM，如 "2026-08" */
  month: string;
  /** 币种 */
  currency: Currency;
  /** 原币收款金额 */
  amount: number;
  /** 汇率（原币 → 人民币，CNY 时为 1，可修改） */
  rate: number;
  /** 人民币金额 = amount × rate（CNY 时 = amount） */
  amountCNY: number;
  /** 是否已收款（false 表示未收款，统计页仍显示） */
  received: boolean;
  /** 收款比例（小数 0~1，全部收款之和必须 = 100%）；一笔且=1 表示全款 */
  ratio?: number;
  /** 备注（默认输入框，选填） */
  note?: string;
}

/** 销售费用（单笔，可多笔叠加） */
export interface SalesFee {
  /** 币种：默认人民币 CNY，可选美元 USD */
  currency: Currency;
  /** 原币金额 */
  amount: number;
  /** 汇率（原币 → 人民币，CNY 为 1） */
  rate: number;
  /** 人民币金额 */
  amountCNY: number;
  /** 费用名称/说明（可选） */
  note?: string;
}

/** 计算请求（含合同信息与收款计划） */
export interface CalculateRequest {
  /** 销售业绩（原币金额，币种由 salesCurrency 指定） */
  salesAmount: number;
  /** 业绩币种：默认 USD，可选 EUR / CNY */
  salesCurrency?: Currency;
  /** 业绩汇率（原币 → 人民币，CNY 为 1，可修改） */
  salesRate?: number;
  /** 销售费用（多笔叠加，默认人民币，可选美元） */
  salesFees?: SalesFee[];
  /** 销售费用合计（人民币，兼容旧客户端直接传） */
  salesCost?: number;
  /** 表格类型模板 ID（缺省用第一个模板） */
  templateId?: string;
  /** 合同号 */
  contractNo?: string;
  /** 销售姓名 */
  customerName?: string;
  /** 这笔收款（第 planIndex 笔） */
  payment?: PaymentPlanItem;
  /** 收款计划（数组，兼容旧客户端；新客户端用 payment 单笔） */
  paymentPlan?: PaymentPlanItem[];
  /** 岗位人员分配：岗位名 → 人员姓名（计算时指定，每次独立，不存默认） */
  positionPersons?: Record<string, string>;
}

/** 计算结果 */
export interface CalculationResult {
  /** 销售业绩（人民币） */
  salesAmount: number;
  /** 销售业绩（原币金额） */
  salesAmountOrig?: number;
  /** 业绩币种 */
  salesCurrency?: Currency;
  /** 业绩汇率 */
  salesRate?: number;
  /** 销售费用合计（人民币） */
  salesCost: number;
  /** 销售费用明细（多笔） */
  salesFees?: SalesFee[];
  /** 提成基数 = 业绩 - 费用 */
  baseAmount: number;
  /** 合同总提成 = 基数 × 总比例 */
  totalCommission: number;
  /** 这笔收款对应的提成 = 合同总提成 × 该笔比例 */
  commission?: number;
  /** 这笔是第几笔（1-based） */
  planIndex?: number;
  /** 该合同收款计划共几笔 */
  totalPlanCount?: number;
  /** 计算所用表格模板快照 */
  settingsSnapshot: Template;
  /** 节点明细（合同级岗位分配） */
  nodeRows: NodeResultRow[];
  /** 岗位汇总（合同级）：岗位名 → 合计金额 */
  positionTotals: Record<string, number>;
  /** 岗位人员分配：岗位名 → 人员姓名（本次计算指定） */
  positionPersons?: Record<string, string>;
  /** 该合同累计收款比例（所有已保存笔之和，小数 0~1） */
  contractPaidRatio?: number;
  /** 是否已收满 100%（累计比例 = 1） */
  contractPaidFull?: boolean;
  /** 校验警告（设置不满足和=1 时的提示） */
  warnings: string[];
}

/** 历史记录（数据库行） */
export interface HistoryRecord {
  id: number;
  /** 合同号 */
  contractNo: string;
  /** 销售姓名 */
  customerName: string;
  /** 收款计划（旧数据为数组；新数据为该笔收款单元素数组） */
  paymentPlan: PaymentPlanItem[];
  /** 岗位人员分配：岗位名 → 人员姓名 */
  positionPersons?: Record<string, string>;
  /** 这笔是第几笔 */
  planIndex?: number;
  /** 共几笔 */
  totalPlanCount?: number;
  /** 这笔提成 */
  commission?: number;
  /** 合同总提成 */
  contractTotalCommission?: number;
  salesAmount: number;
  salesCost: number;
  baseAmount: number;
  totalCommission: number;
  settingsSnapshot: Settings;
  result: CalculationResult;
  createdAt: string;
}

/** 合同主数据（合同录入页管理：业绩/费用/收款计划/岗位人员等） */
export interface Contract {
  id: number;
  contractNo: string;
  customerName: string;
  templateId: string;
  salesCurrency: Currency;
  salesAmountOrig: number;
  salesRate: number;
  salesFees: SalesFee[];
  paymentPlan: PaymentPlanItem[];
  positionPersons: Record<string, string>;
  totalPlanCount: number;
  note: string;
  createdAt: string;
  updatedAt: string;
}

/** 销售费用名称字典 */
export interface FeeName {
  id: number;
  name: string;
  sortOrder: number;
  createdAt: string;
}
