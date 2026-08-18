import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Input, Select, MessagePlugin } from 'tdesign-react';
import type { Settings, Template, FlowNode } from '../types';
import { getSettings, saveSettings } from '../api/settings';
import { defaultSettings, validateTemplate as validateLocal } from '../utils/calcCore';
import TotalRateEditor from '../components/settings/TotalRateEditor';
import NodeEditor from '../components/settings/NodeEditor';
import RatioWarn from '../components/settings/RatioWarn';
import ExchangeRateEditor from '../components/settings/ExchangeRateEditor';
import StaffListEditor from '../components/settings/StaffListEditor';
import PersonPositionsEditor from '../components/settings/PersonPositionsEditor';
import FeeNamesEditor from '../components/settings/FeeNamesEditor';

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [newPosition, setNewPosition] = useState('');
  const [renamingPos, setRenamingPos] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [activeTemplateId, setActiveTemplateId] = useState('');
  const [dirty, setDirty] = useState(false);
  const navigate = useNavigate();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const s = await getSettings();
      setSettings(s);
      setActiveTemplateId(s.templates[0]?.id ?? '');
      setDirty(false);
    } catch (e) {
      MessagePlugin.error(e instanceof Error ? e.message : '加载设置失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading || !settings) {
    return (
      <div className="page-container">
        <div className="page-header">
          <div>
            <h2 className="page-title">系统设置</h2>
            <div className="page-subtitle">配置提成参数</div>
          </div>
        </div>
        <div className="section-card" style={{ textAlign: 'center', padding: 60, color: '#9aa3b5' }}>
          加载中…
        </div>
      </div>
    );
  }

  const activeTemplate =
    settings.templates.find((t) => t.id === activeTemplateId) ?? settings.templates[0];
  const warnings = activeTemplate ? validateLocal(activeTemplate) : [];

  const update = (s: Settings) => {
    setSettings(s);
    setDirty(true);
  };

  /** 更新当前激活模板 */
  const updateActiveTemplate = (patch: Partial<Template>) => {
    if (!activeTemplate) return;
    update({
      ...settings,
      templates: settings.templates.map((t) =>
        t.id === activeTemplate.id ? { ...t, ...patch } : t
      ),
    });
  };

  const selectTemplate = (id: string) => {
    setActiveTemplateId(id);
    setNewPosition('');
  };

  const removeTemplate = (id: string) => {
    if (settings.templates.length <= 1) {
      MessagePlugin.warning('至少保留一个表格类型');
      return;
    }
    const next = { ...settings, templates: settings.templates.filter((t) => t.id !== id) };
    update(next);
    if (activeTemplateId === id) {
      setActiveTemplateId(next.templates[0].id);
    }
    saveSettings(next)
      .then(() => MessagePlugin.info('已删除该表格类型'))
      .catch((e) => MessagePlugin.error(e instanceof Error ? e.message : '删除失败，请重试'));
  };

  const addNode = () => {
    const newNode: FlowNode = {
      id: `n_${Date.now()}`,
      name: `新流程节点${activeTemplate.nodes.length + 1}`,
      nodeRatio: 0,
      positions: {},
    };
    updateActiveTemplate({ nodes: [...activeTemplate.nodes, newNode] });
    MessagePlugin.info('已添加节点，请设置节点比例');
  };

  const addPosition = () => {
    const name = newPosition.trim();
    if (!name) {
      MessagePlugin.warning('请输入岗位名称');
      return;
    }
    if (activeTemplate.positionOrder.includes(name)) {
      MessagePlugin.warning(`岗位「${name}」已存在`);
      return;
    }
    updateActiveTemplate({
      positionOrder: [...activeTemplate.positionOrder, name],
      nodes: activeTemplate.nodes.map((n) => ({ ...n, positions: { ...n.positions, [name]: 0 } })),
    });
    setNewPosition('');
    MessagePlugin.success(`已添加岗位「${name}」`);
  };

  /** 岗位改名：同步更新模板 positionOrder/nodes、人员岗位设置 personPositions */
  const commitRename = () => {
    const oldName = renamingPos;
    setRenamingPos(null);
    if (!oldName || !activeTemplate) return;
    const newName = renameValue.trim();
    if (!newName || newName === oldName) return;
    if (activeTemplate.positionOrder.includes(newName)) {
      MessagePlugin.warning(`岗位「${newName}」已存在`);
      return;
    }
    const next: Settings = {
      ...settings,
      templates: settings.templates.map((t) =>
        t.id === activeTemplate.id
          ? {
              ...t,
              positionOrder: t.positionOrder.map((p) => (p === oldName ? newName : p)),
              nodes: t.nodes.map((n) => {
                const positions = { ...n.positions };
                if (oldName in positions) {
                  positions[newName] = positions[oldName];
                  delete positions[oldName];
                }
                return { ...n, positions };
              }),
            }
          : t
      ),
      personPositions: Object.fromEntries(
        Object.entries(settings.personPositions ?? {}).map(([person, positions]) => [
          person,
          positions.map((p) => (p === oldName ? newName : p)),
        ])
      ),
    };
    update(next);
    saveSettings(next)
      .then(() => MessagePlugin.success(`已将「${oldName}」重命名为「${newName}」`))
      .catch((e) => MessagePlugin.error(e instanceof Error ? e.message : '重命名失败，请重试'));
  };

  const startRename = (pos: string) => {
    setRenamingPos(pos);
    setRenameValue(pos);
  };

  /** 删除岗位：同步移除模板 positionOrder/nodes、人员岗位设置 personPositions */
  const removePosition = (pos: string) => {
    if (!activeTemplate) return;
    const next: Settings = {
      ...settings,
      templates: settings.templates.map((t) =>
        t.id === activeTemplate.id
          ? {
              ...t,
              positionOrder: t.positionOrder.filter((p) => p !== pos),
              nodes: t.nodes.map((n) => {
                const positions = { ...n.positions };
                delete positions[pos];
                return { ...n, positions };
              }),
            }
          : t
      ),
      personPositions: Object.fromEntries(
        Object.entries(settings.personPositions ?? {}).map(([person, positions]) => [
          person,
          positions.filter((p) => p !== pos),
        ])
      ),
    };
    update(next);
    saveSettings(next)
      .then(() => MessagePlugin.success(`已删除岗位「${pos}」`))
      .catch((e) => MessagePlugin.error(e instanceof Error ? e.message : '删除失败，请重试'));
  };

  const resetDefault = () => {
    update(defaultSettings());
    setActiveTemplateId(defaultSettings().templates[0].id);
    MessagePlugin.info('已恢复默认配置（请点击保存生效）');
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await saveSettings(settings);
      setSettings(res.data);
      setDirty(false);
      if (res.warnings.length > 0) {
        MessagePlugin.warning('已保存，但存在比例偏差，请查看提示');
      } else {
        MessagePlugin.success('设置已保存');
      }
    } catch (e) {
      MessagePlugin.error(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h2 className="page-title">系统设置</h2>
          <div className="page-subtitle">配置各表格类型的提成比例与岗位分配</div>
        </div>
        <Button theme="primary" size="large" loading={saving} onClick={handleSave}>
          {dirty ? '保存设置（有未保存修改）' : '保存设置'}
        </Button>
      </div>

      {/* 表格类型 + 总比例 + 流程节点与岗位分配（合并） */}
      <div className="section-card">
        <div className="section-title">
          <span>表格类型与流程节点分配</span>
          <div className="toolbar">
            <Button variant="outline" onClick={() => navigate('/settings/templates/new')}>
              添加表格类型
            </Button>
            <Button variant="outline" theme="warning" onClick={resetDefault}>
              恢复默认
            </Button>
          </div>
        </div>

        {/* 模板选择器 */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
          <span style={{ fontWeight: 600, fontSize: 14, color: '#4a5568', whiteSpace: 'nowrap' }}>当前表格类型</span>
          <Select
            value={activeTemplateId}
            onChange={(v) => selectTemplate(String(v ?? ''))}
            style={{ width: 240 }}
            options={settings.templates.map((t) => ({ value: t.id, label: t.name }))}
          />
          <span style={{ fontSize: 12, color: '#9aa3b5', whiteSpace: 'nowrap' }}>
            不同订单可在计算页选择不同表格
          </span>
          <Button
            size="small"
            variant="text"
            theme="danger"
            disabled={settings.templates.length <= 1}
            onClick={() => removeTemplate(activeTemplate.id)}
          >
            删除当前表格类型
          </Button>
        </div>

        {/* 当前模板的提成系数（总提成 =（销售额 − 成本）× 系数） */}
        <TotalRateEditor
          totalRate={activeTemplate.totalRate}
          onTotalRateChange={(v) => updateActiveTemplate({ totalRate: v })}
        />

        {/* 当前模板的节点与岗位 */}
        <div className="section-title" style={{ marginTop: 8 }}>
          <span>流程节点与岗位分配（{activeTemplate.name}）</span>
          <div className="toolbar">
            <Input
              value={newPosition}
              onChange={(v) => setNewPosition(String(v))}
              placeholder="输入新岗位名称"
              style={{ width: 180 }}
              onEnter={addPosition}
            />
            <Button variant="outline" onClick={addPosition}>
              添加岗位
            </Button>
            <Button variant="outline" onClick={addNode}>
              添加流程节点
            </Button>
          </div>
        </div>

        {/* 岗位列表：点击名称重命名，× 删除（改动会同步到合同录入与人员岗位设置） */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 16 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#4a5568', whiteSpace: 'nowrap' }}>
            岗位（{activeTemplate.positionOrder.length}）：
          </span>
          {activeTemplate.positionOrder.map((pos) =>
            renamingPos === pos ? (
              <Input
                key={pos}
                autofocus
                size="small"
                value={renameValue}
                onChange={(v) => setRenameValue(String(v))}
                onEnter={commitRename}
                onBlur={commitRename}
                style={{ width: 130 }}
              />
            ) : (
              <div
                key={pos}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '4px 10px',
                  background: '#f0f6ff',
                  border: '1px solid #cfe0ff',
                  borderRadius: 6,
                  fontSize: 13,
                }}
              >
                <span
                  style={{ cursor: 'pointer' }}
                  title="点击重命名"
                  onClick={() => startRename(pos)}
                >
                  {pos}
                </span>
                <span
                  style={{ cursor: 'pointer', color: '#9aa3b5', fontWeight: 700, padding: '0 4px' }}
                  title="删除岗位"
                  onClick={() => removePosition(pos)}
                >
                  ×
                </span>
              </div>
            )
          )}
          {activeTemplate.positionOrder.length === 0 && (
            <span style={{ fontSize: 12, color: '#9aa3b5' }}>暂无岗位，请先添加</span>
          )}
        </div>

        <div style={{ marginBottom: 16 }}>
          <RatioWarn warnings={warnings} />
        </div>

        <NodeEditor
          nodes={activeTemplate.nodes}
          positionOrder={activeTemplate.positionOrder}
          onChange={(nodes, positionOrder) => updateActiveTemplate({ nodes, positionOrder })}
        />
      </div>

      <StaffListEditor settings={settings} onChange={update} />

      {/* 人员岗位设置（每人最多 2 个岗位） */}
      <PersonPositionsEditor settings={settings} onChange={update} />

      {/* 汇率设置（最下面） */}
      <ExchangeRateEditor
        rates={activeTemplate.defaultRates}
        onChange={(rates) => updateActiveTemplate({ defaultRates: rates })}
      />

      {/* 销售费用名称字典 */}
      <FeeNamesEditor />
    </div>
  );
}
