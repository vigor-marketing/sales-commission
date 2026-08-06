import type { CalculationResult } from '../../types';
import { fmtMoney, fmtPct } from '../../utils/format';

interface Props {
  result: CalculationResult;
}

export default function SummaryCards({ result }: Props) {
  const hasOrig = result.salesAmountOrig !== undefined && result.salesCurrency !== undefined;
  const cards = [
    {
      label: '销售业绩',
      sub: hasOrig
        ? `${result.salesCurrency} ${fmtMoney(result.salesAmountOrig ?? 0)} × ${(result.salesRate ?? 1).toFixed(2)}`
        : 'Sales Amount',
      value: `¥ ${fmtMoney(result.salesAmount)}`,
      primary: false,
      negative: false,
    },
    {
      label: '销售费用',
      sub: result.salesFees && result.salesFees.length > 0 ? `${result.salesFees.length} 笔费用` : 'CNY',
      value: fmtMoney(result.salesCost),
      primary: false,
      negative: false,
    },
    {
      label: '提成基数',
      sub: '业绩 − 费用',
      value: fmtMoney(result.baseAmount),
      primary: false,
      negative: result.baseAmount < 0,
    },
    {
      label: '总提成',
      sub: `（销售额 − 成本）× 系数 ${fmtPct(result.settingsSnapshot.totalRate)}`,
      value: fmtMoney(result.totalCommission),
      primary: true,
      negative: false,
    },
  ];

  return (
    <div className="summary-grid">
      {cards.map((c) => (
        <div
          className={`summary-card${c.primary ? ' primary-card' : ''}${c.negative ? ' negative' : ''}`}
          key={c.label}
        >
          <div className="label">
            {c.label}
            {c.sub && (
              <span style={{ marginLeft: 8, fontSize: 12, opacity: 0.72 }}>{c.sub}</span>
            )}
          </div>
          <div className="value">{c.value}</div>
        </div>
      ))}
    </div>
  );
}
