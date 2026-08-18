import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { initSchema } from './db/schema.js';
import { seedIfEmpty } from './db/seed.js';
import { settingsRouter } from './routes/settings.js';
import { calculateRouter } from './routes/calculate.js';
import { historyRouter } from './routes/history.js';
import { commissionsRouter } from './routes/commissions.js';
import { contractsRouter } from './routes/contracts.js';
import { feeNamesRouter } from './routes/feeNames.js';
import { platformEventsRouter } from './routes/platformEvents.js';
import { restoreDbFromCloud, startPeriodicBackup, backupEnvReady } from './services/backup.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3001;
const HOST = process.env.HOST ?? '0.0.0.0';

/** 启动引导：有云端备份则先恢复，再初始化 schema + 种子，最后开定时备份 */
async function bootstrap(): Promise<void> {
  const backupReady = backupEnvReady();
  if (backupReady) {
    await restoreDbFromCloud();
  }

  initSchema();
  seedIfEmpty();

  if (backupReady) {
    startPeriodicBackup();
    console.log('[backup] 云端备份环境就绪');
  }
}
const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

// 健康检查
app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    dataMode: process.env.EMPTY_DATA_MODE === 'true' ? 'empty-pilot' : 'normal',
    time: new Date().toISOString(),
  });
});

// 业务路由
app.use('/api/settings', settingsRouter);
app.use('/api/calculate', calculateRouter);
app.use('/api/history', historyRouter);
app.use('/api/commissions', commissionsRouter);
app.use('/api/contracts', contractsRouter);
app.use('/api/feeNames', feeNamesRouter);
app.use('/api/v1', platformEventsRouter);

// 生产模式：托管前端构建产物
const clientDist = path.join(__dirname, '../../client/dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// 完成恢复和数据库初始化后再接收流量，避免冷启动时先返回空数据。
void bootstrap()
  .then(() => {
    app.listen(PORT, HOST, () => {
      console.log(`[server] sales-commission API started: http://${HOST}:${PORT}`);
    });
  })
  .catch((error: unknown) => {
    console.error('[server] bootstrap failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  });
