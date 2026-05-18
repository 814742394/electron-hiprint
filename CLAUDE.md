# electron-hiprint

## 项目概述

基于 Electron 的桌面打印客户端，为 `vue-plugin-hiprint` 提供本地打印服务。通过 Socket.IO 接收来自 Web 应用的打印任务，调用系统打印机完成 HTML/PDF 文档打印。支持本地直连和中转代理（跨网络云打印）两种模式。

## 技术栈

| 类别 | 技术 |
|------|------|
| 运行时 | Electron 17.x, Node.js |
| 通信 | Socket.IO 3.x (服务端+客户端) |
| 前端渲染 | Vue.js 2.x (CDN), Element UI (CDN), jQuery |
| 后端 | Node.js CommonJS 模块 |
| 数据库 | SQLite3 (sqlite3 v5) |
| 打印引擎 | pdf-to-printer (Windows), unix-print (Linux/macOS), ipp (网络打印机) |
| 图片处理 | jimp 图片合成 |
| 工具库 | dayjs, uuid(v7), lodash, electron-store, electron-log |

## 核心依赖

**dependencies（生产依赖）:**
- `socket.io` / `socket.io-client` — 本地 Socket.IO 服务端与中转客户端
- `pdf-to-printer` / `unix-print` — PDF 文件打印（win32 / unix 平台）
- `win32-pdf-printer` — Windows 打印机纸张信息获取
- `ipp` — IPP 协议打印机交互
- `sqlite3` — 打印日志持久化
- `electron-store` — 配置持久化
- `bwip-js` / `jsbarcode` — 条码生成（渲染窗口）
- `jimp` — 图片合成（HTML 截图拼接）
- `jquery` / `dayjs` / `uuid` / `nzh` / `address` / `node-machine-id` — 通用工具
- `concurrent-tasks` — 串行打印任务队列
- `electron-log` — 日志记录

**devDependencies（开发依赖）:**
- `electron` — Electron 运行时
- `electron-builder` — 应用打包
- `prettier` / `uglify-js` — 代码格式化与压缩
- `fs-extra` — 文件操作增强

## 项目目录结构

```
electron-hiprint/
├── main.js                    # 主进程入口，窗口管理、托盘、服务初始化
├── start.js                   # 开发启动脚本（wrapper）
├── package.json               # 项目配置与依赖
├── CLAUDE.md                  # 本文件
├── build-info.json            # 构建时生成的 git commit 信息
│
├── src/                       # 主进程业务代码
│   ├── print.js               # 打印窗口：管理打印任务执行（HTML/PDF/blob_pdf）
│   ├── render.js              # 渲染窗口：截图、PDF生成、JSON打印
│   ├── pdf-print.js           # PDF 文件打印封装（win32/unix）
│   ├── set.js                 # 设置窗口管理
│   ├── printLog.js            # 打印日志窗口管理
│   └── helper.js              # 应用退出辅助
│
├── tools/                     # 工具模块
│   ├── utils.js               # 核心工具库（store、socket 事件、IPP、地址信息、打印状态）
│   ├── database.js            # SQLite 数据库初始化（print_logs 表）
│   ├── database.sqlite        # SQLite 数据库文件（被 gitignore）
│   ├── code_compress.js       # 源码压缩工具（发布前混淆）
│   └── rename.js              # 构建产物重命名工具
│
├── assets/                    # 渲染进程静态资源
│   ├── index.html             # 主窗口页面（Vue + Element UI）
│   ├── loading.html           # 加载等待页面（动画）
│   ├── print.html             # 打印窗口页面（jQuery 加载 hiprint 插件）
│   ├── render.html            # 渲染窗口页面（加载 vue-plugin-hiprint）
│   ├── set.html               # 设置窗口页面（Vue + Element UI）
│   ├── printLog.html          # 打印日志页面（Vue + Element UI + el-table）
│   ├── css/
│   │   ├── style.css          # 主窗口样式
│   │   └── print-lock.css     # hiprint 打印样式
│   ├── js/                    # CDN 前端库
│   │   ├── vue.min.js
│   │   ├── dayjs.min.js
│   │   └── lodash.min.js
│   ├── element-ui/            # Element UI（JS+CSS+字体）
│   └── icons/                 # 托盘图标
│
├── plugin/                    # vue-plugin-hiprint 插件缓存
│   ├── 0.0.52_vue-plugin-hiprint.js
│   ├── 0.0.52_print-lock.css
│   ├── ...
│   └── 0.0.60_print-lock.css  # 默认版本 0.0.60
│
├── build/                     # 构建脚本与图标
│   ├── write-build-info.js    # 写入 git commit 信息到 build-info.json
│   ├── fixSqlite3bug.js       # SQLite3 预构建二进制修复
│   └── icons/                 # 应用图标（ico/png/icns）
│
├── installer.nsh              # NSIS 安装程序自定义脚本
└── .github/workflows/release.yml  # CI/CD 自动构建发布
```

