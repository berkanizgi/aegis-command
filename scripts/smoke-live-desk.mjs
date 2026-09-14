import { _electron as electron, expect } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = await fs.mkdtemp(
  path.join(path.resolve(root, "../../work"), "aegis-desk-ui-"),
);
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
try {
  const page = await app.firstWindow();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.waitForFunction(() => window.aegis);
  // Real Chromium permission path, simulated hardware only. No fake permission UI flag.
  for (let attempt = 0; attempt < 2; attempt++) {
    const audio = await page.evaluate(async () => {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const kinds = stream.getTracks().map((t) => t.kind);
      stream.getTracks().forEach((t) => t.stop());
      return kinds;
    });
    assert.deepEqual(audio, ["audio"]);
    await page.reload();
    await page.waitForFunction(() => window.aegis);
  }
  assert.equal(
    await page.evaluate(async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
        });
        stream.getTracks().forEach((t) => t.stop());
        return "allowed";
      } catch {
        return "denied";
      }
    }),
    "denied",
  );
  // Replace only the data service, retaining production UI, IPC transport and permissions.
  await app.evaluate(
    async ({ app, BrowserWindow, ipcMain, session }, dataDir) => {
      const path = process.getBuiltinModule("node:path");
      const require = process
        .getBuiltinModule("node:module")
        .createRequire(path.join(app.getAppPath(), "package.json"));
      const { createService } = require(
        path.join(app.getAppPath(), "server/service.mjs"),
      );
      const { publicWebUrl } = require(
        path.join(app.getAppPath(), "server/world.mjs"),
      );
      const { createResearchView } = require(
        path.join(app.getAppPath(), "electron/research.cjs"),
      );
      const host = BrowserWindow.getAllWindows()[0];
      const research = createResearchView(() => host, publicWebUrl);
      globalThis.deskResearch = research;
      await session
        .fromPartition("aegis-public-research")
        .protocol.handle(
          "https",
          () =>
            new Response(
              "<!doctype html><meta charset=utf-8><title>Testquelle</title><h1>Recherchierte Testquelle</h1><p>Diese Seite ist eine isolierte UI-Testquelle. Kein Zugriff auf Konten.</p>",
              { headers: { "Content-Type": "text/html; charset=utf-8" } },
            ),
        );
      const days = Array.from(
        { length: 10 },
        (_, i) => `2026-09-${String(13 + i).padStart(2, "0")}`,
      );
      const json = (value) => new Response(JSON.stringify(value));
      const service = await createService({
        dataDir: path.join(dataDir, "fixture"),
        desktop: {
          research,
          publishDesk: (desk) => host.webContents.send("aegis:desk", desk),
        },
        fetchImpl: async (url, options) => {
          if (url.includes("geocoding"))
            return json({
              results: [
                {
                  name: "Wien",
                  country: "Österreich",
                  admin1: "Wien",
                  latitude: 48.208,
                  longitude: 16.372,
                  timezone: "Europe/Vienna",
                },
              ],
            });
          if (url.includes("open-meteo.com/v1/forecast"))
            return json({
              timezone: "Europe/Vienna",
              daily: {
                time: days,
                weather_code: [2, 61, 3, 0, 2, 61, 3, 61, 2, 0],
                temperature_2m_max: [24, 21, 22, 25, 24, 20, 19, 18, 20, 22],
                temperature_2m_min: [14, 13, 12, 14, 15, 13, 10, 9, 11, 12],
                precipitation_probability_max: [
                  10, 80, 20, 0, 10, 85, 20, 70, 15, 0,
                ],
                precipitation_sum: days.map(() => 4.2),
                wind_speed_10m_max: days.map(() => 19),
              },
              hourly: {
                time: days.flatMap((d) =>
                  Array.from(
                    { length: 24 },
                    (_, i) => `${d}T${String(i).padStart(2, "0")}:00`,
                  ),
                ),
                precipitation_probability: Array.from({ length: 240 }, (_, i) =>
                  Math.round((Math.sin(i * 0.3) + 1) * 42),
                ),
                temperature_2m: Array(240).fill(18),
                precipitation: Array(240).fill(0.4),
              },
            });
          if (url.includes("frankfurter"))
            return json(
              Array.from({ length: 22 }, (_, i) => ({
                date: `2026-08-${String(i + 10).padStart(2, "0")}`,
                base: "EUR",
                quote: "USD",
                rate: 1.13 + i * 0.001 + Math.sin(i * 0.9) * 0.012,
              })),
            );
          if (url.includes("/v1/responses"))
            return json({
              output: [
                { type: "web_search_call", status: "completed" },
                {
                  type: "message",
                  content: [
                    {
                      type: "output_text",
                      text: "Diese Recherche zeigt echte UI-Verarbeitung mit simulierten Providerdaten. [Quelle]",
                      annotations: [
                        {
                          type: "url_citation",
                          start_index:
                            "Diese Recherche zeigt echte UI-Verarbeitung mit simulierten Providerdaten. [Quelle]".indexOf(
                              "[Quelle]",
                            ),
                          end_index:
                            "Diese Recherche zeigt echte UI-Verarbeitung mit simulierten Providerdaten. [Quelle]"
                              .length,
                          title: "Testquelle",
                          url: "https://example.org/research",
                        },
                      ],
                    },
                  ],
                },
              ],
            });
          throw Error(`Unexpected test request ${url}`);
        },
      });
      globalThis.deskService = service;
      await service.invoke("settings.update", {
        apiKey: "sk-test-fixture-no-network",
        voiceOnStartup: false,
      });
      ipcMain.removeHandler("aegis:invoke");
      ipcMain.handle("aegis:invoke", (_, operation, payload) =>
        service.invoke(operation, payload),
      );
      // Native layout is tested against the real view with an isolated fixture service.
      ipcMain.removeAllListeners("aegis:research-layout");
      ipcMain.on("aegis:research-layout", (_, value) => research.layout(value));
    },
    dataDir,
  );
  // Avoid loading external map tiles during the simulated UI test.
  await page.context().route("https://www.openstreetmap.org/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<html><body style='background:#19342c;color:#bbdec8;font:20px sans-serif;padding:70px'>OpenStreetMap · isolierte Testkarte</body></html>",
    }),
  );
  await page.reload();
  await page.waitForFunction(() => window.aegis);
  const call = (name, args = {}) =>
    page.evaluate(
      ({ name, args }) => window.aegis.invoke("tools.execute", { name, args }),
      { name, args },
    );
  await call("world_weather", { location: "Wien", day: 1 });
  await expect(page.locator(".command-grid")).toHaveClass(/desk-open/);
  await expect(page.locator(".weather-summary h3")).toHaveText("Wien");
  await expect(page.locator("#aegis-conversation")).toHaveCount(0);
  await expect
    .poll(async () => {
      const core = await page.locator(".core-panel").boundingBox(),
        desk = await page.locator(".live-desk").boundingBox();
      return core.x < desk.x && core.width < desk.width;
    })
    .toBe(true);
  await call("world_view", { action: "select_day", index: 7 });
  await expect(page.locator(".weather-date")).toContainText("20.09.");
  await page.screenshot({
    path: path.join(root, "../Aegis-Live-Desk-Wetter.png"),
    fullPage: true,
  });
  await call("world_markets", {
    kind: "fx",
    base: "EUR",
    quote: "USD",
    days: 30,
  });
  await expect(page.locator(".market-value")).toBeVisible();
  await page.screenshot({
    path: path.join(root, "../Aegis-Live-Desk-Maerkte.png"),
    fullPage: true,
  });
  await call("world_map", { location: "Wien" });
  await expect(page.getByTitle("OpenStreetMap · Wien")).toBeVisible();
  await call("world_search", { query: "Testrecherche" });
  await expect(page.locator(".research-answer")).toContainText(
    "simulierten Providerdaten",
  );
  await call("world_view", { action: "open_source", index: 1 });
  await expect(page.locator(".source-toolbar")).toContainText("Testquelle");
  await expect
    .poll(() =>
      app.evaluate(
        ({ BrowserWindow }) =>
          BrowserWindow.getAllWindows()[0].contentView.children.length,
      ),
    )
    .toBeGreaterThan(0);
  const sourceInfo = await app.evaluate(async ({ BrowserWindow }) => {
    const children = BrowserWindow.getAllWindows()[0].contentView.children;
    const source = children.find((v) =>
      v.webContents?.getURL().includes("example.org"),
    );
    return {
      windows: BrowserWindow.getAllWindows().length,
      preload: await source.webContents.executeJavaScript(
        "typeof window.aegis",
      ),
      title: await source.webContents.executeJavaScript("document.title"),
      bounds: source.getBounds(),
    };
  });
  assert.equal(sourceInfo.windows, 1);
  assert.equal(sourceInfo.preload, "undefined");
  assert.equal(sourceInfo.title, "Testquelle");
  assert.ok(sourceInfo.bounds.width > 150);
  await call("world_view", { action: "back" });
  await expect(page.locator(".research-answer")).toBeVisible();
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].webContents.send("aegis:desk", {
      visible: true,
      revision: 1000,
      history: [],
      scene: {
        id: "mail-fixture",
        kind: "mail",
        title: "Postfach-Briefing",
        status: "ready",
        events: [
          { label: "Sichere Postfachverbindung prüfen" },
          { label: "4 Nachrichten als Belege geordnet" },
        ],
        sources: [],
        fetchedAt: new Date().toISOString(),
        data: {
          provider: "microsoft",
          providerLabel: "Microsoft Graph · Outlook",
          account: "demo@outlook.com",
          unreadCount: 3,
          attentionCount: 2,
          note: "UI-Testdaten: Prioritäten zeigen nachvollziehbare Signale, keine garantierte Wichtigkeit.",
          messages: [
            {
              id: "m1",
              from: "FH Vorarlberg",
              subject: "Abgabe bis morgen bestätigt",
              receivedAt: new Date().toISOString(),
              preview:
                "Bitte reichen Sie die Projektunterlagen bis morgen ein.",
              unread: true,
              priority: "attention",
              reasons: ["Noch ungelesen", "Aufmerksamkeitssignal"],
            },
            {
              id: "m2",
              from: "Microsoft Account",
              subject: "Sicherheitsinformation aktualisiert",
              receivedAt: new Date(Date.now() - 3600000).toISOString(),
              preview: "Eine Sicherheitsinformation wurde geändert.",
              unread: true,
              priority: "attention",
              reasons: ["Vom Postfach als wichtig markiert"],
            },
            {
              id: "m3",
              from: "Projektgruppe",
              subject: "Neuer Besprechungstermin",
              receivedAt: new Date(Date.now() - 7200000).toISOString(),
              preview: "Können wir uns am Montag abstimmen?",
              unread: true,
              priority: "review",
              reasons: ["In den letzten 24 Stunden eingegangen"],
            },
            {
              id: "m4",
              from: "Newsletter",
              subject: "Wochenrückblick",
              receivedAt: new Date(Date.now() - 86400000).toISOString(),
              preview: "Die Themen dieser Woche im Überblick.",
              unread: false,
              priority: "normal",
              reasons: [],
            },
          ],
        },
      },
    });
  });
  await expect(page.locator(".mail-evidence.attention")).toHaveCount(2);
  await expect(page.locator(".inbox-overview")).toContainText(
    "demo@outlook.com",
  );
  await page.screenshot({
    path: path.join(root, "../Aegis-Live-Desk-Postfach.png"),
    fullPage: true,
  });
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setSize(1024, 820),
  );
  await expect(page.locator(".inbox-overview")).toBeVisible();
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    ),
    false,
  );
  await page.screenshot({
    path: path.join(root, "../Aegis-Live-Desk-Kompakt.png"),
    fullPage: true,
  });
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].webContents.send("aegis:desk", {
      visible: false,
      revision: 1001,
      history: [],
      scene: null,
    });
  });
  await expect(page.locator(".live-desk")).toHaveCount(0);
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      simulatedData: true,
      realChromiumMicPermission: true,
      microphoneAllowedAfterReload: true,
      cameraDenied: true,
      weather: true,
      markets: true,
      map: true,
      researchEmbedded: true,
      inboxEvidence: true,
      noForeignPreload: true,
      compactLayout: true,
      errors,
    }),
  );
} finally {
  await app
    .evaluate(async () => {
      await globalThis.deskService?.close();
    })
    .catch(() => {});
  await app.close();
}
