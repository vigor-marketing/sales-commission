import { useState } from 'react';
import { Input, Button, Tag, MessagePlugin, Empty } from 'tdesign-react';
import type { Settings } from '../../types';
import { saveSettings } from '../../api/settings';
import { openOrgPicker } from '../../api/workbench';

interface Props {
  settings: Settings;
  onChange: (s: Settings) => void;
}

/** 人员名单管理：添加 / 删除人员，供计算页姓名下拉选择 */
export default function StaffListEditor({ settings, onChange }: Props) {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [picking, setPicking] = useState(false);
  const staffList = settings.staffList ?? [];

  /** 更新本地状态并立即持久化（人员增删无需再点「保存设置」） */
  const applyAndSave = async (next: Settings, okMsg: string) => {
    onChange(next);
    setSaving(true);
    try {
      await saveSettings(next);
      MessagePlugin.success(okMsg);
    } catch (e) {
      MessagePlugin.error(e instanceof Error ? e.message : '保存失败，请重试');
    } finally {
      setSaving(false);
    }
  };

  const addStaff = () => {
    const n = name.trim();
    if (!n) {
      MessagePlugin.warning('请输入人员姓名');
      return;
    }
    if (staffList.includes(n)) {
      MessagePlugin.warning(`「${n}」已在名单中`);
      return;
    }
    setName('');
    void applyAndSave({ ...settings, staffList: [...staffList, n] }, `已添加「${n}」`);
  };

  const removeStaff = (n: string) => {
    // 同时从「人员岗位设置」里移除该人，保证人名在名单/岗位分配两处一致
    const nextPersonPositions = { ...(settings.personPositions ?? {}) };
    delete nextPersonPositions[n];
    void applyAndSave(
      {
        ...settings,
        staffList: staffList.filter((s) => s !== n),
        personPositions: nextPersonPositions,
      },
      `已移除「${n}」`
    );
  };

  /** 打开平台 /org-picker 选择人员（多选，支持按部门全选/清空），去重后一次保存 */
  const pickFromWorkbench = () => {
    setPicking(true);
    openOrgPicker('multi', '选择人员')
      .then((persons) => {
        if (persons.length === 0) return;
        const fresh = persons.map((p) => p.name).filter((n) => !staffList.includes(n));
        if (fresh.length === 0) {
          MessagePlugin.info('所选成员均已在名单中');
          return;
        }
        void applyAndSave(
          { ...settings, staffList: [...staffList, ...fresh] },
          `已添加 ${fresh.length} 人`
        );
      })
      .catch((e) => MessagePlugin.warning(e instanceof Error ? e.message : '选择人员失败'))
      .finally(() => setPicking(false));
  };

  return (
    <div className="section-card">
      <div className="section-title">人员名单</div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <Input
          value={name}
          onChange={(v) => setName(String(v))}
          placeholder="输入人员姓名，回车添加"
          style={{ width: 220 }}
          onEnter={addStaff}
          clearable
        />
        <Button theme="primary" onClick={addStaff} loading={saving}>
          添加人员
        </Button>
        <Button variant="outline" loading={picking} onClick={pickFromWorkbench}>
          从工作台选择人员
        </Button>
        <span style={{ fontSize: 12, color: '#9aa3b5', alignSelf: 'center' }}>
          共 {staffList.length} 人
        </span>
      </div>

      {staffList.length === 0 ? (
        <Empty
          description="暂无人员名单，添加后计算页「姓名」可从名单快速选择"
          style={{ padding: 20 }}
        />
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {staffList.map((n) => (
            <Tag
              key={n}
              closable
              size="large"
              onClose={() => removeStaff(n)}
              style={{ padding: '6px 12px' }}
            >
              {n}
            </Tag>
          ))}
        </div>
      )}
      <div style={{ marginTop: 12, fontSize: 12, color: '#9aa3b5' }}>
        说明：名单用于提成计算页「姓名」下拉选择；也可直接在计算页输入新姓名（下次可从名单管理添加）。
      </div>
    </div>
  );
}
