"use strict";

const { app, BrowserWindow, shell, dialog, Menu } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const net = require("net");

/**
 * Desktop shell for Content Engine.
 *
 * The app is a Next.js server plus a window pointed at it. Electron starts the
 * server as a child process rather than embedding it, so a server crash can be
 * reported in the window instead of taking the whole app down with it.
 *
 * Three things have to be corrected for a packaged build, and all of them are
 * done here before the server starts:
 *
 *   1. Storage. `process.cwd()` for a packaged app is not the app folder, and
 *      the install directory is read-only for a normal user. Data and media
 *      move to the user's profile via CONTENT_ENGINE_DATA_DIR / _MEDIA_DIR.
 *   2. ffmpeg. There is no system ffmpeg on a colleague's machine, so the
 *      binaries ship with the app and FFMPEG_PATH points at them.
 *   3. Configuration. API keys are read from a file next to the app, never
 *      compiled into the JavaScript.
 */

const isDev = !app.isPackaged;
const RESOURCES = isDev ? path.join(__dirname, "..") : process.resourcesPath;

let serverProcess = null;
let mainWindow = null;
let serverPort = 0;

/* ------------------------------ configuration ----------------------------- */

/**
 * Read `KEY=value` lines into the environment.
 *
 * Two sources, in order of precedence: a file the user can edit next to their
 * own data (so an install can be re-keyed without a new installer), then the
 * one bundled at build time. Neither is required — the app runs without keys,
 * it just can't reach the paid services.
 */
function loadEnvFile(file, env) {
  if (!fs.existsSync(file)) return false;
  for (const line of fs.readFileSync(file, "utf-8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    // First writer wins, so the user's own file overrides the bundled one.
    if (key && env[key] === undefined) env[key] = value;
  }
  return true;
}

function buildEnvironment() {
  const userData = app.getPath("userData");
  const env = { ...process.env };

  // The user's override file takes precedence, so it is read first.
  loadEnvFile(path.join(userData, "settings.env"), env);
  loadEnvFile(path.join(RESOURCES, "app.env"), env);

  env.CONTENT_ENGINE_DATA_DIR = path.join(userData, "data");
  env.CONTENT_ENGINE_MEDIA_DIR = path.join(userData, "media");
  fs.mkdirSync(env.CONTENT_ENGINE_DATA_DIR, { recursive: true });
  fs.mkdirSync(env.CONTENT_ENGINE_MEDIA_DIR, { recursive: true });

  const ffmpeg = path.join(RESOURCES, "bin", process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg");
  if (fs.existsSync(ffmpeg)) env.FFMPEG_PATH = ffmpeg;

  env.NODE_ENV = "production";
  env.HOSTNAME = "127.0.0.1";
  return env;
}

/* -------------------------------- the server ------------------------------ */

/** Ask the OS for a free port rather than guessing one that may be taken. */
function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function waitForServer(port, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const reachable = await new Promise((resolve) => {
      const socket = net.connect(port, "127.0.0.1");
      socket.on("connect", () => socket.end(resolve.bind(null, true)));
      socket.on("error", () => resolve(false));
      socket.setTimeout(1000, () => socket.destroy(resolve.bind(null, false)));
    });
    if (reachable) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

async function startServer() {
  serverPort = await findFreePort();
  const env = buildEnvironment();
  env.PORT = String(serverPort);

  const serverEntry = path.join(RESOURCES, "app-server", "server.js");
  if (!fs.existsSync(serverEntry)) {
    throw new Error(
      `The application server is missing (${serverEntry}). The install looks incomplete — reinstall the app.`,
    );
  }

  serverProcess = spawn(process.execPath, [serverEntry], {
    cwd: path.join(RESOURCES, "app-server"),
    // Electron ships Node inside itself; this flag runs it as a plain Node
    // process, so the app doesn't need a separate Node runtime bundled.
    env: { ...env, ELECTRON_RUN_AS_NODE: "1" },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  let stderr = "";
  serverProcess.stderr.on("data", (chunk) => {
    stderr = (stderr + chunk.toString()).slice(-4000);
    process.stderr.write(chunk);
  });
  serverProcess.stdout.on("data", (chunk) => process.stdout.write(chunk));

  serverProcess.on("exit", (code) => {
    if (code !== 0 && !app.isQuitting) {
      dialog.showErrorBox(
        "Content Engine stopped",
        `The application server exited unexpectedly (code ${code}).\n\n${stderr.split("\n").slice(-8).join("\n")}`,
      );
      app.quit();
    }
  });

  if (!(await waitForServer(serverPort))) {
    throw new Error(`The application server did not start within 60 seconds.\n\n${stderr.slice(-800)}`);
  }
}

/* -------------------------------- the window ------------------------------ */

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 960,
    minHeight: 640,
    show: false,
    backgroundColor: "#0b0b0c",
    title: "Content Engine",
    webPreferences: {
      // Nothing in the page needs Node, and the page renders model-generated
      // text — keeping the renderer sandboxed means a prompt-injected string
      // can never reach the filesystem.
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.once("ready-to-show", () => mainWindow.show());
  mainWindow.loadURL(`http://127.0.0.1:${serverPort}`);

  // External links open in the real browser; the app window stays on the app.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(`http://127.0.0.1:${serverPort}`)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });
}

function buildMenu() {
  const userData = app.getPath("userData");
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: "File",
        submenu: [
          {
            label: "Open data folder",
            click: () => shell.openPath(userData),
          },
          {
            label: "Edit API keys (settings.env)",
            click: async () => {
              const file = path.join(userData, "settings.env");
              if (!fs.existsSync(file)) {
                fs.writeFileSync(
                  file,
                  [
                    "# Content Engine — per-install overrides.",
                    "# Anything set here wins over the keys shipped with the app.",
                    "# Restart Content Engine after editing.",
                    "",
                    "# ANTHROPIC_API_KEY=",
                    "# GEMINI_API_KEY=",
                    "# OPENAI_API_KEY=",
                    "# TAVILY_API_KEY=",
                    "",
                  ].join("\n"),
                  "utf-8",
                );
              }
              shell.openPath(file);
            },
          },
          { type: "separator" },
          { role: "quit" },
        ],
      },
      {
        label: "View",
        submenu: [
          { role: "reload" },
          { role: "toggleDevTools" },
          { type: "separator" },
          { role: "resetZoom" },
          { role: "zoomIn" },
          { role: "zoomOut" },
          { type: "separator" },
          { role: "togglefullscreen" },
        ],
      },
    ]),
  );
}

/* --------------------------------- lifecycle ------------------------------ */

// A second launch focuses the running window instead of starting a second
// server against the same data directory.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    try {
      buildMenu();
      await startServer();
      createWindow();
    } catch (error) {
      dialog.showErrorBox("Content Engine could not start", String(error.message || error));
      app.quit();
    }
  });

  app.on("window-all-closed", () => app.quit());

  app.on("before-quit", () => {
    app.isQuitting = true;
    if (serverProcess && !serverProcess.killed) serverProcess.kill();
  });
}
