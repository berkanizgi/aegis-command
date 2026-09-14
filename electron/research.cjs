const { WebContentsView, session } = require("electron");

// Separate from the Browser Operator: no preload, no AI clicks, no credentials,
// downloads or device permissions. Only visible text can be returned to the AI.
function createResearchView(parent, allowedUrl) {
  let view,
    bounds,
    visible = false,
    serial = 0;
  function ensure() {
    if (view && !view.webContents.isDestroyed()) return view;
    const ses = session.fromPartition("aegis-public-research");
    ses.setPermissionRequestHandler((_, __, callback) => callback(false));
    ses.setPermissionCheckHandler(() => false);
    ses.on("will-download", (event) => event.preventDefault());
    ses.webRequest.onBeforeRequest((details, callback) => {
      if (["mainFrame", "subFrame"].includes(details.resourceType)) {
        try {
          allowedUrl(details.url);
        } catch {
          return callback({ cancel: true });
        }
      }
      callback({});
    });
    view = new WebContentsView({
      webPreferences: {
        session: ses,
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
        navigateOnDragDrop: false,
      },
    });
    view.setBackgroundColor("#0b151c");
    view.webContents.setAudioMuted(true);
    view.webContents.on("before-input-event", (event, input) => {
      if (input.type === "keyDown" && input.key === "Escape") {
        event.preventDefault();
        parent()?.webContents.send("aegis:voice-stop");
      }
    });
    // Keep this a source reader. New source navigation is selected explicitly
    // through Aegis, so the displayed origin and text never silently go stale.
    view.webContents.on("will-navigate", (event) => event.preventDefault());
    for (const eventName of ["will-navigate", "will-redirect"])
      view.webContents.on(eventName, (event, url) => {
        try {
          allowedUrl(url);
        } catch {
          event.preventDefault();
        }
      });
    view.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    parent()?.contentView.addChildView(view);
    view.setVisible(false);
    return view;
  }
  function layout(value) {
    const host = parent();
    if (!host || host.isDestroyed()) return;
    if (!value?.visible) {
      visible = false;
      view?.setVisible(false);
      return;
    }
    const box = value.bounds;
    if (!box || ![box.x, box.y, box.width, box.height].every(Number.isFinite))
      return;
    const [width, height] = host.getContentSize();
    const x = Math.max(0, Math.min(width, Math.round(box.x))),
      y = Math.max(64, Math.min(height, Math.round(box.y)));
    bounds = {
      x,
      y,
      width: Math.max(0, Math.min(Math.round(box.width), width - x)),
      height: Math.max(0, Math.min(Math.round(box.height), height - y)),
    };
    visible = bounds.width >= 150 && bounds.height >= 100;
    if (view && !view.webContents.isDestroyed()) {
      view.setBounds(bounds);
      view.setVisible(visible);
    }
  }
  function hide() {
    serial++;
    visible = false;
    view?.setVisible(false);
    view?.webContents.stop();
  }
  async function open(url) {
    const target = allowedUrl(url),
      own = ++serial,
      current = ensure();
    if (bounds) current.setBounds(bounds);
    current.setVisible(visible);
    const timer = setTimeout(() => current.webContents.stop(), 25000);
    try {
      await current.webContents.loadURL(target);
      if (own !== serial)
        throw Error("Quellenansicht inzwischen geschlossen oder gewechselt.");
      const page = await current.webContents.executeJavaScript(
        `(()=>({title:document.title.slice(0,250),url:location.href,text:(document.body?.innerText||'').slice(0,18000)}))()`,
      );
      allowedUrl(page.url);
      return { ...page, readAt: new Date().toISOString() };
    } finally {
      clearTimeout(timer);
    }
  }
  return {
    open,
    layout,
    hide,
    close() {
      serial++;
      if (view && !view.webContents.isDestroyed()) view.webContents.close();
      view = null;
    },
  };
}
module.exports = { createResearchView };
