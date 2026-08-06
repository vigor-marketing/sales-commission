import type { Currency } from '../types';

const FALLBACK_RATE: Record<Currency, number> = { CNY: 1, USD: 7.2, EUR: 7.8 };

/** 取币种默认汇率（CNY=1, USD/EUR 用 FALLBACK_RATE） */
export function defaultRate(currency: Currency): number {
  return FALLBACK_RATE[currency] ?? 1;
}
