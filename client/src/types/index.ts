/** 与后端共享的类型定义（结构保持一致） */

export interface PositionMap {
  [positionName: string]: number;
}

export interface FlowNode {
  id: string;
  name: string;
  nodeRatio: number;
  positions: PositionMap;
}

/** 表格类型模板 */
export interface Template {
  id: string;
  name: string;
  totalRate: number;
  nodes: FlowNode[];
  positionOrder: string[];
  defaultRates: Record<Currency, number>;
}

export interface Settings {
  /** 表格类型模板列表 */
  templates: Template[];
  /** 人员名单 */
  staffList: string[];
  /** 人员岗位分配：人员名 → 岗位数组（每人最多 2 个岗位） */
  personPositions?: Record<string, string[]>;
}

export interface NodeResultRow {
  nodeId: string;
  nodeName: string;
  nodeRatio: number;
  nodeAmount: number;
  positions: Record<string, number>;
  allocatedDiff: number;
}

export interface CalculateInput {
  salesAmount: number;
  salesCost: number;
}

/** 币种 */
export type Currency = 'CNY' | 'USD' | 'EUR';

/** 收款计划（单笔） */
export interface PaymentPlanItem {
  /** 月份 YYYY-MM */
  month: string;
  currency: Currency;
  /** 原币金额 */
  amount: number;
  /** 汇率（原币→人民币，CNY 为 1） */
  rate: number;
  /** 人民币金额 = amount × rate */
  amountCNY: number;
  /** 是否已收款（false 表示未收款） */
  received: boolean;
  /** 收款比例（小数 0~1，该合同所有笔之和 = 100%）；一笔且=1 表示全款 */
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
  /** 销售费用合计（人民币，兼容旧客户端） */
  salesCost?: number;
  templateId?: string;
  contractNo?: string;
  customerName?: string;
  /** 这笔收款（第 planIndex 笔） */
  payment?: PaymentPlanItem;
  /** 收款计划（数组，兼容旧客户端） */
  paymentPlan?: PaymentPlanItem[];
  /** 这笔是第几笔（1-based） */
  planIndex?: number;
  /** 该合同收款计划共几笔 */
  totalPlanCount?: number;
  /** 岗位人员分配：岗位名 → 人员姓名（计算时指定，每次独立） */
  positionPersons?: Record<string, string>;
}

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
  baseAmount: number;
  /** 合同总提成 */
  totalCommission: number;
  /** 这笔收款对应的提成 = 合同总提成 × 该笔比例 */
  commission?: number;
  /** 这笔是第几笔（1-based） */
  planIndex?: number;
  /** 该合同收款计划共几笔 */
  totalPlanCount?: number;
  /** 计算所用表格模板快照 */
  settingsSnapshot: Template;
  nodeRows: NodeResultRow[];
  positionTotals: Record<string, number>;
  /** 岗位人员分配：岗位名 → 人员姓名（本次计算指定） */
  positionPersons?: Record<string, string>;
  /** 该合同累计收款比例（所有已保存笔之和，小数 0~1） */
  contractPaidRatio?: number;
  /** 是否已收满 100%（累计比例 = 1） */
  contractPaidFull?: boolean;
  warnings: string[];
}

export interface HistoryRecord {
  id: number;
  contractNo: string;
  customerName: string;
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
  settingsSnapshot: Template;
  result: CalculationResult;
  createdAt: string;
}

export interface HistoryPage {
  list: HistoryRecord[];
  total: number;
  page: number;
  pageSize: number;
}

/** 合同查询结果（自动带出） */
export interface ContractLookup {
  contractNo: string;
  customerName: string;
  paymentPlan: PaymentPlanItem[];
  positionPersons?: Record<string, string>;
  /** 合同级信息（最新一条） */
  salesAmount?: number;
  salesAmountOrig?: number;
  salesCurrency?: Currency;
  salesRate?: number;
  salesFees?: SalesFee[];
  salesCost?: number;
  templateName?: string;
  templateId?: string;
  /** 该合同已录到第几笔 */
  lastPlanIndex?: number;
  totalPlanCount?: number;
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
  /** 合同备注（已停用，兼容历史数据保留可选） */
  note?: string;
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

/** 合同已录的收款计划列表项（提成计算页用） */
export interface PlanHistoryItem {
  planIndex: number;
  month: string;
  currency: string;
  amount: number;
  ratio?: number;
  received: boolean;
  note: string;
}
