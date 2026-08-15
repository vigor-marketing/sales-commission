import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import { ConfigProvider } from 'tdesign-react';
import zhCN from 'tdesign-react/es/locale/zh_CN';
import App from './App';
import 'tdesign-react/es/style/index.css';
import './styles/global.css';

// file:// 协议下用 HashRouter（无需服务端路由支持），其他环境用 BrowserRouter
const Router = window.location.protocol === 'file:' ? HashRouter : BrowserRouter;

const content = (
  <React.StrictMode>
    <ConfigProvider globalConfig={zhCN}>
      <App />
    </ConfigProvider>
  </React.StrictMode>
);

ReactDOM.createRoot(document.getElementById('root')!).render(
  Router === HashRouter
    ? <HashRouter>{content}</HashRouter>
    : <BrowserRouter basename={import.meta.env.BASE_URL}>{content}</BrowserRouter>
);
