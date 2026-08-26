import { Input, InputNumber, Select, Button, DatePicker } from 'tdesign-react';
import { useMemo } from 'react';
import type { DateValue, DateMultipleValue } from 'tdesign-react/es/date-picker/type';
import type { SalesFee, PaymentPlanItem, Currency, Settings, Template } from '../../types';
import { fmtMoney } from '../../utils/format';
import { defaultRate } from '../../utils/calcDefaults';
import { salesPersonOptions } from '../../utils/positions';

interface PlanHistoryItem {
  planIndex: number;
  month: string;
  currency: string;
  amount: number;
  ratio?: number;
  received: boolean;
  note: string;
}

interface Props {
  customerName: string;
  contractNo: string;
  contractOptions: string[];
  salesCurrency: Currency;
  salesAmount: number;
  salesRate: number;
  salesFees: SalesFee[];
  planHistory: PlanHistoryItem[];
  /** 合同录入页的全部收款计划（带出展示：已收冻结 / 未收可编辑） */
  contractPlan: PaymentPlanItem[];
  /** 数据库人员（下拉选项） */
  persons?: string[];
  settings?: Settings;
  template?: Template;
  /** 当前这笔收款（受控，由父组件管理） */
  payment: PaymentPlanItem | null;
  /** 当前笔次/总笔数（父组件管理，切换合同/新建时更新） */
  planIndex: number;
  totalPlanCount: number;
  loading: boolean;
  onCustomerNameChange: (v: string) => void;
  onContractNoChange: (v: string) => void;
  /** 新建下一笔收款（重置这笔） */
  onNewPayment: () => void;
  onPaymentChange: (p: PaymentPlanItem) => void;
  onSave: () => void;
}

const CURRENCY_LABELS: Record<Currency, string> = {
  CNY: 'CNY ¥',
  USD: 'USD $',
  EUR: 'EUR €',
};

