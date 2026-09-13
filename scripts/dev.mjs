import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const vite = spawn(
  process.execPath,
  [
    "node_modules/vite/bin/vite.js",
    "--configLoader",
    "runner",
    "--host",
    "127.0.0.1",
    "--port",
    "5173",
    "--strictPort",
  ],
  { cwd: root, stdio: "inherit" },
);
let electron;
const stop = () => {
  electron?.kill();
  vite.kill();
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
for (let i = 0; i < 60; i++) {
  try {
    const r = await fetch("http://127.0.0.1:5173");
    if (r.ok) break;
  } catch {}
  await new Promise((r) => setTimeout(r, 500));
}
electron = spawn(process.execPath, ["node_modules/electron/cli.js", "."], {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, AEGIS_DEV_URL: "http://127.0.0.1:5173" },
});
electron.on("exit", () => {
  vite.kill();
  process.exit();
});
