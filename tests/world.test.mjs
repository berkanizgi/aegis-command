import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  createWorld,
  normalizeSpokenPlace,
  publicWebUrl,
  weatherLabel,
} from "../server/world.mjs";
import { createService } from "../server/service.mjs";
import { installAudioPermissions } from "../electron/permissions.cjs";

delete process.env.OPENAI_API_KEY;
const response = (data) => new Response(JSON.stringify(data));
const dates = Array.from(
  { length: 10 },
  (_, i) => `2026-09-${String(i + 13).padStart(2, "0")}`,
);
function weatherData() {
  return {
    timezone: "Europe/Vienna",
    current: { temperature_2m: 18.1, time: `${dates[0]}T14:00` },
    daily: {
      time: dates,
      weather_code: dates.map(() => 61),
      temperature_2m_max: dates.map(() => 23.5),
      temperature_2m_min: dates.map(() => 12),
      precipitation_probability_max: dates.map(() => 80),
      precipitation_sum: dates.map(() => 5),
      wind_speed_10m_max: dates.map(() => 18),
    },
    hourly: {
      time: dates.flatMap((d) =>
        Array.from(
          { length: 24 },
          (_, i) => `${d}T${String(i).padStart(2, "0")}:00`,
        ),
      ),
      temperature_2m: Array(240).fill(18),
      precipitation_probability: Array(240).fill(70),
      precipitation: Array(240).fill(0.3),
    },
  };
}
function fixture(t, overrides = {}) {
  const calls = [],
    events = [];
  const world = createWorld({
    publish: (desk) => events.push(desk),
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      if (url.includes("geocoding-api"))
        return response({
          results: [
            {
              name: "Wien",
              country: "Österreich",
              admin1: "Wien",
              latitude: 48.2,
              longitude: 16.37,
              timezone: "Europe/Vienna",
            },
          ],
        });
      if (url.includes("open-meteo.com/v1/forecast"))
        return response(weatherData());
      throw Error(`Unexpected request ${url}`);
    },
    search: async (query) => ({
      query,
      sources: [
        {
          title: "Testquelle",
          url: "https://example.org/report",
          excerpt: "Untrusted test data",
        },
      ],
    }),
    ...overrides,
  });
  t.after(() => world.close());
  return { world, calls, events };
}

test("cheap local speech correction preserves Bregenz and Vorarlberg places", () => {
  assert.equal(normalizeSpokenPlace("Bregando"), "Bregenz, Österreich");
  assert.equal(normalizeSpokenPlace("Bregents"), "Bregenz, Österreich");
  assert.equal(normalizeSpokenPlace("Dornbirn"), "Dornbirn, Österreich");
  assert.equal(normalizeSpokenPlace("Salzburg"), "Salzburg");
});

test("weather opens a real-data desk with local forecast dates, ten days and selected hourly data", async (t) => {
  const { world, calls, events } = fixture(t);
  const r = await world.execute("world_weather", { location: "Wien", day: 7 });
  assert.equal(r.location.name, "Wien");
  assert.equal(r.selectedDay, 7);
  assert.equal(r.days[7].date, dates[7]);
  assert.equal(r.hours.length, 24);
  assert.equal(world.state().scene.data.hours.length, 240);
  assert.ok(r.hours.every((h) => h.time.startsWith(dates[7])));
  assert.equal(r.days[7].rainChance, 80);
  assert.equal(r.days[7].label, "Regen");
  assert.ok(calls[1].url.includes("timezone=auto"));
  assert.ok(calls[1].url.includes("forecast_days=10"));
  assert.equal(events[0].scene.status, "loading");
  assert.equal(events.at(-1).scene.status, "ready");
  assert.equal(
    (await world.execute("world_view", { action: "select_day", index: 1 })).day
      .date,
    dates[1],
  );
  await assert.rejects(
    world.execute("world_view", { action: "select_day", index: 15 }),
    /nicht verfügbar/,
  );
});

test("unknown place is not inferred from IP; selected place is reused and forecasts are cached", async (t) => {
  const { world, calls } = fixture(t);
  await assert.rejects(world.execute("world_weather", {}), /Für welchen Ort/);
  assert.equal(calls.length, 0);
  assert.equal(world.state().scene.status, "error");
  await world.execute("world_weather", { location: "Wien" });
  await world.execute("world_weather", { day: 2 });
  assert.equal(calls.length, 2);
  await world.execute("world_map", { zoom: 14 });
  assert.equal(calls.length, 2);
  assert.equal(world.state().scene.data.zoom, 14);
});

test("provider failures and missing values never become fake sunny or zero-valued results", async (t) => {
  assert.equal(weatherLabel(null), "Keine Wetterangabe");
  const { world } = fixture(t, {
    fetchImpl: async () => new Response("provider failure", { status: 503 }),
  });
  await assert.rejects(
    world.execute("world_weather", { location: "Wien" }),
    /503/,
  );
  assert.equal(world.state().scene.status, "error");
  assert.equal(world.state().scene.data, undefined);
});

