import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizePlugin } from "../server/codex-bridge.mjs";

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
  assert.equal(plugin.connected, true);
  assert.equal(plugin.featured, true);
  assert.match(plugin.installUrl, /^https:\/\/chatgpt\.com\/apps\//);
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
