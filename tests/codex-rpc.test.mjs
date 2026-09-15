import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough, Writable } from "node:stream";
import { createCodexRpc } from "../server/codex-rpc.mjs";

test("concurrent callers wait for initialize; server requests cannot steal response IDs", async (t) => {
  const packets = [];
  let initialize, proc;
  const rpc = createCodexRpc({
    home: "test-home",
    cwd: process.cwd(),
    resolveExecutable: async () => "test-codex",
    spawnImpl: () => {
      proc = new EventEmitter();
      proc.stdout = new PassThrough();
      proc.stderr = new PassThrough();
      proc.kill = () => {
        proc.emit("exit", 0);
      };
      const respond = (p) => proc.stdout.write(JSON.stringify(p) + "\n");
      proc.stdin = new Writable({
        write(chunk, encoding, done) {
          const p = JSON.parse(String(chunk));
          packets.push(p);
          if (p.method === "initialize")
            initialize = () =>
              respond({ id: p.id, result: { userAgent: "test" } });
          else if (p.method === "account/read") {
            respond({
              id: p.id,
              method: "mcpServer/elicitation/request",
              params: { mode: "url" },
            });
            respond({ id: p.id, result: { account: { type: "chatgpt" } } });
          } else if (p.method === "app/installed")
            respond({ id: p.id, result: { apps: [] } });
          done();
        },
      });
      return proc;
    },
  });
  t.after(() => rpc.close());
  const first = rpc.request("account/read"),
    second = rpc.request("app/installed");
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(
    packets.map((p) => p.method),
    ["initialize"],
  );
  initialize();
  const [account, apps] = await Promise.all([first, second]);
  assert.equal(account.account.type, "chatgpt");
  assert.deepEqual(apps.apps, []);
  assert.ok(packets.some((p) => p.result?.action === "decline"));
  assert.equal(packets.filter((p) => p.method === "initialize").length, 1);
  assert.equal(rpc.online, true);
});
