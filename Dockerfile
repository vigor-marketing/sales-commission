# 提成管理系统 - 云托管容器镜像
FROM node:20-slim AS base
WORKDIR /app

# 构建依赖（better-sqlite3 需要编译原生模块：python3 + make + g++）
FROM base AS deps
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY server/package.json server/package-lock.json* ./
RUN npm install --omit=dev

# 复制源码与前端构建产物（index.ts 静态托管路径为 ../../client/dist）
COPY server/ ./
COPY client/dist ./client/dist
COPY entrypoint.sh ./
RUN chmod +x entrypoint.sh

# 运行（tsx 直接跑 TS 源码；entrypoint 负责挂载盘首次播种）
FROM deps AS runtime
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000
CMD ["/bin/sh", "entrypoint.sh"]
