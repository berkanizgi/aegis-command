const path = require("node:path");
const { access } = require("node:fs/promises");
const { spawn } = require("node:child_process");

// No arbitrary command strings, shell, user arguments, or executable search on PATH.
async function openApplication(
  name,
  { env = process.env, spawnImpl = spawn, accessImpl = access } = {},
) {
  const roots = [
    env.PROGRAMFILES,
    env["PROGRAMFILES(X86)"],
    env.LOCALAPPDATA,
  ].filter(Boolean);
  const win = env.SystemRoot || "C:\\Windows";
  const choices = {
    chrome: roots.map((root) =>
      path.join(root, "Google", "Chrome", "Application", "chrome.exe"),
    ),
    edge: roots.map((root) =>
      path.join(root, "Microsoft", "Edge", "Application", "msedge.exe"),
    ),
    notepad: [path.join(win, "System32", "notepad.exe")],
    calculator: [path.join(win, "System32", "calc.exe")],
  };
  if (!Object.hasOwn(choices, name))
    throw new Error("Anwendung nicht freigegeben.");
  for (const file of choices[name]) {
    try {
      await accessImpl(file);
    } catch {
      continue;
    }
    return new Promise((resolve, reject) => {
      const process = spawnImpl(file, [], {
        shell: false,
        windowsHide: false,
        stdio: "ignore",
        detached: true,
      });
      process.once("error", reject);
      process.once("spawn", () => {
        process.unref();
        resolve({
          launched: true,
          application: name,
          message:
            "Start an Windows übergeben. Kein Zugriff auf Browserinhalte oder Webseiten bestätigt.",
        });
      });
    });
  }
  throw new Error(
    `${name} wurde an den üblichen Installationsorten nicht gefunden.`,
  );
}
module.exports = { openApplication };
