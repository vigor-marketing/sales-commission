import { useEffect, useState } from 'react';
import { Input, Button, Tag, MessagePlugin } from 'tdesign-react';
import type { FeeName } from '../../types';
import { getFeeNames, createFeeName, deleteFeeName } from '../../api/feeNames';

/** 销售费用名称字典管理（销售费用录入时下拉可选） */
export default function FeeNamesEditor() {
  const [feeNames, setFeeNames] = useState<FeeName[]>([]);
  const [newName, setNewName] = useState('');
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setFeeNames(await getFeeNames());
    } catch (e) {
      MessagePlugin.error(e instanceof Error ? e.message : '加载费用名称失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleAdd = async () => {
    const name = newName.trim();
    if (!name) {
      MessagePlugin.warning('请输入费用名称');
      return;
    }
    try {
      const created = await createFeeName(name);
      if (created) {
        MessagePlugin.success(`已添加「${created.name}」`);
        setNewName('');
        load();
      } else {
        MessagePlugin.info('该名称已存在');
      }
    } catch (e) {
      MessagePlugin.error(e instanceof Error ? e.message : '添加失败');
    }
  };

  const handleDelete = async (id: number, name: string) => {
    try {
      await deleteFeeName(id);
      MessagePlugin.success(`已删除「${name}」`);
      load();
    } catch (e) {
      MessagePlugin.error(e instanceof Error ? e.message : '删除失败');
    }
  };

  return (
    <div className="section-card">
      <div className="section-title">
        <span>销售费用名称字典</span>
        <span style={{ fontSize: 12, fontWeight: 400, color: '#9aa3b5' }}>
          共 {feeNames.length} 项（销售费用录入时下拉可选，也可直接输入新名称自动加入）
        </span>
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <Input
          value={newName}
          onChange={(v) => setNewName(String(v))}
          placeholder="输入新费用名称，如：展会费"
          style={{ width: 220 }}
          onEnter={handleAdd}
        />
        <Button variant="outline" onClick={handleAdd} loading={loading}>
          添加费用名称
        </Button>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {feeNames.map((n) => (
          <Tag
            key={n.id}
            closable
            onClose={() => handleDelete(n.id, n.name)}
            size="medium"
            variant="light"
            style={{ padding: '6px 12px', fontSize: 13 }}
          >
            {n.name}
          </Tag>
        ))}
        {feeNames.length === 0 && (
          <span style={{ color: '#9aa3b5', fontSize: 13 }}>暂无费用名称，请添加</span>
        )}
      </div>
    </div>
  );
}
