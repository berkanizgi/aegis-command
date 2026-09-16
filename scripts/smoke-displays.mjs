import { _electron as electron, expect } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const work = path.resolve(root, "../../work");
await fs.mkdir(work, { recursive: true });
const dataDir = await fs.mkdtemp(path.join(work, "aegis-displays-"));
const app = await electron.launch({
  args: [
    root,
    "--hidden",
    "--use-fake-device-for-media-stream",
    ...(process.env.AEGIS_TEST_RESTRICTED
      ? ["--no-sandbox", "--disable-gpu"]
      : []),
  ],
  env: { ...process.env, OPENAI_API_KEY: "", AEGIS_DATA_DIR: dataDir },
  timeout: 60000,
});
let processOutput = "";
app.process().stderr.on("data", (chunk) => {
  processOutput += chunk;
});
try {
  const main = await app.firstWindow();
  await main.waitForFunction(() => window.aegis);
  await expect(main.locator(".loading-screen")).toHaveCount(0);
  await main.evaluate(() =>
    window.aegis.invoke("settings.update", { useSecondDisplay: false }),
  );
  await expect.poll(() => app.windows().length).toBe(1);
  // Test-only virtual topology; both renderers, permissions and IPC are production code.
  await app.evaluate(({ screen, BrowserWindow }) => {
    const first = screen.getPrimaryDisplay();
    globalThis.displayFixture = {
      first,
      mainId: BrowserWindow.getAllWindows()[0].id,
    };
    screen.getAllDisplays = () => [
      first,
      {
        ...first,
        id: first.id + 100,
        bounds: { ...first.bounds, x: first.bounds.x + first.bounds.width },
      },
    ];
    screen.emit("display-added");
  });
  await main.evaluate(() =>
    window.aegis.invoke("settings.update", { useSecondDisplay: true }),
  );
  await expect.poll(() => app.windows().length).toBe(2);
  const info = app.windows().find((p) => p !== main);
  const errors = [];
  main.on("pageerror", (e) => errors.push(e.message));
  info.on("pageerror", (e) => errors.push(e.message));
  await info.waitForFunction(() => window.aegis?.surface === "information");
  await expect(info.locator("h1")).toContainText(
    "Raum für deinen nächsten Auftrag",
  );
  await expect(main.locator(".display-link")).toContainText("Bildschirm 2");
  const native = await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().map((w) => ({
      fullscreen: w.isFullScreen(),
      preload: !!w.webContents.getLastWebPreferences().preload,
      sandbox: w.webContents.getLastWebPreferences().sandbox,
    })),
  );
  assert.ok(
    native.every((w) => w.fullscreen && w.sandbox),
    JSON.stringify(native),
  );
  await expect(info.locator(".orb-canvas")).toHaveCount(0);
  await expect(info.locator("audio")).toHaveCount(0);
  for (const operation of [
    "realtime.session",
    "settings.update",
    "app.control.ack",
  ]) {
    assert.match(
      await info.evaluate(async (op) => {
        try {
          await window.aegis.invoke(op, {});
          return "allowed";
        } catch (e) {
          return e.message;
        }
      }, operation),
      /Nicht autorisierter/,
    );
  }
  assert.equal(
    await info.evaluate(async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        stream.getTracks().forEach((t) => t.stop());
        return "allowed";
      } catch {
        return "denied";
      }
    }),
    "denied",
  );
  const scene = {
    visible: true,
    revision: 500,
    history: [],
    scene: {
      id: "display-mail-fixture",
      kind: "mail",
      title: "Postfach-Briefing",
      status: "ready",
      events: [{ label: "Isolierte Testnachrichten empfangen" }],
      sources: [],
      fetchedAt: new Date().toISOString(),
      data: {
        provider: "microsoft",
        providerLabel: "Outlook · isolierter Test",
        account: "test@example.test",
        unreadCount: 1,
        attentionCount: 1,
        hasMore: false,
        summary: {
          headline: "Eine Testnachricht im geprüften Ausschnitt.",
          todayCount: 1,
          todayUnread: 1,
          actionCount: 1,
          topSubjects: ["Projektabgabe morgen"],
        },
        messages: [
          {
            id: "fixture-1",
            from: "Projektgruppe",
            subject: "Projektabgabe morgen",
            receivedAt: new Date().toISOString(),
            preview: "Isolierte UI-Testnachricht, kein echtes Postfach.",
            unread: true,
            priority: "attention",
            reasons: ["Noch ungelesen"],
          },
        ],
        note: "Simulierte Testdaten, keine echten Konten.",
      },
    },
  };
  await app.evaluate(({ BrowserWindow }, desk) => {
    for (const w of BrowserWindow.getAllWindows())
      w.webContents.send("aegis:desk", desk);
  }, scene);
  await expect(info.locator(".inbox-overview")).toContainText(
    "test@example.test",
  );
  await expect(info.locator(".mail-evidence")).toHaveCount(1);
  await expect(main.locator(".live-desk")).toHaveCount(0);
  await info.screenshot({
    path: path.join(root, "../Aegis-Second-Display.png"),
    fullPage: true,
    animations: "disabled",
  });
  const result = await main.evaluate(() =>
    window.aegis.invoke("app.voice.navigate", {
      text: "Geh mal in die Einstellungen",
    }),
  );
  assert.equal(result.completed, true);
  await expect(main.locator("h1")).toContainText("Systemeinstellungen");
  scene.revision++;
  await app.evaluate(({ BrowserWindow }, desk) => {
    for (const w of BrowserWindow.getAllWindows())
      w.webContents.send("aegis:desk", desk);
  }, scene);
  await expect(main.locator("h1")).toContainText("Systemeinstellungen");
  await expect(info.locator(".mail-evidence")).toHaveCount(1);
  // Unplug: the existing scene moves back, and no extra voice renderer is started.
  await app.evaluate(({ screen }) => {
    screen.getAllDisplays = () => [globalThis.displayFixture.first];
    screen.emit("display-removed");
  });
  await expect.poll(() => app.windows().length).toBe(1);
  await expect(main.locator(".inbox-overview")).toContainText(
    "test@example.test",
  );
  await expect(main.locator(".display-link")).toHaveCount(0);
  await main.keyboard.press("F11");
  await expect
    .poll(() =>
      app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.fromId(globalThis.displayFixture.mainId).isFullScreen(),
      ),
    )
    .toBe(false);
  await main.evaluate(() =>
    window.aegis.invoke("settings.update", {
      useSecondDisplay: false,
      launchFullscreen: false,
    }),
  );
  const settings = await main.evaluate(
    async () => (await window.aegis.invoke("state")).settings,
  );
  assert.equal(settings.useSecondDisplay, false);
  assert.equal(settings.launchFullscreen, false);
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      simulatedTopology: true,
      realRenderers: 2,
      fullscreen: true,
      secondScreenInbox: true,
      noDuplicateVoice: true,
      secondaryMicDenied: true,
      privilegedIpcDenied: true,
      spokenNavigation: true,
      noProgressNavigationSteal: true,
      unplugFallback: true,
      f11: true,
      errors,
    }),
  );
} catch (error) {
  console.error(processOutput.slice(-7000));
  console.error(
    await app
      .evaluate(({ BrowserWindow, screen }) => ({
        windows: BrowserWindow.getAllWindows().map((w) => ({
          id: w.id,
          url: w.webContents.getURL(),
        })),
        displays: screen.getAllDisplays().map((d) => d.id),
      }))
      .catch(() => ({})),
  );
  throw error;
} finally {
  await app.close();
}
