import { http } from './http';
import { isBackendAvailable } from './probe';
import type { Settings } from '../types';
import { defaultSettings } from '../utils/calcCore';
import { loadLocalSettings, saveLocalSettings } from '../utils/localStore';

export async function getSettings(): Promise<Settings> {
  if (await isBackendAvailable()) {
    try {
      const res = await http.get<{ data: Settings }>('/settings');
      return res.data;
    } catch {
      // 后端异常时回退本地
    }
  }
  return loadLocalSettings() ?? defaultSettings();
}

export async function saveSettings(
  settings: Settings
): Promise<{ data: Settings; warnings: string[] }> {
  if (await isBackendAvailable()) {
    try {
      return await http.put<{ data: Settings; warnings: string[] }>('/settings', settings);
    } catch {
      // 后端异常时回退本地
    }
  }
  saveLocalSettings(settings);
  return { data: settings, warnings: [] };
}