## 架构与通信模式

### 进程架构

```
┌─────────────────────────────────────────────────────┐
│                   Main Process                       │
│  main.js (入口)                                      │
│  ├─ 主窗口 (500×300)  ─── index.html                 │
│  ├─ 打印窗口 (隐藏)    ─── print.html                 │
│  ├─ 渲染窗口 (隐藏)    ─── render.html                │
│  ├─ 设置窗口 (440×591) ─── set.html                   │
│  ├─ 日志窗口 (1080×600) ── printLog.html              │
│  ├─ 系统托盘                                            │
│  └─ Socket.IO 服务端 (:17521)                         │
└─────────────────────────────────────────────────────┘
```

### 通信流程

```
本地模式:
  Web App ──Socket.IO──▶ Socket.IO 服务端 ──IPC──▶ 打印/渲染窗口 ──▶ 系统打印机

中转（中继）模式:
  Web App ──Socket.IO──▶ 中转服务 ──Socket.IO──▶ Socket.IO 客户端 ──IPC──▶ 打印窗口 ──▶ 系统打印机
```

- **主进程**使用 `global` 变量共享窗口引用和服务实例
- **渲染进程**使用 `contextIsolation: false` + `nodeIntegration: true`，直连 Electron IPC
- **打印队列**使用 `concurrent-tasks` 库串行执行（并发度 1），避免打印冲突
- **分批打印**通过 `PRINT_FRAGMENTS_MAPPING` 收集 HTML 片段，拼接后统一打印

## 网络架构

- 本地服务：Socket.IO Server 监听配置端口（默认 17521），接收局域网 Web 连接
- 中转服务：可选连接 `node-hiprint-transit` 中转代理，实现跨网络云打印
- 连接认证：支持 TOKEN 验证（`server.use` middleware）
- 跨域配置：允许所有来源连接（CORS origin 动态回调）

## 窗口布局

所有窗口通过 `BrowserWindow` 手动创建，不使用 `BrowserWindow.loadURL` 加载远程页面，均加载本地 `assets/` 下的 HTML 文件。

| 窗口 | 尺寸 | 可见性 | 用途 |
|------|------|--------|------|
| 主窗口 | 500×300 | 用户可见 | 显示服务状态、地址信息 |
| 打印窗口 | 100×100 | 隐藏 | 执行 HTML 打印任务 |
| 渲染窗口 | 300×500 | 隐藏 | 截图/PDF生成/JSON打印 |
| 设置窗口 | 440×591 | 用户打开 | 系统配置 |
| 日志窗口 | 1080×600 | 用户打开 | 打印记录查看 |

窗口通用配置：`contextIsolation: false`, `nodeIntegration: true`

## 主题样式

- 主窗口：Element UI 主题色（`#409EFF` 蓝、`#67C23A` 绿、`#E6A23C` 橙），背景圆形过渡动画
- 设置页面：Element UI 表单风格，标签居上布局
- 打印页面：无 UI（纯功能窗口），加载 hiprint 插件渲染文档
- 主窗口样式规范：CSS 变量定义主题色 `--primary` `--success` `--warning`，滚动条自定义为深蓝窄条

## 打印支持类型

