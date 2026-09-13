import { test } from "node:test";
import assert from "node:assert/strict";
import { createConnectors } from "../server/connectors.mjs";

const json = (value, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
function manager(fetchImpl, desktop = {}) {
  const secrets = new Map();
  const instance = createConnectors({
    getSecret: (k) => secrets.get(k) || "",
    setSecret: async (k, v) => {
      if (v) secrets.set(k, v);
      else secrets.delete(k);
    },
    fetchImpl,
    desktop,
  });
  return { ...instance, secrets };
}
async function connectGithub(m) {
  await m.configure("github", { token: "fake-token" });
  await m.test("github");
}
function oauthToken(m, id) {
  for (const [field, value] of Object.entries({
    clientId: "test-client",
    accessToken: "fake-access",
    refreshToken: "fake-refresh",
    expiresAt: String(Date.now() + 3600000),
    verified: "true",
  }))
    m.secrets.set(`connector.${id}.${field}`, value);
}

test("tokens do not mean a connection until the provider confirms it", async () => {
  const m = manager(async () => json({ login: "qa" }));
  await m.configure("github", { token: "fake-token" });
  assert.equal(m.list()[0].configured, true);
  assert.equal(m.list()[0].connected, false);
  assert.equal(m.tools().length, 0);
  await m.test("github");
  assert.equal(m.list()[0].connected, true);
  assert.equal(m.tools().length, 3);
  assert.ok(!JSON.stringify(m.list()).includes("fake-token"));
  assert.equal(
    m.tools().find((t) => t.name === "github_create_issue").risk,
    "write",
  );
  await m.disconnect("github");
  assert.equal(m.list()[0].connected, false);
  assert.equal(m.secrets.size, 0);
});
test("API failure never fakes connection and does not expose provider error bodies", async () => {
  const m = manager(async () =>
    json({ message: "secret server error fake-token" }, 401),
  );
  await m.configure("github", { token: "fake-token" });
  await assert.rejects(
    () => m.test("github"),
    (error) =>
      /401/.test(error.message) && !error.message.includes("fake-token"),
  );
  assert.equal(m.list()[0].connected, false);
});
test("GitHub reads and creates with verification without executing shell commands", async () => {
  const requests = [];
  const m = manager(async (url, options) => {
    requests.push({ url, options });
    if (url.endsWith("/user")) return json({ login: "qa" });
    if (options.method === "POST")
      return json({
        number: 7,
        title: "Test",
        html_url: "https://github.com/test/project/issues/7",
      });
    return json({ number: 7, title: "Test" });
  });
  await connectGithub(m);
  const result = await m.execute("github_create_issue", {
    owner: "test",
    repo: "project",
    title: "Test",
    body: "Body",
  });
  assert.equal(result.verified, true);
  assert.equal(requests.filter((r) => r.options.method === "POST").length, 1);
  assert.ok(requests.every((r) => r.options.redirect === "error"));
  await assert.rejects(
    () => m.execute("github_issues", { owner: "../escape", repo: "project" }),
    /ungültiger/,
  );
});
test("a successful write plus failed read-back is explicitly unverified", async () => {
  let posted = false;
  const m = manager(async (url, options) => {
    if (url.endsWith("/user")) return json({ login: "qa" });
    if (options.method === "POST") {
      posted = true;
      return json({ number: 9, title: "Task" });
    }
    return json({}, 503);
  });
  await connectGithub(m);
  const result = await m.execute("github_create_issue", {
    owner: "test",
    repo: "project",
    title: "Task",
    body: "Body",
  });
  assert.equal(posted, true);
  assert.equal(result.created, true);
  assert.equal(result.verified, false);
  assert.match(result.verification, /erneut gelesen/);
});
test("Home Assistant does not accept unencrypted remote token destinations or locks", async () => {
  const m = manager(async (url) =>
    url.endsWith("/api/")
      ? json({ message: "API running" })
      : json({ entity_id: "light.desk", state: "on" }),
  );
  await assert.rejects(
    () =>
      m.configure("homeassistant", {
        url: "http://example.com",
        token: "secret",
      }),
    /HTTP/,
  );
  await assert.rejects(() =>
    m.configure("homeassistant", {
      url: "http://169.254.169.254",
      token: "secret",
    }),
  );
  await m.configure("homeassistant", {
    url: "http://127.0.0.1:8123",
    token: "secret",
  });
  await m.test("homeassistant");
  await assert.rejects(
    () =>
      m.execute("home_control", {
        entityId: "lock.front_door",
        service: "turn_on",
      }),
    /konkrete/,
  );
  const result = await m.execute("home_control", {
    entityId: "light.desk",
    service: "turn_on",
  });
  assert.equal(result.verified, true);
  await m.configure("homeassistant", { url: "https://new.example.com" });
  assert.equal(m.secrets.has("connector.homeassistant.token"), false);
});
test("Gmail draft is UTF-8 encoded, not sent; headers reject injection", async () => {
  let sent;
  const m = manager(async (url, options) => {
    if (options.method === "POST") {
      sent = JSON.parse(options.body);
      assert.ok(url.endsWith("/drafts"));
      return json({ id: "draft1" });
    }
    return json({ id: "draft1" });
  });
  oauthToken(m, "google");
  const r = await m.execute("google_mail_draft", {
    to: "qa@example.com",
    subject: "Grüße",
    body: "Für morgen",
  });
  assert.equal(r.sent, false);
  assert.equal(r.verified, true);
  const mime = Buffer.from(sent.message.raw, "base64url").toString();
  assert.ok(mime.includes(Buffer.from("Grüße").toString("base64")));
  await assert.rejects(
    () =>
      m.execute("google_mail_draft", {
        to: "qa@example.com",
        subject: "Hello\r\nBcc:bad@example.com",
        body: "text",
      }),
    /Zeilenumbrüche/,
  );
});
test("calendar creation requires timezone, ordered dates and no arbitrary attendees", async () => {
  const m = manager(async () => json({}));
  oauthToken(m, "google");
  await assert.rejects(
    () =>
      m.execute("google_calendar_create", {
        title: "Test",
        start: "2026-10-01T10:00:00",
        end: "2026-10-01T11:00:00Z",
      }),
    /Zeitzone/,
  );
  await assert.rejects(
    () =>
      m.execute("google_calendar_create", {
        title: "Test",
        start: "2026-10-01T12:00:00Z",
        end: "2026-10-01T11:00:00Z",
      }),
    /nach start/,
  );
  await assert.rejects(
    () =>
      m.execute("google_calendar_create", {
        title: "Test",
        start: "2026-10-01T10:00:00Z",
        end: "2026-10-01T11:00:00Z",
        attendees: ["stranger@example.com"],
      }),
    /Unbekannte/,
  );
});
test("Microsoft drafts never call send and verify isDraft", async () => {
  const urls = [];
  const m = manager(async (url, options) => {
    urls.push(url);
    return json(
      options.method === "POST"
        ? { id: "draft-ms", webLink: "https://outlook.office.com" }
        : { id: "draft-ms", subject: "Test", isDraft: true },
    );
  });
  oauthToken(m, "microsoft");
  const r = await m.execute("microsoft_mail_draft", {
    to: "qa@example.com",
    subject: "Test",
    body: "Draft",
  });
  assert.equal(r.sent, false);
  assert.equal(r.verified, true);
  assert.ok(urls.every((url) => !url.includes("sendMail")));
});
test("expired OAuth tokens refresh once for concurrent requests", async () => {
  let refreshes = 0;
  const m = manager(async (url) => {
    if (url.includes("/token")) {
      refreshes++;
      return json({ access_token: "new-token", expires_in: 3600 });
    }
    return json({ items: [] });
  });
  oauthToken(m, "google");
  m.secrets.set("connector.google.expiresAt", "0");
  await Promise.all([
    m.execute("google_calendar", {}),
    m.execute("google_calendar", {}),
  ]);
  assert.equal(refreshes, 1);
  assert.equal(m.secrets.get("connector.google.accessToken"), "new-token");
});
test("Google OAuth uses loopback, PKCE and one-time state; wrong state cannot bind an account", async (t) => {
  let exchanged = 0;
  const m = manager(async () => {
    exchanged++;
    return json({ access_token: "google-test", expires_in: 3600 });
  });
  t.after(() => m.close());
  await m.configure("google", {
    clientId: "client.apps.googleusercontent.com",
  });
  const auth = await m.connect("google");
  const url = new URL(auth.url);
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  const callback = new URL(url.searchParams.get("redirect_uri"));
  assert.equal(callback.hostname, "127.0.0.1");
  assert.equal(m.list().find((c) => c.id === "google").connected, false);
  callback.searchParams.set("code", "example-code");
  callback.searchParams.set("state", "wrong");
  let res = await fetch(callback);
  assert.equal(res.status, 400);
  assert.equal(exchanged, 0);
  callback.searchParams.set("state", url.searchParams.get("state"));
  res = await fetch(callback);
  assert.equal(res.status, 200);
  assert.equal(exchanged, 1);
  assert.equal(m.list().find((c) => c.id === "google").connected, true);
});
test("Microsoft device authorization displays code without leaking device token", async (t) => {
  const m = manager(async (url) =>
    json(
      url.includes("/devicecode")
        ? {
            device_code: "secret-device",
            user_code: "ABCD-1234",
            verification_uri: "https://microsoft.com/devicelogin",
            expires_in: 900,
            interval: 5,
          }
        : { access_token: "ms-token", expires_in: 3600 },
    ),
  );
  t.after(() => m.close());
  await m.configure("microsoft", { clientId: "client", tenantId: "common" });
  const auth = await m.connect("microsoft");
  assert.equal(auth.userCode, "ABCD-1234");
  assert.ok(!JSON.stringify(auth).includes("secret-device"));
  const result = await m.test("microsoft");
  assert.equal(result.connected, true);
});
test("Tavily exposes sourced excerpts and not executable page content", async () => {
  const m = manager(async () =>
    json({
      query: "test",
      results: [
        {
          title: "Official source",
          url: "https://example.com",
          content: "Excerpt",
          score: 0.9,
        },
      ],
    }),
  );
  await m.configure("tavily", { apiKey: "fake-search-key" });
  await m.test("tavily");
  const r = await m.execute("web_search", { query: "test" });
  assert.equal(r.sourceType, "untrusted_external_content");
  assert.equal(r.sources[0].url, "https://example.com");
});