test("closing the desk aborts a pending search and late data cannot reopen it", async (t) => {
  let complete, capturedSignal;
  const { world } = fixture(t, {
    search: (_, signal) => {
      capturedSignal = signal;
      return new Promise((resolve) => (complete = resolve));
    },
  });
  const pending = world.execute("world_search", { query: "test" });
  await world.execute("world_view", { action: "home" });
  assert.equal(capturedSignal.aborted, true);
  complete({ sources: [] });
  assert.equal((await pending).cancelled, true);
  assert.equal(world.state().visible, false);
});

test("mail briefing displays traceable evidence and never invents a public source", async (t) => {
  const { world } = fixture(t, {
    mail: async () => ({
      provider: "microsoft",
      providerLabel: "Microsoft Graph · Outlook",
      account: "person@example.com",
      messages: [
        {
          id: "mail-1",
          from: "Schule",
          subject: "Abgabe morgen",
          receivedAt: "2026-09-13T12:00:00Z",
          preview: "Bitte bis morgen einreichen.",
          unread: true,
          priority: "attention",
          score: 6,
          reasons: ["Noch ungelesen", "Aufmerksamkeitssignal"],
        },
      ],
      unreadCount: 1,
      attentionCount: 1,
      sources: [],
      note: "Heuristik",
    }),
  });
  const result = await world.execute("world_mail", {
    provider: "microsoft",
    limit: 12,
  });
  assert.equal(result.messages[0].subject, "Abgabe morgen");
  assert.equal(result.sources.length, 0);
  assert.equal(world.state().scene.kind, "mail");
  assert.match(world.state().scene.events.at(-1).label, /Belege/);
});

test("FX uses ECB rates, preserves quote timestamps and calculates change from actual observations", async (t) => {
  const { world, calls } = fixture(t, {
    fetchImpl: async (url) => {
      calls.push({ url });
      return response([
        { date: "2026-09-11", base: "EUR", quote: "USD", rate: 1.2 },
        { date: "2026-09-01", base: "EUR", quote: "USD", rate: 1 },
        { date: "2026-09-03", base: "EUR", quote: "GBP", rate: 0.9 },
      ]);
    },
  });
  const r = await world.execute("world_markets", {
    kind: "fx",
    base: "eur",
    quote: "usd",
    days: 30,
  });
  assert.equal(r.price, 1.2);
  assert.ok(Math.abs(r.change - 20) < 0.0001);
  assert.equal(r.priceAt, "2026-09-11");
  assert.equal(r.points.length, 2);
  assert.ok(calls[0].url.includes("providers=ECB"));
  assert.match(r.note, /kein Echtzeit/);
});

test("crypto sorts provider candles and retains the exchange ticker timestamp", async (t) => {
  const now = Date.now(),
    p1 = Math.floor((now - 6 * 86400000) / 1000),
    p2 = Math.floor((now - 3 * 86400000) / 1000);
  const { world } = fixture(t, {
    fetchImpl: async (url) =>
      response(
        url.includes("/candles")
          ? [
              [p2, 1, 4, 1, 3, 7],
              [p1, 1, 4, 1, 2, 7],
            ]
          : { price: "4", time: new Date(now).toISOString() },
      ),
  });
  const r = await world.execute("world_markets", {
    kind: "crypto",
    base: "BTC",
    quote: "EUR",
    days: 7,
  });
  assert.equal(r.price, 4);
  assert.equal(r.change, 100);
  assert.deepEqual(
    r.points.map((p) => p.value),
    [2, 3, 4],
  );
  assert.match(r.sources[0].title, /Coinbase/);
  assert.match(r.note, /Einzelbörse/);
});

test("source navigation is restricted to returned HTTPS sources; no arbitrary file or private URL", async (t) => {
  for (const value of [
    "file:///C:/secret",
    "javascript:alert(1)",
    "https://user:secret@example.org",
    "https://127.0.0.1/a",
    "http://example.org",
    "https://localhost/a",
    "https://thing.local",
    "https://[::1]/",
  ])
    assert.throws(() => publicWebUrl(value));
  assert.equal(
    publicWebUrl("https://example.org/page"),
    "https://example.org/page",
  );
  const opened = [];
  const { world } = fixture(t, {
    research: {
      open: async (url) => {
        opened.push(url);
        return { url, title: "Fixture", text: "Untrusted body" };
      },
      hide() {},
    },
  });
  await world.execute("world_search", { query: "test" });
  await assert.rejects(
    world.execute("world_view", { action: "open_source", index: 10 }),
    /Quellennummer/,
  );
  const page = await world.execute("world_view", {
    action: "open_source",
    index: 1,
  });
  assert.deepEqual(opened, ["https://example.org/report"]);
  assert.match(page.sourceType, /untrusted/);
  assert.equal(world.state().scene.browser.text, undefined);
});

