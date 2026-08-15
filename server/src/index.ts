import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { initSchema } from './db/schema.js';
import { seedIfEmpty } from './db/seed.js';
import { settingsRouter } from './routes/settings.js';
import { calculateRouter } from './routes/calculate.js';
import { historyRouter } from './routes/history.js';
import { paymentsRouter } from './routes/payments.js';
import { commissionsRouter } from './routes/commissions.js';
import { contractsRouter } from './routes/contracts.js';
import { feeNamesRouter } from './routes/feeNames.js';
import { restoreDbFromCloud, startPeriodicBackup, backupEnvReady } from './services/backup.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3001;
const isProduction = process.env.NODE_ENV === 'production';
const frameAncestors = process.env.FRAME_ANCESTORS?.trim();
const allowedOrigins = new Set(
  (process.env.CORS_ORIGIN ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
);
const readToken = process.env.API_READ_TOKEN ?? '';
const writeToken = process.env.API_WRITE_TOKEN ?? '';

if (isProduction && !frameAncestors) {
  throw new Error('FRAME_ANCESTORS is required in production.');
}
if (isProduction && frameAncestors.includes('*')) {
  throw new Error('FRAME_ANCESTORS must not contain a wildcard in production.');
}
if (isProduction && (!readToken || !writeToken)) {
  throw new Error('API_READ_TOKEN and API_WRITE_TOKEN are required in production.');
}

function tokenMatches(actual: string, expected: string): boolean {
  if (!actual || !expected) return false;
  const actualBytes = Buffer.from(actual);
  const expectedBytes = Buffer.from(expected);
  return actualBytes.length === expectedBytes.length && crypto.timingSafeEqual(actualBytes, expectedBytes);
}

function apiAccess(write = false): express.RequestHandler {
  return (req, res, next) => {
    const expected = write ? writeToken : (readToken || writeToken);
    // Preserve local development without a token. Production always requires one.
    if (!expected && !isProduction) return next();
    const header = req.header('authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!tokenMatches(token, expected)) {
      return res.status(401).json({ error: '未授权访问' });
    }
    return next();
  };
}

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
app.disable('x-powered-by');
app.use((_, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  if (frameAncestors) res.setHeader('Content-Security-Policy', `frame-ancestors ${frameAncestors}`);
  next();
});
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.has(origin)) return callback(null, true);
    return callback(null, false);
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json({ limit: '2mb' }));

// 健康检查
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

// Read endpoints require the read token. Write requests are additionally
// protected below so a workbench read-only session cannot mutate financial data.
app.use('/api', apiAccess(false));
app.use('/api/settings', (req, res, next) => req.method === 'GET' ? next() : apiAccess(true)(req, res, next), settingsRouter);
app.use('/api/calculate', apiAccess(true), calculateRouter);
app.use('/api/history', (req, res, next) => req.method === 'GET' ? next() : apiAccess(true)(req, res, next), historyRouter);
app.use('/api/payments', paymentsRouter);
app.use('/api/commissions', commissionsRouter);
app.use('/api/contracts', (req, res, next) => req.method === 'GET' ? next() : apiAccess(true)(req, res, next), contractsRouter);
app.use('/api/feeNames', (req, res, next) => req.method === 'GET' ? next() : apiAccess(true)(req, res, next), feeNamesRouter);

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
    // 绑定 0.0.0.0：局域网内其他设备可通过 http://<本机IP>:PORT 访问
    app.listen(PORT, '0.0.0.0', () => {
      // 避免 Windows 终端（GBK）下中文乱码，统一使用 ASCII 日志
      console.log(`[server] sales-commission API started: http://localhost:${PORT} (LAN: http://0.0.0.0:${PORT})`);
    });
  })
  .catch((error: unknown) => {
    console.error('[server] bootstrap failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  });
