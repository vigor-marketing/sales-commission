import { useState, useEffect } from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Layout, Menu } from 'tdesign-react';
import { CalculatorIcon, ChartBarIcon, EditIcon, FileIcon, SettingIcon } from 'tdesign-icons-react';
import ContractsPage from './pages/ContractsPage';
import ContractsManagePage from './pages/ContractsManagePage';
import CalculatorPage from './pages/CalculatorPage';
import PaymentsPage from './pages/PaymentsPage';
import SettingsPage from './pages/SettingsPage';
import HistoryPage from './pages/HistoryPage';
import ContractDetailPage from './pages/ContractDetailPage';
import ContractStatisticsPage from './pages/ContractStatisticsPage';
import TemplateEditorPage from './pages/TemplateEditorPage';
import { useEmbedResize } from './utils/embedResize';

const { Aside, Content } = Layout;
const isEmptyPilot = import.meta.env.VITE_EMPTY_DATA_MODE === 'true';

/** 菜单值 → 路由路径 */
function menuToPath(v: string): string {
  if (v === '/contracts') return '/contracts';
  if (v === '/contracts-manage') return '/contracts-manage';
  if (v === '/calculate') return '/calculate';
  if (v === '/payments') return '/payments';
  if (v === '/settings') return '/settings';
  return '/contracts';
}

export default function App() {
  useEmbedResize();
  const location = useLocation();
  const navigate = useNavigate();
  const [active, setActive] = useState<string>(() => {
    if (location.pathname.startsWith('/contracts-manage')) return '/contracts-manage';
    if (location.pathname.startsWith('/contracts')) return '/contracts';
    if (location.pathname.startsWith('/calculate')) return '/calculate';
    if (location.pathname.startsWith('/payments')) return '/payments';
    if (location.pathname.startsWith('/settings')) return '/settings';
    return '/contracts';
  });

  // 路由切换/刷新后回到页面顶部（手动控制滚动恢复，避免浏览器记忆位置）
  useEffect(() => {
    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual';
    }
    window.scrollTo(0, 0);
  }, [location.pathname]);

  const handleMenuChange = (value: string | number | (string | number)[]) => {
    const v = String(value);
    setActive(v);
    navigate(menuToPath(v));
  };

  return (
    <Layout className="app-shell" style={{ minHeight: '100vh' }}>
      {/* 左侧功能选择（品牌 + 菜单） */}
      <Aside
        className="app-sider"
        width="208px"
        style={{
          background: '#fff',
          boxShadow: '2px 0 10px rgba(31, 56, 106, 0.06)',
          position: 'sticky',
          top: 0,
          height: '100vh',
          overflowY: 'auto',
          zIndex: 90,
        }}
      >
        {/* 品牌区 */}
        <div className="app-brand" style={{ display: 'flex', alignItems: 'center', padding: '18px 16px 14px', borderBottom: '1px solid #eef0f5' }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: 'linear-gradient(135deg, #0052d9, #2f7bff)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: 10,
              boxShadow: '0 3px 8px rgba(0, 82, 217, 0.3)',
              flexShrink: 0,
            }}
          >
            <span style={{ color: '#fff', fontSize: 18, fontWeight: 800 }}>¥</span>
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#1a1a1a', lineHeight: 1.25, whiteSpace: 'nowrap' }}>
              销售提成计算系统
            </div>
            <div style={{ fontSize: 11, color: '#9aa3b5', lineHeight: 1.25, whiteSpace: 'nowrap' }}>
              Commission Calculator
            </div>
          </div>
        </div>

        {/* 功能菜单 */}
        <Menu
          className="app-menu"
          theme="light"
          value={active}
          onChange={handleMenuChange}
          style={{ borderRight: 'none' }}
        >
          <Menu.MenuItem value="/contracts" icon={<EditIcon />}>合同录入</Menu.MenuItem>
          <Menu.MenuItem value="/contracts-manage" icon={<FileIcon />}>合同管理</Menu.MenuItem>
          <Menu.MenuItem value="/calculate" icon={<CalculatorIcon />}>提成计算</Menu.MenuItem>
          <Menu.MenuItem value="/payments" icon={<ChartBarIcon />}>提成统计表</Menu.MenuItem>
          <Menu.MenuItem value="/settings" icon={<SettingIcon />}>系统设置</Menu.MenuItem>
        </Menu>
      </Aside>

      {/* 右侧内容 */}
      <Layout>
        <Content className="app-content" style={{ background: '#f4f6fb', padding: 24, minHeight: '100vh' }}>
          <div style={{ maxWidth: 1280, margin: '0 auto' }}>
            {isEmptyPilot && (
              <div
                role="status"
                style={{
                  marginBottom: 16,
                  padding: '10px 14px',
                  border: '1px solid #e37318',
                  borderRadius: 8,
                  background: '#fff4e8',
                  color: '#7a3b00',
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                当前为 CVM 空白迁移实例：历史财务数据尚待恢复，请勿将本页数据视为原系统记录。
              </div>
            )}
            <Routes>
              {/* 默认进入合同录入页 */}
              <Route path="/" element={<Navigate to="/contracts" replace />} />
              <Route path="/contracts" element={<ContractsPage />} />
              <Route path="/contracts-manage" element={<ContractsManagePage />} />
              <Route path="/calculate" element={<CalculatorPage />} />
              <Route path="/history" element={<HistoryPage />} />
              <Route path="/contract-detail/:contractNo" element={<ContractDetailPage />} />
              <Route path="/contract-statistics/:contractNo" element={<ContractStatisticsPage />} />
              <Route path="/payments" element={<PaymentsPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/settings/templates/new" element={<TemplateEditorPage />} />
            </Routes>
          </div>
        </Content>
      </Layout>
    </Layout>
  );
}