test("microphone is auto-granted only to the trusted main frame; camera and foreign pages stay denied", () => {
  const wc = {},
    requestUrl = "file:///app/index.html";
  const handlers = installAudioPermissions(
    { setPermissionRequestHandler() {}, setPermissionCheckHandler() {} },
    (value) => value === wc,
    (url) => url === requestUrl,
  );
  const request = (sender, permission, details) => {
    let allowed;
    handlers.request(sender, permission, (value) => (allowed = value), details);
    return allowed;
  };
  for (let restart = 0; restart < 3; restart++)
    assert.equal(
      request(wc, "media", {
        mediaTypes: ["audio"],
        isMainFrame: true,
        requestingUrl: requestUrl,
      }),
      true,
    );
  assert.equal(
    handlers.check(wc, "media", "file://", {
      mediaType: "audio",
      isMainFrame: true,
      requestingUrl: requestUrl,
    }),
    true,
  );
  assert.equal(
    handlers.check(wc, "media", "file://", { mediaType: "video" }),
    false,
  );
  for (const details of [
    { mediaTypes: ["video"] },
    { mediaTypes: ["audio", "video"] },
    { mediaTypes: ["audio"], isMainFrame: false },
    { mediaTypes: ["audio"], requestingUrl: "https://example.org" },
    {},
  ])
    assert.equal(request(wc, "media", details), false);
  assert.equal(request({}, "media", { mediaTypes: ["audio"] }), false);
  assert.equal(request(wc, "geolocation", { mediaTypes: ["audio"] }), false);
});

test("service exposes visual tools to Realtime and routes them without text-model calls", async (t) => {
  const published = [],
    requests = [];
  const service = await createService({
    dataDir: await mkdtemp(path.join(os.tmpdir(), "aegis-world-")),
    desktop: { publishDesk: (value) => published.push(value) },
    fetchImpl: async (url, options) => {
      requests.push(url);
      if (url.includes("geocoding"))
        return response({
          results: [{ name: "Wien", latitude: 48.2, longitude: 16.37 }],
        });
      if (url.includes("/realtime/")) {
        const config = JSON.parse(options.body.get("session"));
        assert.ok(config.tools.some((t) => t.name === "world_weather"));
        assert.ok(config.tools.some((t) => t.name === "world_mail"));
        assert.ok(config.tools.some((t) => t.name === "world_view"));
        assert.equal(config.truncation.token_limits.post_instructions, 6000);
        assert.match(config.instructions, /Meister/);
        return new Response("answer");
      }
      throw Error("Unexpected paid request");
    },
  });
  t.after(() => service.close());
  await service.invoke("settings.update", { homeCity: "Wien" });
  await service.invoke("tools.execute", { name: "world_map", args: {} });
  assert.equal(requests.length, 1);
  assert.ok(published.length >= 3);
  const state = await service.invoke("state");
  assert.equal(state.desk.scene.kind, "map");
  assert.equal(
    (await service.invoke("app.overview")).liveDesk.homeCity,
    "Wien",
  );
  await assert.rejects(
    service.invoke("tools.execute", {
      name: "world_weather",
      args: { day: -1 },
    }),
    /ungültige Zahl/,
  );
  await assert.rejects(
    service.invoke("tools.execute", {
      name: "world_view",
      args: { action: "open_source", url: "https://example.org" },
    }),
    /unbekanntes Feld/,
  );
  await service.invoke("settings.update", {
    apiKey: "sk-test-not-real-live-desk",
  });
  await service.invoke("realtime.session", {
    sdp: "v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n",
  });
  await service.invoke("usage.realtime", {
    realtimeInputTextTokens: 100,
    realtimeInputAudioTokens: 40,
    realtimeCachedTokens: 80,
    realtimeOutputTextTokens: 20,
    realtimeOutputAudioTokens: 60,
  });
  const usage = (await service.invoke("state")).usage;
  assert.equal(usage.realtimeInputAudioTokens, 40);
  assert.equal(usage.realtimeOutputAudioTokens, 60);
  assert.equal(usage.realtimeCachedTokens, 80);
});

test("OpenAI web search must run and sources/citation offsets survive to the visual desk", async (t) => {
  let body;
  const service = await createService({
    dataDir: await mkdtemp(path.join(os.tmpdir(), "aegis-search-")),
    fetchImpl: async (_, options) => {
      body = JSON.parse(options.body);
      return response({
        output: [
          {
            type: "web_search_call",
            status: "completed",
            action: {
              sources: [{ title: "Source", url: "https://example.org" }],
            },
          },
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text: "Fact [source].",
                annotations: [
                  {
                    type: "url_citation",
                    start_index: 5,
                    end_index: 13,
                    title: "Source",
                    url: "https://example.org",
                  },
                ],
              },
            ],
          },
        ],
      });
    },
  });
  t.after(() => service.close());
  await service.invoke("settings.update", {
    apiKey: "sk-test-not-real-search",
  });
  const r = await service.invoke("tools.execute", {
    name: "world_search",
    args: { query: "fixture question" },
  });
  assert.equal(body.model, "gpt-4.1-mini");
  assert.equal(body.tool_choice, "required");
  assert.equal(body.store, false);
  assert.equal(body.max_output_tokens, 900);
  assert.equal(r.parts[0].citations[0].start, 5);
  assert.equal(r.sources[0].url, "https://example.org/");
  assert.equal(
    (await service.invoke("state")).desk.scene.data.provider,
    "OpenAI Websuche",
  );
});
