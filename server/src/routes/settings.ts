import { Router } from 'express';
import { readSettings, saveSettings, defaultTemplates } from '../db/seed.js';
import { validateTemplate } from '../utils/validation.js';
import { scheduleBackup } from '../services/backup.js';
import type { Settings, Template, Currency } from '../types.js';

export const settingsRouter = Router();

/** GET /api/settings — 读取当前配置 */
settingsRouter.get('/', (_req, res) => {
  res.json({ data: readSettings() });
});

/** PUT /api/settings — 保存配置（校验不阻断，warnings 返回提示） */
settingsRouter.put('/', (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  if (!body || typeof body !== 'object') {
    res.status(400).json({ error: '请求体必须是设置对象' });
    return;
  }

  // 兼容旧格式：若只提交 totalRate/nodes/positionOrder（无 templates），包装为单个模板
  let templates: Template[];
  if (Array.isArray(body.templates) && (body.templates as unknown[]).length > 0) {
    templates = ((body.templates as Array<Partial<Template>>) ?? []).map((t, i) => ({
      id: typeof t.id === 'string' && t.id ? t.id : `template-${i + 1}`,
      name: typeof t.name === 'string' && t.name.trim() ? t.name.trim() : `表格类型${i + 1}`,
      totalRate: Number(t.totalRate) || 0.02,
      nodes: Array.isArray(t.nodes) ? t.nodes : [],
      positionOrder: Array.isArray(t.positionOrder) ? t.positionOrder : [],
      defaultRates: sanitizeRates(t.defaultRates),
    }));
  } else {
    const legacyTotal = Number(body.totalRate) || 0.02;
    templates = [
      {
        id: 'new-customer',
        name: '新客户提成计算表',
        totalRate: legacyTotal,
        nodes: Array.isArray(body.nodes) ? (body.nodes as Template['nodes']) : [],
        positionOrder: Array.isArray(body.positionOrder)
          ? (body.positionOrder as string[])
          : [],
        defaultRates: sanitizeRates(body.defaultRates),
      },
    ];
  }

  const staffList = Array.isArray(body.staffList)
    ? [...new Set((body.staffList as string[]).map((s) => String(s).trim()).filter(Boolean))]
    : [];

  // 人员岗位分配：人员名 → 岗位数组（每人最多 2 个岗位）
  const personPositions: Record<string, string[]> = {};
  if (body.personPositions && typeof body.personPositions === 'object') {
    for (const [person, positions] of Object.entries(body.personPositions as Record<string, unknown>)) {
      const list = Array.isArray(positions) ? (positions as unknown[]).map(String).filter(Boolean) : [];
      if (person && list.length > 0) personPositions[person] = list.slice(0, 2);
    }
  }

  const settings: Settings = { templates, staffList, personPositions };

  const warnings = settings.templates.flatMap((t) => validateTemplate(t));
  saveSettings(settings);
  // 数据变更 → 触发云端备份
  scheduleBackup();
  res.json({ data: readSettings(), warnings });
});

function sanitizeRates(raw: unknown): Record<Currency, number> {
  const base = defaultTemplates()[0].defaultRates;
  const r = (raw ?? {}) as Partial<Record<Currency, number>>;
  return {
    CNY: 1,
    USD: Number.isFinite(Number(r.USD)) && Number(r.USD) > 0 ? Number(r.USD) : base.USD,
    EUR: Number.isFinite(Number(r.EUR)) && Number(r.EUR) > 0 ? Number(r.EUR) : base.EUR,
  };
}
