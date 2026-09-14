import { chromium } from "@playwright/test";
import { spawn, execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import net from "node:net";
import assert from "node:assert/strict";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tempRoot = path.resolve(root, "../..", "work");
await mkdir(tempRoot, { recursive: true });
const dataDir = await mkdtemp(path.join(tempRoot, "aegis-portable-"));
const probe = net.createServer();
await new Promise((resolve) => probe.listen(0, "127.0.0.1", resolve));
const port = probe.address().port;
await new Promise((resolve) => probe.close(resolve));
const { version } = JSON.parse(
  await readFile(path.join(root, "package.json"), "utf8"),
);
const executable = path.join(root, "release", `Aegis-${version}-Windows.exe`);
const child = spawn(
  executable,
  [
    `--remote-debugging-port=${port}`,
    ...(process.env.AEGIS_TEST_RESTRICTED
      ? ["--no-sandbox", "--disable-gpu"]
      : []),
  ],
  {
    windowsHide: true,
    env: { ...process.env, OPENAI_API_KEY: "", AEGIS_DATA_DIR: dataDir },
    stdio: "ignore",
  },
);
let browser;
try {
  let ready = false;
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`, {
        signal: AbortSignal.timeout(1000),
      });
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  assert.ok(
    ready,
    "Portable app did not expose its test debugging endpoint within 45 seconds",
  );
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  const window = browser
    .contexts()[0]
    .pages()
    .find((p) => p.url().startsWith("file:"));
  assert.ok(window, "Missing app window");
  await window.waitForFunction(() => Boolean(window.aegis), { timeout: 15000 });
  const state = await window.evaluate(() => window.aegis.invoke("state"));
  assert.equal(state.settings.name, "Boss");
  assert.equal(state.connectors.length, 5);
  assert.equal(state.settings.voiceOnStartup, true);
  assert.equal(await window.locator("#aegis-conversation").count(), 0);
  assert.equal(
    await window
      .getByRole("button", { name: "Chat anzeigen", exact: true })
      .count(),
    1,
  );
  const overview = await window.evaluate(() =>
    window.aegis.invoke("app.overview"),
  );
  assert.equal(overview.app, "AEGIS");
  assert.equal(overview.liveDesk.visible, false);
  await window.evaluate(() =>
    window.aegis.invoke("tools.execute", {
      name: "world_view",
      args: { action: "open" },
    }),
  );
  await window.waitForSelector(".live-desk");
  await window.evaluate(() =>
    window.aegis.invoke("tools.execute", {
      name: "world_view",
      args: { action: "home" },
    }),
  );
  await window.waitForSelector(".live-desk", { state: "detached" });
  assert.match(
    await window.locator("body").innerText(),
    new RegExp(`AEGIS v${version.replaceAll(".", "\\.")}`),
  );
  assert.match(await window.title(), /Aegis/);
  console.log(
    JSON.stringify({
      portable: true,
      title: await window.title(),
      localCore: true,
      version,
      voiceFirstDefaults: true,
      appOverview: true,
      liveDesk: true,
      secretStorage: state.settings.secretStorage,
    }),
  );
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  if (child.pid)
    await new Promise((resolve) =>
      execFile(
        "taskkill",
        ["/PID", String(child.pid), "/T", "/F"],
        { windowsHide: true, timeout: 5000 },
        () => resolve(),
      ),
    );
  // Tray close handlers can keep Electron alive after CDP Browser.close.
  // Bound cleanup for restricted CI accounts where taskkill is unavailable.
  await Promise.race([
    browser?.close().catch(() => {}),
    new Promise((resolve) => setTimeout(resolve, 1500)),
  ]);
  process.exit(process.exitCode || 0);
}
