import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
const { createDisplayManager, informationOperationAllowed } = createRequire(
  import.meta.url,
)("../electron/displays.cjs");
class Window extends EventEmitter {
  constructor() {
    super();
    this.dead = false;
    this.fullscreen = false;
  }
  setBounds(value) {
    this.bounds = value;
  }
  getBounds() {
    return this.bounds || {};
  }
  isFullScreen() {
    return !!this.fullscreen;
  }
  setFullScreen(value) {
    this.fullscreen = value;
  }
  isDestroyed() {
    return this.dead;
  }
  destroy() {
    this.dead = true;
    this.emit("closed");
  }
  close() {
    this.emit("close");
    this.destroy();
  }
  show() {
    this.visible = true;
  }
  showInactive() {
    this.show();
  }
  hide() {
    this.visible = false;
  }
}
const display = (id, x = 0) => ({
  id,
  bounds: { x, y: 0, width: 1920, height: 1080 },
  workArea: { x, y: 0, width: 1920, height: 1040 },
});
function fixture(t, count = 2) {
  const primary = new Window(),
    screen = new EventEmitter(),
    created = [],
    changes = [];
  let all = [display(1), display(2, -1920)].slice(0, count);
  screen.getAllDisplays = () => all;
  screen.getPrimaryDisplay = () => all[0];
  const manager = createDisplayManager({
    screen,
    primary: () => primary,
    createSecondary: () => {
      const w = new Window();
      created.push(w);
      return w;
    },
    changed: (s) => changes.push(s),
  });
  t.after(() => manager.close());
  return {
    manager,
    primary,
    created,
    changes,
    setDisplays: (value) => {
      all = value;
      screen.emit("display-removed");
    },
  };
}
test("two real displays get one full-screen surface each, including negative coordinates", (t) => {
  const f = fixture(t);
  f.manager.configure({});
  assert.equal(f.primary.fullscreen, true);
  assert.equal(f.created.length, 1);
  assert.equal(f.created[0].bounds.x, -1920);
  assert.equal(f.created[0].fullscreen, true);
  assert.equal(f.manager.informationHost(), f.created[0]);
  f.manager.show();
  assert.equal(f.created[0].visible, true);
  f.manager.hide();
  assert.equal(f.created[0].visible, false);
  f.manager.configure({});
  assert.equal(f.created.length, 1);
});
test("hot-unplug falls back to main; reconnect recovers; no phantom screen", (t) => {
  const f = fixture(t, 1);
  f.manager.configure({});
  assert.equal(f.created.length, 0);
  f.setDisplays([display(1), display(2, 1920)]);
  assert.equal(f.manager.state().secondaryActive, true);
  const second = f.created[0];
  f.setDisplays([display(1)]);
  assert.equal(second.dead, true);
  assert.equal(f.manager.informationHost(), f.primary);
  f.setDisplays([display(1), display(2, 1920)]);
  assert.equal(f.created.length, 2);
});
test("manual close stays closed and display settings are honored", (t) => {
  const f = fixture(t);
  f.manager.configure({});
  f.created[0].close();
  f.setDisplays([display(1), display(2)]);
  assert.equal(f.manager.state().secondaryActive, false);
  f.manager.configure({ useSecondDisplay: false, launchFullscreen: false });
  assert.equal(f.primary.fullscreen, false);
  f.manager.configure({ useSecondDisplay: true, launchFullscreen: false });
  assert.equal(f.manager.state().secondaryActive, true);
  assert.equal(f.manager.secondary().fullscreen, false);
});
test("information IPC allows inbox review but not another mic, settings, shell or send", () => {
  for (const op of ["state", "mail.reply.update", "mail.reply.save"])
    assert.ok(informationOperationAllowed(op));
  assert.ok(
    informationOperationAllowed("tools.execute", { name: "world_mail" }),
  );
  for (const op of [
    "realtime.session",
    "settings.update",
    "startup.briefing",
    "app.control.ack",
    "chat",
    "missions.run",
    "mail.send",
  ])
    assert.equal(informationOperationAllowed(op), false, op);
  for (const name of [
    "aegis_app",
    "shell_execute",
    "microsoft_mail_send",
    "browser_click",
  ])
    assert.equal(
      informationOperationAllowed("tools.execute", { name }),
      false,
      name,
    );
});
test("source reader preserves initial bounds and reparents before a monitor closes", async () => {
  let view;
  const ses = {
    setPermissionRequestHandler() {},
    setPermissionCheckHandler() {},
    on() {},
    webRequest: { onBeforeRequest() {} },
  };
  const makeHost = () => ({
    isDestroyed: () => false,
    getContentSize: () => [1920, 1080],
    contentView: {
      children: [],
      addChildView(v) {
        this.children.push(v);
      },
      removeChildView(v) {
        this.children = this.children.filter((x) => x !== v);
      },
    },
  });
  const first = makeHost(),
    second = makeHost();
  let host = second;
  const code = await readFile(
    new URL("../electron/research.cjs", import.meta.url),
    "utf8",
  );
  const context = {
    module: { exports: {} },
    setTimeout,
    clearTimeout,
    require: () => ({
      session: { fromPartition: () => ses },
      WebContentsView: class {
        constructor() {
          view = this;
          this.webContents = Object.assign(new EventEmitter(), {
            isDestroyed: () => false,
            setAudioMuted() {},
            setWindowOpenHandler() {},
            stop() {},
            loadURL: async () => {},
            executeJavaScript: async () => ({
              url: "https://example.org",
              text: "Source",
            }),
          });
        }
        setBackgroundColor() {}
        setVisible(v) {
          this.visible = v;
        }
        setBounds(v) {
          this.bounds = v;
        }
      },
    }),
  };
  vm.runInNewContext(code, context);
  const reader = context.module.exports.createResearchView(
    () => host,
    (url) => url,
  );
  reader.layout({
    visible: true,
    bounds: { x: 50, y: 200, width: 1000, height: 600 },
  });
  await reader.open("https://example.org");
  assert.equal(view.visible, true);
  assert.equal(view.bounds.width, 1000);
  assert.ok(second.contentView.children.includes(view));
  host = first;
  reader.rehost();
  assert.equal(second.contentView.children.length, 0);
  assert.ok(first.contentView.children.includes(view));
  assert.equal(view.visible, false);
  reader.layout({
    visible: true,
    bounds: { x: 30, y: 130, width: 800, height: 500 },
  });
  assert.equal(view.visible, true);
  assert.equal(view.bounds.width, 800);
});
