FROM node:20.20.2-alpine

# 替换 Alpine 源为国内阿里云镜像，极大加速 apk 下载
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories

# 安装构建原生模块(如 sqlite3)所需的底层依赖，以及 Python 3.12 所需的 setuptools
RUN apk add --no-cache python3 make g++ py3-setuptools \
    && npm install -g pnpm@10.34.1 --registry=https://registry.npmmirror.com

WORKDIR /app

# 拷贝核心锁文件与工作区配置
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# 拷贝全量源代码
COPY . .

# 配置 pnpm 淘宝镜像，并只安装 api-server 依赖
RUN pnpm config set registry https://registry.npmmirror.com \
    && pnpm install --filter api-server...

# 专门构建 api-server
RUN pnpm --filter api-server run build

# 暴露容器内部运行端口
EXPOSE 3456

# 启动服务端
CMD ["pnpm", "--filter", "api-server", "run", "start:prod"]
