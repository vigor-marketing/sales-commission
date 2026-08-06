import { getDb } from './database.js';
import type { Settings, Template, Currency, FlowNode } from '../types.js';

/** 默认汇率（外币 → 人民币） */
const DEFAULT_RATES: Record<Currency, number> = { CNY: 1, USD: 7.2, EUR: 7.8 };

/** 默认人员名单 */
const DEFAULT_STAFF: string[] = [];

/** 默认节点（参考 Excel 数据，逻辑已校验） */
function defaultNodes(): FlowNode[] {
  return [
    { id: 'n1', name: '客户信息收集', nodeRatio: 0.05, positions: { 运营人员: 0.05 } },
    { id: 'n2', name: '筛选客户/项目洽谈', nodeRatio: 0.1, positions: { 销售人员: 0.1 } },
    { id: 'n3', name: '提交技术方案及确认', nodeRatio: 0.2, positions: { 销售人员: 0.1, 技术人员: 0.1 } },
    { id: 'n4', name: '难点，关系攻克', nodeRatio: 0.1, positions: { 销售人员: 0.02, 总经理参与: 0.08 } },
    { id: 'n5', name: '项目评审', nodeRatio: 0.08, positions: { 销售人员: 0.02, 技术人员: 0.03, 总经理参与: 0.03 } },
    { id: 'n6', name: '项目跟进-合同签订', nodeRatio: 0.3, positions: { 销售人员: 0.2, 销售主管: 0.1 } },
    { id: 'n7', name: '生产跟进-产品交付', nodeRatio: 0.12, positions: { 销售人员: 0.02, 技术人员: 0.08, 销售助理: 0.02 } },
    { id: 'n8', name: '验收-收款', nodeRatio: 0.1, positions: { 销售人员: 0.05, 项目管理人员: 0.05 } },
    { id: 'n9', name: '售后服务', nodeRatio: 0.05, positions: { 项目管理人员: 0.05 } },
  ];
}

const DEFAULT_POSITION_ORDER = [
  '运营人员',
  '销售人员',
  '销售主管',
  '项目管理人员',
  '技术人员',
  '总经理参与',
  '销售助理',
];

/** 默认模板列表 */
export function defaultTemplates(): Template[] {
  return [
    {
      id: 'new-customer',
      name: '新客户提成计算表',
      totalRate: 0.02,
      nodes: defaultNodes(),
      positionOrder: [...DEFAULT_POSITION_ORDER],
      defaultRates: { ...DEFAULT_RATES },
    },
    {
      id: 'old-customer',
      name: '老客户提成计算表',
      totalRate: 0.02,
      nodes: defaultNodes().map((n) => ({ ...n, positions: { ...n.positions } })),
      positionOrder: [...DEFAULT_POSITION_ORDER],
      defaultRates: { ...DEFAULT_RATES },
    },
  ];
}

/** 默认设置 */
export function defaultSettings(): Settings {
  return {
    templates: defaultTemplates(),
    staffList: [...DEFAULT_STAFF],
    personPositions: {},
  };
}

/** 首次启动时写入默认设置（仅当 settings 表为空） */
export function seedIfEmpty(): void {
  const db = getDb();
  const row = db.prepare('SELECT id FROM settings WHERE id = 1').get();
  if (!row) {
    saveSettingsRow(defaultSettings());
  }
}

/**
 * 读取当前设置。
 * 兼容旧库：旧结构为 { totalRate, nodes, positionOrder, defaultRates, staffList }，
 * 迁移为 templates（把旧配置作为第一个模板"新客户提成计算表"）。
 */
export function readSettings(): Settings {
  const db = getDb();
  const row = db.prepare('SELECT total_rate, nodes_json FROM settings WHERE id = 1').get() as
    | { total_rate: number; nodes_json: string }
    | undefined;
  if (!row) {
    seedIfEmpty();
    return defaultSettings();
  }
  const parsed = JSON.parse(row.nodes_json) as Record<string, unknown>;

  // 新结构：含 templates
  const templatesRaw = parsed.templates;
  if (Array.isArray(templatesRaw) && templatesRaw.length > 0) {
    return {
      templates: templatesRaw as Template[],
      staffList: Array.isArray(parsed.staffList) ? (parsed.staffList as string[]) : [],
      personPositions:
        parsed.personPositions && typeof parsed.personPositions === 'object'
          ? (parsed.personPositions as Record<string, string[]>)
          : {},
    };
  }

  // 旧结构迁移：构造单个模板
  const oldNodes = parsed.nodes as Template['nodes'] | undefined;
  const oldOrder = parsed.positionOrder as string[] | undefined;
  const oldRates = parsed.defaultRates as Record<Currency, number> | undefined;
  const legacy: Template = {
    id: 'new-customer',
    name: '新客户提成计算表',
    totalRate: row.total_rate,
    nodes: oldNodes && oldNodes.length > 0 ? oldNodes : defaultNodes(),
    positionOrder: oldOrder && oldOrder.length > 0 ? oldOrder : [...DEFAULT_POSITION_ORDER],
    defaultRates: oldRates ?? { ...DEFAULT_RATES },
  };
  return {
    templates: [legacy],
    staffList: Array.isArray(parsed.staffList) ? (parsed.staffList as string[]) : [],
    personPositions: {},
  };
}

/** 保存设置（覆盖式） */
export function saveSettings(s: Settings): void {
  saveSettingsRow(s);
}

function saveSettingsRow(s: Settings): void {
  const db = getDb();
  const templates = s.templates && s.templates.length > 0 ? s.templates : defaultTemplates();
  const payload = JSON.stringify({
    templates,
    staffList: Array.isArray(s.staffList) ? s.staffList : [],
    personPositions: s.personPositions ?? {},
  });
  db.prepare(
    `INSERT INTO settings (id, total_rate, nodes_json, updated_at)
     VALUES (1, ?, ?, datetime('now','localtime'))
     ON CONFLICT(id) DO UPDATE SET
       total_rate = excluded.total_rate,
       nodes_json = excluded.nodes_json,
       updated_at = datetime('now','localtime')`
  ).run(templates[0].totalRate, payload);
}

/** 取模板（按 id，缺省第一个） */
export function getTemplate(s: Settings, templateId?: string): Template {
  if (templateId) {
    const found = s.templates.find((t) => t.id === templateId);
    if (found) return found;
  }
  return s.templates[0] ?? defaultTemplates()[0];
}
