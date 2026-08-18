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

/** 去除浮点噪声：保留最多 6 位小数（如 30.099999999999998 → 30.1），用于比例 × 100 后的展示值 */
export function deNoise(v: number, digits = 6): number {
  const p = 10 ** digits;
  return Math.round(v * p) / p;
}

/** 数字输入解析：字符串 → 数字，非法返回 NaN */
export function parseNum(s: string): number {
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}
