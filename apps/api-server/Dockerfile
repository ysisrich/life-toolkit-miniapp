# 构建阶段
FROM node:20-alpine AS builder

WORKDIR /app

# 启用 pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# 拷贝依赖相关文件
COPY package.json pnpm-lock.yaml* ./

# 安装所有依赖（包含开发依赖，用于构建）
RUN pnpm install --frozen-lockfile

# 拷贝源码
COPY . .

# 编译
RUN pnpm run build

# 生产阶段
FROM node:20-alpine

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

# 拷贝依赖配置
COPY package.json pnpm-lock.yaml* ./

# 仅安装生产依赖
RUN pnpm install --prod --frozen-lockfile

# 从构建阶段拷贝编译好的文件
COPY --from=builder /app/dist ./dist

# 创建用于挂载 sqlite 数据库的目录
RUN mkdir -p /app/data

# 暴露端口
EXPOSE 3456

# 启动命令
CMD ["node", "dist/main.js"]
