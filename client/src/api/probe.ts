/** 探测后端 API 是否可用（静态部署时 /api 不存在会快速失败） */

let cached: boolean | null = null;
const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, '') ?? '';

export async function isBackendAvailable(): Promise<boolean> {
  if (cached !== null) return cached;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1500);
    const res = await fetch(`${API_BASE}/api/health`, { signal: controller.signal });
    clearTimeout(timer);
    cached = res.ok;
  } catch {
    cached = false;
  }
  return cached;
}
