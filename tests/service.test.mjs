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
// Never inherit a developer's real provider key into test fixtures.
delete process.env.OPENAI_API_KEY;

// All mutations use new, isolated test directories. No personal data or live accounts.
async function setup(t, options = {}) {
  const dir = await realpath(
    await mkdtemp(path.join(os.tmpdir(), "aegis-test-")),
  );
  const workspace = path.join(dir, "workspace");
  await mkdir(workspace);
  const service = await createService({
    dataDir: path.join(dir, "data"),
    pluginBridge: {
      status: () => ({ outlook: { connected: false, state: "unknown" } }),
      catalog: async () => ({ plugins: [] }),
      close() {},
    },
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
test("automatic startup reads one real bounded mailbox excerpt before a paid greeting", async (t) => {
  let reads = 0,
    providerCalls = 0;
  const published = [];
  const s = await setup(t, {
    desktop: {
      publishDesk: (desk) => published.push(desk),
      getDisplays: () => ({ connected: 2, secondaryActive: true }),
    },
    pluginBridge: {
      status: () => ({ outlook: { connected: true } }),
      catalog: async () => ({ plugins: [] }),
      close() {},
      outlookInbox: async ({ limit }) => {
        reads++;
        assert.equal(limit, 20);
        return {
          messages: [
            {
              id: "start-1",
              subject: "Projektfrist",
              from: "Projektgruppe",
              receivedDateTime: new Date().toISOString(),
              bodyPreview: "Frist morgen",
              isRead: false,
            },
          ],
          hasMore: true,
        };
      },
    },
    fetchImpl: async (url) => {
      providerCalls++;
      assert.match(url, /realtime\/calls$/);
      return new Response("answer");
    },
  });
  await s.invoke("settings.update", { apiKey: "test-key" });
  const [first, duplicate] = await Promise.all([
    s.invoke("startup.briefing"),
    s.invoke("startup.briefing"),
  ]);
  assert.equal(reads, 1);
  assert.equal(providerCalls, 0);
  assert.equal(first.checkedMessages, 1);
  assert.deepEqual(first, duplicate);
  assert.equal(published.at(-1).scene.kind, "mail");
  const voice = await s.invoke("realtime.session", {
    startup: true,
    sdp: "v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n",
  });
  assert.equal(providerCalls, 1);
  assert.match(voice.greetingInstructions, /Projektfrist/);
  assert.match(voice.greetingInstructions, /Bildschirm 2/);
  assert.match(voice.greetingInstructions, /geprüften Ausschnitt/);
});

test("plugin drafts lock double clicks and never overwrite a new view", async (t) => {
  let finish,
    calls = 0;
  const bridge = {
    status: () => ({ outlook: { connected: true } }),
    catalog: async () => ({ plugins: [] }),
    close() {},
    outlookInbox: async () => ({
      messages: [
        {
          id: "mail-1",
          subject: "Test mail",
          from: "test@example.test",
          bodyPreview: "Hi",
          isRead: false,
        },
      ],
      hasMore: false,
    }),
    outlookReplyDraft: () => {
      calls++;
      return new Promise((resolve) => {
        finish = resolve;
      });
    },
  };
  const s = await setup(t, { pluginBridge: bridge });
  await s.invoke("tools.execute", {
    name: "world_mail",
    args: { provider: "microsoft", limit: 1 },
  });
  const draft = await s.invoke("mail.reply.prepare", {
    messageId: "mail-1",
    instruction: "Ich akzeptiere.",
  });
  const saving = s.invoke("mail.reply.save", { replyId: draft.id });
  await assert.rejects(
    s.invoke("mail.reply.save", { replyId: draft.id }),
    /nicht mehr aktuell/,
  );
  await assert.rejects(s.invoke("mail.reply.clear"), /gerade gespeichert/);
  finish({ created: true, sent: false, draftId: "draft-1" });
  assert.equal((await saving).status, "saved");
  assert.equal(calls, 1);
});
test("ambiguous draft save cannot be blindly retried", async (t) => {
  const s = await setup(t, {
    pluginBridge: {
      status: () => ({}),
      close() {},
      outlookInbox: async () => ({
        messages: [
          { id: "mail-1", subject: "Test", from: "sender", isRead: false },
        ],
      }),
      outlookReplyDraft: async () => {
        throw Error("timeout");
      },
    },
  });
  await s.invoke("tools.execute", {
    name: "world_mail",
    args: { provider: "microsoft", limit: 1 },
  });
  const draft = await s.invoke("mail.reply.prepare", {
    messageId: "mail-1",
    instruction: "Danke.",
  });
  await assert.rejects(
    s.invoke("mail.reply.save", { replyId: draft.id }),
    /timeout/,
  );
  assert.equal(
    (await s.invoke("state")).desk.scene.data.replyDraft.status,
    "uncertain",
  );
  await assert.rejects(
    s.invoke("mail.reply.save", { replyId: draft.id }),
    /nicht mehr aktuell/,
  );
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
test("connected personal Microsoft mail becomes an evidence-based visual briefing", async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "aegis-mail-"));
  const store = await createStore(dir, mockCrypto);
  for (const [field, value] of Object.entries({
    clientId: "00000000-0000-4000-8000-000000000001",
    tenantId: "consumers",
    accessToken: "test-access-token",
    refreshToken: "test-refresh-token",
    expiresAt: String(Date.now() + 3600000),
    verified: "true",
    account: "person@hotmail.com",
  }))
    await store.setSecret(`connector.microsoft.${field}`, value);
  await store.close();
  const service = await createService({
    dataDir: dir,
    secureStorage: mockCrypto,
    fetchImpl: async (url, options = {}) => {
      assert.match(url, /graph\.microsoft\.com\/v1\.0\/me\/messages/);
      if (url.endsWith("/mail-urgent/createReply")) {
        assert.equal(options.method, "POST");
        assert.equal(
          JSON.parse(options.body).comment,
          "Danke.\n\nIch bestätige den Termin.",
        );
        return response({
          id: "reply-draft-1",
          subject: "RE: Dringend: Abgabe morgen",
          webLink: "https://outlook.live.com/mail/drafts/reply-draft-1",
        });
      }
      if (url.includes("/reply-draft-1?"))
        return response({
          id: "reply-draft-1",
          isDraft: true,
          subject: "RE: Dringend: Abgabe morgen",
          webLink: "https://outlook.live.com/mail/drafts/reply-draft-1",
        });
      return response({
        value: [
          {
            id: "mail-urgent",
            subject: "Dringend: Abgabe morgen",
            from: {
              emailAddress: {
                name: "Lehrperson",
                address: "school@example.com",
              },
            },
            receivedDateTime: new Date().toISOString(),
            bodyPreview: "Bitte die Unterlagen bis morgen einreichen.",
            isRead: false,
            importance: "high",
            webLink: "https://outlook.live.com/mail/0/id/test",
          },
          {
            id: "mail-normal",
            subject: "Newsletter",
            from: { emailAddress: { name: "News" } },
            receivedDateTime: "2025-01-01T10:00:00Z",
            bodyPreview: "Wochenrückblick",
            isRead: true,
            importance: "normal",
          },
        ],
      });
    },
  });
  t.after(() => service.close());
  const result = await service.invoke("tools.execute", {
    name: "world_mail",
    args: { provider: "microsoft", limit: 12 },
  });
  assert.equal(result.providerLabel, "Microsoft Graph · Outlook");
  assert.equal(result.messages[0].priority, "attention");
  assert.equal(result.messages[0].from, "Lehrperson");
  assert.ok(result.messages[0].reasons.length >= 3);
  assert.equal(result.sources.length, 0);
  assert.equal((await service.invoke("state")).desk.scene.kind, "mail");
  const localReply = await service.invoke("mail.reply.prepare", {
    messageId: "mail-urgent",
    instruction: "Danke, ich akzeptiere.",
  });
  assert.equal(localReply.sent, false);
  assert.equal(localReply.status, "ready");
  const revised = await service.invoke("mail.reply.update", {
    replyId: localReply.id,
    body: "Danke.\n\nIch bestätige den Termin.",
  });
  assert.match(revised.body, /\n\n/);
  const saved = await service.invoke("mail.reply.save", {
    replyId: localReply.id,
  });
  assert.equal(saved.sent, false);
  assert.equal(saved.status, "saved");
  assert.match(saved.draftUrl, /outlook\.live\.com/);
  await assert.rejects(
    () => service.invoke("mail.reply.save", { replyId: localReply.id }),
    /nicht mehr aktuell/,
  );
  await service.invoke("mail.reply.clear");
  assert.equal(
    (await service.invoke("state")).desk.scene.data.replyDraft,
    undefined,
  );
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
  const offer = [
    "v=0",
    "o=- 123456789 2 IN IP4 127.0.0.1",
    "s=-",
    "t=0 0",
    "a=group:BUNDLE 0",
    "m=audio 9 UDP/TLS/RTP/SAVPF 111",
    "c=IN IP4 0.0.0.0",
    "a=mid:0",
    "a=sendrecv",
    "a=rtpmap:111 opus/48000/2",
    "",
  ].join("\r\n");
  const s = await setup(t, {
    fetchImpl: async (url, options) => {
      assert.equal(url, "https://api.openai.com/v1/realtime/calls");
      assert.equal(options.headers.Authorization, "Bearer fake-key");
      // Serialize and parse the actual multipart request: SDP must survive intact,
      // including the final CRLF required by strict SDP parsers (EOF regression).
      const request = new Request(url, options);
      assert.match(
        request.headers.get("content-type"),
        /^multipart\/form-data; boundary=/,
      );
      const multipart = await request.formData();
      assert.equal(multipart.get("sdp"), offer);
      session = JSON.parse(multipart.get("session"));
      return new Response("v=0\r\nanswer");
    },
  });
  await s.invoke("settings.update", { apiKey: "fake-key" });
  const result = await s.invoke("realtime.session", { sdp: offer });
  assert.equal(result.sdp, "v=0\r\nanswer");
  assert.equal(session.type, "realtime");
  assert.match(session.instructions, /aegis_app/);
  assert.match(session.instructions, /Einstellungen.*settings/);
  assert.match(session.instructions, /Plugins.*plugins/);
  assert.ok(session.tools.some((t) => t.name === "aegis_command"));
  assert.ok(session.tools.some((t) => t.name === "aegis_status"));
  assert.ok(session.tools.some((t) => t.name === "world_mail_reply"));
  assert.ok(
    session.tools.every((tool) => !("strict" in tool)),
    "Realtime function tools must not contain the Responses-only strict field",
  );
  assert.match(result.greetingInstructions, /Begrüße den Nutzer/);
  assert.match(result.greetingInstructions, /keine Werkzeuge/);
  assert.ok(!result.greetingInstructions.includes("fake-key"));
  assert.equal(session.audio.input.transcription.language, "de");
  assert.match(session.audio.input.transcription.prompt, /Bregenz/);
});
test("Aegis knows real setup and local commitments without accessing accounts or credentials", async (t) => {
  const s = await setup(t, {
    fetchImpl: () => {
      throw Error("Unexpected network access");
    },
  });
  await s.invoke("settings.update", {
    apiKey: "fake-private-api-key",
    voiceOnStartup: false,
  });
  await s.invoke("connector.configure", {
    id: "github",
    token: "fake-private-github-token",
  });
  await s.invoke("commitments.save", {
    title: "Review vorbereiten",
    person: "QA",
  });
  const result = await s.invoke("app.overview");
  assert.equal(result.app, "AEGIS");
  assert.equal(result.ai.voiceOnStartup, false);
  assert.equal(
    result.integrations.find((c) => c.id === "github").configured,
    true,
  );
  assert.equal(
    result.integrations.find((c) => c.id === "github").connected,
    false,
  );
  assert.equal(result.commitments[0].title, "Review vorbereiten");
  assert.match(result.microsoftSetup, /Outlook Email.*ohne Azure/);
  assert.ok(!JSON.stringify(result).includes("fake-private"));
  const tool = await s.invoke("tools.execute", {
    name: "aegis_status",
    args: {},
  });
  assert.equal(tool.app, "AEGIS");
  assert.equal((await s.invoke("state")).usage.requests, 0);
  await assert.rejects(
    () => s.invoke("settings.update", { voiceOnStartup: "true" }),
    /Ungültige/,
  );
});
test("invalid Realtime offers are rejected before any provider call", async (t) => {
  let calls = 0;
  const s = await setup(t, {
    fetchImpl: async () => {
      calls++;
      throw Error("No provider call expected");
    },
  });
  await s.invoke("settings.update", { apiKey: "fake-key" });
  for (const sdp of [
    undefined,
    null,
    42,
    "",
    "   ",
    "not-sdp",
    "v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111",
    "v=0\r\n",
    "v=0\r\n" + "x".repeat(100000),
  ]) {
    await assert.rejects(() => s.invoke("realtime.session", { sdp }));
  }
  assert.equal(calls, 0);
  assert.equal((await s.invoke("state")).usage.requests, 0);
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
