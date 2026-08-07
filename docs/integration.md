# 工作台接入说明

## 生产环境配置

```env
NODE_ENV=production
FRAME_ANCESTORS="'self' https://<workbench-domain>"
API_READ_TOKEN=<财务只读令牌>
API_WRITE_TOKEN=<财务写入令牌>
CORS_ORIGIN=https://<workbench-domain>
VITE_APP_BASE_PATH=/apps/sales-commission/
```

- 总经理和副总经理按既定规则获得读取令牌；财务经理与会计的写入必须经工作台网关和角色授权。
- 令牌由网关在服务端验证或注入；不得写入前端构建变量、页面地址或仓库。
- 同域反向代理时可以留空 `CORS_ORIGIN`，但仍必须配置 `FRAME_ANCESTORS`。
- OIDC 建立后用组织角色和数据范围替代当前过渡性令牌。

## 验收

1. `GET /api/health` 返回 200。
2. 生产环境缺失 CSP 或任一 API 令牌时服务拒绝启动。
3. 无令牌不能读取合同、回款、提成、设置或历史；只读令牌不能写入。
4. `/apps/sales-commission/` 的静态资源、深层刷新和 API 调用均正常。
5. 合同修改、历史删除、费用字典变更后均触发云端备份。
