import { InputNumber, Form } from 'tdesign-react';
import type { Currency } from '../../types';

interface Props {
  rates: Record<Currency, number>;
  onChange: (rates: Record<Currency, number>) => void;
}

/** 默认汇率设置（USD/EUR → 人民币），计算收款时可逐笔修改 */
export default function ExchangeRateEditor({ rates, onChange }: Props) {
  const r = rates ?? { CNY: 1, USD: 7.2, EUR: 7.8 };
  const updateRate = (currency: 'USD' | 'EUR', value: number) => {
    onChange({ ...r, [currency]: value });
  };

  return (
    <div className="section-card">
      <div className="section-title">汇率设置</div>
      <Form labelWidth={140} layout="inline">
        <Form.FormItem label="美元（USD）汇率">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <InputNumber
              value={r.USD}
              onChange={(v) => updateRate('USD', Number(v) || 0)}
              min={0.0001}
              step={0.01}
              theme="column"
              style={{ width: 150 }}
              size="large"
            />
            <span style={{ color: '#9aa3b5', fontSize: 13 }}>1 USD = {Number(r.USD) || 0} CNY</span>
          </div>
        </Form.FormItem>
        <Form.FormItem label="欧元（EUR）汇率">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <InputNumber
              value={r.EUR}
              onChange={(v) => updateRate('EUR', Number(v) || 0)}
              min={0.0001}
              step={0.01}
              theme="column"
              style={{ width: 150 }}
              size="large"
            />
            <span style={{ color: '#9aa3b5', fontSize: 13 }}>1 EUR = {Number(r.EUR) || 0} CNY</span>
          </div>
        </Form.FormItem>
      </Form>
      <div style={{ marginTop: 8, fontSize: 12, color: '#9aa3b5' }}>
        说明：此处为默认汇率，录入收款计划时自动带出，仍可对每一笔单独修改。
      </div>
    </div>
  );
}
