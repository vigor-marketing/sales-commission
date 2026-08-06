import { Alert } from 'tdesign-react';

interface Props {
  warnings: string[];
}

export default function RatioWarn({ warnings }: Props) {
  if (warnings.length === 0) {
    return (
      <Alert
        theme="success"
        message="比例校验通过：各节点岗位比例之和与节点比例一致，系统将按权重归一化分配总提成"
      />
    );
  }
  return (
    <Alert
      theme="warning"
      message={
        <div>
          <div style={{ fontWeight: 600 }}>
            以下比例存在偏差，系统将按权重归一化分配总提成（仍可正常计算并保存）：
          </div>
          <ul style={{ margin: '8px 0 0', paddingLeft: 20, lineHeight: 1.8 }}>
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      }
    />
  );
}
