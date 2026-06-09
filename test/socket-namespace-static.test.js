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

console.log("socket namespace static checks passed");
