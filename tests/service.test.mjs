import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  symlink,
  stat,
  realpath,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createService, validateArguments } from "../server/service.mjs";
import { createStore } from "../server/store.mjs";
import { confinedPath } from "../server/local-tools.mjs";

// All mutations use new, isolated test directories. No personal data or live accounts.
async function setup(t, options = {}) {
  const dir = await realpath(
    await mkdtemp(path.join(os.tmpdir(), "aegis-test-")),
  );
  const workspace = path.join(dir, "workspace");
  await mkdir(workspace);
  const service = await createService({
    dataDir: path.join(dir, "data"),
    ...options,
  });
  t.after(() => service.close());
  await service.invoke("settings.update", { workspace });
  return { ...service, dir, workspace };
}
const mockCrypto = {
  encryptString: (text) => Buffer.from("test-only:" + text).reverse(),
  decryptString: (buf) => {
    const value = Buffer.from(buf).reverse().toString();
    if (!value.startsWith("test-only:")) throw Error("bad");
    return value.slice(10);
  },
};
const response = (value) =>
  new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

test("first start is honest: no connected integrations or invented personal data", async (t) => {
  const s = await setup(t);
  const state = await s.invoke("state");
  assert.equal(state.settings.hasApiKey, false);
  assert.equal(state.settings.secretStorage, "memory-only");
  for (const key of [
    "missions",
    "memories",
    "messages",
    "commitments",
    "activity",
    "routines",
  ])
    assert.equal(state[key].length, 0, key);
  assert.equal(state.connectors.length, 5);
  assert.ok(state.connectors.every((c) => !c.connected));
});
test("memory, commitments and settings persist through restart", async (t) => {
  const s = await setup(t);
  await s.invoke("memory.save", {
    title: "Atlas",
    content: "Entwurf prüfen",
    tags: ["projekt"],
  });
  const item = await s.invoke("commitments.save", {
    title: "Entwurf schicken",
    person: "Lara",
    dueAt: "2026-10-01T10:00:00Z",
  });
  await s.invoke("commitments.done", { id: item.id });
  await s.close();
  const again = await createService({ dataDir: path.join(s.dir, "data") });
  t.after(() => again.close());
  const state = await again.invoke("state");
  assert.equal(state.memories[0].title, "Atlas");
  assert.equal(state.commitments[0].status, "done");
  assert.equal(state.settings.workspace, s.workspace);
});
test("encrypted desktop persistence does not expose state or credentials", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "aegis-crypto-"));
  const store = await createStore(dir, mockCrypto);
  store.state.memories.push({ title: "Sensitive project title" });
  await store.setSecret("key", "secret-test-value");
  await store.close();
  const disk = await readFile(path.join(dir, "state.json"), "utf8");
  assert.equal(JSON.parse(disk).version, 2);
  assert.ok(!disk.includes("Sensitive"));
  assert.ok(!disk.includes("secret-test-value"));
  const again = await createStore(dir, mockCrypto);
  assert.equal(again.getSecret("key"), "secret-test-value");
  assert.equal(again.state.memories[0].title, "Sensitive project title");
  await again.close();
  await assert.rejects(() => createStore(dir), /verschlüsselt/);
  assert.equal(await readFile(path.join(dir, "state.json"), "utf8"), disk);
});
test("without OS crypto, secrets are session-only and hidden from state", async (t) => {
  const s = await setup(t);
  await s.invoke("settings.update", { apiKey: "sk-testing-local-credential" });
  const state = await s.invoke("state");
  assert.equal(state.settings.hasApiKey, true);
  assert.ok(!JSON.stringify(state).includes("sk-testing"));
  assert.ok(
    !(await readFile(path.join(s.dir, "data", "state.json"), "utf8")).includes(
      "sk-testing",
    ),
  );
  await s.close();
  const again = await createService({ dataDir: path.join(s.dir, "data") });
  t.after(() => again.close());
  assert.equal((await again.invoke("state")).settings.hasApiKey, false);
});
test("report write waits for exact approval, verifies content, and cannot run twice", async (t) => {
  const s = await setup(t);
  const pending = await s.invoke("tools.execute", {
    name: "report_write",
    args: { filename: "Weekly.md", content: "# Real result" },
  });
  assert.equal(pending.pendingApproval, true);
  const target = path.join(s.workspace, "Aegis Reports", "Weekly.md");
  await assert.rejects(() => stat(target), { code: "ENOENT" });
  const mission = (await s.invoke("state")).missions[0];
  assert.equal(mission.status, "approval");
  assert.ok(!JSON.stringify(mission).includes("approvalDigest"));
  await assert.rejects(
    () => s.invoke("missions.approve", { id: mission.id, stepId: "wrong" }),
    /nicht mehr aktuell/,
  );
  const done = await s.invoke("missions.approve", {
    id: mission.id,
    stepId: mission.steps[0].id,
  });
  assert.equal(done.status, "completed");
  assert.equal(done.steps[0].result.verified, true);
  assert.equal(await readFile(target, "utf8"), "# Real result");
  await s.invoke("missions.run", { id: mission.id });
  assert.equal(await readFile(target, "utf8"), "# Real result");
  const entry = (await s.invoke("state")).activity.find((a) => a.undoable);
  const undo = await s.invoke("activity.undo", { id: entry.id });
  assert.equal(await readFile(undo.recoveredAt, "utf8"), "# Real result");
  await assert.rejects(() => stat(target), { code: "ENOENT" });
});
test("undo refuses to remove an edited report", async (t) => {
  const s = await setup(t);
  const p = await s.invoke("tools.execute", {
    name: "report_write",
    args: { filename: "Note.md", content: "initial" },
  });
  const done = await s.invoke("missions.approve", {
    id: p.missionId,
    stepId: p.stepId,
  });
  await writeFile(done.steps[0].result.path, "User changes");
  await assert.rejects(
    () => s.invoke("activity.undo", { id: done.steps[0].result.activityId }),
    /nachträglich geändert/,
  );
  assert.equal(
    await readFile(done.steps[0].result.path, "utf8"),
    "User changes",
  );
});
test("existing files are never overwritten and failed writes are not retried", async (t) => {
  const s = await setup(t);
  await mkdir(path.join(s.workspace, "Aegis Reports"));
  await writeFile(
    path.join(s.workspace, "Aegis Reports", "Same.md"),
    "original",
  );
  const p = await s.invoke("tools.execute", {
    name: "report_write",
    args: { filename: "Same.md", content: "replacement" },
  });
  const m = await s.invoke("missions.approve", {
    id: p.missionId,
    stepId: p.stepId,
  });
  assert.equal(m.status, "failed");
  await assert.rejects(
    () => s.invoke("missions.run", { id: m.id }),
    /fehlgeschlagen/,
  );
  assert.equal(
    await readFile(path.join(s.workspace, "Aegis Reports", "Same.md"), "utf8"),
    "original",
  );
});
test("workspace confines paths, excludes credentials and never launches scripts", async (t) => {
  let opened = false;
  const s = await setup(t, {
    desktop: {
      openPath: async () => {
        opened = true;
      },
    },
  });
  await writeFile(path.join(s.workspace, ".env"), "PRIVATE=secret");
  await writeFile(path.join(s.workspace, "run.js"), "throw Error()");
  await writeFile(path.join(s.workspace, "notes.md"), "aegis search target");
  await assert.rejects(
    () => confinedPath(s.workspace, "../outside.txt"),
    /außerhalb/,
  );
  await assert.rejects(() => confinedPath(s.workspace, ".env"), /sensibl/);
  const results = await s.invoke("workspace.search", { query: "aegis search" });
  assert.equal(results.results[0].path, "notes.md");
  const p = await s.invoke("workspace.open", { path: "run.js" });
  const m = await s.invoke("missions.approve", {
    id: p.missionId,
    stepId: p.stepId,
  });
  assert.equal(m.status, "failed");
  assert.equal(opened, false);
});
test("workspace rejects junction escapes", async (t) => {
  const s = await setup(t);
  const outside = path.join(s.dir, "outside");
  await mkdir(outside);
  await symlink(outside, path.join(s.workspace, "escape"), "junction");
  await assert.rejects(
    () => confinedPath(s.workspace, "escape"),
    /Symbolische/,
  );
});
test("local chat runs supported commands without an API call", async (t) => {
  const s = await setup(t, {
    fetchImpl: () => {
      throw Error("Should not use network");
    },
  });
  assert.match(
    (await s.invoke("chat", { message: "Fokus 25" })).message,
    /Fokus-Timer läuft/,
  );
  await s.invoke("chat", {
    message: "Merke dir Projekt Atlas benötigt eine Entscheidung",
  });
  assert.match(
    (await s.invoke("chat", { message: "Erinnere Atlas" })).message,
    /Entscheidung/,
  );
  await s.invoke("chat", { message: "Fokus beenden" });
  assert.equal((await s.invoke("state")).focus.active, false);
});
test("invalid arguments and settings fail before execution", async (t) => {
  const s = await setup(t);
  await assert.rejects(() => s.invoke("focus.start", { minutes: -4 }), /Zahl/);
  await assert.rejects(
    () => s.invoke("settings.update", { provider: "unknown" }),
    /Anbieter/,
  );
  await assert.rejects(
    () => s.invoke("settings.update", { dailyRequestLimit: 1001 }),
    /Tageslimit/,
  );
  await assert.rejects(
    () =>
      s.invoke("tools.execute", {
        name: "focus_start",
        args: { minutes: 20, command: "rm" },
      }),
    /unbekanntes Feld/,
  );
  assert.throws(
    () =>
      validateArguments(
        { type: "object", properties: {}, additionalProperties: false },
        JSON.parse('{"__proto__":{}}'),
      ),
    /Unsicher/,
  );
});
test("OpenAI Responses tool loop uses real results and daily quota", async (t) => {
  const calls = [];
  const s = await setup(t, {
    fetchImpl: async (url, options) => {
      const body = JSON.parse(options.body);
      calls.push(body);
      assert.equal(options.redirect, "error");
      assert.equal(body.store, false);
      if (calls.length === 1)
        return response({
          output: [
            {
              type: "function_call",
              call_id: "call_1",
              name: "memory_search",
              arguments: '{"query":"Atlas"}',
            },
          ],
          usage: { input_tokens: 50, output_tokens: 10 },
        });
      return response({
        output: [
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text: "Atlas: finale Entscheidung offen.",
              },
            ],
          },
        ],
        usage: { input_tokens: 70, output_tokens: 15 },
      });
    },
  });
  await s.invoke("memory.save", {
    title: "Atlas",
    content: "finale Entscheidung offen",
  });
  await s.invoke("settings.update", {
    apiKey: "fake-key",
    dailyRequestLimit: 2,
  });
  const result = await s.invoke("chat", { message: "Was ist mit Atlas?" });
  assert.match(result.message, /Entscheidung/);
  assert.equal(calls.length, 2);
  assert.ok(
    calls[1].input.some(
      (i) =>
        i.type === "function_call_output" && i.output.includes("Entscheidung"),
    ),
  );
  assert.ok(
    calls[0].tools.every((tool) => !("risk" in tool) && !("connector" in tool)),
  );
  const state = await s.invoke("state");
  assert.equal(state.usage.requests, 2);
  assert.equal(state.usage.inputTokens, 120);
  await assert.rejects(
    () => s.invoke("chat", { message: "Noch etwas" }),
    /Tageslimit/,
  );
  assert.equal(calls.length, 2);
});
test("AI write request produces an approval, not an immediate filesystem mutation", async (t) => {
  let count = 0;
  const s = await setup(t, {
    fetchImpl: async () =>
      response(
        ++count === 1
          ? {
              output: [
                {
                  type: "function_call",
                  call_id: "x",
                  name: "report_write",
                  arguments: JSON.stringify({
                    filename: "AI.md",
                    content: "Proposed",
                  }),
                },
              ],
            }
          : {
              output: [
                {
                  type: "message",
                  content: [
                    { type: "output_text", text: "Deine Freigabe fehlt." },
                  ],
                },
              ],
            },
      ),
  });
  await s.invoke("settings.update", { apiKey: "fake-key" });
  await s.invoke("chat", { message: "Erstelle den Bericht" });
  assert.equal((await s.invoke("state")).missions[0].status, "approval");
  await assert.rejects(
    () => stat(path.join(s.workspace, "Aegis Reports", "AI.md")),
    { code: "ENOENT" },
  );
});
test("Realtime exchange keeps long-lived credentials outside renderer and builds session", async (t) => {
  let session;
  const s = await setup(t, {
    fetchImpl: async (url, options) => {
      assert.equal(url, "https://api.openai.com/v1/realtime/calls");
      session = JSON.parse(options.body.get("session"));
      return new Response("v=0\r\nanswer");
    },
  });
  await s.invoke("settings.update", { apiKey: "fake-key" });
  const result = await s.invoke("realtime.session", { sdp: "v=0\r\noffer" });
  assert.equal(result.sdp, "v=0\r\nanswer");
  assert.equal(session.type, "realtime");
  assert.equal(session.tools[0].name, "aegis_command");
  assert.equal(session.audio.input.transcription.language, "de");
});
test("browser operator is wired through approvals", async (t) => {
  const commands = [];
  const s = await setup(t, {
    desktop: {
      browser: async (command) => {
        commands.push(command);
        return { url: "https://example.com", elements: [], text: "Example" };
      },
    },
  });
  const p = await s.invoke("tools.execute", {
    name: "browser_open",
    args: { url: "https://example.com" },
  });
  assert.equal(commands.length, 0);
  await s.invoke("missions.approve", { id: p.missionId, stepId: p.stepId });
  assert.equal(commands[0].action, "open");
  const read = await s.invoke("tools.execute", {
    name: "browser_read",
    args: {},
  });
  assert.equal(read.text, "Example");
});
test("shadow produces a disabled draft and stops observing on restart", async (t) => {
  const s = await setup(t);
  await s.invoke("shadow.start");
  await s.invoke("shadow.event", {
    title: "Recherchiere das Projekt Atlas",
    app: "Browser",
  });
  const stopped = await s.invoke("shadow.stop");
  assert.equal(stopped.routine.enabled, false);
  assert.match(stopped.routine.prompt, /Atlas/);
  await s.invoke("shadow.start");
  await s.close();
  const again = await createService({ dataDir: path.join(s.dir, "data") });
  t.after(() => again.close());
  assert.equal((await again.invoke("state")).shadow.active, false);
});
test("routine writes use the same approval boundary", async (t) => {
  const s = await setup(t);
  const routine = await s.invoke("routines.save", {
    title: "Bericht",
    prompt: "Bericht erstellen",
    enabled: false,
    intervalMinutes: 60,
  });
  const result = await s.invoke("routines.run", { id: routine.id });
  assert.equal(result.status, "approval");
  await assert.rejects(
    () =>
      s.invoke("routines.save", {
        title: "Too fast",
        prompt: "Briefing",
        intervalMinutes: 1,
      }),
    /Routineintervall/,
  );
});
test("changing workspace invalidates pending report approval", async (t) => {
  const s = await setup(t);
  const p = await s.invoke("tools.execute", {
    name: "report_write",
    args: { filename: "Bound.md", content: "Bound to folder" },
  });
  const second = path.join(s.dir, "second");
  await mkdir(second);
  await s.invoke("settings.update", { workspace: second });
  await assert.rejects(
    () => s.invoke("missions.approve", { id: p.missionId, stepId: p.stepId }),
    /Arbeitsordner/,
  );
  await assert.rejects(() => stat(path.join(second, "Aegis Reports")), {
    code: "ENOENT",
  });
});
test("routine creation from voice/chat requires approval and avoids duplicate pending runs", async (t) => {
  const s = await setup(t);
  const p = await s.invoke("tools.execute", {
    name: "routine_create",
    args: {
      title: "Woche",
      prompt: "Bericht erstellen",
      enabled: true,
      intervalMinutes: 60,
    },
  });
  assert.equal((await s.invoke("state")).routines.length, 0);
  const result = await s.invoke("missions.approve", {
    id: p.missionId,
    stepId: p.stepId,
  });
  const routine = result.steps[0].result;
  assert.equal(routine.enabled, true);
  const first = await s.invoke("routines.run", { id: routine.id });
  const second = await s.invoke("routines.run", { id: routine.id });
  assert.equal(first.id, second.id);
});
test("interrupted write in a paused mission is not retried after restart", async (t) => {
  const s = await setup(t);
  const m = await s.invoke("missions.create", { goal: "Bericht erstellen" });
  await s.close();
  const file = path.join(s.dir, "data", "state.json");
  const document = JSON.parse(await readFile(file, "utf8"));
  document.state.missions[0].status = "paused";
  document.state.missions[0].steps[0].status = "running";
  await writeFile(file, JSON.stringify(document));
  const again = await createService({ dataDir: path.join(s.dir, "data") });
  t.after(() => again.close());
  assert.equal((await again.invoke("state")).missions[0].status, "failed");
  await assert.rejects(
    () => again.invoke("missions.run", { id: m.id }),
    /fehlgeschlagen/,
  );
});
