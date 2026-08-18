/**
 * 财务数据备份/恢复
 * - 正式主备份：传统 CloudBase COS（@cloudbase/node-sdk，对象 sales-commission/财务数据.db）
 * - 本地兜底：本机备份目录（防误删/单文件损坏）
 * - 启动恢复顺序：COS 主对象 → 本地最新快照（仅当数据库文件缺失时才恢复，避免旧备份覆盖新数据）
 * - 写后防抖 800ms，另有 10 分钟兜底备份
 *
 * 访问凭据仅保存在运行环境变量中，绝不下发给前端。
 */
import cloudbase, { type CloudBase } from '@cloudbase/node-sdk';
import fs from 'node:fs';
import path from 'node:path';
import { getDb, getDbPath } from '../db/database.js';

const CLOUD_PATH = 'sales-commission/财务数据.db';
const LEGACY_CLOUD_PATH = 'sales-commission/commission.db';

/** 环境 ID：云托管注入 CBR_ENV_ID（TCBR）；本机用 ENV_ID/CBR_ENV_ID 显式指定 */
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
  console.log(`[backup] 已恢复数据库备份: ${source}`);
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
  if (!fs.existsSync(dbPath) || !backupEnvReady()) return false;
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

/** 本地备份：写入本机备份目录（防数据丢失的第一道防线），保留最近 N 份快照。 */
export async function backupDbToLocal(): Promise<boolean> {
  const dbPath = getDbPath();
  if (!fs.existsSync(dbPath)) return false;
  const dir = process.env.LOCAL_BACKUP_DIR ?? path.join(path.dirname(dbPath), 'backups');
  const keep = Number(process.env.LOCAL_BACKUP_KEEP ?? 56);
  try {
    fs.mkdirSync(dir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const tmp = path.join(dir, `.commission-${ts}.db.tmp`);
    const dest = path.join(dir, `commission-${ts}.db`);
    await getDb().backup(tmp);
    fs.renameSync(tmp, dest);
    const files = fs
      .readdirSync(dir)
      .filter((f) => f.startsWith('commission-') && f.endsWith('.db'))
      .sort()
      .reverse();
    for (const f of files.slice(keep)) {
      try {
        fs.unlinkSync(path.join(dir, f));
      } catch {
        // 忽略清理失败
      }
    }
    console.log(`[backup] 本地备份完成: ${dest}`);
    return true;
  } catch (error) {
    console.error('[backup] 本地备份失败:', error instanceof Error ? error.message : error);
    return false;
  }
}

/** 从本地备份目录恢复最新一份快照。 */
function restoreFromLocal(): boolean {
  const dir = process.env.LOCAL_BACKUP_DIR ?? path.join(path.dirname(getDbPath()), 'backups');
  try {
    const files = fs
      .readdirSync(dir)
      .filter((f) => f.startsWith('commission-') && f.endsWith('.db'))
      .sort()
      .reverse();
    for (const f of files) {
      const p = path.join(dir, f);
      if (writeRestoredDb(fs.readFileSync(p), `本地快照:${p}`)) return true;
    }
  } catch {
    // 本地无备份
  }
  return false;
}

/** 从 COS 主对象/历史兼容对象恢复；失败时回退本地最新快照。仅当数据库文件缺失时才执行。 */
export async function restoreDbFromCloud(): Promise<boolean> {
  const dbPath = getDbPath();
  if (fs.existsSync(dbPath)) {
    return false; // 数据库已存在，不覆盖（避免旧备份覆盖新数据）
  }

  if (backupEnvReady()) {
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
  }

  if (restoreFromLocal()) return true;
  console.log('[backup] 未找到可恢复的云端/本地备份');
  return false;
}

let timer: NodeJS.Timeout | null = null;

/** 写操作后触发主备份（防抖 800ms，合并连续写入）。本地备份始终执行，COS 备份需环境就绪。 */
export function scheduleBackup(): void {
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    void backupDbToLocal();
    void backupDbToCos();
  }, 800);
}

/** 启动定时兜底备份（每 10 分钟）；启动 3 秒后写入一次主备份。 */
export function startPeriodicBackup(): void {
  const interval = Number(process.env.BACKUP_INTERVAL_MS ?? 10 * 60 * 1000);
  setInterval(() => {
    void backupDbToLocal();
    void backupDbToCos();
  }, interval);
  setTimeout(() => {
    void backupDbToLocal();
    void backupDbToCos();
  }, 3000);
}

/** COS 主备份环境是否已配置。 */
export function backupEnvReady(): boolean {
  return Boolean(envId() && backupBucket() && process.env.BACKUP_SECRET_ID && process.env.BACKUP_SECRET_KEY);
}
