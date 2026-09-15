import { readdir, readFile, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createCodexRpc, bridgeError } from "./codex-rpc.mjs";

const OUTLOOK = "connector_4aaab2856305417b993eca9a216aaf6e";
const PRIORITY = [
  "outlook-email",
  "outlook-calendar",
  "gmail",
  "google-calendar",
  "google-drive",
  "github",
  "todoist",
  "notion",
  "dropbox",
  "trello",
  "asana",
  "spotify",
  "canva",
];
const CATEGORY = {
  "outlook-email": "Kommunikation",
  "outlook-calendar": "Zeit & Planung",
  gmail: "Kommunikation",
  "google-calendar": "Zeit & Planung",
  "google-drive": "Dateien & Wissen",
  github: "Entwicklung",
  todoist: "Aufgaben",
  notion: "Wissen & Projekte",
  dropbox: "Dateien & Wissen",
  trello: "Aufgaben",
  asana: "Aufgaben",
  spotify: "Medien",
  canva: "Kreativität",
};
const ALIASES = {
  "app-6943b73823548191a9f9216c6790c453": "todoist",
  "app-69b31dc2110c8191b8b47dc98fe5a052": "dropbox",
  "app-6a20b18a639081918c1b438f8381b27e": "trello",
  "app-68de829bf7648191acd70a907364c67c": "spotify",
};
const clean = (value, max = 600) =>
  String(value ?? "")
    .replace(/[\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
const slug = (value) =>
  clean(value, 160)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
const safeInstall = (value) =>
  typeof value === "string" && /^https:\/\/chatgpt\.com\/apps\//i.test(value)
    ? value
    : null;
const sort = (a, b) =>
  a.rank - b.rank || a.displayName.localeCompare(b.displayName);

async function newestJson(directory) {
  try {
    const entries = await readdir(directory);
    const files = await Promise.all(
      entries
        .filter((n) => n.endsWith(".json"))
        .map(async (name) => {
          const file = path.join(directory, name);
          return { file, modified: (await stat(file)).mtimeMs };
        }),
    );
    const file = files.sort((a, b) => b.modified - a.modified)[0]?.file;
    return file ? JSON.parse(await readFile(file, "utf8")) : {};
  } catch {
    return {};
  }
}

export function normalizePlugin(raw, apps = []) {
  const release = raw.release || {},
    ui = release.interface || raw.interface || {};
  const name = slug(raw.name || release.name);
  const displayName = clean(
    ui.displayName ||
      ui.display_name ||
      raw.displayName ||
      raw.display_name ||
      release.displayName ||
      release.display_name ||
      name,
    160,
  );
  const appIds = release.appIds || release.app_ids || raw.appIds || [];
  const app = apps.find(
    (a) =>
      appIds.includes(a.id) ||
      slug(a.name || a.runtimeName) === name ||
      (a.pluginDisplayNames || []).some((n) => slug(n) === slug(displayName)) ||
      slug(a.name || a.runtimeName) === slug(displayName),
  );
  const feature = ALIASES[name] || name,
    rank = PRIORITY.indexOf(feature);
  // Catalog accessibility is not proof that a tool is callable.
  const connected = app?.callable === true && app?.enabled !== false;
  return {
    id: clean(raw.id || name, 240),
    name,
    displayName,
    description: clean(
      ui.shortDescription ||
        ui.short_description ||
        release.description ||
        raw.description ||
        app?.description,
    ),
    category: clean(ui.category || CATEGORY[feature] || "Weitere", 80),
    featured: rank >= 0,
    rank: rank < 0 ? 999 : rank,
    available:
      ["AVAILABLE", "ENABLED"].includes(
        raw.availability || raw.status || "AVAILABLE",
      ) &&
      (raw.installPolicy ||
        raw.installationPolicy ||
        raw.installation_policy) !== "NOT_AVAILABLE",
    disabledReason: clean(raw.disabledReason || raw.disabled_reason),
    installed: Boolean(raw.installed || app?.callable),
    enabled: raw.enabled !== false && app?.enabled !== false,
    connected,
    connectionState: connected ? "callable" : "unknown",
    appId: app?.id || appIds[0] || null,
    installUrl: safeInstall(app?.installUrl),
    brandColor: clean(ui.brandColor || ui.brand_color, 40) || null,
  };
}

// Parse connector data directly. There is no model turn that could invent mail IDs.
export function connectorData(result) {
  if (result?.isError)
    throw new Error(
      bridgeError(
        result.content?.find((c) => c.type === "text")?.text ||
          "Outlook-Aufruf fehlgeschlagen.",
      ),
    );
  if (result?.structuredContent != null)
    return connectorData(result.structuredContent);
  if (result?.result != null) return connectorData(result.result);
  if (Array.isArray(result?.content)) {
    for (const part of result.content)
      if (part.type === "text") {
        try {
          return connectorData(JSON.parse(part.text));
        } catch (e) {
          if (!(e instanceof SyntaxError)) throw e;
        }
      }
    throw new Error(
      "Outlook hat keine strukturierten Daten geliefert. Es werden keine Nachrichten erfunden.",
    );
  }
  return result;
}

export function createCodexBridge({
  cwd = process.cwd(),
  desktop = {},
  codexHome,
  rpc: suppliedRpc,
} = {}) {
  const home =
    codexHome || process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
  let snapshot,
    inflight,
    fetchedAt = 0,
    sessionPromise,
    closed = false,
    activeCalls = 0;
  let verifiedAccount = null;
  const rpc =
    suppliedRpc ||
    createCodexRpc({
      home,
      cwd,
      onChange: () => {
        fetchedAt = 0;
      },
    });
  const request = (...args) => rpc.request(...args);
  const knownMessages = new Set();
  async function cachedCatalog() {
    const [plugins, apps] = await Promise.all([
      newestJson(path.join(home, "cache", "remote_plugin_catalog")),
      newestJson(path.join(home, "cache", "codex_app_directory")),
    ]);
    const metadata = apps.connectors || apps.data || [];
    const entries = (plugins.plugins || []).map((p) =>
      normalizePlugin(p, metadata),
    );
    if (!entries.some((p) => p.name === "outlook-email"))
      entries.push(
        normalizePlugin({
          name: "outlook-email",
          release: { display_name: "Outlook Email", app_ids: [OUTLOOK] },
          description: "Postfach lesen und Antworten als Entwurf vorbereiten.",
        }),
      );
    for (const plugin of entries) {
      plugin.connected = false;
      plugin.connectionState = "unknown";
      if (plugin.name === "outlook-email") {
        plugin.appId ||= OUTLOOK;
        plugin.installUrl ||= `https://chatgpt.com/apps/outlook-email/${OUTLOOK}`;
      }
    }
    return entries;
  }
  async function refresh(force) {
    const entries = await cachedCatalog();
    const [accountResult, runtimeResult] = await Promise.allSettled([
      request("account/read", { refreshToken: false }),
      request("app/installed", { forceRefresh: force || !snapshot }, 45000),
    ]);
    const account =
      accountResult.status === "fulfilled"
        ? accountResult.value?.account
        : null;
    if (snapshot?.account?.email && account?.email !== snapshot.account.email) {
      verifiedAccount = null;
      knownMessages.clear();
    }
    const runtimeKnown = runtimeResult.status === "fulfilled";
    const apps = runtimeKnown ? runtimeResult.value?.apps || [] : [];
    const errors = [accountResult, runtimeResult]
      .filter((r) => r.status === "rejected")
      .map((r) => bridgeError(r.reason));
    for (const plugin of entries) {
      const app = apps.find(
        (a) =>
          a.id === plugin.appId ||
          slug(a.runtimeName) === plugin.name ||
          slug(a.runtimeName) === slug(plugin.displayName),
      );
      plugin.connected = app?.callable === true && app?.enabled === true;
      plugin.installed = !!app || plugin.installed;
      plugin.enabled = app ? app.enabled : plugin.enabled;
      plugin.connectionState = !runtimeKnown
        ? "unknown"
        : !app
          ? "not_connected"
          : !app.enabled
            ? "disabled"
            : app.callable
              ? "callable"
              : "not_callable";
      if (plugin.name === "outlook-email")
        plugin.account = plugin.connected ? verifiedAccount : null;
    }
    snapshot = {
      source: "cache",
      runtime:
        accountResult.status === "fulfilled" || runtimeKnown
          ? "online"
          : "offline",
      runtimeVerified: runtimeKnown,
      checkedAt: new Date().toISOString(),
      account: {
        signedIn: !!account,
        known: accountResult.status === "fulfilled",
        email: clean(account?.email, 200) || null,
        plan: clean(account?.planType, 80) || null,
      },
      plugins: entries.filter((p) => p.name && p.displayName).sort(sort),
      error: [...new Set(errors)].join(" ") || null,
    };
    fetchedAt = Date.now();
    return snapshot;
  }
  async function catalog(force = false) {
    if (closed) throw new Error("Plugin-Verbindung geschlossen.");
    if (inflight) return inflight;
    if (!force && snapshot && Date.now() - fetchedAt < 30000) return snapshot;
    if (force && sessionPromise && !activeCalls) {
      const old = sessionPromise;
      sessionPromise = undefined;
      void old
        .then((s) => request("thread/unsubscribe", { threadId: s.threadId }))
        .catch(() => {});
    }
    inflight = refresh(force).finally(() => {
      inflight = undefined;
    });
    return inflight;
  }
  function status() {
    const p = snapshot?.plugins.find((p) => p.name === "outlook-email");
    return {
      checkedAt: snapshot?.checkedAt || null,
      stale: !snapshot || Date.now() - fetchedAt > 30000,
      runtime: snapshot?.runtime || "unchecked",
      account: snapshot?.account || { signedIn: false, known: false },
      error: snapshot?.error || null,
      outlook: {
        connected: p?.connected === true,
        state: p?.connectionState || "unknown",
        account: p?.connected ? verifiedAccount : null,
        nextStep: p?.connected
          ? "Postfach kann jetzt abgerufen werden; noch keine Mailprüfung."
          : "Plugins → Status prüfen. ChatGPT und Codex müssen mit demselben Konto angemeldet sein. Ein Fehler bedeutet nicht automatisch, dass Hotmail getrennt ist.",
      },
    };
  }
  async function install(name) {
    const p = (await catalog()).plugins.find((p) => p.name === slug(name));
    if (!p || !p.available) throw new Error("Plugin ist nicht verfügbar.");
    if (p.connected)
      return {
        ok: true,
        connected: true,
        message: `${p.displayName} ist bereits in der Codex-Laufzeit verfügbar.`,
      };
    // Experimental plugin/install is not a supported production provisioning API.
    // Opening an OAuth dialog is never reported as a successful installation.
    if (!p.installUrl)
      throw new Error(
        "Bitte dieses Plugin in Codex unter Plugins einrichten und danach hier den Status prüfen.",
      );
    if (!desktop.openExternal)
      throw new Error("Bitte die Desktop-App für die Kontoanmeldung öffnen.");
    await desktop.openExternal(p.installUrl);
    fetchedAt = 0;
    return {
      ok: true,
      installed: false,
      authRequired: true,
      opened: p.installUrl,
      message:
        "Verbindungsdialog geöffnet. Nutze dasselbe ChatGPT-Konto wie in Codex. Beim Zurückkehren wird der Zugriff erneut geprüft.",
    };
  }
  async function login() {
    const result = await request("account/login/start", {
      type: "chatgptDeviceCode",
    });
    if (
      typeof result.verificationUrl === "string" &&
      /^https:\/\/(chatgpt\.com|auth\.openai\.com)\//i.test(
        result.verificationUrl,
      )
    )
      await desktop.openExternal?.(result.verificationUrl);
    fetchedAt = 0;
    return {
      ...result,
      message: result.userCode
        ? `ChatGPT-Anmeldung: Code ${clean(result.userCode, 40)}. Melde dich mit dem Konto an, das Outlook enthält.`
        : "ChatGPT-Anmeldung geöffnet.",
    };
  }
  async function session() {
    if (!sessionPromise)
      sessionPromise = (async () => {
        const r = await request("thread/start", {
          cwd,
          ephemeral: true,
          sandbox: "read-only",
          approvalPolicy: "never",
        });
        if (!r.thread?.id) throw new Error("Keine Plugin-Sitzung verfügbar.");
        return { threadId: r.thread.id };
      })().catch((e) => {
        sessionPromise = undefined;
        throw e;
      });
    return sessionPromise;
  }
  async function tool(action) {
    // Enforced allowlist: no agent turn, arbitrary tool, send, delete or forward.
    if (
      ![
        "get_profile",
        "list_messages",
        "search_messages",
        "create_reply_draft",
      ].includes(action)
    )
      throw new Error("Outlook-Aktion gesperrt.");
    const s = await session();
    let cursor, match;
    const seen = new Set();
    const deadline = Date.now() + 15000;
    let initializing;
    do {
      initializing = false;
      do {
        const r = await request(
          "mcpServerStatus/list",
          {
            threadId: s.threadId,
            detail: "toolsAndAuthOnly",
            limit: 100,
            ...(cursor ? { cursor } : {}),
          },
          45000,
        );
        initializing ||= (r.data || []).some(
          (server) =>
            server.name === "codex_apps" &&
            ["starting", "notStarted"].includes(server.runtimeStatus),
        );
        for (const server of r.data || [])
          for (const [key, t] of Object.entries(server.tools || {})) {
            if (server.name !== "codex_apps") continue;
            const name = t.name || key;
            if (
              [
                `microsoft_outlook_email.${action}`,
                `microsoft_outlook_email_${action}`,
                `mcp__codex_apps__microsoft_outlook_email_${action}`,
                `mcp__codex_apps.microsoft_outlook_email_${action}`,
              ].includes(name)
            )
              match = {
                threadId: s.threadId,
                server: server.name,
                tool: name,
                schema: t.inputSchema,
              };
          }
        cursor = r.nextCursor;
        if (seen.has(cursor)) break;
        seen.add(cursor);
      } while (cursor && !match && seen.size < 20);
      if (match || !initializing || Date.now() >= deadline || closed) break;
      await new Promise((resolve) => setTimeout(resolve, 500));
      cursor = undefined;
      seen.clear();
    } while (!match);
    if (!match)
      throw new Error(
        "Outlook ist in dieser Codex-Sitzung nicht aufrufbar. In Codex mit demselben ChatGPT-Konto anmelden, Outlook Email aktivieren und in Aegis den Status prüfen.",
      );
    return match;
  }
  async function callOutlook(action, args) {
    if (closed) throw new Error("Plugin-Verbindung geschlossen.");
    activeCalls++;
    try {
      const t = await tool(action);
      for (const key of Object.keys(args))
        if (!Object.hasOwn(t.schema?.properties || {}, key))
          throw new Error(
            `Outlook-Schnittstelle hat sich geändert (${key}). Bitte Codex aktualisieren.`,
          );
      return connectorData(
        await request(
          "mcpServer/tool/call",
          {
            threadId: t.threadId,
            server: t.server,
            tool: t.tool,
            arguments: args,
          },
          60000,
        ),
      );
    } finally {
      activeCalls--;
    }
  }
  async function verifyOutlook() {
    try {
      const profile = await callOutlook("get_profile", {});
      verifiedAccount =
        clean(
          profile.mail ||
            profile.email ||
            profile.email_address ||
            profile.userPrincipalName ||
            profile.user_principal_name,
          200,
        ) || null;
      if (!verifiedAccount)
        throw new Error("Outlook-Profil konnte nicht bestätigt werden.");
      if (!snapshot) await catalog();
      const p = snapshot.plugins.find((p) => p.name === "outlook-email");
      if (p)
        Object.assign(p, {
          connected: true,
          installed: true,
          connectionState: "verified",
          account: verifiedAccount,
        });
      snapshot.runtime = "online";
      snapshot.checkedAt = new Date().toISOString();
      fetchedAt = Date.now();
      return {
        connected: true,
        account: verifiedAccount,
        checkedAt: snapshot.checkedAt,
      };
    } catch (e) {
      const p = snapshot?.plugins.find((p) => p.name === "outlook-email");
      if (p) Object.assign(p, { connected: false, connectionState: "unknown" });
      throw new Error(bridgeError(e));
    }
  }
  async function outlookInbox({ query = "", limit = 30 } = {}) {
    limit = Math.min(50, Math.max(1, Number(limit) || 30));
    const raw = query
      ? await callOutlook("search_messages", {
          query: clean(query, 500),
          size: limit,
          from_index: 0,
        })
      : await callOutlook("list_messages", {
          folder_id: "inbox",
          top: limit,
          skip: 0,
          order_by: "receivedDateTime desc",
        });
    const list = raw?.value || raw?.messages || raw?.emails || raw?.results;
    if (!Array.isArray(list))
      throw new Error(
        "Outlook-Antwort enthält keine lesbare Nachrichtenliste.",
      );
    const messages = list
      .slice(0, limit)
      .map((m) => ({
        id: m.id || m.message_id,
        subject: clean(m.subject, 500),
        from:
          typeof m.from === "string"
            ? m.from
            : m.from?.emailAddress?.address ||
              m.from?.email_address?.address ||
              m.sender?.emailAddress?.address ||
              m.sender?.email ||
              (typeof m.sender === "string" ? m.sender : ""),
        receivedDateTime:
          m.receivedDateTime ||
          m.received_date_time ||
          m.received_at ||
          m.received,
        bodyPreview: clean(
          m.bodyPreview ||
            m.body_preview ||
            m.preview ||
            m.snippet ||
            m.body?.content,
          600,
        ),
        isRead: m.isRead ?? m.is_read ?? false,
        importance: m.importance || "normal",
        webLink: m.webLink || m.web_link || m.url || null,
      }))
      .filter((m) => typeof m.id === "string" && m.id);
    for (const m of messages) knownMessages.add(m.id);
    if (knownMessages.size > 500) {
      knownMessages.clear();
      for (const m of messages) knownMessages.add(m.id);
    }
    return {
      account: verifiedAccount,
      messages,
      hasMore: !!(raw.has_more || raw.hasMore || raw["@odata.nextLink"]),
    };
  }
  async function outlookReplyDraft({ messageId, body }) {
    if (!knownMessages.has(messageId))
      throw new Error(
        "Die Originalnachricht zuerst erneut im Postfach abrufen.",
      );
    if (typeof body !== "string" || !body.trim() || body.length > 12000)
      throw new Error("Ungültiger Entwurfstext.");
    const raw = await callOutlook("create_reply_draft", {
      message_id: messageId,
      comment: body,
      reply_all: false,
    });
    const draft = raw.message || raw.draft || raw,
      draftId = draft.id || draft.message_id || raw.draft_id;
    if (!draftId || (draft.isDraft ?? draft.is_draft) !== true)
      throw new Error(
        "Outlook hat keinen bestätigten Entwurf zurückgegeben. Vor erneutem Speichern bitte den Entwürfe-Ordner prüfen.",
      );
    return {
      created: true,
      sent: false,
      draftId,
      webLink: draft.webLink || draft.web_link || draft.url || null,
    };
  }
  return {
    catalog,
    status,
    install,
    login,
    verifyOutlook,
    outlookInbox,
    outlookReplyDraft,
    close: () => {
      closed = true;
      rpc.close();
    },
  };
}
