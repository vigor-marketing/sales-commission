import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Popconfirm, MessagePlugin } from 'tdesign-react';
import type { Contract, Settings, FeeName } from '../types';
import { getContract, getContracts, upsertContract, deleteContract } from '../api/contracts';
import { getFeeNames } from '../api/feeNames';
import { getSettings } from '../api/settings';
import { getCommissionPersons } from '../api/commissions';
import ContractForm from '../components/contracts/ContractForm';

type ContractDraft = Omit<Contract, 'id' | 'createdAt' | 'updatedAt'>;

/** 合同编辑页：独立页面修改单个合同（保存/删除后返回合同管理列表） */
export default function ContractEditPage() {
  const navigate = useNavigate();
  const { contractNo } = useParams();
  const [active, setActive] = useState<ContractDraft | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [feeNames, setFeeNames] = useState<FeeName[]>([]);
  const [persons, setPersons] = useState<string[]>([]);
  const [existingContractNos, setExistingContractNos] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const no = contractNo ? decodeURIComponent(contractNo) : '';
      try {
        const [contract, s, fns, p, list] = await Promise.all([
          getContract(no),
          getSettings(),
          getFeeNames(),
          getCommissionPersons(),
          getContracts(),
        ]);
        if (!contract) {
          MessagePlugin.error(`合同「${no}」不存在`);
          navigate('/contracts-manage', { replace: true });
          return;
        }
        setActive({
          contractNo: contract.contractNo,
          customerName: contract.customerName,
          templateId: contract.templateId,
          salesCurrency: contract.salesCurrency,
          salesAmountOrig: contract.salesAmountOrig,
          salesRate: contract.salesRate,
          salesFees: contract.salesFees,
          paymentPlan: contract.paymentPlan,
          positionPersons: contract.positionPersons,
          totalPlanCount: contract.totalPlanCount,
        });
        if (s) setSettings(s);
        setFeeNames(fns);
        setPersons(p);
        setExistingContractNos(new Set((list ?? []).map((c) => c.contractNo).filter(Boolean)));
      } catch (e) {
        MessagePlugin.error(e instanceof Error ? e.message : '加载合同失败');
      } finally {
        setLoading(false);
      }
    })();
  }, [contractNo, navigate]);

  const personOptions = [...new Set([...persons, ...(settings?.staffList ?? [])])];

  /** 保存修改：只更新合同主数据（contracts 表），计算历史快照不动 */
  const handleSave = async () => {
    if (!active) return;
    if (!active.contractNo.trim()) {
      MessagePlugin.warning('请输入合同号');
      return;
    }
    if (!active.customerName.trim()) {
      MessagePlugin.warning('请输入销售姓名');
      return;
    }
    if (active.salesAmountOrig < 0) {
      MessagePlugin.warning('业绩金额必须 ≥ 0');
      return;
    }
    setSaving(true);
    try {
      // 修改模式：携带原合同号，后端允许更新自身（合同号唯一性由后端校验）
      const saved = await upsertContract({ ...active, originalContractNo: contractNo });
      MessagePlugin.success(`已更新合同 ${saved.contractNo}，已同步到提成计算/统计`);
      navigate('/contracts-manage');
    } catch (e) {
      MessagePlugin.error(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!contractNo) return;
    try {
      await deleteContract(decodeURIComponent(contractNo));
      MessagePlugin.success(`已删除合同 ${contractNo}`);
      navigate('/contracts-manage');
    } catch (e) {
      MessagePlugin.error(e instanceof Error ? e.message : '删除失败');
    }
  };

  if (loading || !active) {
    return (
      <div className="page-container">
        <div className="page-header">
          <div>
            <h2 className="page-title">修改合同</h2>
          </div>
        </div>
        <div className="section-card" style={{ textAlign: 'center', padding: 60, color: '#9aa3b5' }}>
          加载中…
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h2 className="page-title">修改合同</h2>
          <div className="page-subtitle">
            修改合同主数据后自动同步到提成计算 / 统计；已保存的计算历史保持原快照
          </div>
        </div>
        <Button variant="outline" onClick={() => navigate('/contracts-manage')}>返回合同列表</Button>
      </div>

      <div className="section-card">
        <div className="section-title">
          <span>合同：{active.contractNo}</span>
        </div>
        <ContractForm
          active={active}
          onChange={setActive}
          settings={settings}
          feeNames={feeNames}
          onFeeNamesChange={setFeeNames}
          personOptions={personOptions}
          editing
          existingContractNos={existingContractNos}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 18 }}>
          <Button theme="primary" loading={saving} onClick={handleSave} style={{ minWidth: 160 }}>
            保存修改（同步到其他部分）
          </Button>
          <Popconfirm content="确认删除该合同？" onConfirm={handleDelete}>
            <Button variant="outline" theme="danger">删除该合同</Button>
          </Popconfirm>
          <span style={{ fontSize: 12, color: '#9aa3b5', whiteSpace: 'nowrap' }}>
            修改后提成计算页带出的合同信息将同步更新；已保存的历史记录不重算
          </span>
        </div>
      </div>
    </div>
  );
}
