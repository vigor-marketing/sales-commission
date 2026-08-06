#!/bin/sh
# 云托管启动脚本：
# 1. 若挂载盘 /data 为空（首次挂载 CFS），把镜像内置的数据库种子复制过去
# 2. 启动应用（DB_PATH 指向挂载盘 /data/commission.db）
set -e

if [ -n "$DB_PATH" ]; then
  DATA_DIR="$(dirname "$DB_PATH")"
  mkdir -p "$DATA_DIR"
  # 仅当挂载盘尚无数据库时播种（避免覆盖已有数据）
  if [ ! -f "$DB_PATH" ] && [ -d /app/server/data ]; then
    echo "[init] 初始化持久化数据库：从镜像种子复制 -> $DB_PATH"
    cp -f /app/server/data/commission.db "$DB_PATH" 2>/dev/null || true
  fi
fi

echo "[start] sales-commission starting... (DB_PATH=${DB_PATH:-default})"
exec npx tsx src/index.ts
