import { spawn } from "node:child_process";
import { access, readdir, stat } from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";

export function bridgeError(value) {
  const message = String(
    value?.message || value || "Plugin-Verbindung fehlgeschlagen.",
  );
  if (/403|Forbidden/i.test(message))
    return "OpenAI verweigert diesen Abruf (HTTP 403). Das ist kein Hotmail-Passwortfehler. Prüfe die ChatGPT-Anmeldung in Codex und aktualisiere anschließend den Status. Eine Browser-Anmeldung allein bestätigt noch keinen Zugriff aus Aegis.";
  return (
    message
      .split(/<!doctype|<html|<style|<script/i)[0]
      .replace(/<[^>]*>/g, " ")
      .replace(/[\u0000-\u001f]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 500) ||
    "Der Anbieter hat eine unerwartete Webseite statt einer API-Antwort geliefert."
  );
}

export function createCodexRpc({
  home,
  cwd,
  onChange = () => {},
  spawnImpl = spawn,
  resolveExecutable,
}) {
  let child,
    starting,
    ready = false,
    nextId = 0,
    generation = 0;
  const pending = new Map();
  async function executable() {
    const exists = async (file) => {
      try {
        await access(file);
        return true;
      } catch {
        return false;
      }
    };
    const configured = process.env.AEGIS_CODEX_PATH;
    if (configured && path.isAbsolute(configured) && (await exists(configured)))
      return configured;
    // Prefer the installed desktop runtime, ordered by modification time (hashes are not versions).
    if (process.platform === "win32" && process.env.LOCALAPPDATA) {
      const root = path.join(
        process.env.LOCALAPPDATA,
        "OpenAI",
        "Codex",
        "bin",
      );
      const candidates = [];
      for (const dir of await readdir(root, { withFileTypes: true }).catch(
        () => [],
      )) {
        const file = path.join(root, dir.name, "codex.exe");
        if (dir.isDirectory() && (await exists(file)))
          candidates.push({ file, modified: (await stat(file)).mtimeMs });
      }
      if (candidates.length)
        return candidates.sort((a, b) => b.modified - a.modified)[0].file;
    }
    const embedded = path.join(
      home,
      "plugins",
      ".plugin-appserver",
      process.platform === "win32" ? "codex.exe" : "codex",
    );
    return (await exists(embedded))
      ? embedded
      : process.platform === "win32"
        ? "codex.exe"
        : "codex";
  }
  function close(reason = "Codex-Verbindung wurde beendet.") {
    generation++;
    const old = child;
    child = undefined;
    starting = undefined;
    ready = false;
    for (const p of pending.values()) {
      clearTimeout(p.timer);
      p.reject(new Error(bridgeError(reason)));
    }
    pending.clear();
    old?.kill();
  }
  function write(packet) {
    if (!child?.stdin.writable)
      throw new Error("Codex-App-Server ist offline.");
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", ...packet }) + "\n");
  }
  async function start() {
    if (starting) return starting;
    if (ready && child) return;
    const epoch = generation;
    starting = (async () => {
      const command = resolveExecutable
        ? await resolveExecutable()
        : await executable();
      if (epoch !== generation) throw new Error("Start abgebrochen.");
      const proc = (child = spawnImpl(command, ["app-server"], {
        cwd,
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env, CODEX_HOME: home },
      }));
      let stderr = "";
      proc.stderr.on("data", (chunk) => {
        stderr = (stderr + chunk).slice(-2000);
      });
      proc.stdin.on("error", (e) => {
        if (child === proc) close(e);
      });
      proc.on("error", (e) => {
        if (child === proc) close(e);
      });
      proc.on("exit", () => {
        if (child === proc) close(stderr || "Codex-App-Server beendet.");
      });
      readline.createInterface({ input: proc.stdout }).on("line", (line) => {
        let packet;
        try {
          packet = JSON.parse(line);
        } catch {
          return;
        }
        // Server requests have their own id space; never mistake one for a response.
        if (packet.method) {
          if (packet.id != null) {
            if (packet.method === "mcpServer/elicitation/request")
              write({
                id: packet.id,
                result: { action: "decline", content: null },
              });
            else
              write({
                id: packet.id,
                error: {
                  code: -32601,
                  message:
                    "Aegis erlaubt hier keine zusätzlichen Aktionen. Anmeldung bitte im offiziellen Verbindungsdialog abschließen.",
                },
              });
          } else if (/account\/|app\/|plugin\//.test(packet.method))
            onChange(packet);
          return;
        }
        const p = pending.get(packet.id);
        if (!p) return;
        pending.delete(packet.id);
        clearTimeout(p.timer);
        packet.error
          ? p.reject(new Error(bridgeError(packet.error)))
          : p.resolve(packet.result);
      });
      await request("initialize", {
        clientInfo: { name: "aegis-command", version: "0.6.0" },
        capabilities: { experimentalApi: true },
      });
      write({ method: "initialized", params: {} });
      ready = true;
    })()
      .catch((error) => {
        close(error);
        throw error;
      })
      .finally(() => {
        if (epoch === generation) starting = undefined;
      });
    return starting;
  }
  async function request(method, params = {}, timeout = 30000) {
    if (method !== "initialize") await start();
    return new Promise((resolve, reject) => {
      const id = `aegis-${++nextId}`;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`${method}: Zeitlimit erreicht.`));
      }, timeout);
      pending.set(id, { resolve, reject, timer });
      try {
        write({ id, method, params });
      } catch (e) {
        clearTimeout(timer);
        pending.delete(id);
        reject(e);
      }
    });
  }
  return {
    request,
    close,
    get online() {
      return ready;
    },
  };
}
