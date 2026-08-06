/** 金额/百分比格式化 */

/** 千分位金额格式，保留 2 位小数 */
export function fmtMoney(v: number): string {
  const sign = v < 0 ? '-' : '';
  const abs = Math.abs(v);
  const [int, dec] = abs.toFixed(2).split('.');
  const intFmt = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${sign}${intFmt}.${dec}`;
}

/** 百分比格式：0.02 → "2%"；0.123 → "12.30%" */
export function fmtPct(v: number, digits = 2): string {
  return `${(v * 100).toFixed(digits)}%`;
}

/** 数字输入解析：字符串 → 数字，非法返回 NaN */
export function parseNum(s: string): number {
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}
