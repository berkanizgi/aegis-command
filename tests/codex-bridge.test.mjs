import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizePlugin,
  createCodexBridge,
  connectorData,
} from "../server/codex-bridge.mjs";
import { bridgeError } from "../server/codex-rpc.mjs";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

test("official Outlook plugin metadata becomes a safe Hotmail catalog entry", () => {
  const plugin = normalizePlugin(
    {
      id: "plugin-outlook",
      name: "outlook-email",
      status: "AVAILABLE",
      installation_policy: "AVAILABLE",
      release: {
        display_name: "Outlook Email",
        app_ids: ["connector-outlook"],
        interface: {
          short_description: "Read and draft Outlook email",
          category: "Communication",
          brand_color: "#0877cc",
        },
      },
    },
    [
      {
        id: "connector-outlook",
        name: "Outlook Email",
        isAccessible: true,
        installUrl: "https://chatgpt.com/apps/outlook-email/connector-outlook",
      },
    ],
  );
  assert.equal(plugin.name, "outlook-email");
  assert.equal(plugin.displayName, "Outlook Email");
  assert.equal(plugin.available, true);
  assert.equal(
    plugin.connected,
    false,
    "catalog accessibility is not runtime connectivity",
  );
  assert.equal(plugin.featured, true);
  assert.match(plugin.installUrl, /^https:\/\/chatgpt\.com\/apps\//);
});

const outlookId = "connector_4aaab2856305417b993eca9a216aaf6e";
async function fixture(t, handler) {
  const home = await mkdtemp(path.join(os.tmpdir(), "aegis-plugin-test-"));
  const calls = [];
  const bridge = createCodexBridge({
    codexHome: home,
    rpc: {
      request: async (method, args) => {
        calls.push({ method, args });
        return handler(method, args);
      },
      close() {},
    },
    desktop: { openExternal: async (url) => calls.push({ url }) },
  });
  t.after(() => bridge.close());
  return { home, calls, bridge };
}
const baseRpc = (method) => {
  if (method === "account/read")
    return { account: { type: "chatgpt", email: "test@example.test" } };
  if (method === "app/installed")
    return {
      apps: [
        {
          id: outlookId,
          runtimeName: "Microsoft Outlook Email",
          enabled: true,
          callable: true,
        },
      ],
    };
  throw new Error(`Unexpected RPC: ${method}`);
};
test("runtime connection survives without app/list or a remote plugin catalog", async (t) => {
  const { bridge, calls } = await fixture(t, baseRpc);
  const catalog = await bridge.catalog(true);
  assert.equal(catalog.account.signedIn, true);
  assert.equal(
    catalog.plugins.find((p) => p.name === "outlook-email").connected,
    true,
  );
  assert.equal(bridge.status().outlook.connected, true);
  assert.ok(
    !calls.some((c) => c.method === "app/list" || c.method === "plugin/list"),
  );
});
test("403 becomes actionable text and preserves successful account state", async (t) => {
  const { bridge } = await fixture(t, (method) => {
    if (method === "app/installed")
      throw Error("403 Forbidden: <html><style>secret CSS</style>");
    return baseRpc(method);
  });
  const c = await bridge.catalog(true);
  assert.equal(c.account.signedIn, true);
  assert.equal(c.runtime, "online");
  assert.equal(c.runtimeVerified, false);
  assert.equal(c.plugins[0].connectionState, "unknown");
  assert.equal(c.plugins[0].connected, false);
  assert.match(c.error, /403/);
  assert.doesNotMatch(c.error, /html|secret CSS/);
});
test("stale cache can never show a confirmed connection", async (t) => {
  const { bridge, home } = await fixture(t, () => {
    throw Error("offline");
  });
  for (const dir of ["remote_plugin_catalog", "codex_app_directory"])
    await mkdir(path.join(home, "cache", dir), { recursive: true });
  await writeFile(
    path.join(home, "cache", "remote_plugin_catalog", "test.json"),
    JSON.stringify({
      plugins: [{ name: "outlook-email", release: { app_ids: [outlookId] } }],
    }),
  );
  await writeFile(
    path.join(home, "cache", "codex_app_directory", "test.json"),
    JSON.stringify({
      connectors: [
        {
          id: outlookId,
          name: "Outlook Email",
          isAccessible: true,
          callable: true,
          enabled: true,
        },
      ],
    }),
  );
  const c = await bridge.catalog();
  assert.equal(c.plugins[0].connected, false);
  assert.equal(c.plugins[0].connectionState, "unknown");
});
test("concurrent refresh shares one runtime request, including first startup", async (t) => {
  const { bridge, calls } = await fixture(t, baseRpc);
  await Promise.all([
    bridge.catalog(true),
    bridge.catalog(true),
    bridge.catalog(false),
  ]);
  assert.equal(calls.filter((c) => c.method === "app/installed").length, 1);
});
test("opening the official connection dialog never claims installed", async (t) => {
  const { bridge, calls } = await fixture(t, (m) =>
    m === "app/installed" ? { apps: [] } : baseRpc(m),
  );
  const r = await bridge.install("outlook-email");
  assert.equal(r.installed, false);
  assert.equal(r.authRequired, true);
  assert.ok(
    calls.some((c) =>
      c.url?.startsWith("https://chatgpt.com/apps/outlook-email/"),
    ),
  );
  assert.ok(!calls.some((c) => c.method === "plugin/install"));
});
function mailRpc(method, args) {
  if (method === "thread/start") return { thread: { id: "test-thread" } };
  if (method === "mcpServerStatus/list")
    return {
      data: [
        {
          name: "codex_apps",
          runtimeStatus: "connected",
          tools: Object.fromEntries(
            [
              "get_profile",
              "list_messages",
              "search_messages",
              "create_reply_draft",
              "send_email",
            ].map((action) => {
              const name = "microsoft_outlook_email." + action;
              return [
                name,
                {
                  name,
                  inputSchema: {
                    type: "object",
                    properties: Object.fromEntries(
                      [
                        "folder_id",
                        "top",
                        "skip",
                        "order_by",
                        "query",
                        "size",
                        "from_index",
                        "message_id",
                        "comment",
                        "reply_all",
                      ].map((k) => [k, {}]),
                    ),
                  },
                },
              ];
            }),
          ),
        },
      ],
    };
  if (method === "mcpServer/tool/call") {
    if (args.tool.endsWith("get_profile"))
      return { structuredContent: { email: "private@hotmail.test" } };
    if (
      args.tool.endsWith("list_messages") ||
      args.tool.endsWith("search_messages")
    )
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              value: [
                {
                  id: "EXACT-raw/ID+=",
                  subject: "Test",
                  sender: { emailAddress: { address: "sender@example.test" } },
                  receivedDateTime: "2026-09-15T10:00:00Z",
                  bodyPreview: "Test preview",
                  isRead: true,
                  web_link: "https://outlook.live.com/mail/0/id/test",
                },
              ],
              has_more: true,
            }),
          },
        ],
      };
    if (args.tool.endsWith("create_reply_draft"))
      return { structuredContent: { id: "draft-1", isDraft: true } };
    throw Error("A send tool must never be called");
  }
  return baseRpc(method);
}
test("profile and inbox use direct read calls with exact provider IDs, no model turns", async (t) => {
  const { bridge, calls } = await fixture(t, mailRpc);
  const profile = await bridge.verifyOutlook();
  assert.equal(profile.account, "private@hotmail.test");
  const inbox = await bridge.outlookInbox({ limit: 2 });
  assert.equal(inbox.messages[0].id, "EXACT-raw/ID+=");
  assert.equal(inbox.messages[0].from, "sender@example.test");
  assert.equal(inbox.hasMore, true);
  assert.equal(bridge.status().outlook.account, profile.account);
  const list = calls.find(
    (c) =>
      c.method === "mcpServer/tool/call" &&
      c.args.tool.endsWith("list_messages"),
  );
  assert.equal(list.args.arguments.folder_id, "inbox");
  assert.ok(!calls.some((c) => c.method === "turn/start"));
});
test("draft only accepts an observed message, preserves body, forbids reply-all and send", async (t) => {
  const { bridge, calls } = await fixture(t, mailRpc);
  await assert.rejects(
    bridge.outlookReplyDraft({ messageId: "invented", body: "hi" }),
    /zuerst/,
  );
  await bridge.outlookInbox();
  const body = "Hallo\n\nIch akzeptiere.\n  Mit Grüßen";
  const result = await bridge.outlookReplyDraft({
    messageId: "EXACT-raw/ID+=",
    body,
  });
  assert.equal(result.created, true);
  assert.equal(result.sent, false);
  assert.deepEqual(
    calls.find((c) => c.args?.tool?.endsWith("create_reply_draft")).args
      .arguments,
    { message_id: "EXACT-raw/ID+=", comment: body, reply_all: false },
  );
  assert.ok(!calls.some((c) => c.args?.tool?.endsWith("send_email")));
});
test("unverified connector drafts and non-JSON answers fail closed", async (t) => {
  const { bridge } = await fixture(t, (m, a) =>
    m === "mcpServer/tool/call" && a.tool.endsWith("create_reply_draft")
      ? { structuredContent: { created: true, sent: false } }
      : mailRpc(m, a),
  );
  await bridge.outlookInbox();
  await assert.rejects(
    bridge.outlookReplyDraft({ messageId: "EXACT-raw/ID+=", body: "ok" }),
    /keinen bestätigten Entwurf/,
  );
  assert.throws(
    () =>
      connectorData({
        content: [{ type: "text", text: "I read all your emails." }],
      }),
    /keine strukturierten/,
  );
  assert.doesNotMatch(
    bridgeError("oops <html><style>html dump</style>"),
    /html dump/,
  );
});

test("catalog metadata never exposes an untrusted install URL", () => {
  const plugin = normalizePlugin(
    {
      name: "outlook-email",
      status: "AVAILABLE",
      release: { display_name: "Outlook Email" },
    },
    [
      {
        name: "Outlook Email",
        installUrl: "https://attacker.invalid/connect",
      },
    ],
  );
  assert.equal(plugin.installUrl, null);
});
