/**
 * 后端优先 + 本地兜底的统一包装。
 * 后端可用时直接请求，失败抛出（由页面 MessagePlugin 展示）；后端不可用（静态/standalone）时才走本地兜底。
 */
import { isBackendAvailable } from './probe';

export async function withFallback<T>(
  fetchBackend: () => Promise<T>,
  fallback: () => T | Promise<T>
): Promise<T> {
  if (await isBackendAvailable()) {
    return await fetchBackend();
  }
  return await fallback();
}
