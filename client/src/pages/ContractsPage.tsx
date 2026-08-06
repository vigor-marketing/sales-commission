import { useEffect, useState, useCallback } from 'react';
import { Button, MessagePlugin } from 'tdesign-react';
import type { Contract, Settings, FeeName } from '../types';
import { upsertContract, getContracts } from '../api/contracts';
import { getFeeNames } from '../api/feeNames';
import { getSettings } from '../api/settings';
import { getCommissionPersons } from '../api/commissions';
import ContractForm from '../components/contracts/ContractForm';

function emptyContract(): Omit<Contract, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    contractNo: '',
    customerName: '',
    templateId: '',
    salesCurrency: 'USD',
    salesAmountOrig: 0,
    salesRate: 7.2,
    salesFees: [],
    paymentPlan: [],
    positionPersons: {},
    totalPlanCount: 1,
  };
}

/** 合同录入页：纯录入（无列表，列表在「合同管理」页），先选销售姓名 → 再录入合同 */
export default function ContractsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [feeNames, setFeeNames] = useState<FeeName[]>([]);
  const [persons, setPersons] = useState<string[]>([]);
  const [active, setActive] = useState<Omit<Contract, 'id' | 'createdAt' | 'updatedAt'>>(emptyContract());
  const [saving, setSaving] = useState(false);
  const [existingContractNos, setExistingContractNos] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      const [s, fns, p, list] = await Promise.all([getSettings(), getFeeNames(), getCommissionPersons(), getContracts()]);
      if (s) setSettings(s);
      setFeeNames(fns);
      setPersons(p);
      setExistingContractNos(new Set((list ?? []).map((c) => c.contractNo).filter(Boolean)));
    } catch (e) {
      MessagePlugin.error(e instanceof Error ? e.message : '加载配置失败');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const personOptions = [...new Set([...persons, ...(settings?.staffList ?? [])])];

  /** 新建合同：清空表单 */
  const handleNew = () => {
    setActive(emptyContract());
  };

  /** 保存合同（按合同号 upsert，数据库唯一，重复保存 = 更新覆盖） */
  const handleSave = async () => {
    if (!active.contractNo.trim()) {
      MessagePlugin.warning('请输入合同号（数据库唯一）');
      return;
    }
    if (existingContractNos.has(active.contractNo.trim())) {
      MessagePlugin.error(`合同号「${active.contractNo.trim()}」已存在，禁止输入`);
      return;
    }
    if (!active.customerName.trim()) {
      MessagePlugin.warning('请先选择销售姓名');
      return;
    }
    if (active.salesAmountOrig < 0) {
      MessagePlugin.warning('业绩金额必须 ≥ 0');
      return;
    }
    setSaving(true);
    try {
      const saved = await upsertContract(active);
      MessagePlugin.success(`已保存合同 ${saved.contractNo}，可在「提成计算」页带出使用`);
      // 保存成功后刷新合同号列表（含本次保存的）
      setExistingContractNos((prev) => new Set([...prev, saved.contractNo]));
    } catch (e) {
      MessagePlugin.error(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h2 className="page-title">合同录入</h2>
          <div className="page-subtitle">
            先选择销售姓名 → 录入合同（业绩/费用/收款计划/岗位人员）；收款按比例自动计算，合同号数据库唯一
          </div>
        </div>
        <div className="toolbar">
          <Button variant="outline" onClick={handleNew}>+ 新建合同</Button>
          <Button theme="primary" loading={saving} onClick={handleSave}>保存合同</Button>
        </div>
      </div>

      <div className="section-card">
        <div className="section-title">
          <span>{active.contractNo ? `合同：${active.contractNo}` : '新建合同'}</span>
          {active.contractNo && (
            <Button size="small" variant="text" onClick={handleNew}>清空 → 新建</Button>
          )}
        </div>
        <ContractForm
          active={active}
          onChange={setActive}
          settings={settings}
          feeNames={feeNames}
          onFeeNamesChange={setFeeNames}
          personOptions={personOptions}
          existingContractNos={existingContractNos}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 18 }}>
          <Button theme="primary" size="large" loading={saving} onClick={handleSave} style={{ minWidth: 160 }}>
            保存合同
          </Button>
          <span style={{ fontSize: 12, color: '#9aa3b5', whiteSpace: 'nowrap' }}>
            合同号重复保存 = 更新覆盖（数据库唯一）；保存后可在「提成计算」页选该合同带出，或在「合同管理」页修改
          </span>
        </div>
      </div>
    </div>
  );
}
