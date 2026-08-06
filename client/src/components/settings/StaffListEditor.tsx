import { useState } from 'react';
import { Input, Button, Tag, MessagePlugin, Empty } from 'tdesign-react';
import type { Settings } from '../../types';

interface Props {
  settings: Settings;
  onChange: (s: Settings) => void;
}

/** 人员名单管理：添加 / 删除人员，供计算页姓名下拉选择 */
export default function StaffListEditor({ settings, onChange }: Props) {
  const [name, setName] = useState('');
  const staffList = settings.staffList ?? [];

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
    onChange({ ...settings, staffList: [...staffList, n] });
    setName('');
    MessagePlugin.success(`已添加「${n}」`);
  };

  const removeStaff = (n: string) => {
    onChange({ ...settings, staffList: staffList.filter((s) => s !== n) });
    MessagePlugin.info(`已移除「${n}」`);
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
        <Button theme="primary" onClick={addStaff}>
          添加人员
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