export default function InputForm({
  customerName,
  contractNo,
  contractOptions,
  salesCurrency,
  salesAmount,
  salesRate,
  salesFees,
  planHistory,
  contractPlan,
  persons,
  settings,
  template,
  payment,
  planIndex,
  totalPlanCount,
  loading,
  onCustomerNameChange,
  onContractNoChange,
  onNewPayment,
  onPaymentChange,
  onSave,
}: Props) {
  const staffList = settings?.staffList ?? [];
  const personOptions = [...new Set([...(persons ?? []), ...staffList])];
  const salesOptions = salesPersonOptions(settings?.personPositions, personOptions);

  // 合同业绩人民币折算（只读）
  const rate = salesCurrency === 'CNY' ? 1 : salesRate;
  const cnyAmount = rate > 0 ? Math.round(salesAmount * rate * 100) / 100 : 0;
  const feesTotal = salesFees.reduce((s, f) => s + (f.amountCNY || 0), 0);
  const payCNY = payment ? (payment.currency === 'CNY' ? payment.amount : Math.round(payment.amount * payment.rate * 100) / 100) : 0;

  // 全部收款计划行（第 1 笔到最后一笔）：
  // 已收判定 = 该笔已保存 且 保存信息与合同计划一致（月份/币种/金额）；否则默认未收款
  const planRows = useMemo(
    () =>
      contractPlan.map((p, idx) => {
        const pi = idx + 1;
        const h = planHistory.find((x) => x.planIndex === pi);
        const paid =
          h !== undefined &&
          h.month === p.month &&
          h.currency === p.currency &&
          Math.abs((h.amount ?? 0) - (p.amount ?? 0)) < 0.01;
        return { ...p, planIndex: pi, paid };
      }),
    [contractPlan, planHistory]
  );

  const updatePayment = (p: Partial<PaymentPlanItem>) => {
    if (!payment) {
      // 兜底：受控状态下 payment 由父组件保证非空
      const now = new Date();
      const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const base: PaymentPlanItem = {
        month,
        currency: 'USD',
        amount: 0,
        rate: salesRate || 7.25,
        amountCNY: 0,
        received: false,
        ratio: undefined,
      };
      onPaymentChange({ ...base, ...p });
      return;
    }
    onPaymentChange({ ...payment, ...p });
  };

  const handlePaymentMonth = (v: DateValue | DateMultipleValue) => {
    const s = typeof v === 'string' ? v : String(v ?? '');
    updatePayment({ month: s});
  };

  // 比例驱动金额（原币金额 = 人民币金额 ÷ 汇率；人民币 = 合同人民币 × 比例）
  const updateByRatio = (ratio: number) => {
    const r = payment?.currency === 'CNY' ? 1 : payment?.rate || rate || 1;
    const cny = Math.round(cnyAmount * ratio * 100) / 100;
    const amount = payment?.currency === 'CNY' ? cny : Math.round((cny / r) * 100) / 100;
    updatePayment({ ratio, amount, amountCNY: cny });
  };
  // 金额驱动比例（先按汇率折算人民币，再除以合同人民币）
  const updateByAmount = (amt: number) => {
    const r = payment?.currency === 'CNY' ? 1 : payment?.rate || rate || 1;
    const payCNY = payment?.currency === 'CNY' ? Math.round(amt * 100) / 100 : Math.round(amt * r * 100) / 100;
    const ratio = cnyAmount > 0 ? Math.min(1, Math.round((payCNY / cnyAmount) * 10000) / 10000) : 0;
    updatePayment({ amount: amt, ratio, amountCNY: payCNY });
  };

  return (
    <div>
      <div style={{ borderTop: '1px dashed #e3e8f0', paddingTop: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 4 }}>
          <span style={{ fontWeight: 600, fontSize: 14, color: '#4a5568', whiteSpace: 'nowrap' }}>
            ① 销售姓名
          </span>
          <span style={{ fontWeight: 600, fontSize: 14, color: '#4a5568', whiteSpace: 'nowrap' }}>② 合同号</span>
        </div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Select
              value={customerName || undefined}
              onChange={(v) => onCustomerNameChange(v == null ? '' : String(v))}
              placeholder={salesOptions.length > 0 ? `选择销售（共 ${salesOptions.length} 人）` : '人员名单为空，请先到系统设置添加'}
              filterable
              creatable
              clearable
              style={{ width: 200 }}
              size="large"
              options={salesOptions.map((n) => ({ value: n, label: n }))}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Select
              value={contractNo || undefined}
              onChange={(v) => onContractNoChange(v == null ? '' : String(v))}
              placeholder={customerName ? (contractOptions.length > 0 ? `选择合同（${contractOptions.length} 个，可搜索）` : '该销售暂无合同，请先到「合同录入」创建') : '请先选择销售姓名'}
              filterable
              clearable
              style={{ width: 280 }}
              size="large"
              options={contractOptions.map((c) => ({ value: c, label: c }))}
            />
          </div>
          {contractNo && (
            <Button size="small" variant="outline" onClick={onNewPayment}>
              ＋ 新建下一笔收款
            </Button>
          )}
        </div>
      </div>

      {/* 合同信息（带出，只读） */}
      {contractNo && (
        <div
          style={{
            marginTop: 14,
            background: '#f7f9ff',
            borderRadius: 10,
            border: '1px solid #e8edf7',
            padding: '14px 16px',
          }}
        >
          <div style={{ fontWeight: 600, fontSize: 14, color: '#4a5568', marginBottom: 10, whiteSpace: 'nowrap' }}>
            合同信息（② 选择合同后自动带出，只读）
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 13, marginBottom: 8 }}>
            <span style={{ color: '#7a8499', minWidth: 74, whiteSpace: 'nowrap' }}>表格类型</span>
            <span style={{ color: '#4a5568', fontWeight: 600, whiteSpace: 'nowrap' }}>
              {template?.name ?? '默认表格'}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 13, marginBottom: 8 }}>
            <span style={{ color: '#7a8499', minWidth: 74, whiteSpace: 'nowrap' }}>销售业绩</span>
            <span style={{ color: '#4a5568', fontWeight: 600, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
              {fmtMoney(salesAmount)} {salesCurrency}
              {salesCurrency !== 'CNY' && (
                <span style={{ color: '#9aa3b5', fontWeight: 400 }}> × {Number(salesRate).toFixed(2)}</span>
              )}
            </span>
            <span style={{ color: '#0052d9', fontWeight: 700, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
              ≈ ¥ {fmtMoney(cnyAmount)}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 13 }}>
            <span style={{ color: '#7a8499', minWidth: 74, whiteSpace: 'nowrap' }}>销售费用</span>
            <span style={{ fontWeight: 600, color: '#4a5568', fontVariantNumeric: 'tabular-nums' }}>¥ {fmtMoney(feesTotal)}</span>
            <span style={{ color: '#7a8499', minWidth: 60, marginLeft: 12, whiteSpace: 'nowrap' }}>提成基数</span>
            <span style={{ color: '#0052d9', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
              ¥ {fmtMoney(cnyAmount - feesTotal)}
            </span>
          </div>
        </div>
      )}

      {/* ③ 这笔收款 */}
      <div style={{ borderTop: '1px dashed #e3e8f0', paddingTop: 14, marginTop: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 4 }}>
          <span style={{ fontWeight: 600, fontSize: 14, color: '#4a5568', whiteSpace: 'nowrap' }}>
            ③ 这笔收款
            {contractNo
              ? `（计划 ${totalPlanCount} 笔，已收 ${planHistory.length} 笔${planIndex > totalPlanCount ? '，本次为追加收款' : `，本次第 ${planIndex} 笔`}）`
              : ''}
          </span>
          <span style={{ fontSize: 12, color: '#9aa3b5', whiteSpace: 'nowrap' }}>
            （百分比 × 合同总金额 = 本次收款金额 × 汇率 = 人民币；比例合计 = 100%；保存即标记已收）
          </span>
        </div>

        {/* 自动带入的收款计划（第 1 笔到最后一笔，只读）：已保存且与计划一致 → 已收款；否则未收款 */}
        {contractNo && planRows.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
            {planRows.map((p) => (
                <div
                  key={p.planIndex}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    flexWrap: 'wrap',
                    padding: '8px 12px',
                    background: p.paid ? '#f2fbf7' : '#f8f9fb',
                    border: p.paid ? '1px solid #cfe8dc' : '1px solid #e8edf7',
                    borderRadius: 8,
                  }}
                >
                  <span style={{ fontSize: 12, color: '#5b6b85', minWidth: 44, whiteSpace: 'nowrap' }}>
                    第{p.planIndex}笔
                  </span>
                  <span style={{ fontSize: 13, color: '#4a5568', whiteSpace: 'nowrap' }}>{p.month}</span>
                  <span style={{ fontSize: 13, color: '#4a5568', fontWeight: 600, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                    {fmtMoney(p.amount)} {p.currency}
                  </span>
                  {p.ratio !== undefined && (
                    <span style={{ fontSize: 12, color: '#6b7588', whiteSpace: 'nowrap' }}>{(p.ratio * 100).toFixed(1)}%</span>
                  )}
                  {p.currency !== 'CNY' && (
                    <span style={{ fontSize: 12, color: '#8a94a6', whiteSpace: 'nowrap' }}>× {Number(p.rate).toFixed(2)} = ¥ {fmtMoney(p.amountCNY ?? 0)}</span>
                  )}
                  {p.paid ? (
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        color: '#00a870',
                        background: '#e8f7ef',
                        border: '1px solid #b6e5c8',
                        borderRadius: 9999,
                        padding: '2px 10px',
                        whiteSpace: 'nowrap',
                      }}
                      title="该笔已保存且与收款计划一致，冻结不可修改"
                    >
                      已收款
                    </span>
                  ) : (
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        color: '#9aa3b5',
                        background: '#f2f3f7',
                        border: '1px solid #e3e6ee',
                        borderRadius: 9999,
                        padding: '2px 10px',
                        whiteSpace: 'nowrap',
                      }}
                      title="未完成收款；录入该笔并保存后显示已收款"
                    >
                      未收款
                    </span>
                  )}
                </div>
              ))}
          </div>
        )}

        {!contractNo ? (
          <div style={{ color: '#9aa3b5', fontSize: 13, padding: '10px 0' }}>
            请先选择合同号，再录入收款
          </div>
        ) : payment ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              flexWrap: 'wrap',
              padding: '10px 12px',
              background: '#f7f9ff',
              borderRadius: 8,
              border: '1px solid #e8edf7',
            }}
          >
            <span style={{ fontSize: 12, color: '#8a94a6', minWidth: 44, whiteSpace: 'nowrap' }}>
              第{planIndex}笔
            </span>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
              <Input
                value={payment.ratio !== undefined ? String(Math.round(payment.ratio * 10000) / 100) : ''}
                onChange={(v) => {
                  const pct = Number(v);
                  if (Number.isFinite(pct) && pct >= 0 && pct <= 100) {
                    updateByRatio(Math.round(pct * 10000) / 10000 / 100);
                  }
                }}
                placeholder="比例"
                style={{ width: 84 }}
                size="medium"
              />
              <span style={{ fontSize: 13, color: '#6b7588' }}>%</span>
            </div>
            <DatePicker
              value={payment.month}
              onChange={handlePaymentMonth}
              mode="month"
              placeholder="收款月份"
              style={{ width: 110 }}
              allowInput
              clearable={false}
            />
            <Select
              value={payment.currency}
              onChange={(v) =>
                updatePayment({
                  currency: (v ?? 'USD') as Currency,
                  rate: (v ?? 'USD') === 'CNY' ? 1 : payment.rate || defaultRate((v ?? 'USD') as Currency),
                })
              }
              style={{ width: 110 }}
              options={Object.entries(CURRENCY_LABELS).map(([value, label]) => ({ value, label }))}
            />
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
              <InputNumber
                value={payment.amount}
                onChange={(v) => {
                  const amt = Number(v);
                  if (Number.isFinite(amt) && amt >= 0) updateByAmount(amt);
                }}
                placeholder="原币金额"
                min={0}
                style={{ width: 140 }}
                theme="column"
              />
            </div>
            {payment.currency !== 'CNY' && (
              <>
                <span style={{ fontSize: 13, color: '#6b7588', whiteSpace: 'nowrap' }}>×汇率</span>
                <Input
                  value={String(payment.rate)}
                  onChange={(v) => updatePayment({ rate: Number(v) > 0 ? Number(v) : payment.rate })}
                  placeholder="汇率"
                  style={{ width: 80 }}
                  size="medium"
                />
              </>
            )}
            <span style={{ fontSize: 13, color: '#4a5568', whiteSpace: 'nowrap' }}>=</span>
            <span
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: '#0052d9',
                minWidth: 90,
                fontVariantNumeric: 'tabular-nums',
                whiteSpace: 'nowrap',
              }}
            >
              ¥ {fmtMoney(payCNY)}
            </span>
          </div>
        ) : (
          <div style={{ color: '#9aa3b5', fontSize: 13, padding: '10px 0' }}>
            该合同已录入 {planHistory.length} 笔，请填写第 {planIndex} 笔收款信息
          </div>
        )}
        {payment && payCNY > cnyAmount && cnyAmount > 0 && (
          <div style={{ marginTop: 8, fontSize: 13, color: '#d54941', whiteSpace: 'nowrap' }}>
            ⚠️ 这笔收款（¥ {fmtMoney(payCNY)}）不能大于合同总金额（¥ {fmtMoney(cnyAmount)}）
          </div>
        )}
      </div>

      {/* 保存按钮 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 18 }}>
        <Button theme="primary" size="large" loading={loading} onClick={onSave} style={{ minWidth: 160 }}>
          保存这笔收款
        </Button>
        <span style={{ fontSize: 12, color: '#9aa3b5', whiteSpace: 'nowrap' }}>
          保存后自动计算提成并写入历史（每笔收款一条记录）；重新选择该合同可继续录入下一笔
        </span>
      </div>
    </div>
  );
}
