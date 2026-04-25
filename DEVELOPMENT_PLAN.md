# 内网聊天室重构开发步骤手册 (Next.js 全栈版)

本项目采用 Next.js (App Router) + TypeScript + Tailwind CSS + Socket.io 架构，实现前后端一体化和强类型约束。

## 阶段一：基础设施搭建 (Infrastructure Setup)
- [ ] 1.1 **备份旧资产**：将现有的 `public` 和 `src` 目录移入 `legacy` 备份目录，清理工作区。
- [ ] 1.2 **初始化 Next.js 项目**：使用 `create-next-app` 初始化项目（开启 TypeScript, Tailwind CSS, App Router）。
- [ ] 1.3 **配置 Socket.io 自定义服务**：在根目录建立 `server.ts`，集成 Next.js 渲染与 Socket.io 实时通信。
- [ ] 1.4 **工程化规范**：配置路径别名 (`@/*`) 和基础公共样式。

## 阶段二：建立类型契约 (Core Type Definitions)
- [ ] 2.1 **定义数据模型**：在 `types/` 目录下建立 `User`, `ChatMessage`, `Todo`, `Favorite` 等核心数据结构的 TypeScript 接口。
- [ ] 2.2 **定义 API 契约**：建立前后端交互的 Request Body 和 Response Data 类型，确保接口强校验。

## 阶段三：后端逻辑与数据层迁移 (Backend & Data Migration)
- [ ] 3.1 **数据持久化层重构**：将原有的 JSON 文件读写逻辑迁移至 `lib/db.ts`，并加上严格的类型校验。
- [ ] 3.2 **REST API 迁移**：将原 Express 路由 (Todos, 用户登录, 文件上传等) 迁移至 Next.js 的 Route Handlers (`app/api/...`)。
- [ ] 3.3 **Socket 事件迁移**：将原有的 Socket.io 聊天、收藏广播等逻辑迁移至 `server.ts`，并实现强类型事件绑定。

## 阶段四：前端界面重构 (Frontend UI Reconstruction)
- [ ] 4.1 **布局与基础组件**：使用 React + Tailwind 重构全局 Header、通知组件等。
- [ ] 4.2 **鉴权与状态管理**：重构登录页，使用 React Context 或 Zustand 管理全局用户状态和未读消息数。
- [ ] 4.3 **聊天室核心功能**：重构消息列表、发送框、图片预览，对接 Socket.io Client。
- [ ] 4.4 **消息提醒机制**：重构并封装“主动消息提醒”功能（Tab 标题闪烁 + 提示音）为 React Hook。
- [ ] 4.5 **扩展功能板**：重构右侧的“任务清单(Todos)”和“收藏夹(Favorites)”面板。

## 阶段五：工程化测试与交付 (Testing & Delivery)
- [ ] 5.1 **端到端测试**：编写 TS 版本的自动化测试脚本，验证核心链路。
- [ ] 5.2 **全面联调与 UI 走查**：对照旧版功能，确保 100% 还原且无白屏、数据丢失等 Bug。
- [ ] 5.3 **生产构建与打包**：执行 `npm run build`，验证生产环境运行无误，并打包最终的 7z 离线包。