/**
 * 财务数据备份/恢复
 * - 正式主存储：CloudBase 云存储（传统 COS）
 * - 主对象：sales-commission/财务数据.db
 * - 启动恢复顺序：主对象 → 历史兼容对象 sales-commission/commission.db
 * - 写后防抖 800ms，另有 10 分钟兜底备份
 *
 * 访问凭据仅保存在云托管环境变量中，绝不下发给前端。
 */
import cloudbase, { type CloudBase } from '@cloudbase/node-sdk';
import fs from 'node:fs';
import path from 'node:path';
import { getDb, getDbPath } from '../db/database.js';

const CLOUD_PATH = 'sales-commission/财务数据.db';
const LEGACY_CLOUD_PATH = 'sales-commission/commission.db';

// 环境 ID：云托管注入 CBR_ENV_ID（TCBR）；云函数注入 SCF_NAMESPACE / TCB_ENV_ID
export function envId(): string {
  return (
    process.env.CBR_ENV_ID ??
    process.env.TCB_ENV_ID ??
    process.env.SCF_NAMESPACE ??
    process.env.TENCENTCLOUD_ENV ??
    process.env.ENV_ID ??
    ''
  );
}

function backupBucket(): string {
  return process.env.BACKUP_BUCKET ?? '';
}

function isSqlite(content: Buffer): boolean {
  return content.length >= 16 && content.subarray(0, 16).toString('utf8') === 'SQLite format 3\u0000';
}

function writeRestoredDb(content: Buffer, source: string): boolean {
  if (!isSqlite(content)) {
    console.error(`[backup] 跳过无效数据库备份: ${source}`);
    return false;
  }

  const dbPath = getDbPath();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const tmp = `${dbPath}.restore.tmp`;
  fs.writeFileSync(tmp, content);
  fs.renameSync(tmp, dbPath);
  console.log(`[backup] 已从云端恢复数据库备份: ${source}`);
  return true;
}

let sdkApp: CloudBase | null = null;
function getCosApp(): CloudBase {
  if (!sdkApp) {
    const secretId = process.env.BACKUP_SECRET_ID;
    const secretKey = process.env.BACKUP_SECRET_KEY;
    sdkApp = cloudbase.init({
      env: envId(),
      ...(secretId && secretKey ? { secretId, secretKey } : {}),
    });
  }
  return sdkApp;
}

function fileId(cloudPath: string): string {
  return `cloud://${envId()}.${backupBucket()}/${cloudPath}`;
}

/** 上传数据库到传统 CloudBase COS 主对象。 */
export async function backupDbToCos(): Promise<boolean> {
  const dbPath = getDbPath();
  if (!fs.existsSync(dbPath) || !envId() || !backupBucket()) return false;

  try {
    // WAL 模式下先做 checkpoint，确保主库文件包含本轮已提交的数据。
    getDb().pragma('wal_checkpoint(TRUNCATE)');
    await getCosApp().uploadFile({
      cloudPath: CLOUD_PATH,
      fileContent: fs.createReadStream(dbPath),
    });
    console.log(`[backup] 已写入云端备份: ${CLOUD_PATH}`);
    return true;
  } catch (error) {
    console.error('[backup] COS 上传失败:', error instanceof Error ? error.message : error);
    return false;
  }
}

/** 从传统 CloudBase COS 主对象和历史兼容对象依次恢复数据库。 */
export async function restoreDbFromCloud(): Promise<boolean> {
  if (!envId() || !backupBucket()) return false;

  const app = getCosApp();
  for (const cloudPath of [CLOUD_PATH, LEGACY_CLOUD_PATH]) {
    try {
      const result = await app.downloadFile({ fileID: fileId(cloudPath) });
      const content = result.fileContent;
      if (!content || typeof content === 'string') continue;
      if (writeRestoredDb(Buffer.from(content), `COS:${cloudPath}`)) return true;
    } catch {
      // 路径不存在或暂不可读时继续尝试下一条兼容路径。
    }
  }

  console.log('[backup] 未找到可恢复的云端备份');
  return false;
}

let timer: NodeJS.Timeout | null = null;

/** 写操作后触发主备份（防抖 800ms，合并连续写入）。 */
export function scheduleBackup(): void {
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    void backupDbToCos();
  }, 800);
}

/** 启动定时兜底备份（每 10 分钟）；启动 3 秒后写入一次主备份。 */
export function startPeriodicBackup(): void {
  const interval = Number(process.env.BACKUP_INTERVAL_MS ?? 10 * 60 * 1000);
  setInterval(() => {
    void backupDbToCos();
  }, interval);
  setTimeout(() => {
    void backupDbToCos();
  }, 3000);
}

/** 传统 COS 主备份环境是否已配置。 */
export function backupEnvReady(): boolean {
  return Boolean(envId() && backupBucket());
}
