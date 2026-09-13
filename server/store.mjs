import { mkdir, readFile, writeFile, rename, unlink } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

export const now = () => new Date().toISOString();
export const id = () => randomUUID();
export const dateKey = () => now().slice(0, 10);
export function defaultState() {
  return {
    settings: {
      name: "Boss",
      language: "de",
      provider: "openai",
      model: "gpt-4.1-mini",
      realtimeModel: "gpt-realtime-mini",
      voice: "cedar",
      workspace: "",
      autoSpeak: false,
      autostart: false,
      dailyRequestLimit: 100,
    },
    missions: [],
    memories: [],
    commitments: [],
    routines: [],
    activity: [],
    messages: [],
    focus: { active: false },
    shadow: { active: false, events: [] },
    usage: { date: dateKey(), requests: 0, inputTokens: 0, outputTokens: 0 },
  };
}

export async function createStore(dataDir, secureStorage) {
  if (!dataDir || !path.isAbsolute(dataDir))
    throw new Error("An absolute application data directory is required.");
  await mkdir(dataDir, { recursive: true, mode: 0o700 });
  const filename = path.join(dataDir, "state.json");
  let document;
  try {
    document = JSON.parse(await readFile(filename, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT")
      throw new Error(
        "Die lokale Datenbank konnte nicht gelesen werden. Bitte state.json sichern und prüfen.",
      );
  }
  const persistentSecrets = Boolean(
    secureStorage?.encryptString && secureStorage?.decryptString,
  );
  if (document?.version === 2) {
    if (!persistentSecrets)
      throw new Error(
        "Diese Datenbank ist mit Windows verschlüsselt. Bitte im ursprünglichen Windows-Konto öffnen; Daten wurden nicht verändert.",
      );
    try {
      document = JSON.parse(
        secureStorage.decryptString(Buffer.from(document.ciphertext, "base64")),
      );
    } catch {
      throw new Error(
        "Windows konnte die lokale Datenbank nicht entschlüsseln. Die Originaldatei wurde nicht verändert.",
      );
    }
  }
  if (document && document.version !== 1)
    throw new Error(
      "Unbekannte Datenbankversion. Daten wurden nicht verändert.",
    );
  const base = defaultState();
  const state = {
    ...base,
    ...document?.state,
    settings: { ...base.settings, ...document?.state?.settings },
  };
  const secrets = new Map();
  const encrypted = document?.secrets || {};
  if (persistentSecrets) {
    for (const [key, value] of Object.entries(encrypted)) {
      try {
        secrets.set(
          key,
          secureStorage.decryptString(Buffer.from(value, "base64")),
        );
      } catch {
        /* An unavailable OS key must never expose or replace the original ciphertext. */
      }
    }
  }
  let queue = Promise.resolve();
  function save() {
    const snapshot = JSON.stringify({ version: 1, state, secrets: encrypted });
    const text = persistentSecrets
      ? JSON.stringify({
          version: 2,
          protection: "os-encrypted",
          ciphertext: Buffer.from(
            secureStorage.encryptString(snapshot),
          ).toString("base64"),
        })
      : snapshot;
    const persist = async () => {
      const temp = `${filename}.${randomUUID()}.tmp`;
      try {
        await writeFile(temp, text, {
          encoding: "utf8",
          mode: 0o600,
          flag: "wx",
        });
        await rename(temp, filename);
      } catch (error) {
        await unlink(temp).catch(() => {});
        throw error;
      }
    };
    const pending = queue.then(persist, persist);
    queue = pending.catch(() => {});
    return pending;
  }
  async function setSecret(key, value) {
    if (typeof key !== "string" || key.length > 200)
      throw new Error("Invalid secret name.");
    if (value == null || value === "") {
      secrets.delete(key);
      delete encrypted[key];
    } else {
      if (typeof value !== "string" || value.length > 32000)
        throw new Error("Ungültiger Zugangsschlüssel.");
      if (persistentSecrets) {
        const ciphertext = secureStorage.encryptString(value);
        encrypted[key] = Buffer.from(ciphertext).toString("base64");
      }
      secrets.set(key, value);
    }
    await save();
  }
  function sanitize(text) {
    let result = String(text ?? "Unbekannter Fehler.");
    for (const secret of secrets.values())
      if (secret.length > 3) result = result.split(secret).join("[redacted]");
    return result.replace(/sk-[\w-]{12,}/g, "[redacted]").slice(0, 3000);
  }
  return {
    state,
    save,
    getSecret: (key) => secrets.get(key) || "",
    setSecret,
    sanitize,
    persistentSecrets,
    close: () => queue,
  };
}
