import { useEffect, useMemo, useState } from 'react';
import { Dialog, Input, Button, Checkbox, Loading, MessagePlugin } from 'tdesign-react';
import { getWorkbenchOrgPersons, type WorkbenchOrgPerson } from '../../api/workbench';

interface Props {
  visible: boolean;
  /** 已在人员名单中的姓名（禁用勾选，避免重复添加） */
  existing: string[];
  onClose: () => void;
  /** 确认时回调本次新增的姓名列表 */
  onConfirm: (names: string[]) => void;
}

/** 从工作台组织架构选择人员（搜索 + 按部门分组 + 多选），参照 bmail「选择员工」 */
export default function WorkbenchPersonPicker({ visible, existing, onClose, onConfirm }: Props) {
  const [persons, setPersons] = useState<WorkbenchOrgPerson[]>([]);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    setKeyword('');
    setSelected(new Set());
    getWorkbenchOrgPersons()
      .then(setPersons)
      .catch((e) => MessagePlugin.error(e instanceof Error ? e.message : '加载工作台人员失败'))
      .finally(() => setLoading(false));
  }, [visible]);

  const filtered = useMemo(() => {
    const k = keyword.trim().toLowerCase();
    if (!k) return persons;
    return persons.filter((p) =>
      [p.name, p.englishName, p.department, p.team, p.role].some((s) =>
        (s ?? '').toLowerCase().includes(k)
      )
    );
  }, [persons, keyword]);

  const groups = useMemo(() => {
    const map = new Map<string, WorkbenchOrgPerson[]>();
    for (const p of filtered) {
      const list = map.get(p.department) ?? [];
      list.push(p);
      map.set(p.department, list);
    }
    return [...map.entries()];
  }, [filtered]);

  const toggle = (name: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const toggleDepartment = (names: string[]) => {
    setSelected((prev) => {
      const next = new Set(prev);
      const allSelected = names.length > 0 && names.every((n) => next.has(n));
      if (allSelected) names.forEach((n) => next.delete(n));
      else names.forEach((n) => next.add(n));
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(filtered.map((p) => p.name)));
  const clearAll = () => setSelected(new Set());

  const handleConfirm = () => {
    const fresh = [...selected].filter((n) => !existing.includes(n));
    if (fresh.length === 0) {
      MessagePlugin.info('请选择尚未在名单中的成员');
      return;
    }
    onConfirm(fresh);
  };

  return (
    <Dialog visible={visible} header="从工作台选择人员" width={660} onClose={onClose} footer={null}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <Input
          value={keyword}
          onChange={(v) => setKeyword(String(v))}
          placeholder="按员工姓名、账号、部门模糊查询"
          clearable
          style={{ flex: 1 }}
        />
        <Button size="small" variant="outline" onClick={selectAll}>全选</Button>
        <Button size="small" variant="outline" onClick={clearAll}>清空</Button>
      </div>

      <div
        style={{
          maxHeight: 380,
          overflowY: 'auto',
          border: '1px solid #eef0f5',
          borderRadius: 8,
        }}
      >
        {loading ? (
          <div style={{ padding: 48, textAlign: 'center' }}>
            <Loading text="加载人员中…" />
          </div>
        ) : groups.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', color: '#9aa3b5' }}>暂无匹配人员</div>
        ) : (
          groups.map(([dept, deptPersons]) => {
            const names = deptPersons.map((p) => p.name);
            const allSelected = names.length > 0 && names.every((n) => selected.has(n));
            const someSelected = names.some((n) => selected.has(n));
            return (
              <div key={dept}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '8px 12px',
                    background: '#f5f7fb',
                    fontWeight: 600,
                    cursor: 'pointer',
                    borderTop: '1px solid #eef0f5',
                  }}
                  onClick={() => toggleDepartment(names)}
                >
                  <Checkbox checked={allSelected} indeterminate={!allSelected && someSelected} />
                  <span>{dept}</span>
                  <span style={{ fontSize: 12, color: '#9aa3b5', fontWeight: 400 }}>
                    {deptPersons.length} 人
                  </span>
                </div>
                <div style={{ padding: '4px 12px 8px 44px' }}>
                  {deptPersons.map((p) => {
                    const already = existing.includes(p.name);
                    return (
                      <Checkbox
                        key={p.id}
                        checked={selected.has(p.name)}
                        disabled={already}
                        onChange={() => toggle(p.name)}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}
                      >
                        <span style={{ flex: 1 }}>{p.name}</span>
                        <span style={{ fontSize: 12, color: '#9aa3b5', marginLeft: 8 }}>{p.englishName}</span>
                        <span style={{ fontSize: 12, color: '#9aa3b5', marginLeft: 8 }}>{p.role}</span>
                        {already && (
                          <span style={{ fontSize: 11, color: '#00a870', marginLeft: 8 }}>已添加</span>
                        )}
                      </Checkbox>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 16 }}>
        <span style={{ fontSize: 12, color: '#9aa3b5', marginRight: 'auto' }}>
          已选 {selected.size} 人
        </span>
        <Button variant="outline" onClick={onClose}>关闭</Button>
        <Button theme="primary" onClick={handleConfirm}>确定添加</Button>
      </div>
    </Dialog>
  );
}
