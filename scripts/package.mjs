import { cp, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Package an explicit runtime allowlist, not arbitrary files in the checkout.
// Apart from avoiding unrelated files, this handles Windows directories with
// ill-formed Unicode names which Node cannot stat when scanning a whole root.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cache = path.join(root, ".cache");
await mkdir(cache, { recursive: true });
const stage = await mkdtemp(path.join(cache, "package-app-"));
const manifest = JSON.parse(
  await readFile(path.join(root, "package.json"), "utf8"),
);
await Promise.all(
  ["dist", "server", "electron"].map((name) =>
    cp(path.join(root, name), path.join(stage, name), { recursive: true }),
  ),
);
// Renderer dependencies are bundled by Vite; the main process uses built-ins only.
const staged = Object.fromEntries(
  ["name", "version", "private", "author", "type", "description", "main"].map(
    (key) => [key, manifest[key]],
  ),
);
staged.build = {
  ...manifest.build,
  directories: { output: path.join(root, "release") },
  electronDist: path.join(root, "node_modules", "electron", "dist"),
  electronVersion: JSON.parse(
    await readFile(
      path.join(root, "node_modules", "electron", "package.json"),
      "utf8",
    ),
  ).version,
  win: {
    ...manifest.build.win,
    icon: path.join(root, manifest.build.win.icon),
  },
};
await writeFile(
  path.join(stage, "package.json"),
  JSON.stringify(staged, null, 2),
);
const require = createRequire(import.meta.url);
const cli = path.join(
  path.dirname(require.resolve("electron-builder/package.json")),
  "cli.js",
);
const child = spawn(
  process.execPath,
  [cli, "--projectDir", stage, "--win", "portable", "--publish", "never"],
  { cwd: stage, windowsHide: true, stdio: "inherit", env: process.env },
);
child.once("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.once("exit", (code) => {
  process.exitCode = code ?? 1;
});
