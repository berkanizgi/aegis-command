import { test } from "node:test";
import assert from "node:assert/strict";
import { createAppControl } from "../server/app-control.mjs";
import { createRequire } from "node:module";
import { EventEmitter } from "node:events";
const { openApplication } = createRequire(import.meta.url)(
  "../electron/app-launcher.cjs",
);

test("navigation needs the committed target view acknowledgement", async () => {
  let request;
  const control = createAppControl({
    desktop: {
      publishControl: (r) => {
        request = r;
      },
    },
    overview: () => ({ app: "AEGIS" }),
    activity: async () => {},
  });
  const navigating = control.execute({
    action: "navigate",
    target: "settings",
  });
  assert.equal(control.state().page, "command");
  assert.equal(
    control.ack({ id: request.id, page: "plugins" }).accepted,
    false,
  );
  assert.equal(
    control.ack({ id: request.id, page: "settings", voiceStatus: "listening" })
      .accepted,
    true,
  );
  const result = await navigating;
  assert.equal(result.completed, true);
  assert.equal(result.view.voiceStatus, "listening");
  control.close();
});
test("stop voice requires idle, closes pending controls safely, rejects unknown actions", async () => {
  let request;
  const c = createAppControl({
    desktop: {
      publishControl: (r) => {
        request = r;
      },
    },
    overview: () => ({}),
    activity: async () => {},
  });
  const p = c.execute({ action: "stop_voice" });
  assert.equal(
    c.ack({ id: request.id, voiceStatus: "speaking" }).accepted,
    false,
  );
  c.ack({ id: request.id, voiceStatus: "idle" });
  assert.equal((await p).completed, true);
  await assert.rejects(
    c.execute({ action: "navigate", target: "send_mail" }),
    /Unbekannte/,
  );
  await assert.rejects(
    c.execute({ action: "open_application", target: "powershell" }),
    /nicht freigegeben/,
  );
  const waiting = c.execute({ action: "navigate", target: "plugins" });
  c.close();
  await assert.rejects(waiting, /App beendet/);
});
test("launcher uses fixed paths and no shell or arbitrary args", async () => {
  let invocation;
  const result = await openApplication("chrome", {
    env: { LOCALAPPDATA: "C:\\Test" },
    accessImpl: async () => {},
    spawnImpl: (...args) => {
      invocation = args;
      const p = new EventEmitter();
      p.unref = () => {};
      queueMicrotask(() => p.emit("spawn"));
      return p;
    },
  });
  assert.equal(result.launched, true);
  assert.match(invocation[0], /chrome\.exe$/);
  assert.deepEqual(invocation[1], []);
  assert.equal(invocation[2].shell, false);
  await assert.rejects(
    openApplication("chrome; powershell"),
    /nicht freigegeben/,
  );
  await assert.rejects(
    openApplication("chrome", {
      env: {},
      accessImpl: async () => {
        throw Error();
      },
    }),
    /nicht gefunden/,
  );
});
