"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const main = read("main.js");
const utils = read("tools/utils.js");
const serial = read("src/serial.js");
const readme = read("README.md");
const setHtml = read("assets/set.html");

assert(
  main.includes('.of("/hiprint")'),
  "main.js should create the /hiprint namespace",
);
assert(
  main.includes('.of("/serial")'),
  "main.js should create the /serial namespace",
);
assert(
  main.includes("initDefaultSocketEvent"),
  "main.js should bind an explicit default namespace handler",
);
assert(
  utils.includes("function initSerialSocketEvent"),
  "tools/utils.js should expose serial socket event binding",
);
assert(
  !/插件端 Disconnect[\s\S]{0,240}closeSerial/.test(utils),
  "hiprint socket disconnect should not close the serial port",
);
assert(
  !serial.includes("global.SOCKET_SERVER?.sockets?.sockets"),
  "serial broadcasts should not target the default Socket.IO namespace",
);
assert(
  serial.includes("global.SERIAL_NAMESPACE?.sockets"),
  "serial broadcasts should target the serial namespace",
);
assert(
  utils.includes("global.SERIAL_OWNER_SOCKET_ID"),
  "serial namespace should track the owning socket id",
);
assert(
  utils.includes("当前已有串口 owner，不能重复打开串口"),
  "serial-start should reject non-owner attempts while serial is connected",
);
assert(
  main.includes("global.HIPRINT_SOCKET_CLIENT"),
  "transit printing should use a dedicated hiprint client",
);
assert(
  main.includes("global.SERIAL_SOCKET_CLIENT"),
  "transit serial should use a dedicated serial client",
);
assert(
  readme.includes("http://localhost:17521/hiprint"),
  "README should document /hiprint",
);
assert(
  readme.includes("http://localhost:17521/serial"),
  "README should document /serial",
);
assert(
  /serialDataLogEnabled:\s*\{[\s\S]*?default:\s*true/.test(utils),
  "tools/utils.js should define serialDataLogEnabled with default true",
);
assert(
  setHtml.includes("serialDataLogEnabled") &&
    setHtml.includes("记录串口数据日志"),
  "settings page should expose serial data log switch",
);
assert(
  serial.includes('store.get("serialDataLogEnabled")') &&
    /if\s*\(\s*store\.get\("serialDataLogEnabled"\)\s*\)\s*\{[\s\S]*?console\.log\(`==> 串口数据: \$\{text\}`\);[\s\S]*?\}/.test(serial),
  "serial data console.log should be controlled by serialDataLogEnabled",
);
assert(
  /serialOutputMode:\s*\{[\s\S]*?default:\s*"text"/.test(utils),
  "tools/utils.js should define serialOutputMode with default text",
);
assert(
  setHtml.includes("serialOutputMode") &&
    setHtml.includes("输出模式") &&
    setHtml.includes("HEX"),
  "settings page should expose serial output mode selector",
);
assert(
  serial.includes('store.get("serialOutputMode")') &&
    /chunk\.toString\(\s*"hex"\s*\)/.test(serial),
  "serial data should support hex output mode",
);
assert(
  readme.includes("serialOutputMode") && readme.includes('"hex"'),
  "README should document serialOutputMode",
);
assert(
  /serialForwardMode:\s*\{[\s\S]*?default:\s*"realtime"/.test(utils),
  "tools/utils.js should define serialForwardMode with default realtime",
);
assert(
  /serialLatestChunkCount:\s*\{[\s\S]*?default:\s*3/.test(utils),
  "tools/utils.js should define serialLatestChunkCount with default 3",
);
assert(
  /serialLatestFlushInterval:\s*\{[\s\S]*?default:\s*50/.test(utils),
  "tools/utils.js should define serialLatestFlushInterval with default 50",
);
assert(
  setHtml.includes("serialForwardMode") &&
    setHtml.includes("串口转发模式") &&
    setHtml.includes("最新数据模式") &&
    setHtml.includes("完整帧模式"),
  "settings page should expose serial forward mode selector",
);
assert(
  setHtml.includes("serialLatestChunkCount") &&
    setHtml.includes("保留最新 chunk 数") &&
    setHtml.includes("serialLatestFlushInterval") &&
    setHtml.includes("转发间隔(ms)"),
  "settings page should expose latest forwarding parameters",
);
assert(
  serial.includes('serialForwardMode === "latest"') &&
    serial.includes("serialLatestQueue") &&
    serial.includes("flushLatestSerialData") &&
    serial.includes("clearLatestSerialForwarder"),
  "serial data should support latest queue forwarding mode",
);
assert(
  serial.includes('serialForwardMode === "frame"') &&
    serial.includes("createHexFrameForwarder") &&
    serial.includes("hexFrameForwarder"),
  "serial data should support hex frame forwarding mode",
);
assert(
  readme.includes("serialForwardMode") &&
    readme.includes('"frame"') &&
    readme.includes("serialLatestChunkCount") &&
    readme.includes("serialLatestFlushInterval"),
  "README should document serial forwarding options",
);

console.log("socket namespace static checks passed");
