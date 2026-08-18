import { http } from './http';
import { withFallback } from './withFallback';
import { loadLocalHistory } from '../utils/localStore';

/**
 * 获取所有可选销售人员（下拉用）：
 * 后端优先从数据库历史记录 + 系统设置名单合并；后端不可用时用本地兜底。
 */
export async function getCommissionPersons(): Promise<string[]> {
  return withFallback(
    async () => (await http.get<{ data: string[] }>('/commissions/persons')).data,
    () => {
      // 本地兜底：localStorage 历史中出现的人员
      const persons = new Set<string>();
      for (const r of loadLocalHistory()) {
        if (r.customerName) persons.add(r.customerName);
      }
      return [...persons].sort((a, b) => a.localeCompare(b, 'zh-CN'));
    }
  );
}
