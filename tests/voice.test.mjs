import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

// Exercise the production TypeScript controller with isolated browser doubles.
// No microphone, network, real credentials or paid provider calls.
const source = await readFile(
  new URL("../src/lib/voice.ts", import.meta.url),
  "utf8",
);
const { outputText } = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
});
const { createVoiceSession } = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`
);

function fixture(t, overrides = {}) {
  const sent = [],
    calls = [],
    statuses = [],
    errors = [],
    levels = [],
    transcripts = [];
  let peer,
    stopped = 0,
    contextClosed = 0,
    frames = 0;
  const track = {
    enabled: true,
    stop: () => {
      stopped++;
    },
  };
  const stream = { getTracks: () => [track], getAudioTracks: () => [track] };
  const channel = {
    readyState: "connecting",
    send: (text) => sent.push(JSON.parse(text)),
    close() {
      this.readyState = "closed";
    },
  };
  const globals = {
    navigator: { mediaDevices: { getUserMedia: async () => stream } },
    document: {
      body: { appendChild() {} },
      createElement: () => ({ play: async () => {}, pause() {}, remove() {} }),
    },
    requestAnimationFrame: () => ++frames,
    cancelAnimationFrame: () => {},
    AudioContext: class {
      createAnalyser() {
        return {
          fftSize: 256,
          getByteTimeDomainData: (samples) => samples.fill(150),
          disconnect() {},
        };
      }
      createMediaStreamSource() {
        return { connect() {}, disconnect() {} };
      }
      async resume() {}
      async close() {
        contextClosed++;
      }
    },
    RTCPeerConnection: class {
      constructor() {
        peer = this;
      }
      addTrack() {}
      createDataChannel() {
        return channel;
      }
      async createOffer() {
        return overrides.offer
          ? overrides.offer()
          : {
              type: "offer",
              sdp: "v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n",
            };
      }
      async setLocalDescription() {}
      async setRemoteDescription() {}
      close() {
        this.connectionState = "closed";
      }
    },
  };
  const saved = Object.fromEntries(
    Object.keys(globals).map((key) => [
      key,
      Object.getOwnPropertyDescriptor(globalThis, key),
    ]),
  );
  for (const [key, value] of Object.entries(globals))
    Object.defineProperty(globalThis, key, {
      value,
      configurable: true,
      writable: true,
    });
  const session = createVoiceSession({
    invoke: async (operation, payload) => {
      calls.push({ operation, payload });
      return operation === "realtime.session"
        ? {
            sdp: "answer",
            greetingInstructions:
              "Begrüße Boss. Keine externen Prüfungen behaupten.",
          }
        : { app: "AEGIS", pendingApproval: true };
    },
    onStatus: (s) => statuses.push(s),
    onError: (e) => errors.push(e),
    onAudioLevel: (v) => levels.push(v),
    onTranscript: (...args) => transcripts.push(args),
  });
  t.after(() => {
    session.stop();
    for (const key of Object.keys(globals)) {
      if (saved[key]) Object.defineProperty(globalThis, key, saved[key]);
      else delete globalThis[key];
    }
  });
  return {
    session,
    sent,
    calls,
    statuses,
    errors,
    levels,
    transcripts,
    get peer() {
      return peer;
    },
    get stopped() {
      return stopped;
    },
    get contextClosed() {
      return contextClosed;
    },
    open: () => {
      channel.readyState = "open";
      channel.onopen();
    },
    emit: (data) => channel.onmessage({ data: JSON.stringify(data) }),
  };
}

test("voice greets once after the session and channel are ready, without fake user messages", async (t) => {
  const f = fixture(t);
  await f.session.start();
  await f.emit({ type: "session.created" });
  assert.equal(f.sent.length, 0);
  f.open();
  await f.emit({ type: "session.created" });
  await f.session.start();
  assert.equal(f.calls.length, 1);
  assert.equal(f.sent.length, 1);
  assert.equal(f.sent[0].type, "response.create");
  assert.equal(f.sent[0].response.tool_choice, "none");
  assert.match(f.sent[0].response.instructions, /Begrüße/);
});
test("voice stays speaking until playback ends, not merely model generation", async (t) => {
  const f = fixture(t);
  await f.session.start();
  f.open();
  await f.emit({ type: "output_audio_buffer.started" });
  await f.emit({ type: "response.done" });
  assert.equal(f.statuses.at(-1), "speaking");
  await f.emit({ type: "output_audio_buffer.stopped" });
  assert.equal(f.statuses.at(-1), "listening");
});
test("remote audio drives the meter and stop releases tracks and AudioContext", async (t) => {
  const f = fixture(t);
  await f.session.start();
  f.peer.ontrack({ streams: [{}] });
  assert.ok(f.levels.at(-1) > 0);
  f.session.stop();
  assert.equal(f.stopped, 1);
  assert.equal(f.contextClosed, 1);
  assert.equal(f.levels.at(-1), 0);
  const before = f.statuses.length;
  f.open();
  await f.emit({ type: "output_audio_buffer.started" });
  assert.equal(f.statuses.length, before);
});
test("voice status reads are local while actions retain the existing approval route", async (t) => {
  const f = fixture(t);
  await f.session.start();
  f.open();
  await f.emit({
    type: "response.function_call_arguments.done",
    name: "aegis_status",
    call_id: "s",
    arguments: "{}",
  });
  assert.equal(f.calls.at(-1).operation, "app.overview");
  await f.emit({
    type: "response.function_call_arguments.done",
    name: "aegis_command",
    call_id: "c",
    arguments: '{"message":"Erstelle einen Entwurf"}',
  });
  assert.equal(f.calls.at(-1).operation, "chat");
  assert.ok(f.sent.some((e) => e.item?.output?.includes("pendingApproval")));
  const count = f.calls.length;
  await f.emit({
    type: "response.function_call_arguments.done",
    name: "aegis_command",
    call_id: "c",
    arguments: "{}",
  });
  assert.equal(f.calls.length, count);
});
test("stopping during offer creation prevents late provider calls", async (t) => {
  let resolve;
  const f = fixture(t, {
    offer: () =>
      new Promise((r) => {
        resolve = r;
      }),
  });
  const pending = f.session.start();
  await new Promise((r) => setImmediate(r));
  f.session.stop();
  resolve({ type: "offer", sdp: "unused" });
  await pending;
  assert.equal(f.calls.length, 0);
  assert.equal(f.errors.length, 0);
});

test("visual voice tools route directly and wait for the generating response before continuing", async (t) => {
  const f = fixture(t);
  await f.session.start();
  f.open();
  await f.emit({ type: "response.created" });
  await f.emit({
    type: "response.function_call_arguments.done",
    name: "world_weather",
    call_id: "weather-1",
    arguments: '{"location":"Wien","day":7}',
  });
  assert.deepEqual(f.calls.at(-1), {
    operation: "tools.execute",
    payload: { name: "world_weather", args: { location: "Wien", day: 7 } },
  });
  await f.emit({
    type: "response.function_call_arguments.done",
    name: "world_view",
    call_id: "view-1",
    arguments: '{"action":"open"}',
  });
  assert.equal(f.sent.filter((e) => e.type === "response.create").length, 0);
  assert.equal(
    f.sent.filter((e) => e.type === "conversation.item.create").length,
    2,
  );
  await f.emit({ type: "response.done" });
  assert.equal(f.sent.filter((e) => e.type === "response.create").length, 1);
  assert.equal(
    f.calls.some((c) => c.operation === "chat"),
    false,
  );
});

test("voice routes inbox directly and records provider token details once", async (t) => {
  const f = fixture(t);
  await f.session.start();
  f.open();
  await f.emit({
    type: "response.function_call_arguments.done",
    name: "world_mail",
    call_id: "mail-1",
    arguments: '{"provider":"microsoft","limit":12}',
  });
  assert.deepEqual(f.calls.at(-1), {
    operation: "tools.execute",
    payload: {
      name: "world_mail",
      args: { provider: "microsoft", limit: 12 },
    },
  });
  const done = {
    type: "response.done",
    response: {
      id: "response-usage-1",
      usage: {
        input_token_details: {
          text_tokens: 120,
          audio_tokens: 30,
          cached_tokens: 80,
        },
        output_token_details: { text_tokens: 18, audio_tokens: 55 },
      },
    },
  };
  await f.emit(done);
  await f.emit(done);
  assert.equal(
    f.calls.filter((call) => call.operation === "usage.realtime").length,
    1,
  );
  assert.equal(
    f.calls.find((call) => call.operation === "usage.realtime").payload
      .realtimeOutputAudioTokens,
    55,
  );
});