| 类型 | 说明 | 实现方式 |
|------|------|----------|
| `html`（默认） | 直接打印 HTML 内容 | `webContents.print()` 调用系统打印 |
| `pdf` | 先打印为 PDF，再发送到打印机 | `printToPDF()` + `pdf-to-printer`/`unix-print` |
| `url_pdf` | 下载远程 PDF 后打印 | http/https下载 + pdf打印 |
| `blob_pdf` | 接收二进制 PDF 数据直接打印 | Buffer/Uint8Array 写入文件 + pdf打印 |

## 构建流程

### 环境要求
- Node.js 18.x
- 使用 `npm` 包管理器
- 配置了 npmmirror 镜像（Electron 下载加速）

### 脚本命令

```bash
npm start              # 开发启动（写入 git 信息后启动 Electron）
npm run build-w        # 构建 Windows 32位 NSIS 安装包
npm run build-w-64     # 构建 Windows 64位 NSIS 安装包
npm run build-m        # 构建 macOS x64 DMG
npm run build-m-arm64  # 构建 macOS ARM64 DMG
npm run build-m-universal # 构建 macOS Universal DMG
npm run build-l        # 构建 Linux x64 (tar.xz + deb)
npm run build-l-arm64  # 构建 Linux ARM64 (tar.xz + deb)
npm run compress       # UglifyJS 混淆 src/ 目录代码（发布前）
npm run restore        # 从备份恢复原始代码
npm run releases       # 完整发布流程：compress → build-all → restore
```

### 打包配置（electron-builder）

- **productName**: hiprint
- **appId**: com.simple.cc.hiprint
- **输出目录**: `out/`
- **asar**: true（源码打包）
- **资源外置**: `plugin/*` 目录（hiprint 插件独立部署）
- **Windows**: NSIS 安装器（支持自定义安装目录、桌面快捷方式、URL 协议注册）
- **macOS**: DMG（无签名，`identity: null`）
- **Linux**: tar.xz + deb
- **自定义 NSIS**: 注册 `hiprint://` URL Protocol，支持在安装/卸载时清理缓存

### CI/CD (GitHub Actions)

- 触发条件：推送符合 `X.Y.Z` 或 `X.Y.Z-betaN` 格式的 git tag
- 流程：校验版本号 → 矩阵构建（7 个平台架构）→ 汇总发布 Release（draft）
- node-version: 18

## 开发规范

### 编码风格
- **CommonJS** 模块（`require/module.exports`）
- 使用 Prettier 格式化（配置见 `.prettierrc.json`）
- JavaScript 严格模式 `"use strict"`（大部分文件）
- 函数使用 JSDoc 风格注释（`@description`, `@param`, `@return`）
- 全局变量大写命名（`MAIN_WINDOW`, `PRINT_RUNNER` 等）
- 文件名小写 + 连字符（kebab-case）

### 代码约定
- 主进程使用 `global` 对象挂载跨模块共享的状态
- IPC 通道名使用小写驼峰（`openSetting`, `capturePage`, `printToPDF`）
- Socket.IO 事件名使用小写（`news`, `render-print`, `render-jpeg`）
- 错误处理使用 Promise `.catch()` 和 `try/catch`
- 控制台日志统一使用 `console.log` + 中文描述（已重定向到 electron-log 文件）
- 日志文件路径: `<logPath>/YYYY-MM-DD.log`

### 项目特色
- 无单元测试
- 无 TypeScript
- 无前端构建工具链（Vue/Element UI 直接从 CDN 加载至 `assets/`）
- 前端渲染页面的 Vue 2 代码直接内嵌在 HTML `<script>` 标签中
- hiprint 渲染插件（`vue-plugin-hiprint`）动态加载，支持多版本切换
- 打印窗口和渲染窗口首次使用时懒创建（`printSetup()` / `renderSetup()`）

### 数据库

使用 SQLite3 存储打印日志（`tools/database.sqlite`），表结构：

```sql
CREATE TABLE print_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  socketId TEXT,
  clientType TEXT,
  printer TEXT,
  templateId TEXT,
  data TEXT,
  pageNum INTEGER,
  status TEXT,          -- 'success' | 'failed'
  errorMessage TEXT,
  rePrintAble INTEGER DEFAULT 1
);
```
