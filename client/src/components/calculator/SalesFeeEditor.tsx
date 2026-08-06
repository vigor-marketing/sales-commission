import { useEffect, useState } from 'react';
import { InputNumber, Select, Button, MessagePlugin } from 'tdesign-react';
import type { SalesFee, Currency, FeeName } from '../../types';
import { fmtMoney } from '../../utils/format';
import { getFeeNames, createFeeName } from '../../api/feeNames';

interface Props {
  fees: SalesFee[];
  onChange: (fees: SalesFee[]) => void;
  /** 默认汇率（USD → CNY） */
  defaultRates?: Record<Currency, number>;
}

const FALLBACK_RATE: Record<Currency, number> = { CNY: 1, USD: 7.2, EUR: 7.8 };

/** 销售费用编辑：多种费用叠加（默认人民币，可选美元），费用名称从字典下拉（可新建） */
export default function SalesFeeEditor({ fees, onChange, defaultRates }: Props) {
  const [feeNames, setFeeNames] = useState<FeeName[]>([]);

  useEffect(() => {
    getFeeNames().then(setFeeNames).catch(() => setFeeNames([]));
  }, []);

  const rateOf = (currency: Currency): number => {
    const r = defaultRates?.[currency];
    return r && r > 0 ? r : FALLBACK_RATE[currency];
  };

  const recompute = (fee: SalesFee): SalesFee => {
    const amountCNY =
      fee.currency === 'CNY' ? Math.round(fee.amount * 100) / 100 : Math.round(fee.amount * fee.rate * 100) / 100;
    return { ...fee, amountCNY };
  };

  const addFee = () => {
    if (fees.length >= 10) {
      MessagePlugin.warning('最多 10 笔费用');
      return;
    }
    const newFee: SalesFee = { currency: 'CNY', amount: 0, rate: 1, amountCNY: 0, note: '' };
    onChange([...fees, newFee]);
  };

  const updateFee = (index: number, patch: Partial<SalesFee>) => {
    onChange(fees.map((f, i) => (i === index ? recompute({ ...f, ...patch }) : f)));
  };

  const removeFee = (index: number) => {
    onChange(fees.filter((_, i) => i !== index));
  };

  const totalCNY = fees.reduce((s, f) => s + (f.amountCNY || 0), 0);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontWeight: 600, fontSize: 14, color: '#4a5568', whiteSpace: 'nowrap' }}>
          销售费用
        </span>
        <span style={{ fontSize: 12, color: '#9aa3b5', marginLeft: 8, whiteSpace: 'nowrap' }}>
          （多种费用可叠加，默认人民币，可选美元）
        </span>
        <Button size="small" variant="outline" style={{ marginLeft: 'auto' }} onClick={addFee}>
          + 添加费用
        </Button>
      </div>

      {fees.length === 0 && (
        <div style={{ color: '#9aa3b5', fontSize: 13, padding: '12px 0', whiteSpace: 'nowrap' }}>
          暂无销售费用，点击「添加费用」录入（默认人民币）
        </div>
      )}

      {fees.map((fee, index) => (
        <div
          key={index}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flexWrap: 'wrap',
            padding: '8px 12px',
            marginBottom: 6,
            background: '#f7f9ff',
            borderRadius: 8,
            border: '1px solid #e8edf7',
          }}
        >
          <span style={{ fontSize: 12, color: '#8a94a6', minWidth: 46, whiteSpace: 'nowrap' }}>费用{index + 1}</span>
          <Select
            value={fee.note ?? ''}
            onChange={async (v) => {
              const name = String(v ?? '');
              // 若不在字典中，保存到字典
              if (name && !feeNames.find((n) => n.name === name)) {
                try {
                  const created = await createFeeName(name);
                  if (created) setFeeNames((prev) => [...prev, created].sort((a, b) => a.sortOrder - b.sortOrder));
                } catch {
                  // 忽略保存失败，仍允许使用
                }
              }
              updateFee(index, { note: name });
            }}
            placeholder="费用名称（从下拉选择）"
            style={{ width: 160 }}
            size="small"
            filterable
            creatable
            clearable
            options={feeNames.map((n) => ({ value: n.name, label: n.name }))}
          />
          <Select
            value={fee.currency}
            onChange={(v) => updateFee(index, { currency: (v ?? 'CNY') as Currency, rate: (v ?? 'CNY') === 'CNY' ? 1 : fee.rate || rateOf((v ?? 'CNY') as Currency) })}
            style={{ width: 128 }}
            options={[
              { value: 'CNY', label: '人民币（CNY）' },
              { value: 'USD', label: '美元（USD）' },
            ]}
          />
          <InputNumber
            value={fee.amount}
            onChange={(v) => updateFee(index, { amount: Number(v) || 0 })}
            placeholder="费用金额"
            min={0}
            theme="column"
            style={{ width: 130 }}
          />
          {fee.currency !== 'CNY' && (
            <>
              <span style={{ fontSize: 13, color: '#6b7588', whiteSpace: 'nowrap' }}>×汇率</span>
              <InputNumber
                value={fee.rate}
                onChange={(v) => updateFee(index, { rate: Number(v) > 0 ? Number(v) : fee.rate })}
                placeholder="汇率"
                min={0}
                step={0.01}
                theme="normal"
                style={{ width: 100 }}
              />
            </>
          )}
          <span style={{ fontSize: 13, color: '#4a5568', whiteSpace: 'nowrap' }}>=</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#0052d9', minWidth: 100, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
            ¥ {fmtMoney(fee.amountCNY)}
          </span>
          <Button size="small" variant="text" theme="danger" style={{ marginLeft: 'auto' }} onClick={() => removeFee(index)}>
            删除
          </Button>
        </div>
      ))}

      {fees.length > 0 && (
        <div style={{ textAlign: 'right', fontSize: 13, color: '#4a5568', marginTop: 2, whiteSpace: 'nowrap' }}>
          费用合计（人民币）：
          <span style={{ fontWeight: 700, color: '#0052d9', fontSize: 15, fontVariantNumeric: 'tabular-nums' }}>
            ¥ {fmtMoney(totalCNY)}
          </span>
        </div>
      )}
    </div>
  );
}
