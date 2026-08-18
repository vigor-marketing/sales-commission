import { http } from './http';
import { withFallback } from './withFallback';
import type { Settings } from '../types';
import { defaultSettings } from '../utils/calcCore';
import { loadLocalSettings, saveLocalSettings } from '../utils/localStore';

export async function getSettings(): Promise<Settings> {
  return withFallback(
    async () => (await http.get<{ data: Settings }>('/settings')).data,
    () => loadLocalSettings() ?? defaultSettings()
  );
}

export async function saveSettings(
  settings: Settings
): Promise<{ data: Settings; warnings: string[] }> {
  return withFallback(
    () => http.put<{ data: Settings; warnings: string[] }>('/settings', settings),
    () => {
      saveLocalSettings(settings);
      return { data: settings, warnings: [] };
    }
  );
}
