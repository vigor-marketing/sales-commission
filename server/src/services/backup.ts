/**
 * 财务数据备份/恢复
 * - 正式主备份：独立 COS 存储桶（cos-nodejs-sdk-v5 直传，对象 sales-commission/财务数据.db）
 * - 本地兜底：本机备份目录（防误删/单文件损坏）
 * - 启动恢复顺序：COS 主对象 → 本地最新快照（仅当数据库文件缺失时才恢复，避免旧备份覆盖新数据）
 * - 写后防抖 800ms，另有 10 分钟兜底备份
 *
 * 访问凭据仅保存在运行环境变量中，绝不下发给前端。
 */
import COS from 'cos-nodejs-sdk-v5';
import fs from 'node:fs';
import path from 'node:path';
import { getDb, getDbPath } from '../db/database.js';

const OBJECT_KEY = 'sales-commission/财务数据.db';

function cosBucket(): string {
  return process.env.COS_BUCKET ?? '';
}
function cosRegion(): string {
  return process.env.COS_REGION ?? '';
}
function cosSecretId(): string {
  return process.env.COS_SECRET_ID ?? '';
}
function cosSecretKey(): string {
  return process.env.COS_SECRET_KEY ?? '';
}

let cosApp: COS | null = null;
function getCos(): COS {
  if (!cosApp) {
    cosApp = new COS({
      SecretId: cosSecretId(),
      SecretKey: cosSecretKey(),
    });
  }
  return cosApp;
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

/** 上传数据库到独立 COS 主对象。 */
export async function backupDbToCos(): Promise<boolean> {
  const dbPath = getDbPath();
  if (!fs.existsSync(dbPath) || !backupEnvReady()) return false;
  try {
    // WAL 模式下先做 checkpoint，确保主库文件包含本轮已提交的数据。
    getDb().pragma('wal_checkpoint(TRUNCATE)');
    await getCos().putObject({
      Bucket: cosBucket(),
      Region: cosRegion(),
      Key: OBJECT_KEY,
      Body: fs.createReadStream(dbPath),
    });
    console.log(`[backup] 已写入云端备份: ${OBJECT_KEY}`);
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

/** 从 COS 主对象恢复；失败时回退本地最新快照。仅当数据库文件缺失时才执行。 */
export async function restoreDbFromCloud(): Promise<boolean> {
  const dbPath = getDbPath();
  if (fs.existsSync(dbPath)) {
    return false; // 数据库已存在，不覆盖（避免旧备份覆盖新数据）
  }

  if (backupEnvReady()) {
    try {
      const result = await getCos().getObject({
        Bucket: cosBucket(),
        Region: cosRegion(),
        Key: OBJECT_KEY,
      });
      const content = result.Body;
      if (content && Buffer.isBuffer(content) && writeRestoredDb(Buffer.from(content), `COS:${OBJECT_KEY}`)) {
        return true;
      }
    } catch {
      // COS 读取失败 → 回退本地快照
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
  return Boolean(cosBucket() && cosRegion() && cosSecretId() && cosSecretKey());
}
