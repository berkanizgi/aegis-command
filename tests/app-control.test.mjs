import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createAppControl,
  spokenNavigation,
  normalizePage,
} from "../server/app-control.mjs";
import { createRequire } from "node:module";
import { EventEmitter } from "node:events";
const { openApplication } = createRequire(import.meta.url)(
  "../electron/app-launcher.cjs",
);
test("German voice navigation accepts direct commands, never negations or quoted instructions", () => {
  for (const text of [
    "Geh mal in die Einstellungen",
    "Okay, öffne bitte die Einstellungen.",
    "Aegis, zeig mir mal die Einstellungen",
    "Wechsle zu den Einstellungen",
  ])
    assert.equal(spokenNavigation(text), "settings", text);
  for (const text of [
    "Geh mal in die Plugin",
    "Öffne die Plugins",
    "Gehe zu Plugins bitte",
  ])
    assert.equal(spokenNavigation(text), "plugins", text);
  for (const text of [
    "Nicht in die Einstellungen gehen",
    "Wie öffne ich die Einstellungen?",
    "Schreibe: Öffne die Plugins",
    "Öffne die Einstellungen und lösche alles",
    "Öffne __proto__",
    "Öffne Chrome",
  ])
    assert.equal(spokenNavigation(text), null, text);
  assert.equal(normalizePage("Einstellungen"), "settings");
});
test("duplicate navigation from transcript and model is coalesced; newer navigation wins", async () => {
  const requests = [];
  const c = createAppControl({
    desktop: { publishControl: (r) => requests.push(r) },
    overview: () => ({}),
    activity: async () => {},
  });
  const a = c.execute({ action: "navigate", target: "Einstellungen" });
  const b = c.execute({ action: "navigate", target: "settings" });
  assert.equal(requests.length, 1);
  c.ack({ id: requests[0].id, page: "settings", voiceStatus: "listening" });
  assert.equal((await a).completed, true);
  assert.equal((await b).completed, true);
  const older = c.execute({ action: "navigate", target: "plugins" });
  const newer = c.execute({ action: "navigate", target: "missions" });
  assert.equal((await older).superseded, true);
  c.ack({ id: requests.at(-1).id, page: "missions" });
  await newer;
  c.close();
});

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
