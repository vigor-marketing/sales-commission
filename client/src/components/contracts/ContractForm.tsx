import { Input, InputNumber, Select, Button, DatePicker, MessagePlugin } from 'tdesign-react';
import { useState, useEffect } from 'react';
import type { DateValue, DateMultipleValue } from 'tdesign-react/es/date-picker/type';
import type { Contract, SalesFee, PaymentPlanItem, Currency, Settings, Template, FeeName } from '../../types';
import { fmtMoney } from '../../utils/format';
import { positionPersonOptions, salesPersonOptions } from '../../utils/positions';

const CURRENCY_LABELS: Record<Currency, string> = {
  CNY: 'CNY ¥',
  USD: 'USD $',
  EUR: 'EUR €',
};
const FALLBACK_RATE: Record<Currency, number> = { CNY: 1, USD: 7.2, EUR: 7.8 };

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

type ContractDraft = Omit<Contract, 'id' | 'createdAt' | 'updatedAt'>;

interface Props {
  active: ContractDraft;
  onChange: (next: ContractDraft) => void;
  settings?: Settings | null;
  feeNames: FeeName[];
  /** 费用名称下拉新建后回调（更新字典） */
  onFeeNamesChange?: (list: FeeName[]) => void;
  /** 可选人员（岗位分配下拉） */
  personOptions: string[];
  /** 编辑模式：合同号不可修改 */
  editing?: boolean;
  /** 已有合同号集合（用于重复校验，禁止输入）。编辑模式可忽略。 */
  existingContractNos?: Set<string>;
}

