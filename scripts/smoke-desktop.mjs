import { _electron as electron, expect } from "@playwright/test";
import assert from "node:assert/strict";
import http from "node:http";
import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const testRoot = path.resolve(root, "../..", "work");
await fs.mkdir(testRoot, { recursive: true });
const dataDir = await fs.mkdtemp(path.join(testRoot, "aegis-desktop-smoke-"));
// Optional test-only switch for restricted Windows CI accounts. Production keeps Chromium sandboxed.
const app = await electron.launch({
  ...(process.env.AEGIS_TEST_EXECUTABLE
    ? { executablePath: path.resolve(process.env.AEGIS_TEST_EXECUTABLE) }
    : {}),
  args: [
    ...(process.env.AEGIS_TEST_RESTRICTED
      ? ["--no-sandbox", "--disable-gpu"]
      : []),
    ...(process.env.AEGIS_TEST_EXECUTABLE ? [] : [root]),
  ],
  env: { ...process.env, OPENAI_API_KEY: "", AEGIS_DATA_DIR: dataDir },
  timeout: 60000,
});
const fixture = http.createServer((req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.end(
    "<!doctype html><html><title>Aegis QA fixture</title><h1>Browser Test</h1><input aria-label=\"Project note\"><button onclick=\"document.querySelector('h1').textContent='Action confirmed'\">Apply note</button></html>",
  );
});
await new Promise((resolve) => fixture.listen(0, "127.0.0.1", resolve));
try {
  const window = await app.firstWindow();
  await window.waitForLoadState("domcontentloaded");
  const errors = [];
  window.on("pageerror", (error) => errors.push(error.message));
  await window.waitForFunction(() => document.body.innerText.includes("Boss"), {
    timeout: 15000,
  });
  const state = await window.evaluate(() => window.aegis.invoke("state"));
  await window.evaluate(() =>
    window.aegis.invoke("settings.update", {
      useSecondDisplay: false,
      launchFullscreen: false,
    }),
  );
  const navigated = await window.evaluate(() =>
    window.aegis.invoke("tools.execute", {
      name: "aegis_app",
      args: { action: "navigate", target: "settings" },
    }),
  );
  assert.equal(navigated.completed, true);
  await expect(window.locator("h1")).toContainText("Systemeinstellungen");
  assert.equal(
    (await window.evaluate(() => window.aegis.invoke("app.overview")))
      .currentView.page,
    "settings",
  );
  await window.evaluate(() =>
    window.aegis.invoke("tools.execute", {
      name: "aegis_app",
      args: { action: "navigate", target: "command" },
    }),
  );
  if (!Array.isArray(state.missions)) throw new Error("Missing state");
  const note = await window.evaluate(() =>
    window.aegis.invoke("memory.save", {
      title: "Desktop QA",
      content: "Persistenz und IPC funktionieren.",
      tags: ["qa"],
    }),
  );
  const saved = await window.evaluate(() => window.aegis.invoke("state"));
  if (!saved.memories.some((m) => m.title === "Desktop QA"))
    throw new Error("Memory write failed");
  if (note.id)
    await window.evaluate(
      (id) => window.aegis.invoke("memory.delete", { id }),
      note.id,
    );
  await window.screenshot({
    path: path.join(root, "..", "Aegis-Command-Center.png"),
    fullPage: true,
  });
  const workspace = path.join(dataDir, "workspace");
  await fs.mkdir(workspace);
  await window.evaluate(
    (folder) => window.aegis.invoke("settings.update", { workspace: folder }),
    workspace,
  );
  const nav = (name) => window.locator(".nav-item").filter({ hasText: name });
  await nav("Gedächtnis").click();
  await window
    .getByRole("button", { name: "Erste Erinnerung", exact: true })
    .click();
  let dialog = window.getByRole("dialog");
  await dialog.getByLabel("Titel", { exact: true }).fill("Atlas · Testprojekt");
  await dialog
    .getByLabel("Was soll Aegis wissen?")
    .fill("Der nächste Schritt ist der Design-Review.");
  await dialog.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect(window.locator(".memory-card h3")).toHaveText(
    "Atlas · Testprojekt",
  );
  await nav("Command Center").click();
  await expect(window.getByLabel("Nachricht an Aegis")).toHaveCount(0);
  await window
    .getByRole("button", { name: "Chat anzeigen", exact: true })
    .click();
  await window.getByLabel("Nachricht an Aegis").fill("Fokus 25");
  await window
    .getByRole("button", { name: "Nachricht senden", exact: true })
    .click();
  await expect(window.locator(".message.assistant").last()).toContainText(
    "Fokus-Timer läuft",
  );
  await window.evaluate(() => window.aegis.invoke("focus.stop"));
  await window
    .getByRole("button", { name: "Neue Mission", exact: true })
    .click();
  dialog = window.getByRole("dialog");
  await dialog.getByLabel("Dein Ziel").fill("Bericht erstellen");
  await dialog
    .getByRole("button", { name: "Mission planen", exact: true })
    .click();
  await expect(
    dialog.getByRole("button", { name: "Plan ausführen", exact: true }),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: "Plan ausführen", exact: true })
    .click();
  await expect(
    dialog.getByRole("button", { name: "Freigeben", exact: true }),
  ).toBeVisible();
  await assert.rejects(() => fs.stat(path.join(workspace, "Aegis Reports")), {
    code: "ENOENT",
  });
  await window.screenshot({
    path: path.join(root, "..", "Aegis-Mission-Control.png"),
    fullPage: true,
  });
  await dialog.getByRole("button", { name: "Freigeben", exact: true }).click();
  await expect(dialog.locator(".mission-meta .badge")).toContainText(
    "Abgeschlossen",
  );
  const reportFiles = await fs.readdir(path.join(workspace, "Aegis Reports"));
  assert.equal(reportFiles.length, 1);
  await dialog.getByRole("button", { name: "Schließen", exact: true }).click();
  await nav("Aktivitätsprotokoll").click();
  await window.getByRole("button", { name: "Rückgängig", exact: true }).click();
  await expect(window.getByRole("status")).toContainText("rückgängig");
  assert.equal(
    (await fs.readdir(path.join(workspace, "Aegis Reports", ".aegis-undo")))
      .length,
    1,
  );
  await nav("Einstellungen").click();
  await expect(
    window.getByRole("checkbox", { name: /Beim Öffnen begrüßen/ }),
  ).toBeChecked();
  await window
    .getByRole("button", { name: "Microsoft 365 Nicht verbunden" })
    .click();
  await expect(
    window.getByRole("button", { name: "Postfach anmelden", exact: true }),
  ).toBeDisabled();
  await expect(window.getByLabel("Microsoft-Kontotyp")).toHaveValue("common");
  await window
    .locator(".microsoft-setup summary")
    .filter({ hasText: "Fehler" })
    .click();
  await expect(window.locator(".microsoft-setup details").last()).toContainText(
    "Verwaltungsportal",
  );
  await window.screenshot({
    path: path.join(root, "..", "Aegis-Microsoft-Setup.png"),
    fullPage: true,
  });
  await window.getByLabel("Wie soll Aegis dich ansprechen?").fill("Boss QA");
  await window
    .getByRole("button", { name: "Einstellungen speichern", exact: true })
    .click();
  await expect(window.getByRole("status")).toContainText("gespeichert");
  assert.equal(
    (await window.evaluate(() => window.aegis.invoke("state"))).settings.name,
    "Boss QA",
  );
  await window.getByRole("button", { name: "GitHub Nicht verbunden" }).click();
  await expect(
    window.getByLabel("Personal Access Token", { exact: true }),
  ).toBeVisible();
  await window.screenshot({
    path: path.join(root, "..", "Aegis-Settings.png"),
    fullPage: true,
  });
  await nav("Automationen").click();
  await expect(
    window.getByRole("heading", { name: "Zeig Aegis deinen Ablauf." }),
  ).toBeVisible();
  await nav("Workspace").click();
  await expect(
    window.getByRole("heading", { name: "Dein Arbeitsbereich ist verbunden." }),
  ).toBeVisible();
  const overflow = await window.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  assert.equal(overflow, false);
  const call = (operation, payload = {}) =>
    window.evaluate(
      ({ operation, payload }) => window.aegis.invoke(operation, payload),
      { operation, payload },
    );
  const url = `http://127.0.0.1:${fixture.address().port}`;
  let approval = await call("tools.execute", {
    name: "browser_open",
    args: { url },
  });
  let result = await call("missions.approve", {
    id: approval.missionId,
    stepId: approval.stepId,
  });
  assert.equal(result.status, "completed");
  let snapshot = result.steps[0].result;
  const field = snapshot.elements.find((e) => e.label === "Project note");
  assert.ok(field);
  approval = await call("tools.execute", {
    name: "browser_fill",
    args: {
      ref: field.ref,
      label: field.label,
      url: snapshot.url,
      text: "Project Atlas",
    },
  });
  result = await call("missions.approve", {
    id: approval.missionId,
    stepId: approval.stepId,
  });
  assert.equal(result.steps[0].result.filled, true);
  snapshot = await call("tools.execute", { name: "browser_read", args: {} });
  const button = snapshot.elements.find((e) => e.label === "Apply note");
  assert.ok(button);
  approval = await call("tools.execute", {
    name: "browser_click",
    args: { ref: button.ref, label: button.label, url: snapshot.url },
  });
  result = await call("missions.approve", {
    id: approval.missionId,
    stepId: approval.stepId,
  });
  assert.equal(result.steps[0].result.clicked, true);
  snapshot = await call("tools.execute", { name: "browser_read", args: {} });
  assert.match(snapshot.text, /Action confirmed/);
  const operator = app.windows().find((p) => p.url().startsWith(url));
  assert.ok(operator);
  assert.equal(await operator.evaluate(() => typeof window.aegis), "undefined");
  await operator.close();
  console.log(
    JSON.stringify({
      title: await window.title(),
      secretStorage:
        state.settings.secretStorage || state.settings.persistentSecrets,
      errors,
      stateFields: Object.keys(state),
    }),
  );
  if (errors.length) throw new Error(errors.join("\n"));
} finally {
  fixture.closeAllConnections();
  fixture.close();
  await app.close();
}
