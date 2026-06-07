# 生活工具箱 (Life Toolkit) Monorepo

这是一个基于 **pnpm workspaces** 构建的企业级全栈工程，包含高颜值的微信小程序客户端，以及强大的 NestJS 后端系统。

## 🏗️ 架构概览 (Architecture)

本仓库采用 Monorepo 模式进行管理，所有的应用和模块收纳在统一的空间下。

```text
.
├── apps
│   ├── miniapp         # 微信小程序 (前端视图层，基于分包架构)
│   └── api-server      # NestJS 微服务 (后端 API 层，基于 TypeORM + SQLite)
├── packages            # 共享层 (如类型定义、公共插件)
├── pnpm-workspace.yaml # Monorepo 工作区定义
└── package.json        # 根级依赖和脚本入口
```

## 🚀 核心特性

- **前端 (Miniapp)**：
  - Apple VisionOS 风格的高端毛玻璃 UI 设计。
  - 极致丝滑的 GSAP 动效矩阵。
  - 微前端（分包）架构，工具组件高度解耦，实现动态无感加载。
  - 集成 Bark 原生系统级推送服务。
- **后端 (API Server)**：
  - 基于当前最前沿的 NestJS 企业级框架。
  - 内置 TypeORM 与 SQLite 自动实体同步，做到开箱即用的本地数据库支持。
  - 为未来微信云开发、“订阅消息”推送任务提供独立的 Cron 节点。

## 🛠️ 快速启动指南

### 1. 统一环境准备
请确保你的电脑上安装了 `Node.js` (v18+) 和 `pnpm`。在仓库根目录执行一次依赖安装：
```bash
pnpm install
```

### 2. 启动 NestJS 后端
```bash
pnpm run dev:api
```
此时 API 服务器将监听 `http://localhost:3000` 并在后端目录自动生成 `database.sqlite` 数据库文件。

### 3. 运行微信小程序客户端
打开 **微信开发者工具**，将项目目录指定为本仓库下的 `apps/miniapp/` 文件夹。
开发者工具会自动读取配置并进入实时预览。

---

> *生活不仅是数据的堆砌，更是设计的艺术。致力于用极简美学重新定义实用工具！*
