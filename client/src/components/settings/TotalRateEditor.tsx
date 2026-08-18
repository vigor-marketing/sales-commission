import { InputNumber, Form } from 'tdesign-react';
import { fmtPct, deNoise } from '../../utils/format';

interface Props {
  totalRate: number;
  onTotalRateChange: (v: number) => void;
}

export default function TotalRateEditor({ totalRate, onTotalRateChange }: Props) {
  return (
    <div className="section-card">
      <div className="section-title">基础参数</div>
      <Form labelWidth={140} layout="inline">
        <Form.FormItem label="提成系数">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <InputNumber
              value={deNoise(totalRate * 100)}
              onChange={(v) => {
                const num = Number(v);
                if (!Number.isNaN(num)) onTotalRateChange(num / 100);
              }}
              min={0}
              max={100}
              step={0.1}
              theme="column"
              style={{ width: 150 }}
              size="large"
            />
            <span style={{ color: '#4a5568', fontWeight: 600, fontSize: 14 }}>%</span>
            <span style={{ color: '#9aa3b5', fontSize: 13, marginLeft: 8 }}>
              当前：{fmtPct(totalRate)}（默认 2%）
            </span>
          </div>
        </Form.FormItem>
      </Form>
      <div className="formula-bar" style={{ marginBottom: 0, marginTop: 8 }}>
        <span>计算公式：</span>
        <code>提成基数 = 销售额（人民币）− 成本（费用）；总提成 = 提成基数 × 提成系数 {fmtPct(totalRate)}</code>
      </div>
    </div>
  );
}
