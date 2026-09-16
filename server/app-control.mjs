import { randomUUID } from "node:crypto";

export const APP_PAGES = [
  "command",
  "missions",
  "memory",
  "routines",
  "workspace",
  "plugins",
  "activity",
  "settings",
];
const pageAliases = {
  einstellungen: "settings",
  systemeinstellungen: "settings",
  einstellung: "settings",
  plugin: "plugins",
  erweiterungen: "plugins",
  "plug ins": "plugins",
  "plug-ins": "plugins",
  missionen: "missions",
  mission: "missions",
  gedächtnis: "memory",
  erinnerungen: "memory",
  automationen: "routines",
  routinen: "routines",
  arbeitsbereich: "workspace",
  aktivität: "activity",
  aktivitäten: "activity",
  verlauf: "activity",
  "command center": "command",
  hauptbildschirm: "command",
  startseite: "command",
};
export function normalizePage(target) {
  const value = String(target || "")
    .toLocaleLowerCase("de")
    .trim();
  return APP_PAGES.includes(value)
    ? value
    : Object.hasOwn(pageAliases, value)
      ? pageAliases[value]
      : undefined;
}
export function spokenNavigation(text) {
  const value = String(text || "")
    .toLocaleLowerCase("de")
    .replace(/[.,!?]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  // Only direct, whole-utterance requests. No quoted, negated or hypothetical commands.
  const match =
    /^(?:(?:okay|ok|aegis|bitte) )*(?:(?:geh|gehe|wechsel|wechsle|navigiere)(?: bitte| mal| jetzt)*(?: in| zu| auf)(?: die| den| das| dem)? |(?:öffne|öffnen|zeig|zeige)(?: mir| bitte| mal| jetzt)*(?: die| den| das)? )(.+?)(?: bitte| mal| jetzt)*$/.exec(
      value,
    );
  return match ? normalizePage(match[1]) || null : null;
}
export const appControlTool = {
  type: "function",
  name: "aegis_app",
  risk: "read",
  description:
    "Control THIS Aegis app visibly: navigate to command/missions/memory/routines/workspace/plugins/activity/settings; inspect current app/settings; stop_voice disconnects the microphone and ends this conversation; open_application launches chrome/edge/notepad/calculator. Never changes settings or sends mail. Use before claiming an app was opened.",
  parameters: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["navigate", "inspect", "stop_voice", "open_application"],
      },
      target: {
        type: "string",
        description:
          "Navigation: Einstellungen=settings, Plugin/Plugins=plugins, Missionen=missions, Gedächtnis=memory, Automationen=routines, Workspace=workspace, Aktivität=activity, Command Center=command. For applications: chrome/edge/notepad/calculator.",
      },
    },
    required: ["action"],
    additionalProperties: false,
  },
};
export function createAppControl({ desktop, overview, activity }) {
  let view = { page: "command", voiceStatus: "idle", checkedAt: null };
  const pending = new Map();
  function update(value) {
    if (APP_PAGES.includes(value.page)) view.page = value.page;
    if (
      [
        "idle",
        "connecting",
        "listening",
        "thinking",
        "speaking",
        "error",
      ].includes(value.voiceStatus)
    )
      view.voiceStatus = value.voiceStatus;
    view.checkedAt = new Date().toISOString();
    return { ...view };
  }
  function ack({ id, page, voiceStatus }) {
    const task = pending.get(id);
    if (!task) return { accepted: false };
    if (task.action === "navigate" && page !== task.target)
      return { accepted: false };
    if (task.action === "stop_voice" && voiceStatus !== "idle")
      return { accepted: false };
    pending.delete(id);
    clearTimeout(task.timer);
    update({ page, voiceStatus });
    task.resolve({ completed: true, action: task.action, view: { ...view } });
    return { accepted: true };
  }
  async function execute({ action, target }) {
    if (action === "navigate") target = normalizePage(target);
    if (action === "inspect") return overview();
    if (action === "open_application") {
      if (!["chrome", "edge", "notepad", "calculator"].includes(target))
        throw new Error(
          "Diese Anwendung ist nicht freigegeben. Verfügbar: Chrome, Edge, Editor und Rechner.",
        );
      if (!desktop.openApplication)
        throw new Error(
          "Programme können nur in der Desktop-App gestartet werden.",
        );
      const result = await desktop.openApplication(target);
      await activity(
        "Anwendung gestartet",
        `${target}: Start an Windows übergeben.`,
        "success",
      );
      return result;
    }
    if (!["navigate", "stop_voice"].includes(action))
      throw new Error("Unbekannte App-Aktion.");
    if (action === "navigate" && !APP_PAGES.includes(target))
      throw new Error("Unbekannte Aegis-Seite.");
    if (!desktop.publishControl)
      throw new Error(
        "App-Steuerung benötigt die laufende Desktop-Oberfläche.",
      );
    if (action === "navigate" && view.checkedAt && view.page === target)
      return {
        completed: true,
        action,
        view: { ...view },
        overview: overview(),
      };
    for (const task of pending.values()) {
      if (
        action === "navigate" &&
        task.action === action &&
        task.target === target
      )
        return task.promise;
    }
    // A newer explicit navigation supersedes an older uncommitted one.
    for (const [key, task] of pending) {
      if (action === "navigate" && task.action === action) {
        clearTimeout(task.timer);
        pending.delete(key);
        task.resolve({ completed: false, superseded: true });
      }
    }
    const id = randomUUID();
    const promise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(
          new Error(
            "Die Oberfläche hat die Aktion nicht bestätigt. Bitte Aegis öffnen.",
          ),
        );
      }, 6000);
      pending.set(id, { action, target, timer, resolve, reject });
      try {
        desktop.publishControl({ id, action, target });
      } catch (e) {
        clearTimeout(timer);
        pending.delete(id);
        reject(e);
      }
    });
    if (pending.has(id)) pending.get(id).promise = promise;
    const result = await promise;
    if (!result.completed) return result;
    await activity(
      "App-Steuerung",
      action === "stop_voice"
        ? "Sprachverbindung beendet"
        : `Ansicht geöffnet: ${target}`,
      "success",
    );
    return {
      ...result,
      overview: action === "navigate" ? overview() : undefined,
    };
  }
  return {
    execute,
    update,
    ack,
    state: () => ({ ...view }),
    close: () => {
      for (const p of pending.values()) {
        clearTimeout(p.timer);
        p.reject(new Error("App beendet."));
      }
      pending.clear();
    },
  };
}