/** 合同表单：①基础信息 ②销售业绩 ③销售费用 ④收款计划 ⑤岗位人员分配 */
export default function ContractForm({
  active,
  onChange,
  settings,
  feeNames,
  onFeeNamesChange,
  personOptions,
  editing,
  existingContractNos,
}: Props) {
  // 合同号重复：禁止输入并提示
  const [contractNoError, setContractNoError] = useState(false);
  const handleContractNoChange = (v: string) => {
    const next = String(v);
    if (!editing && existingContractNos?.has(next)) {
      MessagePlugin.error(`合同号「${next}」已存在，禁止输入`);
      setContractNoError(true);
      return; // 不更新 active → Input 显示不变（输入被拦截）
    }
    setContractNoError(false);
    onChange({ ...active, contractNo: next });
  };
  const activeTemplate: Template | undefined =
    settings?.templates.find((t) => t.id === active.templateId) ?? settings?.templates[0];

  // 表格类型自动带出：未显式选择时默认首个模板（与下拉框展示一致，避免保存空 templateId）
  useEffect(() => {
    if (!active.templateId && settings?.templates?.length) {
      onChange({ ...active, templateId: settings.templates[0].id });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings]);

  // 销售姓名候选：仅销售类岗位（销售人员/销售主管/项目管理人员/销售助理）可录入合同
  const salesOptions = salesPersonOptions(settings?.personPositions, personOptions);

  // 按系统设置自动安排岗位人员：某岗位在「人员岗位设置」中只有 1 个配置人且当前未分配 → 自动带出（可手动改）
  // 依赖 settings 异步加载完成时触发（settings?.personPositions 由 undefined→对象）
  useEffect(() => {
    if (!settings?.personPositions) return;
    const positions = activeTemplate?.positionOrder ?? [];
    if (positions.length === 0) return;
    const next = { ...active.positionPersons };
    let changed = false;
    for (const pos of positions) {
      if (next[pos]) continue; // 已有人，不覆盖
      const assigned = Object.entries(settings.personPositions)
        .filter(([, ps]) => ps && ps.includes(pos))
        .map(([person]) => person);
      if (assigned.length === 1) {
        next[pos] = assigned[0];
        changed = true;
      }
    }
    if (changed) onChange({ ...active, positionPersons: next });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings?.personPositions, activeTemplate?.id]);


  // 业绩人民币折算
  const rate = active.salesCurrency === 'CNY' ? 1 : active.salesRate;
  const salesCNY = rate > 0 ? Math.round(active.salesAmountOrig * rate * 100) / 100 : 0;
  const feesTotal = active.salesFees.reduce((s, f) => s + (f.amountCNY || 0), 0);

  /** 按业绩人民币与比例计算一笔收款（人民币 = 业绩 × 比例；原币 = 人民币 / 汇率） */
  const calcByRatio = (ratio: number, currency: Currency, r: number): { amount: number; amountCNY: number } => {
    const cny = Math.round(salesCNY * ratio * 100) / 100;
    const amount = currency === 'CNY' ? cny : Math.round((cny / (r > 0 ? r : 1)) * 100) / 100;
    return { amount, amountCNY: cny };
  };

  const setActive = (patch: Partial<ContractDraft>) => {
    const next = { ...active, ...patch };
    // 合同业绩/汇率/币种变化 → 各笔收款按比例自动重算金额（比例不变）
    const salesChanged =
      'salesAmountOrig' in patch || 'salesRate' in patch || 'salesCurrency' in patch;
    if (salesChanged && next.paymentPlan.length > 0) {
      const newRate = next.salesCurrency === 'CNY' ? 1 : next.salesRate;
      const newSalesCNY = newRate > 0 ? Math.round(next.salesAmountOrig * newRate * 100) / 100 : 0;
      next.paymentPlan = next.paymentPlan.map((p) => {
        if (!p.ratio || p.ratio <= 0) return p;
        const cny = Math.round(newSalesCNY * p.ratio * 100) / 100;
        return {
          ...p,
          amountCNY: cny,
          amount: p.currency === 'CNY' ? cny : Math.round((cny / (p.rate > 0 ? p.rate : 1)) * 100) / 100,
        };
      });
    }
    onChange(next);
  };

  // 收款计划编辑
  const handlePlanMonth = (idx: number, v: DateValue | DateMultipleValue) => {
    if (!v) return;
    const raw = Array.isArray(v) ? (v as DateValue[])[0] : v;
    if (!raw) return;
    let month: string;
    if (raw instanceof Date) {
      month = `${raw.getFullYear()}-${String(raw.getMonth() + 1).padStart(2, '0')}`;
    } else {
      month = String(raw).slice(0, 7);
    }
    updatePlan(idx, { month });
  };

  const updatePlan = (idx: number, patch: Partial<PaymentPlanItem>) => {
    const plan = active.paymentPlan.map((p, i) => {
      if (i !== idx) return p;
      const next = { ...p, ...patch };
      if (patch.ratio !== undefined) {
        // 改比例 → 金额自动计算（业绩 × 比例）
        const calc = calcByRatio(patch.ratio, next.currency, next.rate);
        next.amount = calc.amount;
        next.amountCNY = calc.amountCNY;
      } else if (patch.amount !== undefined) {
        // 改金额 → 比例自动反推（金额 / 业绩）
        next.amountCNY =
          next.currency === 'CNY' ? Math.round(next.amount * 100) / 100 : Math.round(next.amount * next.rate * 100) / 100;
        next.ratio = salesCNY > 0 ? Math.min(1, Math.round((next.amountCNY / salesCNY) * 10000) / 10000) : 0;
      } else {
        // 改汇率等 → 金额/比例保持，人民币按比例不变，原币重算
        next.amountCNY = Math.round(salesCNY * (next.ratio ?? 0) * 100) / 100;
        next.amount =
          next.currency === 'CNY' ? next.amountCNY : Math.round((next.amountCNY / (next.rate > 0 ? next.rate : 1)) * 100) / 100;
      }
      return next;
    });
    setActive({ paymentPlan: plan });
  };

  const addPlan = () => {
    if (active.paymentPlan.length >= 4) {
      MessagePlugin.warning('最多 4 笔收款计划');
      return;
    }
    const idx = active.paymentPlan.length;
    const rateNow = active.salesCurrency === 'CNY' ? 1 : active.salesRate || 7.2;
    const newItem: PaymentPlanItem = {
      month: currentMonth(),
      currency: 'USD',
      amount: 0,
      rate: rateNow,
      amountCNY: 0,
      received: false,
      ratio: idx === 0 ? 1 : 0, // 默认第一笔 100%，后续 0%（让用户填）
    };
    setActive({ paymentPlan: [...active.paymentPlan, newItem] });
  };

  const removePlan = (idx: number) => {
    setActive({ paymentPlan: active.paymentPlan.filter((_, i) => i !== idx) });
  };

  // 费用编辑
  const updateFee = (idx: number, patch: Partial<SalesFee>) => {
    const fees = active.salesFees.map((f, i) => {
      if (i !== idx) return f;
      const next = { ...f, ...patch };
      next.amountCNY = next.currency === 'CNY' ? Math.round(next.amount * 100) / 100 : Math.round(next.amount * next.rate * 100) / 100;
      return next;
    });
    setActive({ salesFees: fees });
  };

  const addFee = () => {
    if (active.salesFees.length >= 10) {
      MessagePlugin.warning('最多 10 笔费用');
      return;
    }
    setActive({ salesFees: [...active.salesFees, { currency: 'CNY', amount: 0, rate: 1, amountCNY: 0, note: '' }] });
  };

  const removeFee = (idx: number) => {
    setActive({ salesFees: active.salesFees.filter((_, i) => i !== idx) });
  };

  const setPosition = (pos: string, person: string) => {
    const next = { ...active.positionPersons };
    if (person) next[pos] = person;
    else delete next[pos];
    setActive({ positionPersons: next });
  };

  const planRatioSum = active.paymentPlan.reduce((s, p) => s + (p.ratio ?? 0), 0) * 100;
  const ratioOk = Math.abs(planRatioSum - 100) < 0.01;

  return (
    <div>
      {/* ① 基础信息：先选销售姓名（下拉），再录入合同号 */}
      <div style={{ fontWeight: 600, fontSize: 14, color: '#4a5568', marginBottom: 10 }}>① 基础信息（销售姓名 / 合同号 / 表格类型）</div>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ minWidth: 80, textAlign: 'right', color: '#4a5568' }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>销售姓名</div>
          </div>
          <Select
            value={active.customerName || undefined}
            onChange={(v) => setActive({ customerName: v == null ? '' : String(v) })}
            placeholder={salesOptions.length > 0 ? `选择销售（共 ${salesOptions.length} 人）` : '人员名单为空，请先到系统设置添加'}
            filterable
            creatable
            clearable
            style={{ width: 210 }}
            size="large"
            options={salesOptions.map((n) => ({ value: n, label: n }))}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ minWidth: 80, textAlign: 'right', color: '#4a5568' }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>合同号</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Input
              value={active.contractNo}
              onChange={handleContractNoChange}
              placeholder="合同号（数据库唯一，禁止输入已存在的）"
              style={{ width: 260 }}
              size="large"
              disabled={!!editing}
              status={contractNoError ? 'error' : undefined}
            />
            {contractNoError && (
              <span style={{ fontSize: 12, color: '#d54941' }}>
                ⚠️ 合同号已存在，禁止输入（数据库唯一）
              </span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ minWidth: 80, textAlign: 'right', color: '#4a5568' }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>表格类型</div>
          </div>
          <Select
            value={active.templateId || activeTemplate?.id}
            onChange={(v) => setActive({ templateId: String(v ?? '') })}
            style={{ width: 200 }}
            size="large"
            options={(settings?.templates ?? []).map((t) => ({ value: t.id, label: t.name }))}
          />
        </div>
      </div>

      {/* ② 销售业绩 */}
      <div style={{ borderTop: '1px dashed #e3e8f0', paddingTop: 14, marginBottom: 14 }}>
        <div style={{ fontWeight: 600, fontSize: 14, color: '#4a5568', marginBottom: 10 }}>② 销售业绩（合同总金额）</div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <Select
            value={active.salesCurrency}
            onChange={(v) => {
              const c = (v ?? 'USD') as Currency;
              setActive({
                salesCurrency: c,
                salesRate: c === 'CNY' ? 1 : (active.salesRate || activeTemplate?.defaultRates?.[c] || FALLBACK_RATE[c]),
              });
            }}
            style={{ width: 140 }}
            size="large"
            options={Object.entries(CURRENCY_LABELS).map(([value, label]) => ({ value, label }))}
          />
          <InputNumber
            value={active.salesAmountOrig}
            onChange={(v) => setActive({ salesAmountOrig: Number(v) || 0 })}
            placeholder="原币金额"
            style={{ width: 180 }}
            min={0}
            size="large"
            theme="column"
          />
          {active.salesCurrency !== 'CNY' && (
            <>
              <span style={{ fontSize: 13, color: '#6b7588' }}>× 汇率</span>
              <InputNumber
                value={active.salesRate}
                onChange={(v) => setActive({ salesRate: Number(v) > 0 ? Number(v) : active.salesRate })}
                placeholder="汇率"
                style={{ width: 100 }}
                min={0}
                step={0.01}
                size="large"
                theme="normal"
              />
            </>
          )}
          <span style={{ fontSize: 13, color: '#4a5568' }}>≈</span>
          <span style={{ fontSize: 15, fontWeight: 700, color: '#0052d9', minWidth: 110, fontVariantNumeric: 'tabular-nums' }}>
            ¥ {fmtMoney(salesCNY)}
          </span>
        </div>
      </div>

      {/* ③ 销售费用（多笔，费用名称从字典下拉） */}
      <div style={{ borderTop: '1px dashed #e3e8f0', paddingTop: 14, marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontWeight: 600, fontSize: 14, color: '#4a5568' }}>③ 销售费用（多种费用叠加，名称从字典下拉）</span>
          <Button size="small" variant="outline" style={{ marginLeft: 'auto' }} onClick={addFee}>+ 添加费用</Button>
        </div>
        {active.salesFees.length === 0 && (
          <div style={{ color: '#9aa3b5', fontSize: 13, padding: '8px 0' }}>暂无销售费用</div>
        )}
        {active.salesFees.map((fee, idx) => (
          <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '8px 12px', marginBottom: 6, background: '#f7f9ff', borderRadius: 8, border: '1px solid #e8edf7' }}>
            <span style={{ fontSize: 12, color: '#8a94a6', minWidth: 46 }}>费用{idx + 1}</span>
            <Select
              value={fee.note ?? ''}
              onChange={async (v) => {
                const name = String(v ?? '');
                if (name && !feeNames.find((n) => n.name === name)) {
                  try {
                    const { createFeeName } = await import('../../api/feeNames');
                    const created = await createFeeName(name);
                    if (created && onFeeNamesChange) onFeeNamesChange([...feeNames, created].sort((a, b) => a.sortOrder - b.sortOrder));
                  } catch { /* 忽略 */ }
                }
                updateFee(idx, { note: name });
              }}
              placeholder="费用名称（字典下拉）"
              style={{ width: 160 }}
              size="small"
              filterable
              creatable
              clearable
              options={feeNames.map((n) => ({ value: n.name, label: n.name }))}
            />
            <Select
              value={fee.currency}
              onChange={(v) => updateFee(idx, { currency: (v ?? 'CNY') as Currency, rate: (v ?? 'CNY') === 'CNY' ? 1 : fee.rate || 7.2 })}
              style={{ width: 120 }}
              size="small"
              options={[{ value: 'CNY', label: 'CNY' }, { value: 'USD', label: 'USD' }]}
            />
            <InputNumber
              value={fee.amount}
              onChange={(v) => updateFee(idx, { amount: Number(v) || 0 })}
              placeholder="金额"
              min={0}
              size="small"
              theme="column"
              style={{ width: 120 }}
            />
            {fee.currency !== 'CNY' && (
              <>
                <span style={{ fontSize: 12, color: '#6b7588' }}>×汇率</span>
                <InputNumber value={fee.rate} onChange={(v) => updateFee(idx, { rate: Number(v) > 0 ? Number(v) : fee.rate })} placeholder="汇率" min={0} step={0.01} size="small" theme="normal" style={{ width: 90 }} />
              </>
            )}
            <span style={{ fontSize: 12, color: '#4a5568' }}>=</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#0052d9', minWidth: 90, fontVariantNumeric: 'tabular-nums' }}>¥ {fmtMoney(fee.amountCNY)}</span>
            <Button size="small" variant="text" theme="danger" style={{ marginLeft: 'auto' }} onClick={() => removeFee(idx)}>删除</Button>
          </div>
        ))}
        {active.salesFees.length > 0 && (
          <div style={{ textAlign: 'right', fontSize: 13, color: '#4a5568' }}>
            费用合计（人民币）：
            <span style={{ fontWeight: 700, color: '#0052d9', fontSize: 15, fontVariantNumeric: 'tabular-nums' }}>¥ {fmtMoney(feesTotal)}</span>
            {feesTotal > salesCNY && salesCNY > 0 && (
              <span style={{ color: '#d54941', marginLeft: 12 }}>⚠️ 高于销售业绩</span>
            )}
          </div>
        )}
      </div>

      {/* ④ 收款计划（多笔，按比例，合计 = 100%） */}
      <div style={{ borderTop: '1px dashed #e3e8f0', paddingTop: 14, marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 4 }}>
          <span style={{ fontWeight: 600, fontSize: 14, color: '#4a5568' }}>④ 收款计划（最多 4 笔，比例合计必须 = 100%）</span>
          <span style={{ fontSize: 12, color: '#9aa3b5', whiteSpace: 'nowrap' }}>
            百分比 × 合同总金额 = 本次收款金额（原币）× 汇率 = 人民币金额；改合同金额各笔自动调整
          </span>
          <Button size="small" variant="outline" style={{ marginLeft: 'auto' }} onClick={addPlan}>+ 添加收款计划</Button>
        </div>
        {active.paymentPlan.length === 0 && (
          <div style={{ color: '#9aa3b5', fontSize: 13, padding: '8px 0' }}>暂无收款计划（点"+ 添加收款计划"录入）</div>
        )}
        {active.paymentPlan.map((item, idx) => (
          <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '8px 12px', marginBottom: 6, background: '#f7f9ff', borderRadius: 8, border: '1px solid #e8edf7' }}>
            <span style={{ fontSize: 12, color: '#8a94a6', minWidth: 40 }}>第{idx + 1}笔</span>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 12, color: '#6b7588' }}>比例</span>
              <InputNumber
                value={item.ratio !== undefined ? Math.round(item.ratio * 10000) / 100 : 0}
                onChange={(v) => {
                  const pct = Number(v);
                  if (Number.isFinite(pct) && pct >= 0 && pct <= 100) updatePlan(idx, { ratio: Math.round(pct * 10000) / 10000 / 100 });
                }}
                placeholder="比例"
                min={0}
                max={100}
                step={1}
                size="small"
                theme="column"
                style={{ width: 84 }}
              />
              <span style={{ fontSize: 12, color: '#6b7588' }}>%</span>
            </div>
            <DatePicker value={item.month} onChange={(v) => handlePlanMonth(idx, v)} mode="month" placeholder="月份" style={{ width: 110 }} allowInput clearable={false} size="small" />
            <Select
              value={item.currency}
              onChange={(v) => updatePlan(idx, { currency: (v ?? 'USD') as Currency, rate: (v ?? 'USD') === 'CNY' ? 1 : item.rate || 7.2 })}
              style={{ width: 110 }}
              size="small"
              options={Object.entries(CURRENCY_LABELS).map(([value, label]) => ({ value, label }))}
            />
            <InputNumber value={item.amount} onChange={(v) => updatePlan(idx, { amount: Number(v) || 0 })} placeholder="原币金额" min={0} size="small" theme="column" style={{ width: 140 }} />
            {item.currency !== 'CNY' && (
              <>
                <span style={{ fontSize: 12, color: '#6b7588' }}>×汇率</span>
                <InputNumber value={item.rate} onChange={(v) => updatePlan(idx, { rate: Number(v) > 0 ? Number(v) : item.rate })} placeholder="汇率" min={0} step={0.01} size="small" theme="normal" style={{ width: 80 }} />
              </>
            )}
            <span style={{ fontSize: 12, color: '#4a5568' }}>=</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#0052d9', minWidth: 90, fontVariantNumeric: 'tabular-nums' }}>¥ {fmtMoney(item.amountCNY)}</span>
            <Button size="small" variant="text" theme="danger" style={{ marginLeft: 'auto' }} onClick={() => removePlan(idx)}>删除</Button>
          </div>
        ))}
        {active.paymentPlan.length > 0 && (
          <div style={{ textAlign: 'right', fontSize: 13, color: '#4a5568' }}>
            比例合计：
            <span style={{ fontWeight: 700, color: ratioOk ? '#00a870' : '#d54941', fontVariantNumeric: 'tabular-nums' }}>{planRatioSum.toFixed(2)}%</span>
            <span style={{ color: ratioOk ? '#9aa3b5' : '#d54941', marginLeft: 8 }}>{ratioOk ? '✓ 等于 100%' : '（必须等于 100%）'}</span>
          </div>
        )}
      </div>

      {/* ⑤ 岗位人员分配（下拉 + 可直接输入新姓名） */}
      <div style={{ borderTop: '1px dashed #e3e8f0', paddingTop: 14 }}>
        <div style={{ fontWeight: 600, fontSize: 14, color: '#4a5568', marginBottom: 10 }}>⑤ 岗位人员分配</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          {(activeTemplate?.positionOrder ?? []).map((pos) => {
            const posOptions = positionPersonOptions(settings?.personPositions, pos, personOptions);
            const value = active.positionPersons[pos] ?? '';
            const notInList = !!value && !posOptions.includes(value);
            return (
              <div key={pos} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#f7f8fa', padding: '4px 10px', borderRadius: 6 }}>
                <span style={{ fontSize: 13, color: '#4a5568', fontWeight: 600, whiteSpace: 'nowrap' }}>{pos}</span>
                <Select
                  value={value || undefined}
                  onChange={(v) => setPosition(pos, v == null ? '' : String(v))}
                  placeholder={posOptions.length > 0 ? '选择或输入人员' : '输入人员姓名'}
                  clearable
                  filterable
                  creatable
                  style={{ width: 180 }}
                  size="medium"
                  options={posOptions.map((n) => ({ value: n, label: n }))}
                />
                {notInList && (
                  <span style={{ fontSize: 11, color: '#0052d9', background: '#e8f0ff', padding: '1px 6px', borderRadius: 4 }}>新增</span>
                )}
              </div>
            );
          })}
        </div>
        <div style={{ marginTop: 8, fontSize: 12, color: '#9aa3b5' }}>
          每个岗位一个可输入下拉：可从候选列表选，也可直接输入新姓名（蓝标"新增"提示未在系统设置预配的人员）
        </div>
      </div>
    </div>
  );
}
