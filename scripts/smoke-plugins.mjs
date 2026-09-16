import { _electron as electron, expect } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
await fs.mkdir(path.join(root, ".cache"), { recursive: true });
const dataDir = await fs.mkdtemp(path.join(root, ".cache", "plugins-ui-"));
const app = await electron.launch({
  args: [
    root,
    "--hidden",
    ...(process.env.AEGIS_TEST_RESTRICTED
      ? ["--no-sandbox", "--disable-gpu"]
      : []),
  ],
  env: { ...process.env, OPENAI_API_KEY: "", AEGIS_DATA_DIR: dataDir },
  timeout: 60000,
});
try {
  const page = await app.firstWindow();
  await page.waitForFunction(() => window.aegis);
  await page.evaluate(() =>
    window.aegis.invoke("settings.update", {
      useSecondDisplay: false,
      launchFullscreen: false,
    }),
  );
  await app.evaluate(async ({ app, BrowserWindow, ipcMain }, dataDir) => {
    const path = process.getBuiltinModule("node:path");
    const require = process
      .getBuiltinModule("node:module")
      .createRequire(path.join(app.getAppPath(), "package.json"));
    const { createService } = require(
      path.join(app.getAppPath(), "server/service.mjs"),
    );
    const host = BrowserWindow.getAllWindows()[0];
    const plugin = {
      id: "test-outlook",
      name: "outlook-email",
      displayName: "Outlook Email",
      category: "Kommunikation",
      featured: true,
      available: true,
      installed: true,
      connected: false,
      connectionState: "unknown",
      description: "Isolierte Testverbindung",
    };
    const catalog = {
      runtime: "online",
      source: "cache",
      runtimeVerified: false,
      account: { signedIn: true, known: true, email: "chatgpt@example.test" },
      plugins: [plugin],
      error: "OpenAI verweigert diesen Abruf (HTTP 403). Status ungeklärt.",
    };
    const bridge = {
      catalog: async () => catalog,
      status: () => ({
        outlook: {
          connected: plugin.connected,
          account: plugin.account,
          state: plugin.connectionState,
        },
      }),
      verifyOutlook: async () => {
        Object.assign(plugin, {
          connected: true,
          connectionState: "verified",
          account: "private@hotmail.test",
        });
        catalog.error = null;
        catalog.runtimeVerified = true;
        return { connected: true, account: plugin.account };
      },
      outlookInbox: async () => ({
        account: plugin.account,
        messages: [
          {
            id: "qa-mail-1",
            subject: "QA · Termin bestätigen",
            from: "sender@example.test",
            receivedDateTime: new Date().toISOString(),
            bodyPreview: "Bitte bestätigen Sie den Termin.",
            importance: "high",
            isRead: false,
          },
        ],
        hasMore: false,
      }),
      close() {},
    };
    const service = await createService({
      dataDir: path.join(dataDir, "fixture"),
      pluginBridge: bridge,
      desktop: {
        publishDesk: (v) => host.webContents.send("aegis:desk", v),
        publishControl: (v) => host.webContents.send("aegis:control", v),
      },
      fetchImpl: async () => {
        throw Error("No external API allowed in UI test");
      },
    });
    globalThis.pluginTestService = service;
    ipcMain.removeHandler("aegis:invoke");
    ipcMain.handle("aegis:invoke", (_, operation, payload) =>
      service.invoke(operation, payload),
    );
  }, dataDir);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.reload();
  await page.locator(".nav-item").filter({ hasText: "Plugins" }).click();
  await expect(page.locator(".plugin-cache-note")).toContainText("403");
  await expect(page.locator(".plugin-runtime-status")).toContainText(
    "chatgpt@example.test",
  );
  await page
    .getByRole("button", { name: "Verbindung testen", exact: true })
    .click();
  await expect(page.locator(".outlook-priority")).toContainText(
    "Bestätigtes Outlook-Konto: private@hotmail.test",
  );
  await expect(page.locator(".plugin-cache-note")).toHaveCount(0);
  const status = await page.evaluate(() =>
    window.aegis.invoke("tools.execute", { name: "aegis_status", args: {} }),
  );
  assert.equal(status.plugins.outlook.connected, true);
  await page.screenshot({
    path: path.join(root, "../Aegis-Plugins-QA.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Postfach öffnen", exact: true })
    .click();
  await expect(page.locator(".mailbox-scroll")).toContainText(
    "QA · Termin bestätigen",
  );
  await expect(page.locator(".breadcrumb")).toContainText("Command Center");
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      simulated: true,
      status403Independent: true,
      profileVerified: true,
      aiSeesConnection: true,
      opensMailbox: true,
      noExternalRequests: true,
    }),
  );
} finally {
  await app
    .evaluate(async () => {
      await globalThis.pluginTestService?.close();
    })
    .catch(() => {});
  await app.close();
}
