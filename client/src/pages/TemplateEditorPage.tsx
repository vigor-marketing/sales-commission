import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Input, MessagePlugin } from 'tdesign-react';
import type { Settings, Template, FlowNode } from '../types';
import { getSettings, saveSettings } from '../api/settings';
import { defaultSettings, validateTemplate } from '../utils/calcCore';
import TotalRateEditor from '../components/settings/TotalRateEditor';
import NodeEditor from '../components/settings/NodeEditor';
import ExchangeRateEditor from '../components/settings/ExchangeRateEditor';
import RatioWarn from '../components/settings/RatioWarn';

/** 新增表格类型：独立页面填写名称/比例/节点/岗位/汇率，保存后返回系统设置 */
export default function TemplateEditorPage() {
  const navigate = useNavigate();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [name, setName] = useState('');
  const [template, setTemplate] = useState<Template | null>(null);
  const [newPosition, setNewPosition] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const s = await getSettings();
        setSettings(s);
        // 以第一个表格类型为底本克隆，避免从空白开始搭建 9 个节点
        const base = s.templates[0] ?? defaultSettings().templates[0];
        setTemplate({
          id: `tpl-${Date.now()}`,
          name: '',
          totalRate: base.totalRate,
          nodes: base.nodes.map((n) => ({ ...n, positions: { ...n.positions } })),
          positionOrder: [...base.positionOrder],
          defaultRates: { ...base.defaultRates },
        });
      } catch (e) {
        MessagePlugin.error(e instanceof Error ? e.message : '加载设置失败');
      }
    })();
  }, []);

  const addPosition = () => {
    if (!template) return;
    const pos = newPosition.trim();
    if (!pos) {
      MessagePlugin.warning('请输入岗位名称');
      return;
    }
    if (template.positionOrder.includes(pos)) {
      MessagePlugin.warning(`岗位「${pos}」已存在`);
      return;
    }
    setTemplate({
      ...template,
      positionOrder: [...template.positionOrder, pos],
      nodes: template.nodes.map((n) => ({ ...n, positions: { ...n.positions, [pos]: 0 } })),
    });
    setNewPosition('');
  };

  const addNode = () => {
    if (!template) return;
    const newNode: FlowNode = {
      id: `n_${Date.now()}`,
      name: `新流程节点${template.nodes.length + 1}`,
      nodeRatio: 0,
      positions: {},
    };
    setTemplate({ ...template, nodes: [...template.nodes, newNode] });
  };

  const handleSave = async () => {
    if (!settings || !template) return;
    const n = name.trim();
    if (!n) {
      MessagePlugin.warning('请输入表格类型名称');
      return;
    }
    const newTemplate: Template = { ...template, name: n };
    const next: Settings = { ...settings, templates: [...settings.templates, newTemplate] };
    setSaving(true);
    try {
      const res = await saveSettings(next);
      if (res.warnings.length > 0) {
        MessagePlugin.warning('已保存，但存在比例偏差，请到系统设置查看');
      } else {
        MessagePlugin.success(`已添加表格类型「${n}」`);
      }
      navigate('/settings');
    } catch (e) {
      MessagePlugin.error(e instanceof Error ? e.message : '保存失败，请重试');
    } finally {
      setSaving(false);
    }
  };

  if (!settings || !template) {
    return (
      <div className="page-container">
        <div className="page-header">
          <div>
            <h2 className="page-title">新增表格类型</h2>
          </div>
        </div>
        <div className="section-card" style={{ textAlign: 'center', padding: 60, color: '#9aa3b5' }}>
          加载中…
        </div>
      </div>
    );
  }

  const warnings = validateTemplate({ ...template, name: name.trim() || '新表格类型' });

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h2 className="page-title">新增表格类型</h2>
          <div className="page-subtitle">填写名称、提成系数、流程节点与岗位分配、汇率后保存</div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Button variant="outline" onClick={() => navigate('/settings')}>取消</Button>
          <Button theme="primary" size="large" loading={saving} onClick={handleSave}>保存并返回</Button>
        </div>
      </div>

      {/* 表格类型名称 */}
      <div className="section-card">
        <div className="section-title">表格类型名称</div>
        <Input
          value={name}
          onChange={(v) => setName(String(v))}
          placeholder="例如：大客户提成计算表"
          style={{ width: 320 }}
        />
      </div>

      {/* 基础参数（提成系数） */}
      <TotalRateEditor
        totalRate={template.totalRate}
        onTotalRateChange={(v) => setTemplate({ ...template, totalRate: v })}
      />

      {/* 流程节点与岗位分配 */}
      <div className="section-card">
        <div className="section-title">
          <span>流程节点与岗位分配</span>
          <div className="toolbar">
            <Input
              value={newPosition}
              onChange={(v) => setNewPosition(String(v))}
              placeholder="输入新岗位名称"
              style={{ width: 180 }}
              onEnter={addPosition}
            />
            <Button variant="outline" onClick={addPosition}>添加岗位</Button>
            <Button variant="outline" onClick={addNode}>添加流程节点</Button>
          </div>
        </div>
        <div style={{ marginBottom: 16 }}>
          <RatioWarn warnings={warnings} />
        </div>
        <NodeEditor
          nodes={template.nodes}
          positionOrder={template.positionOrder}
          onChange={(nodes, positionOrder) => setTemplate({ ...template, nodes, positionOrder })}
        />
      </div>

      {/* 汇率设置 */}
      <ExchangeRateEditor
        rates={template.defaultRates}
        onChange={(rates) => setTemplate({ ...template, defaultRates: rates })}
      />
    </div>
  );
}
