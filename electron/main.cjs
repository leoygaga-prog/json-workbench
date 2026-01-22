const { app, BrowserWindow } = require("electron");
const path = require("path");

// 判断是否为开发模式
const isDev = process.env.NODE_ENV === "development";

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    title: "JSON Workbench",
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      // 允许在渲染进程中使用 Web Workers
      nodeIntegrationInWorker: true,
      // CodeMirror 不需要禁用 webSecurity
    },
    // 窗口样式
    backgroundColor: "#f8fafc",
    show: false, // 先隐藏，加载完成后显示
  });

  // 加载应用
  if (isDev) {
    // 开发模式：加载本地开发服务器
    mainWindow.loadURL("http://localhost:5173");
    // 开发模式下不自动打开开发者工具（可按 F12 手动打开）
  } else {
    // 生产模式：加载打包后的文件
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }

  // 窗口准备好后显示
  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  // 处理窗口关闭
  mainWindow.on("closed", () => {
    // 在 macOS 上，除非用户用 Cmd + Q 确定地退出
    // 否则绑定应用及其菜单栏到 dock 图标是常见的做法
  });
}

// Electron 初始化完成后创建窗口
app.whenReady().then(() => {
  createWindow();

  // macOS 特殊处理：点击 dock 图标时重新创建窗口
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// 所有窗口关闭时退出应用（Windows & Linux）
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

// 安全性：阻止新窗口创建
app.on("web-contents-created", (event, contents) => {
  contents.setWindowOpenHandler(() => {
    return { action: "deny" };
  });
});
