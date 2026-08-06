import { getDb } from './database.js';

/** 幂等建表 + 增量迁移（兼容已存在的旧库） */
export function initSchema(): void {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      id          INTEGER PRIMARY KEY CHECK (id = 1),
      total_rate  REAL NOT NULL DEFAULT 0.02,
      nodes_json  TEXT NOT NULL,
      updated_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS calculation_history (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      contract_no       TEXT NOT NULL DEFAULT '',
      customer_name     TEXT NOT NULL DEFAULT '',
      payment_plan_json TEXT NOT NULL DEFAULT '[]',
      position_persons_json TEXT NOT NULL DEFAULT '{}',
      plan_index        INTEGER NOT NULL DEFAULT 1,
      total_plan_count  INTEGER NOT NULL DEFAULT 1,
      contract_total_commission REAL NOT NULL DEFAULT 0,
      commission        REAL NOT NULL DEFAULT 0,
      sales_amount      REAL NOT NULL,
      sales_cost        REAL NOT NULL,
      base_amount       REAL NOT NULL,
      total_commission  REAL NOT NULL,
      settings_snapshot TEXT NOT NULL,
      result_json       TEXT NOT NULL,
      created_at        TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE INDEX IF NOT EXISTS idx_history_created ON calculation_history(created_at DESC);

    CREATE TABLE IF NOT EXISTS contracts (
      id                       INTEGER PRIMARY KEY AUTOINCREMENT,
      contract_no              TEXT NOT NULL UNIQUE,
      customer_name            TEXT NOT NULL DEFAULT '',
      template_id              TEXT NOT NULL DEFAULT '',
      sales_currency            TEXT NOT NULL DEFAULT 'USD',
      sales_amount_orig        REAL NOT NULL DEFAULT 0,
      sales_rate               REAL NOT NULL DEFAULT 1,
      sales_fees_json          TEXT NOT NULL DEFAULT '[]',
      payment_plan_json        TEXT NOT NULL DEFAULT '[]',
      position_persons_json    TEXT NOT NULL DEFAULT '{}',
      total_plan_count         INTEGER NOT NULL DEFAULT 1,
      note                     TEXT NOT NULL DEFAULT '',
      created_at               TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      updated_at               TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE INDEX IF NOT EXISTS idx_contracts_customer ON contracts(customer_name);
    CREATE INDEX IF NOT EXISTS idx_contracts_no ON contracts(contract_no);

    CREATE TABLE IF NOT EXISTS fee_names (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT NOT NULL UNIQUE,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE INDEX IF NOT EXISTS idx_fee_names_sort ON fee_names(sort_order, id);
  `);

  migrate();
}

/**
 * 增量迁移：为旧版本数据库补充新列。
 * （新库已含列则跳过；旧库缺列则 ALTER TABLE 补齐）
 */
function migrate(): void {
  const db = getDb();
  const cols = db.prepare(`PRAGMA table_info(calculation_history)`).all() as Array<{ name: string }>;
  const has = (name: string) => cols.some((c) => c.name === name);

  if (!has('contract_no')) {
    db.exec(`ALTER TABLE calculation_history ADD COLUMN contract_no TEXT NOT NULL DEFAULT ''`);
  }
  if (!has('customer_name')) {
    db.exec(`ALTER TABLE calculation_history ADD COLUMN customer_name TEXT NOT NULL DEFAULT ''`);
  }
  if (!has('payment_plan_json')) {
    db.exec(`ALTER TABLE calculation_history ADD COLUMN payment_plan_json TEXT NOT NULL DEFAULT '[]'`);
  }
  if (!has('position_persons_json')) {
    db.exec(`ALTER TABLE calculation_history ADD COLUMN position_persons_json TEXT NOT NULL DEFAULT '{}'`);
  }
  if (!has('plan_index')) {
    db.exec(`ALTER TABLE calculation_history ADD COLUMN plan_index INTEGER NOT NULL DEFAULT 1`);
  }
  if (!has('total_plan_count')) {
    db.exec(`ALTER TABLE calculation_history ADD COLUMN total_plan_count INTEGER NOT NULL DEFAULT 1`);
  }
  if (!has('contract_total_commission')) {
    db.exec(`ALTER TABLE calculation_history ADD COLUMN contract_total_commission REAL NOT NULL DEFAULT 0`);
  }
  if (!has('commission')) {
    db.exec(`ALTER TABLE calculation_history ADD COLUMN commission REAL NOT NULL DEFAULT 0`);
  }
}
