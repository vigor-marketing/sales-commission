/** 探测后端 API 是否可用（静态部署时 API 不存在会快速失败） */
import { apiUrl } from './http';

let cached: boolean | null = null;

export async function isBackendAvailable(): Promise<boolean> {
  if (cached !== null) return cached;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1500);
    const res = await fetch(apiUrl('/health'), { signal: controller.signal });
    clearTimeout(timer);
    cached = res.ok;
  } catch {
    cached = false;
  }
  return cached;
}

export function resetBackendProbe(): void {
  cached = null;
}
