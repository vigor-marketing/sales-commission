import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessagePlugin, Button } from 'tdesign-react';
import type { CalculationResult, PaymentPlanItem, Settings, Template, Currency, SalesFee } from '../types';
import { runCalculation } from '../api/calculate';
import { getSettings } from '../api/settings';
import { getCommissionPersons } from '../api/commissions';
import { getContractOptions, getHistory } from '../api/history';
import { getContract } from '../api/contracts';
import { fmtPct } from '../utils/format';
import InputForm from '../components/calculator/InputForm';
import type { PlanHistoryItem } from '../types';
import SummaryCards from '../components/calculator/SummaryCards';
import ResultTable from '../components/calculator/ResultTable';

export default function CalculatorPage() {
  const navigate = useNavigate();
  // ① 销售姓名 → ② 合同号（自动带出该销售所有合同）
  const [customerName, setCustomerName] = useState('');
  const [contractOptions, setContractOptions] = useState<string[]>([]);
  const [contractNo, setContractNo] = useState('');
  // 合同主数据（只读，来自「合同录入」页，保存时用于计算）
  const [salesCurrency, setSalesCurrency] = useState<Currency>('USD');
  const [salesAmount, setSalesAmount] = useState(0);
  const [salesRate, setSalesRate] = useState(7.25);
  const [salesFees, setSalesFees] = useState<SalesFee[]>([]);
  const [positionPersons, setPositionPersons] = useState<Record<string, string>>({});
  // ④ 这笔收款
  const [payment, setPayment] = useState<PaymentPlanItem | null>(null);
  const [planIndex, setPlanIndex] = useState(1);
  const [totalPlanCount, setTotalPlanCount] = useState(1);
  // 该合同已录的收款计划列表
  const [planHistory, setPlanHistory] = useState<PlanHistoryItem[]>([]);
  // 合同录入页的全部收款计划（用于带出展示：已收冻结 / 未收可编辑）
  const [contractPlan, setContractPlan] = useState<PaymentPlanItem[]>([]);
  const [persons, setPersons] = useState<string[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [templateId, setTemplateId] = useState('');
  const [result, setResult] = useState<CalculationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const resultRef = useRef<HTMLDivElement>(null);

  // 加载系统设置 + 数据库人员
  useEffect(() => {
    getSettings()
      .then((s) => {
        setSettings(s);
        if (!templateId && s.templates.length > 0) {
          setTemplateId(s.templates[0].id);
        }
      })
      .catch(() => setSettings(null));
    getCommissionPersons().then(setPersons).catch(() => setPersons([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeTemplate: Template | undefined =
    settings?.templates.find((t) => t.id === templateId) ?? settings?.templates[0];

  /** 切换销售姓名：加载该销售所有合同，清空合同与收款 */
  const handleCustomerNameChange = (name: string) => {
    setCustomerName(name);
    setContractNo('');
    setPayment(null);
    setPlanIndex(1);
    setTotalPlanCount(1);
    setPlanHistory([]);
    setContractPlan([]);
    setSalesAmount(0);
    setSalesFees([]);
    setPositionPersons({});
    setResult(null);
    if (name) {
      getContractOptions(name)
        .then(setContractOptions)
        .catch(() => setContractOptions([]));
    } else {
      setContractOptions([]);
    }
  };

  /** 选择合同：带出「合同录入」页的合同主数据（只读）+ 已录收款计划，定位下一笔 */
  const handleContractNoChange = useCallback(
    async (no: string) => {
      setContractNo(no);
      setPayment(null);
        setResult(null);
      setSalesAmount(0);
      setSalesFees([]);
      setPositionPersons({});
      if (!no) {
        setPlanHistory([]);
        return;
      }
      // 加载该合同已录的收款计划 + 完整记录（多笔提成明细）
      let planList: PlanHistoryItem[] = [];
      try {
        const hist = await getHistory(1, 10000);
        const rows = hist.list.filter((r) => r.contractNo === no && r.paymentPlan.length > 0);
        planList = rows.map((r) => {
          const p = r.paymentPlan[0];
          return {
            planIndex: r.planIndex ?? 1,
            month: p?.month ?? '',
            currency: p?.currency ?? 'USD',
            amount: p?.amount ?? 0,
            ratio: p?.ratio,
            received: p?.received === true,
            note: p?.note ?? '',
          };
        });
        setPlanHistory(planList);
      } catch {
        setPlanHistory([]);
      }
      // 从「合同录入」页带出合同主数据
      try {
        const contract = await getContract(no);
        if (!contract) {
          MessagePlugin.warning(`合同 ${no} 尚未在「合同录入」页创建，请先录入合同信息`);
          setPlanHistory([]);
          return;
        }
        if (contract.customerName && contract.customerName !== customerName) {
          setCustomerName(contract.customerName);
          getContractOptions(contract.customerName).then(setContractOptions).catch(() => setContractOptions([]));
        }
        setSalesCurrency(contract.salesCurrency ?? 'USD');
        setSalesAmount(contract.salesAmountOrig ?? 0);
        setSalesRate(contract.salesRate ?? 7.2);
        setSalesFees(contract.salesFees ?? []);
        setPositionPersons(contract.positionPersons ?? {});
        setContractPlan(contract.paymentPlan ?? []);
        if (contract.templateId) setTemplateId(contract.templateId);
        // 合同收款计划（所有笔次）——用于批量录入区加载
        // 定位下一笔（已录笔数；合同主数据 totalPlanCount 优先）
        const lastSaved = planList.length > 0 ? Math.max(...planList.map((h) => h.planIndex)) : 0;
        const nextIndex = lastSaved + 1;
        // 计划总笔数 = 合同录入的计划数（追加收款时 planIndex 会超过它）
        const total = contract.totalPlanCount ?? Math.max(planList.length, 1);
        setPlanIndex(nextIndex);
        setTotalPlanCount(total);
        // 这笔收款按收款顺序自动带入收款计划内容（与计划一致，可修改；保存时要求完全一致）
        const plan = contract.paymentPlan?.[nextIndex - 1];
        const now = new Date();
        const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        setPayment({
          month: plan?.month ?? month,
          currency: plan?.currency ?? 'USD',
          amount: plan?.amount ?? 0,
          rate: plan?.rate ?? contract.salesRate ?? 7.2,
          amountCNY: plan?.amountCNY ?? 0,
          received: false,
          ratio: plan?.ratio,
        });
        MessagePlugin.info(`已带出合同 ${no}，正在录入第 ${nextIndex} 笔收款（共 ${total} 笔）`);
      } catch (e) {
        MessagePlugin.error(e instanceof Error ? e.message : '查询合同失败');
      }
    },
    [customerName]
  );

  /** 新建下一笔收款（同合同继续录入，按顺序带入下一笔计划内容） */
  const handleNewPayment = () => {
    if (!contractNo) return;
    const nextIndex = planHistory.length + 1;
    const total = Math.max(contractPlan.length || totalPlanCount, nextIndex);
    setPlanIndex(nextIndex);
    setTotalPlanCount(total);
    setResult(null);
    const plan = contractPlan[nextIndex - 1];
    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    setPayment({
      month: plan?.month ?? month,
      currency: plan?.currency ?? 'USD',
      amount: plan?.amount ?? 0,
      rate: plan?.rate ?? (salesRate || 7.2),
      amountCNY: plan?.amountCNY ?? 0,
      received: false,
      ratio: plan?.ratio,
    });
    MessagePlugin.info(`开始录入第 ${nextIndex} 笔收款（共 ${total} 笔）`);
  };

  /** 保存这笔收款：计算提成并写入历史 */
  const handleSave = async () => {
    if (!customerName.trim()) {
      MessagePlugin.warning('请先选择销售姓名');
      return;
    }
    if (!contractNo.trim()) {
      MessagePlugin.warning('请先选择合同号');
      return;
    }
    if (!Number.isFinite(salesAmount) || salesAmount <= 0) {
      MessagePlugin.warning('合同销售业绩无效，请确认已在「合同录入」页填写');
      return;
    }
    const rate = salesCurrency === 'CNY' ? 1 : salesRate;
    if (!Number.isFinite(rate) || rate <= 0) {
      MessagePlugin.warning('合同汇率无效');
      return;
    }
    const cnyAmount = Math.round(salesAmount * rate * 100) / 100;
    const feesTotal = salesFees.reduce((s, f) => s + (f.amountCNY || 0), 0);
    if (feesTotal > cnyAmount + 0.01) {
      MessagePlugin.warning(`费用合计（¥ ${feesTotal.toFixed(2)}）不能大于销售业绩（¥ ${cnyAmount.toFixed(2)}）`);
      return;
    }
    if (!payment) {
      MessagePlugin.warning('请填写这笔收款信息');
      return;
    }
    if (!payment.month) {
      MessagePlugin.warning('请选择收款月份');
      return;
    }
    if (!Number.isFinite(payment.amount) || payment.amount <= 0) {
      MessagePlugin.warning('请输入这笔收款金额');
      return;
    }
    if (!payment.ratio || payment.ratio <= 0 || payment.ratio > 1) {
      MessagePlugin.warning('请输入这笔收款比例（0%~100%）');
      return;
    }
    // 保存强校验：这笔收款必须与当前笔收款计划一致（月份/币种/金额/比例；汇率可单独调整）
    const plan = contractPlan[planIndex - 1];
    if (plan) {
      const same =
        payment.month === plan.month &&
        payment.currency === plan.currency &&
        Math.abs((payment.amount ?? 0) - (plan.amount ?? 0)) < 0.01 &&
        Math.abs((payment.ratio ?? 0) - (plan.ratio ?? 0)) < 0.0001;
      if (!same) {
        MessagePlugin.warning(
          `这笔收款必须与第 ${planIndex} 笔收款计划一致才能保存（计划：${plan.month} ${plan.currency} ${plan.amount}，比例 ${((plan.ratio ?? 0) * 100).toFixed(1)}%；汇率可单独调整）`
        );
        return;
      }
    }
    // 新模型按实际汇率折算：人民币以实际汇率计算，金额锁定在收款计划内，不再比较合同汇率的人民币

    setLoading(true);
    try {
      const res = await runCalculation({
        salesAmount,
        salesCurrency,
        salesRate: rate,
        salesFees,
        customerName,
        contractNo,
        payment: { ...payment, received: true },
        planIndex,
        totalPlanCount,
        positionPersons,
        templateId: templateId || activeTemplate?.id,
      });
      setResult(res);
      // 刷新该合同已收计划（含刚保存的这笔），并自动进入下一笔（保留结果展示）
      let savedMax = 0;
      try {
        const hist = await getHistory(1, 10000);
        const rows = hist.list.filter((r) => r.contractNo === contractNo && r.paymentPlan.length > 0);
        savedMax = rows.length > 0 ? Math.max(...rows.map((r) => r.planIndex ?? 1)) : 0;
        setPlanHistory(
          rows.map((r) => {
            const p = r.paymentPlan[0];
            return {
              planIndex: r.planIndex ?? 1,
              month: p?.month ?? '',
              currency: p?.currency ?? 'USD',
              amount: p?.amount ?? 0,
              ratio: p?.ratio,
              received: p?.received === true,
              note: p?.note ?? '',
            };
          })
        );
      } catch {
        // 忽略刷新失败
      }
      // 自动进入下一笔：重置这笔录入为下一笔收款计划内容（追加收款时超出计划则空值）
      const nextIdx = savedMax + 1;
      const nextTotal = Math.max(contractPlan.length || totalPlanCount, nextIdx);
      setPlanIndex(nextIdx);
      setTotalPlanCount(nextTotal);
      const nplan = contractPlan[nextIdx - 1];
      const now2 = new Date();
      const month2 = `${now2.getFullYear()}-${String(now2.getMonth() + 1).padStart(2, '0')}`;
      setPayment({
        month: nplan?.month ?? month2,
        currency: nplan?.currency ?? 'USD',
        amount: nplan?.amount ?? 0,
        rate: nplan?.rate ?? (salesCurrency === 'CNY' ? 1 : salesRate || 7.2),
        amountCNY: nplan?.amountCNY ?? 0,
        received: false,
        ratio: nplan?.ratio,
      });
      const ratioPct = res.contractPaidRatio !== undefined ? Math.round(res.contractPaidRatio * 10000) / 100 : NaN;
      const paidMsg = `提成 ¥ ${res.commission?.toFixed(2) ?? res.totalCommission.toFixed(2)}`;
      if (res.contractPaidFull) {
        MessagePlugin.success(`已保存第 ${planIndex} 笔收款，${paidMsg}；该合同累计收款 100%，已收完（已自动进入第 ${nextIdx} 笔）`);
      } else if (Number.isFinite(ratioPct)) {
        MessagePlugin.info(
          `已保存第 ${planIndex} 笔收款，${paidMsg}；该合同累计收款 ${ratioPct.toFixed(1)}%，未收满（剩 ${(100 - ratioPct).toFixed(1)}%），已自动进入第 ${nextIdx} 笔`
        );
      } else {
        MessagePlugin.success(`已保存第 ${planIndex} 笔收款，${paidMsg}（已自动进入第 ${nextIdx} 笔）`);
      }
      setTimeout(() => {
        resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    } catch (e) {
      MessagePlugin.error(e instanceof Error ? e.message : '保存失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h2 className="page-title">提成计算</h2>
          <div className="page-subtitle">
            选择合同（合同信息来自「合同录入」，只读）→ 录入这笔收款 → 保存，每笔收款一条记录
          </div>
        </div>
      </div>
      {/* 公式说明 */}
      <div className="formula-bar">
        <span>计算公式：</span>
        <code>提成基数 = 销售额（人民币）− 成本（费用）；总提成 = 提成基数 × 提成系数；这笔提成 = 总提成 × 该笔比例</code>
        <span style={{ color: '#9aa3b5' }}>
          （当前表格「{activeTemplate?.name ?? '-'}」比例{' '}
          {activeTemplate ? fmtPct(activeTemplate.totalRate) : '2%'}，表格类型随合同自动带入，可在系统设置中调整）
        </span>
      </div>

      <div className="section-card">
        <div className="section-title">计算参数</div>
        <InputForm
          customerName={customerName}
          contractNo={contractNo}
          contractOptions={contractOptions}
          salesCurrency={salesCurrency}
          salesAmount={salesAmount}
          salesRate={salesRate}
          salesFees={salesFees}
          planHistory={planHistory}
          contractPlan={contractPlan}
          settings={settings ?? undefined}
          template={activeTemplate}
          persons={persons}
          payment={payment}
          planIndex={planIndex}
          totalPlanCount={totalPlanCount}
          loading={loading}
          onCustomerNameChange={handleCustomerNameChange}
          onContractNoChange={(v) => handleContractNoChange(v)}
          onNewPayment={handleNewPayment}
          onPaymentChange={(p) => setPayment({ ...p })}
          onSave={handleSave}
        />
      </div>

      {/* 该合同提成统计入口（多笔明细 / 按人明细已移至独立统计页，与合同管理一致） */}
      {contractNo && (
        <div className="section-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>该合同提成统计</div>
              <div style={{ fontSize: 12, color: '#7a8499', marginTop: 2 }}>
                该合同所有收款笔次的提成明细 + 按人员 × 笔 × 岗位汇总（与合同管理页合同明细一致）
              </div>
            </div>
            <Button
              theme="primary"
              variant="outline"
              onClick={() => navigate(`/contract-statistics/${encodeURIComponent(contractNo)}?from=calculate`)}
            >
              查看该合同提成统计 →
            </Button>
          </div>
        </div>
      )}

      {!result && (
        <div className="section-card" style={{ textAlign: 'center', padding: '48px 24px' }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>📋</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#1a1a1a', marginBottom: 4 }}>
            暂无计算结果
          </div>
          <div style={{ fontSize: 13, color: '#7a8499' }}>
            选择销售姓名 → 合同号（合同信息自动带出）→ 录入这笔收款 → 点击「保存这笔收款」后，
            这里将展示汇总卡片与提成明细表（计算表）。
          </div>
        </div>
      )}

      {result && (
        <div ref={resultRef}>
          <SummaryCards result={result} />
          {result.warnings.length > 0 && (
            <div
              className="section-card"
              style={{ padding: '14px 24px', borderColor: '#ffe1c2', background: '#fffbf5' }}
            >
              <div style={{ color: '#e37318', fontSize: 13 }}>
                ⚠️ {result.warnings.join('；')}
              </div>
            </div>
          )}
          <ResultTable result={result} />
        </div>
      )}
    </div>
  );
}
