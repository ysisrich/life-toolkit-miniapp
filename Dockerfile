FROM node:20.20.2-alpine

# 安装构建原生模块(如 sqlite3)所需的底层依赖，并全局安装 pnpm
RUN apk add --no-cache python3 make g++ \
    && npm install -g pnpm@10.34.1

WORKDIR /app

# 拷贝核心锁文件与工作区配置
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# 拷贝全量源代码
COPY . .

# 只安装 api-server 及其依赖模块的依赖，避免安装前端无用依赖
RUN pnpm install --filter api-server...

# 专门构建 api-server
RUN pnpm --filter api-server run build

# 暴露容器内部运行端口
EXPOSE 3456

# 启动服务端
CMD ["pnpm", "--filter", "api-server", "run", "start:prod"]
