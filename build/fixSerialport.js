"use strict";

/**
 * 使用 @electron/rebuild 重建 serialport 原生模块以适配 Electron 的 Node.js ABI 版本
 * 在开发环境中（npm install 后）执行，确保原生模块能正确加载
 */
const path = require("path");
const fs = require("fs");
const { execSync } = require("child_process");

// 仅在非 Electron 运行时执行重建（Electron 运行时说明已在打包环境中处理）
if (process.versions && process.versions.electron) {
  console.log("[fixSerialport] 已在 Electron 环境中运行，跳过重建");
  process.exit(0);
}

const serialportBindingsPath = path.join(
  process.cwd(),
  "node_modules",
  "@serialport",
  "bindings",
  "build",
  "Release",
  "bindings.node",
);

// 如果 .node 文件不存在（如安装失败），直接跳过
if (!fs.existsSync(serialportBindingsPath)) {
  console.log("[fixSerialport] @serialport/bindings 未安装，跳过重建");
  process.exit(0);
}

// 读取 Electron 版本
const electronPkgPath = path.join(process.cwd(), "node_modules", "electron", "package.json");
if (!fs.existsSync(electronPkgPath)) {
  console.log("[fixSerialport] Electron 未安装，跳过重建");
  process.exit(0);
}

const electronPkg = require(electronPkgPath);
const electronVersion = electronPkg.version;

console.log(`[fixSerialport] 开始重建 @serialport/bindings 适配 Electron ${electronVersion}...`);

try {
  execSync(`npx @electron/rebuild -f -w @serialport/bindings`, {
    cwd: process.cwd(),
    stdio: "inherit",
    env: {
      ...process.env,
      npm_config_build_from_source: "true",
    },
    timeout: 120000,
  });
  console.log("[fixSerialport] @serialport/bindings 重建成功");
} catch (err) {
  console.error(`[fixSerialport] @serialport/bindings 重建失败: ${err.message}`);
  console.error("串口功能将不可用，但不影响其他功能");
  process.exit(0); // 不阻止安装流程
}
