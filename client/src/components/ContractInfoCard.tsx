import type { Contract, Settings } from '../types';
import { fmtMoney } from '../utils/format';

interface Props {
  contract: Contract;
  settings: Settings | null;
}

/** 合同信息卡片（合同详情页 + 提成统计页共用）—— 主数据 + 费用 + 收款计划 + 岗位人员 */
export default function ContractInfoCard({ contract: c, settings }: Props) {
  const salesCNY = (c.salesCurrency === 'CNY' ? 1 : c.salesRate || 1) * c.salesAmountOrig;
  const feesTotal = c.salesFees.reduce((s, f) => s + (f.amountCNY || 0), 0);
  const templateName =
    settings?.templates.find((t) => t.id === c.templateId)?.name ?? c.templateId ?? '默认表格';

  return (
    <div className="section-card">
      <div className="section-title">合同信息</div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '10px 20px',
          fontSize: 13,
        }}
      >
        <div>
          <span style={{ color: '#7a8499' }}>合同号：</span>
          <b>{c.contractNo}</b>
        </div>
        <div>
          <span style={{ color: '#7a8499' }}>销售姓名：</span>
          <b>{c.customerName}</b>
        </div>
        <div>
          <span style={{ color: '#7a8499' }}>表格类型：</span>
          <b>{templateName}</b>
        </div>
        <div>
          <span style={{ color: '#7a8499' }}>销售业绩：</span>
          <b>
            {fmtMoney(c.salesAmountOrig)} {c.salesCurrency}
          </b>
          {c.salesCurrency !== 'CNY' && (
            <span style={{ color: '#9aa3b5' }}> × {Number(c.salesRate || 1).toFixed(2)}</span>
          )}
        </div>
        <div>
          <span style={{ color: '#7a8499' }}>业绩人民币：</span>
          <b style={{ color: '#0052d9' }}>≈ ¥ {fmtMoney(Math.round(salesCNY * 100) / 100)}</b>
        </div>
        <div>
          <span style={{ color: '#7a8499' }}>费用合计：</span>
          <b>¥ {fmtMoney(feesTotal)}</b>
        </div>
        <div>
          <span style={{ color: '#7a8499' }}>计划笔数：</span>
          <b>{c.totalPlanCount ?? c.paymentPlan.length}</b>
        </div>
        <div>
          <span style={{ color: '#7a8499' }}>更新时间：</span>
          <b>{c.updatedAt ?? '—'}</b>
        </div>
      </div>

      {c.salesFees.length > 0 && (
        <div style={{ marginTop: 10, fontSize: 13 }}>
          <span style={{ color: '#7a8499' }}>费用明细：</span>
          {c.salesFees.map((f, i) => (
            <span
              key={i}
              style={{
                background: '#f7f9ff',
                border: '1px solid #e8edf7',
                borderRadius: 4,
                padding: '1px 8px',
                marginRight: 6,
              }}
            >
              {f.note ?? '费用'} {f.currency} {fmtMoney(f.amount)}（¥ {fmtMoney(f.amountCNY)}）
            </span>
          ))}
        </div>
      )}

      {c.paymentPlan.length > 0 && (
        <div style={{ marginTop: 10, fontSize: 13 }}>
          <span style={{ color: '#7a8499' }}>收款计划：</span>
          {c.paymentPlan.map((p, i) => (
            <span
              key={i}
              style={{
                background: '#f7f9ff',
                border: '1px solid #e8edf7',
                borderRadius: 4,
                padding: '1px 8px',
                marginRight: 6,
              }}
            >
              第{i + 1}笔 {p.month} {p.currency} {fmtMoney(p.amount)}
              {p.ratio !== undefined && `（${(p.ratio * 100).toFixed(1)}%）`}
              {p.currency !== 'CNY' && p.rate ? ` × 实际结汇汇率 ${Number(p.rate).toFixed(2)}` : ''} = ¥ {fmtMoney(p.amountCNY)}
            </span>
          ))}
        </div>
      )}

      {Object.keys(c.positionPersons || {}).length > 0 && (
        <div style={{ marginTop: 10, fontSize: 13 }}>
          <span style={{ color: '#7a8499' }}>岗位人员：</span>
          {Object.entries(c.positionPersons).map(([pos, name]) => (
            <span
              key={pos}
              style={{
                background: '#e8f0ff',
                color: '#0052d9',
                border: '1px solid #cfe0ff',
                borderRadius: 4,
                padding: '1px 8px',
                marginRight: 6,
              }}
            >
              {pos}: {name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
