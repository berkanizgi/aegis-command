import { test } from "node:test";
import assert from "node:assert/strict";
import { createStartupBriefing } from "../server/startup-briefing.mjs";
test("startup is single-flight read-only and bounds the data sent to the voice model", async () => {
  let reads = 0;
  const b = createStartupBriefing({
    enabled: () => true,
    sanitize: String,
    read: async () => {
      reads++;
      return {
        displayed: true,
        fetchedAt: "now",
        messages: [{ preview: "private full body" }],
        unreadCount: 1,
        attentionCount: 1,
        summary: { todayCount: 1, topSubjects: ["a", "b", "c", "d"] },
      };
    },
  });
  const [a, c] = await Promise.all([b.run(), b.run()]);
  await b.run();
  assert.equal(reads, 1);
  assert.deepEqual(a, c);
  assert.equal(a.status, "ready");
  assert.equal(a.topSubjects.length, 3);
  assert.equal(a.checkedMessages, 1);
  assert.ok(!JSON.stringify(a).includes("private full body"));
});
test("disabled, failed or superseded startup cannot claim a mailbox was checked", async () => {
  const disabled = createStartupBriefing({
    enabled: () => false,
    read: () => {
      throw Error("Must not read");
    },
    sanitize: String,
  });
  assert.equal((await disabled.run()).status, "disabled");
  const failed = createStartupBriefing({
    enabled: () => true,
    read: () => {
      throw Error("secret");
    },
    sanitize: () => "sanitized",
  });
  assert.deepEqual(await failed.run(), {
    status: "unavailable",
    error: "sanitized",
  });
  const cancelled = createStartupBriefing({
    enabled: () => true,
    read: () => ({ cancelled: true }),
    sanitize: String,
  });
  assert.equal((await cancelled.run()).status, "cancelled");
});
