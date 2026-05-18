"use strict";

const SerialPort = require("serialport");
const ReadlineParser = require("@serialport/parser-readline");
const { app, ipcMain } = require("electron");
const { store } = require("../tools/utils");

let serialPort = null;
let parser = null;

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
  const sockets = global.SOCKET_SERVER?.sockets?.sockets;
  if (sockets) {
    for (const [, socket] of sockets) {
      socket.emit("serial-status", { connected: status });
    }
  }
  if (global.SOCKET_CLIENT?.connected) {
    global.SOCKET_CLIENT.emit("serial-status", { connected: status });
  }
  // 通知主窗口
  global.MAIN_WINDOW?.webContents.send("serial-status", status);
}

/**
 * 向所有 Socket.IO 客户端广播串口数据
 */
function broadcastSerialData(data) {
  const payload = { data, timestamp: Date.now() };
  const sockets = global.SOCKET_SERVER?.sockets?.sockets;
  if (sockets) {
    for (const [, socket] of sockets) {
      socket.emit("serial-data", payload);
    }
  }
  if (global.SOCKET_CLIENT?.connected) {
    global.SOCKET_CLIENT.emit("serial-data", payload);
  }
}

/**
 * 向所有 Socket.IO 客户端广播串口错误
 */
function broadcastSerialError(message) {
  const sockets = global.SOCKET_SERVER?.sockets?.sockets;
  if (sockets) {
    for (const [, socket] of sockets) {
      socket.emit("serial-error", { message, timestamp: Date.now() });
    }
  }
  if (global.SOCKET_CLIENT?.connected) {
    global.SOCKET_CLIENT.emit("serial-error", { message, timestamp: Date.now() });
  }
}

/**
 * 打开串口连接
 */
async function openSerial(config) {
  // 先关闭已有连接
  await closeSerial();

  const options = {
    path: config.serialPort,
    baudRate: parseInt(config.serialBaudRate, 10) || 9600,
    dataBits: parseInt(config.serialDataBits, 10) || 8,
    stopBits: parseFloat(config.serialStopBits) || 1,
    parity: config.serialParity || "none",
    autoOpen: true,
  };

  return new Promise((resolve, reject) => {
    serialPort = new SerialPort(options);

    serialPort.on("open", () => {
      console.log(`==> 串口已打开: ${options.path} @ ${options.baudRate}bps`);

      // 按行解析
      parser = serialPort.pipe(
        new ReadlineParser({ delimiter: "\n" }),
      );

      parser.on("data", (line) => {
        line = line.trim();
        if (line) {
          console.log(`==> 串口数据: ${line}`);
          broadcastSerialData(line);
        }
      });

      serialPort.on("error", (err) => {
        console.error(`==> 串口错误: ${err.message}`);
        broadcastSerialError(err.message);
      });

      serialPort.on("close", () => {
        console.log("==> 串口已关闭");
        broadcastSerialStatus();
      });

      broadcastSerialStatus();
      resolve();
    });

    serialPort.on("error", (err) => {
      console.error(`==> 串口打开失败: ${err.message}`);
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
  if (serialPort && serialPort.isOpen) {
    return new Promise((resolve) => {
      serialPort.close(() => {
        serialPort = null;
        parser = null;
        broadcastSerialStatus();
        resolve();
      });
    });
  }
  serialPort = null;
  parser = null;
  return Promise.resolve();
}

/**
 * 根据 store 配置自动初始化串口
 */
async function initSerial() {
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

/**
 * 获取可用串口列表
 */
async function handleSerialList(event) {
  try {
    const ports = await SerialPort.list();
    event.sender.send("serial-list", ports.map((p) => p.path));
    return ports.map((p) => p.path);
  } catch (err) {
    console.error(`==> 获取串口列表失败: ${err.message}`);
    event.sender.send("serial-list", []);
    return [];
  }
}

/**
 * 打开串口（测试用）
 */
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

/**
 * 关闭串口
 */
async function handleSerialClose() {
  await closeSerial();
}

// ---- IPC 事件注册/移除 ----

function initSerialEvent() {
  ipcMain.on("serial-list", handleSerialList);
  ipcMain.on("serial-open", handleSerialOpen);
  ipcMain.on("serial-close", handleSerialClose);
}

function removeSerialEvent() {
  ipcMain.removeListener("serial-list", handleSerialList);
  ipcMain.removeListener("serial-open", handleSerialOpen);
  ipcMain.removeListener("serial-close", handleSerialClose);
}

module.exports = {
  initSerial,
  openSerial,
  closeSerial,
  getSerialStatus,
  initSerialEvent,
  removeSerialEvent,
};
