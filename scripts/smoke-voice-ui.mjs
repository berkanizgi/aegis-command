import { _electron as electron, expect } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Fully isolated UI simulation: fake mic/peer/provider; no live API calls.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const work = path.resolve(root, "../../work");
await fs.mkdir(work, { recursive: true });
const dataDir = await fs.mkdtemp(path.join(work, "aegis-voice-ui-"));
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
const watchdog = setTimeout(() => {
  console.error("Voice UI fixture exceeded its 90-second limit.");
  app.process().kill();
  process.exit(1);
}, 90000);
watchdog.unref();
try {
  const page = await app.firstWindow();
  await page.waitForFunction(() => window.aegis);
  await page.evaluate(() =>
    window.aegis.invoke("settings.update", {
      useSecondDisplay: false,
      launchFullscreen: false,
    }),
  );
  const state = await page.evaluate(() => window.aegis.invoke("state"));
  state.settings.hasApiKey = true;
  state.settings.voiceOnStartup = true;
  await app.evaluate(async ({ ipcMain, BrowserWindow, app }, state) => {
    const path = process.getBuiltinModule("node:path");
    const require = process
      .getBuiltinModule("node:module")
      .createRequire(path.join(app.getAppPath(), "package.json"));
    const { createAppControl, spokenNavigation } = require(
      path.join(app.getAppPath(), "server/app-control.mjs"),
    );
    globalThis.voiceTest = { state, sessions: 0, polls: 0, fail: false };
    const host = BrowserWindow.getAllWindows()[0];
    const control = createAppControl({
      desktop: {
        publishControl: (value) =>
          host.webContents.send("aegis:control", value),
      },
      overview: () => ({}),
      activity: async () => {},
    });
    ipcMain.removeHandler("aegis:invoke");
    ipcMain.handle("aegis:invoke", (_, operation, payload) => {
      const test = globalThis.voiceTest;
      if (operation === "app.view" || operation === "app.control.ack") {
        test.view = payload;
        return operation === "app.view"
          ? control.update(payload)
          : control.ack(payload);
      }
      if (operation === "startup.briefing") return { status: "disabled" };
      if (operation === "plugins.catalog") return { plugins: [] };
      if (operation === "app.voice.navigate") {
        const target = spokenNavigation(payload.text);
        return target
          ? control.execute({ action: "navigate", target })
          : { handled: false };
      }
      if (operation === "state") {
        test.polls++;
        return test.state;
      }
      if (operation === "realtime.session") {
        test.sessions++;
        if (test.fail) throw Error("Simulierter Verbindungsfehler");
        return {
          sdp: "test-answer",
          greetingInstructions: "Begrüße Boss aus dem lokalen Appstatus.",
        };
      }
      if (operation === "app.overview")
        return { app: "AEGIS", pendingApprovals: 0 };
      if (operation === "settings.update")
        return Object.assign(test.state.settings, payload);
      throw Error(`Unexpected simulated operation: ${operation}`);
    });
  }, state);
  await page.addInitScript(() => {
    window.voiceEvents = [];
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: async () => ({
          getTracks: () => [{ stop() {} }],
          getAudioTracks: () => [],
        }),
      },
    });
    HTMLMediaElement.prototype.play = async function () {};
    window.AudioContext = class {
      createAnalyser() {
        return {
          fftSize: 256,
          getByteTimeDomainData: (samples) =>
            samples.fill(150 + Math.sin(Date.now() / 80) * 8),
          disconnect() {},
        };
      }
      createMediaStreamSource() {
        return { connect() {}, disconnect() {} };
      }
      async resume() {}
      async close() {}
    };
    window.RTCPeerConnection = class {
      addTrack() {}
      close() {
        this.channel.readyState = "closed";
      }
      createDataChannel() {
        const channel = (this.channel = {
          readyState: "connecting",
          close() {
            this.readyState = "closed";
          },
          send(text) {
            const data = JSON.parse(text);
            window.voiceEvents.push(data);
            if (data.type === "response.create") {
              channel.onmessage({
                data: JSON.stringify({ type: "response.created" }),
              });
              channel.onmessage({
                data: JSON.stringify({ type: "output_audio_buffer.started" }),
              });
              channel.onmessage({
                data: JSON.stringify({
                  type: "response.output_audio_transcript.done",
                  transcript: "Testbegrüßung. Was steht an, Boss?",
                }),
              });
              channel.onmessage({
                data: JSON.stringify({ type: "response.done" }),
              });
            }
          },
        });
        window.voiceChannel = channel;
        return channel;
      }
      async createOffer() {
        return {
          type: "offer",
          sdp: "v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n",
        };
      }
      async setLocalDescription() {}
      async setRemoteDescription() {
        this.ontrack?.({ streams: [new MediaStream()] });
        this.channel.readyState = "open";
        this.channel.onopen();
        this.channel.onmessage({
          data: JSON.stringify({ type: "session.created" }),
        });
      }
    };
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.reload();
  await expect(page.locator(".orb-canvas")).toHaveAttribute(
    "data-voice-status",
    "speaking",
  );
  await expect(page.locator("#aegis-conversation")).toHaveCount(0);
  await expect(page.getByLabel("Nachricht an Aegis")).toHaveCount(0);
  assert.equal(
    await page.evaluate(
      () =>
        window.voiceEvents.filter((e) => e.type === "response.create").length,
    ),
    1,
  );
  await page.screenshot({
    path: path.join(root, "../Aegis-Voice-First.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Chat anzeigen", exact: true })
    .click();
  await expect(page.locator("#aegis-conversation")).toContainText(
    "Testbegrüßung",
  );
  await expect(page.locator(".orb-canvas")).toBeVisible();
  await page
    .getByRole("button", { name: "Chat ausblenden", exact: true })
    .click();
  await expect(page.locator("#aegis-conversation")).toHaveCount(0);
  await page.evaluate(() =>
    window.voiceChannel.onmessage({
      data: JSON.stringify({
        type: "conversation.item.input_audio_transcription.completed",
        transcript: "Geh mal in die Einstellungen",
      }),
    }),
  );
  await expect(page.locator("h1")).toContainText("Systemeinstellungen");
  await expect
    .poll(() => app.evaluate(() => globalThis.voiceTest.view?.voiceStatus))
    .toBe("speaking");
  assert.equal(await app.evaluate(() => globalThis.voiceTest.sessions), 1);
  await page.evaluate(() =>
    window.voiceChannel.onmessage({
      data: JSON.stringify({
        type: "conversation.item.input_audio_transcription.completed",
        transcript: "Aegis, öffne die Plugins",
      }),
    }),
  );
  await expect(page.locator(".plugin-hub")).toBeVisible();
  await expect
    .poll(() => app.evaluate(() => globalThis.voiceTest.view?.voiceStatus))
    .toBe("speaking");
  assert.equal(await app.evaluate(() => globalThis.voiceTest.sessions), 1);
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].webContents.send("aegis:control", {
      id: "test-home",
      action: "navigate",
      target: "command",
    }),
  );
  await expect(page.locator(".orb-canvas")).toHaveAttribute(
    "data-voice-status",
    "speaking",
  );
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].webContents.send("aegis:control", {
      id: "test-stop",
      action: "stop_voice",
    }),
  );
  await expect(page.locator(".orb-canvas")).toHaveAttribute(
    "data-voice-status",
    "idle",
  );
  await expect
    .poll(() => app.evaluate(() => globalThis.voiceTest.polls))
    .toBeGreaterThan(2);
  assert.equal(await app.evaluate(() => globalThis.voiceTest.sessions), 1);
  // Disabling startup must survive refresh; a failed startup must not retry forever.
  await app.evaluate(() => {
    globalThis.voiceTest.state.settings.voiceOnStartup = false;
    globalThis.voiceTest.sessions = 0;
    globalThis.voiceTest.polls = 0;
  });
  await page.reload();
  await expect
    .poll(() => app.evaluate(() => globalThis.voiceTest.polls), {
      timeout: 12000,
    })
    .toBeGreaterThan(2);
  assert.equal(await app.evaluate(() => globalThis.voiceTest.sessions), 0);
  await app.evaluate(() => {
    globalThis.voiceTest.state.settings.voiceOnStartup = true;
    globalThis.voiceTest.fail = true;
    globalThis.voiceTest.polls = 0;
  });
  await page.reload();
  await expect(page.locator(".orb-canvas")).toHaveAttribute(
    "data-voice-status",
    "error",
  );
  await expect
    .poll(() => app.evaluate(() => globalThis.voiceTest.polls), {
      timeout: 12000,
    })
    .toBeGreaterThan(2);
  assert.equal(await app.evaluate(() => globalThis.voiceTest.sessions), 1);
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      simulated: true,
      automaticGreeting: true,
      transcriptOptIn: true,
      orbDuringSpeech: true,
      appControlStopsVoice: true,
      navigationPreservesVoice: true,
      noRetryLoop: true,
      startupOffHonored: true,
    }),
  );
} finally {
  await app.close();
  clearTimeout(watchdog);
}
