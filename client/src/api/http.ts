/** fetch 封装：baseURL=/api（可用 VITE_API_BASE 指向独立后端域名），JSON 序列化，统一错误抛出 */

// VITE_API_BASE 可指向独立后端；默认跟随 Vite base，支持工作台子路径。
const configuredApiBase = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, '');
const appBasePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const API_BASE = configuredApiBase ?? `${appBasePath}/api`;

export function apiUrl(path: string): string {
  return `${API_BASE}${path}`;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(apiUrl(path), {
    headers: { 'Content-Type': 'application/json', ...(options.headers ?? {}) },
    ...options,
  });
  if (res.status === 204) {
    return undefined as T;
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.error || `请求失败 (${res.status})`);
  }
  return body as T;
}

export const http = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(data ?? {}) }),
  put: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(data ?? {}) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
