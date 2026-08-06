import HistoryTable from '../components/calculator/HistoryTable';

/** 计算历史独立页：保留全部功能 + 单选/多选（不与其他页面互链） */
export default function HistoryPage() {
  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h2 className="page-title">计算历史</h2>
          <div className="page-subtitle">
            每笔收款一条记录；支持逐级筛选（销售姓名 → 合同）、单选/多选、批量导出与删除
          </div>
        </div>
      </div>

      <HistoryTable version={0} />
    </div>
  );
}
