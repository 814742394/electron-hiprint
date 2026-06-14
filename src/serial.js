"use strict";

let serialPort = null;
let _closing = false; // 防止并发关闭串口
let serialLatestQueue = [];
let serialLatestTimer = null;

// 惰性加载 serialport，模块不可用时不会导致应用崩溃
let _SerialPort = null;

function getSerialPort() {
  if (!_SerialPort) {
    _SerialPort = require("serialport");
  }
  return _SerialPort;
}

/**
 * 检查 serialport 模块是否可用
 */
function isSerialModuleAvailable() {
  try {
    getSerialPort();
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * 获取当前串口连接状态
 */
function getSerialStatus() {
  return serialPort && serialPort.isOpen;
}

/**
 * 向所有 Socket.IO 客户端广播串口状态
 */
function broadcastSerialStatus() {
  const status = getSerialStatus();
  const sockets = global.SERIAL_NAMESPACE?.sockets;
  if (sockets) {
    for (const [, socket] of sockets) {
      socket.emit("serial-status", { connected: status });
    }
  }
  if (global.SERIAL_SOCKET_CLIENT?.connected) {
    global.SERIAL_SOCKET_CLIENT.emit("serial-status", { connected: status });
  }
  global.MAIN_WINDOW?.webContents.send("serial-status", status);
}

/**
 * 向所有 Socket.IO 客户端广播串口数据
 */
function broadcastSerialData(data) {
  const payload = { data, timestamp: Date.now() };
  const sockets = global.SERIAL_NAMESPACE?.sockets;
  if (sockets) {
    for (const [, socket] of sockets) {
      socket.emit("serial-data", payload);
    }
  }
  if (global.SERIAL_SOCKET_CLIENT?.connected) {
    global.SERIAL_SOCKET_CLIENT.emit("serial-data", payload);
  }
}

function logSerialData(text) {
  if (store.get("serialDataLogEnabled")) {
    console.log(`==> 串口数据: ${text}`);
  }
}

function flushLatestSerialData() {
  if (!serialLatestQueue.length) return;

  const list = serialLatestQueue;
  serialLatestQueue = [];
  list.forEach((data) => {
    logSerialData(data);
    broadcastSerialData(data);
  });
}

function clearLatestSerialForwarder() {
  if (serialLatestTimer) {
    clearInterval(serialLatestTimer);
    serialLatestTimer = null;
  }
  serialLatestQueue = [];
}

function appendLatestSerialData(data, chunkCount) {
  serialLatestQueue.push(data);
  if (serialLatestQueue.length > chunkCount) {
    serialLatestQueue = serialLatestQueue.slice(-chunkCount);
  }
}

/**
 * 向所有 Socket.IO 客户端广播串口错误
 */
function broadcastSerialError(message) {
  const sockets = global.SERIAL_NAMESPACE?.sockets;
  if (sockets) {
    for (const [, socket] of sockets) {
      socket.emit("serial-error", { message, timestamp: Date.now() });
    }
  }
  if (global.SERIAL_SOCKET_CLIENT?.connected) {
    global.SERIAL_SOCKET_CLIENT.emit("serial-error", { message, timestamp: Date.now() });
  }
}

/**
 * 打开串口连接
 */
async function openSerial(config) {
  if (!isSerialModuleAvailable()) {
    throw new Error("serialport 模块不可用");
  }

  await closeSerial();
  clearLatestSerialForwarder();

  const SerialPort = getSerialPort();

  const portPath = config.serialPort || store.get("serialPort");
  const outputMode = config.serialOutputMode || store.get("serialOutputMode") || "text";
  const serialForwardMode =
    config.serialForwardMode || store.get("serialForwardMode") || "realtime";
  const serialLatestChunkCount =
    parseInt(config.serialLatestChunkCount, 10) ||
    store.get("serialLatestChunkCount") ||
    3;
  const serialLatestFlushInterval =
    parseInt(config.serialLatestFlushInterval, 10) ||
    store.get("serialLatestFlushInterval") ||
    50;
  const options = {
    baudRate: parseInt(config.serialBaudRate, 10) || store.get("serialBaudRate") || 9600,
    dataBits: parseInt(config.serialDataBits, 10) || store.get("serialDataBits") || 8,
    stopBits: parseFloat(config.serialStopBits) || store.get("serialStopBits") || 1,
    parity: config.serialParity || store.get("serialParity") || "none",
    autoOpen: true,
  };

  console.log(`==> 串口配置:`, { portPath, ...options });

  return new Promise((resolve, reject) => {
    serialPort = new SerialPort(portPath, options);

    serialPort.on("open", () => {
      console.log(`==> 串口已打开: ${portPath} @ ${options.baudRate}bps`);
      if (serialForwardMode === "latest") {
        serialLatestTimer = setInterval(
          flushLatestSerialData,
          serialLatestFlushInterval,
        );
      }

      serialPort.on("data", (chunk) => {
        const text = outputMode === "hex" ? chunk.toString("hex") : chunk.toString();
        if (serialForwardMode === "latest") {
          appendLatestSerialData(text, serialLatestChunkCount);
          return;
        }
        logSerialData(text);
        broadcastSerialData(text);
      });

      // 进入流动模式后 data 事件才会触发
      serialPort.resume();

      serialPort.on("error", (err) => {
        console.error(`==> 串口错误: ${err.message}`);
        clearLatestSerialForwarder();
        broadcastSerialError(err.message);
      });

      serialPort.on("close", () => {
        console.log("==> 串口已关闭");
        clearLatestSerialForwarder();
        broadcastSerialStatus();
      });

      broadcastSerialStatus();
      resolve();
    });

    serialPort.on("error", (err) => {
      console.error(`==> 串口打开失败: ${err.message}`);
      clearLatestSerialForwarder();
      serialPort = null;
      broadcastSerialStatus();
      reject(err);
    });
  });
}

/**
 * 关闭串口连接
 */
async function closeSerial() {
  if (_closing) {
    console.log("==> 串口正在关闭中，跳过重复关闭");
    return Promise.resolve();
  }
  if (serialPort && serialPort.isOpen) {
    _closing = true;
    return new Promise((resolve) => {
      // Windows 串口驱动有时会导致 close() 回调不触发，设置超时强制关闭
      const timer = setTimeout(() => {
        console.warn("==> 串口关闭超时，强制清理");
        _closing = false;
        clearLatestSerialForwarder();
        serialPort = null;
        global.SERIAL_OWNER_SOCKET_ID = null;
        broadcastSerialStatus();
        resolve();
      }, 3000);

      serialPort.close((err) => {
        clearTimeout(timer);
        if (err) {
          console.warn(`==> 串口关闭出错: ${err.message}`);
        }
        console.log("==> 串口已关闭");
        _closing = false;
        clearLatestSerialForwarder();
        serialPort = null;
        global.SERIAL_OWNER_SOCKET_ID = null;
        broadcastSerialStatus();
        resolve();
      });
    });
  }
  _closing = false;
  clearLatestSerialForwarder();
  serialPort = null;
  global.SERIAL_OWNER_SOCKET_ID = null;
  return Promise.resolve();
}

/**
 * 根据 store 配置自动初始化串口
 */
async function initSerial() {
  if (!isSerialModuleAvailable()) {
    console.log("==> serialport 模块不可用，串口功能已禁用");
    return;
  }

  await closeSerial();

  if (!store.get("serialEnabled")) {
    return;
  }

  const port = store.get("serialPort");
  if (!port) {
    console.log("==> 串口已启用但未选择端口");
    return;
  }

  try {
    await openSerial(store.store);
  } catch (err) {
    console.error(`==> 串口自动连接失败: ${err.message}`);
  }
}

// ---- IPC 处理函数 ----

async function handleSerialList(event) {
  try {
    const ports = await listSerialPorts();
    event.sender.send("serial-list", ports);
    return ports;
  } catch (err) {
    console.error(`==> 获取串口列表失败: ${err.message}`);
    event.sender.send("serial-list", []);
    return [];
  }
}

async function handleSerialOpen(event, config) {
  try {
    await openSerial(config);
    event.sender.send("serial-open-result", {
      success: true,
      message: "串口打开成功",
    });
  } catch (err) {
    event.sender.send("serial-open-result", {
      success: false,
      message: `串口打开失败: ${err.message}`,
    });
  }
}

async function handleSerialClose() {
  await closeSerial();
}

// ---- IPC 事件注册/移除 ----

function initSerialEvent() {
  try {
    // 注册串口列表获取（不依赖 serialport 模块）
    ipcMain.on("serial-list", handleSerialList);
    ipcMain.on("serial-open", handleSerialOpen);
    ipcMain.on("serial-close", handleSerialClose);
  } catch (err) {
    console.error("==> 串口 IPC 注册失败:", err.message);
  }
}

function removeSerialEvent() {
  try {
    ipcMain.removeListener("serial-list", handleSerialList);
    ipcMain.removeListener("serial-open", handleSerialOpen);
    ipcMain.removeListener("serial-close", handleSerialClose);
  } catch (err) {
    // 忽略移除错误
  }
}

const { app, ipcMain } = require("electron");
const { store, listSerialPorts } = require("../tools/utils");

module.exports = {
  initSerial,
  openSerial,
  closeSerial,
  getSerialStatus,
  initSerialEvent,
  removeSerialEvent,
  isSerialModuleAvailable,
};
