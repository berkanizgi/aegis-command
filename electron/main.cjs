const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  shell,
  safeStorage,
  globalShortcut,
  desktopCapturer,
  Notification,
  Tray,
  Menu,
  nativeImage,
  session,
} = require("electron");
const path = require("node:path");
const os = require("node:os");
const { pathToFileURL } = require("node:url");
const { execFile } = require("node:child_process");
const { createBrowserOperator } = require("./browser.cjs");
const { isTrustedFile } = require("./trust.cjs");
const { installAudioPermissions } = require("./permissions.cjs");
const { createResearchView } = require("./research.cjs");
if (process.env.AEGIS_DATA_DIR)
  app.setPath("userData", path.resolve(process.env.AEGIS_DATA_DIR));
app.setName("Aegis");
let win,
  service,
  tray,
  quitting = false,
  shadowTimer;
const devUrl = process.env.AEGIS_DEV_URL;
const appRoot = path.resolve(__dirname, "..");
function safeExternal(raw) {
  const url = new URL(raw);
  if (
    !["https:", "http:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new Error("Nur HTTP(S)-Links sind erlaubt.");
  return shell.openExternal(url.href);
}
function trusted(sender) {
  return (
    win &&
    sender === win.webContents &&
    (devUrl
      ? sender.getURL().startsWith(new URL(devUrl).origin + "/")
      : isTrustedFile(
          sender.getURL(),
          path.join(appRoot, "dist", "index.html"),
        ))
  );
}
const foregroundScript = `Add-Type -TypeDefinition 'using System; using System.Text; using System.Runtime.InteropServices; public class AegisWindow { [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow(); [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n); }'; $aegisText = New-Object System.Text.StringBuilder 512; [void][AegisWindow]::GetWindowText([AegisWindow]::GetForegroundWindow(), $aegisText, 512); $aegisText.ToString()`;
function activeWindow() {
  return new Promise((resolve) =>
    execFile(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", foregroundScript],
      { windowsHide: true, timeout: 5000 },
      (err, stdout) => resolve(err ? "" : stdout.trim()),
    ),
  );
}
async function captureScreen() {
  const sources = await desktopCapturer.getSources({
    types: ["window", "screen"],
    thumbnailSize: { width: 1600, height: 1000 },
  });
  const available = sources.filter((s) => s.name !== "Aegis").slice(0, 12);
  if (!available.length) throw new Error("Kein Fenster zum Teilen verfügbar.");
  const choice = await dialog.showMessageBox(win, {
    type: "question",
    title: "Aegis · Bildschirm teilen",
    message: "Welche Ansicht soll Aegis einmalig analysieren?",
    detail:
      "Ein einzelnes Bild der ausgewählten Ansicht wird an deinen KI-Anbieter gesendet.",
    buttons: ["Abbrechen", ...available.map((s) => s.name)],
    cancelId: 0,
    defaultId: 0,
    noLink: true,
  });
  if (choice.response === 0) throw new Error("Bildschirmfreigabe abgebrochen.");
  return available[choice.response - 1].thumbnail.toDataURL();
}
async function createWindow() {
  win = new BrowserWindow({
    width: 1500,
    height: 980,
    minWidth: 940,
    minHeight: 680,
    title: "Aegis",
    backgroundColor: "#050b12",
    frame: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      autoplayPolicy: "no-user-gesture-required",
    },
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    safeExternal(url).catch(() => {});
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event, url) => {
    if (url !== win.webContents.getURL()) event.preventDefault();
  });
  win.once("ready-to-show", () => {
    if (!process.argv.includes("--hidden")) win.show();
  });
  win.on("close", (event) => {
    if (tray && !quitting) {
      event.preventDefault();
      win.hide();
    }
  });
  if (devUrl) await win.loadURL(devUrl);
  else await win.loadFile(path.join(appRoot, "dist", "index.html"));
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => {
    win?.show();
    win?.focus();
  });
  app
    .whenReady()
    .then(async () => {
      const { createService } = await import(
        pathToFileURL(path.join(appRoot, "server", "service.mjs")).href
      );
      const { publicWebUrl } = await import(
        pathToFileURL(path.join(appRoot, "server", "world.mjs")).href
      );
      const research = createResearchView(() => win, publicWebUrl);
      const desktop = {
        research,
        publishDesk: (desk) => {
          if (win && !win.isDestroyed())
            win.webContents.send("aegis:desk", desk);
        },
        browser: createBrowserOperator(() => win),
        pickFolder: async () => {
          const result = await dialog.showOpenDialog(win, {
            properties: ["openDirectory"],
            title: "Arbeitsordner für Aegis freigeben",
          });
          return result.canceled ? null : result.filePaths[0];
        },
        openPath: async (file) => {
          const error = await shell.openPath(file);
          if (error) throw new Error(error);
          return { opened: file };
        },
        openExternal: safeExternal,
        notify: (title, body) => {
          if (Notification.isSupported()) {
            const note = new Notification({ title, body });
            note.on("click", () => win?.show());
            note.show();
          }
        },
        getSystemInfo: () => ({
          platform: os.platform(),
          hostname: os.hostname(),
          totalMemory: os.totalmem(),
          freeMemory: os.freemem(),
          uptime: os.uptime(),
          cpus: os.cpus().length,
        }),
        captureScreen,
        setAutostart: (enabled) =>
          app.setLoginItemSettings({
            openAtLogin: !!enabled,
            path: process.env.PORTABLE_EXECUTABLE_FILE || process.execPath,
            args: ["--hidden"],
          }),
      };
      const secureStorage = safeStorage.isEncryptionAvailable()
        ? {
            encryptString: (text) => safeStorage.encryptString(text),
            decryptString: (data) => safeStorage.decryptString(data),
          }
        : undefined;
      service = await createService({
        dataDir: path.join(app.getPath("userData"), "data"),
        secureStorage,
        desktop,
      });
      ipcMain.handle("aegis:invoke", async (event, operation, payload) => {
        if (!trusted(event.sender) || typeof operation !== "string")
          throw new Error("Nicht autorisierter Aufruf.");
        return service.invoke(operation, payload || {});
      });
      ipcMain.on("aegis:window", (event, action) => {
        if (!trusted(event.sender)) return;
        if (action === "minimize") win.minimize();
        if (action === "maximize")
          win.isMaximized() ? win.unmaximize() : win.maximize();
        if (action === "close") win.close();
      });
      ipcMain.on("aegis:research-layout", (event, value) => {
        if (
          trusted(event.sender) &&
          event.senderFrame === event.sender.mainFrame
        )
          research.layout(value);
      });
      installAudioPermissions(session.defaultSession, trusted, (url) =>
        devUrl
          ? url.startsWith(new URL(devUrl).origin + "/")
          : isTrustedFile(url, path.join(appRoot, "dist", "index.html")),
      );
      await createWindow();
      win.on("resize", () => research.layout({ visible: false }));
      const iconPath = path.join(appRoot, "dist", "aegis-icon.png");
      const icon = nativeImage.createFromPath(iconPath);
      if (!icon.isEmpty()) {
        tray = new Tray(icon.resize({ width: 16, height: 16 }));
        tray.setToolTip("Aegis · Personal Command OS");
        tray.setContextMenu(
          Menu.buildFromTemplate([
            { label: "Command Center öffnen", click: () => win.show() },
            {
              label: "Sprachsteuerung",
              click: () => {
                win.show();
                win.webContents.send("aegis:voice-toggle");
              },
            },
            { type: "separator" },
            {
              label: "Aegis beenden",
              click: () => {
                quitting = true;
                app.quit();
              },
            },
          ]),
        );
        tray.on("double-click", () => win.show());
      }
      globalShortcut.register("CommandOrControl+Shift+Space", () => {
        win.show();
        win.webContents.send("aegis:voice-toggle");
      });
      let lastTitle = "",
        busy = false;
      shadowTimer = setInterval(async () => {
        if (busy || process.platform !== "win32") return;
        busy = true;
        try {
          const state = await service.invoke("state", {});
          if (state.shadow?.active) {
            const title = await activeWindow();
            if (
              title &&
              title !== lastTitle &&
              !/Aegis|passwor|kennwort|1password|bitwarden|keepass|incognito|inkognito|inprivate/i.test(
                title,
              )
            ) {
              lastTitle = title;
              await service.invoke("shadow.event", {
                title,
                app: "Windows · aktives Fenster",
              });
            }
          } else lastTitle = "";
        } catch {
        } finally {
          busy = false;
        }
      }, 7000);
    })
    .catch((error) => {
      dialog.showErrorBox("Aegis konnte nicht starten", error.message);
      quitting = true;
      app.quit();
    });
  let shutdownStarted = false;
  app.on("before-quit", (event) => {
    quitting = true;
    clearInterval(shadowTimer);
    globalShortcut.unregisterAll();
    if (service && !shutdownStarted) {
      event.preventDefault();
      shutdownStarted = true;
      service
        .close()
        .catch(() => {})
        .finally(() => app.quit());
    }
  });
  app.on("window-all-closed", () => {
    if (!tray) app.quit();
  });
}
