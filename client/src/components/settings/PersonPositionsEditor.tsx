import { Select, Tag, MessagePlugin } from 'tdesign-react';
import type { Settings } from '../../types';
import { saveSettings } from '../../api/settings';

interface Props {
  settings: Settings;
  onChange: (next: Settings) => void;
}

/** 兜底默认岗位（模板岗位为空时） */
const FALLBACK_POSITIONS = ['销售人员', '技术人员', '项目经理', '销售主管', '运营人员', '总经理助理'];

/** 人员岗位设置：给每个人分配岗位（每人最多 2 个）；岗位来自所有模板 positionOrder 并集 */
export default function PersonPositionsEditor({ settings, onChange }: Props) {
  const positions = [
    ...new Set(settings.templates.flatMap((t) => t.positionOrder ?? [])),
  ];
  const allPositions = positions.length > 0 ? positions : FALLBACK_POSITIONS;
  const personPositions = settings.personPositions ?? {};

  // 人名与「人员名单」保持一致：以 staffList 为基准，合并已配置岗位的人（避免丢失既有分配）
  const allPersonNames = [
    ...new Set([...(settings.staffList ?? []), ...Object.keys(personPositions)]),
  ].sort((a, b) => a.localeCompare(b, 'zh-CN'));

  const setPersonPositions = (person: string, nextPositions: Array<string | number>) => {
    const list = nextPositions.map(String).filter(Boolean);
    if (list.length > 2) {
      MessagePlugin.warning('每人最多分配 2 个岗位');
      return;
    }
    const next: Record<string, string[]> = { ...personPositions };
    if (list.length > 0) next[person] = list;
    else delete next[person];
    const nextSettings = { ...settings, personPositions: next };
    onChange(nextSettings);
    // 立即持久化，避免依赖「保存设置」导致刷新后回退
    saveSettings(nextSettings).catch((e) =>
      MessagePlugin.error(e instanceof Error ? e.message : '保存失败，请重试')
    );
  };

  const assignedCount = Object.values(personPositions).filter((v) => v && v.length > 0).length;

  return (
    <div className="section-card">
      <div className="section-title">
        <span>人员岗位设置</span>
        <span style={{ fontSize: 12, color: '#9aa3b5', marginLeft: 10 }}>
          给每个人分配岗位（每人最多 2 个岗位）；合同/提成页岗位分配下拉将按此过滤
        </span>
      </div>

      {allPersonNames.length === 0 ? (
        <div style={{ color: '#9aa3b5', fontSize: 13, padding: '12px 0' }}>
          暂无人员，请先在「人员名单」中添加
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {allPersonNames.map((person) => {
            const cur = personPositions[person] ?? [];
            return (
              <div
                key={person}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  flexWrap: 'wrap',
                  padding: '8px 12px',
                  background: cur.length > 0 ? '#f0f6ff' : '#f7f8fa',
                  border: cur.length > 0 ? '1px solid #cfe0ff' : '1px solid #eceef2',
                  borderRadius: 8,
                }}
              >
                <span style={{ fontSize: 13, fontWeight: 600, color: cur.length > 0 ? '#0052d9' : '#4a5568', minWidth: 70 }}>
                  {person}
                </span>
                <Select
                  value={cur}
                  onChange={(v) => setPersonPositions(person, (v ?? []) as Array<string | number>)}
                  multiple
                  filterable
                  clearable
                  style={{ width: 320 }}
                  size="small"
                  placeholder="选择岗位（最多 2 个）"
                  options={allPositions.map((pos) => ({ value: pos, label: pos }))}
                />
                {cur.length > 0 && (
                  <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {cur.map((pos) => (
                      <Tag key={pos} theme="primary" variant="light" size="small">{pos}</Tag>
                    ))}
                  </span>
                )}
              </div>
            );
          })}
          <div style={{ textAlign: 'right', fontSize: 12, color: '#7a8499' }}>
            已分配 {assignedCount}/{allPersonNames.length} 人
          </div>
        </div>
      )}
    </div>
  );
}
