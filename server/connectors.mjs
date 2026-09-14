import http from "node:http";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

const PROVIDERS = {
  github: {
    name: "GitHub",
    description: "Repositories, offene Issues und Projektaufgaben.",
    fields: ["token"],
    capabilities: ["Repositories lesen", "Issues lesen", "Issues erstellen"],
  },
  google: {
    name: "Google Workspace",
    description: "Gmail, Kalender und Drive über persönliche Anmeldung.",
    fields: ["clientId", "clientSecret"],
    capabilities: [
      "E-Mails lesen",
      "Entwürfe erstellen",
      "Kalender lesen",
      "Termine erstellen",
      "Drive durchsuchen",
    ],
  },
  microsoft: {
    name: "Microsoft 365",
    description: "Outlook, Kalender und Microsoft To Do.",
    fields: ["clientId", "tenantId"],
    capabilities: [
      "E-Mails lesen",
      "Entwürfe erstellen",
      "Kalender lesen",
      "Termine erstellen",
      "Aufgaben verwalten",
    ],
  },
  homeassistant: {
    name: "Home Assistant",
    description: "Zustände sehen, Licht, Schalter und Szenen steuern.",
    fields: ["url", "token"],
    capabilities: [
      "Gerätezustände lesen",
      "Licht schalten",
      "Schalter steuern",
      "Szenen aktivieren",
    ],
  },
  tavily: {
    name: "Web Research",
    description: "Aktuelle Websuche mit nachprüfbaren Quellen über Tavily.",
    fields: ["apiKey"],
    capabilities: ["Web recherchieren", "Quellen finden"],
  },
};
const GOOGLE_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.compose",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/drive.readonly",
];
const MS_SCOPES =
  "openid profile offline_access User.Read Mail.ReadWrite Calendars.ReadWrite Tasks.ReadWrite";
function validateMicrosoftClientId(value) {
  if (value?.toLowerCase() === "74658136-14ec-4630-ad9b-26e160ff0fc6")
    throw new Error(
      "Diese ID gehört zum Microsoft-Verwaltungsportal, nicht zu Aegis. Bitte die Application (Client) ID deiner eigenen Appregistrierung verwenden.",
    );
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value || "",
    )
  )
    throw new Error(
      "Eine eigene Microsoft Application (Client) ID im GUID-Format wird benötigt. Kein Mailpasswort, keine E-Mail-Adresse und kein Client Secret eingeben.",
    );
}
const TOKEN_FIELDS = [
  "accessToken",
  "refreshToken",
  "expiresAt",
  "verified",
  "account",
];
const FIXED_HOSTS = new Set([
  "api.github.com",
  "accounts.google.com",
  "oauth2.googleapis.com",
  "openidconnect.googleapis.com",
  "gmail.googleapis.com",
  "www.googleapis.com",
  "graph.microsoft.com",
  "login.microsoftonline.com",
  "api.tavily.com",
]);
const STRING = { type: "string" };
const tool = (
  connector,
  name,
  description,
  properties = {},
  required = [],
  risk = "read",
) => ({
  type: "function",
  name,
  description,
  parameters: {
    type: "object",
    properties,
    required,
    additionalProperties: false,
  },
  strict: false,
  connector,
  risk,
});
const TOOLS = [
  tool(
    "github",
    "github_repositories",
    "List repositories accessible to the connected GitHub account.",
    { limit: { type: "integer", minimum: 1, maximum: 50 } },
  ),
  tool(
    "github",
    "github_issues",
    "Read current issues and pull requests for a repository.",
    {
      owner: STRING,
      repo: STRING,
      state: { type: "string", enum: ["open", "closed", "all"] },
    },
    ["owner", "repo"],
  ),
  tool(
    "github",
    "github_create_issue",
    "Create a GitHub issue. Requires user approval.",
    { owner: STRING, repo: STRING, title: STRING, body: STRING },
    ["owner", "repo", "title", "body"],
    "write",
  ),
  tool(
    "google",
    "google_mail_search",
    "Find Gmail messages. Use Gmail query syntax, e.g. is:unread or from:person@example.com.",
    { query: STRING, limit: { type: "integer", minimum: 1, maximum: 20 } },
  ),
  tool(
    "google",
    "google_mail_read",
    "Read a Gmail message by the exact ID returned by search.",
    { id: STRING },
    ["id"],
  ),
  tool(
    "google",
    "google_mail_draft",
    "Create a plain text Gmail draft; this NEVER sends mail. Requires approval.",
    { to: STRING, subject: STRING, body: STRING },
    ["to", "subject", "body"],
    "write",
  ),
  tool(
    "google",
    "google_calendar",
    "Read primary calendar events in a date range. Dates must include a timezone.",
    { start: STRING, end: STRING },
  ),
  tool(
    "google",
    "google_calendar_create",
    "Create a personal primary-calendar event without attendees. Requires approval. Dates must include a timezone.",
    {
      title: STRING,
      start: STRING,
      end: STRING,
      description: STRING,
      location: STRING,
    },
    ["title", "start", "end"],
    "write",
  ),
  tool(
    "google",
    "google_drive_search",
    "Find files by name in Google Drive; returns IDs, links and modified dates.",
    { query: STRING },
    ["query"],
  ),
  tool(
    "google",
    "google_drive_read",
    "Read text from a Google Doc or text/plain file, using an ID from Drive search.",
    { id: STRING },
    ["id"],
  ),
  tool(
    "microsoft",
    "microsoft_mail",
    "List recent Outlook messages, optionally search a phrase.",
    { query: STRING, limit: { type: "integer", minimum: 1, maximum: 20 } },
  ),
  tool(
    "microsoft",
    "microsoft_mail_read",
    "Read a specific Outlook message returned by microsoft_mail.",
    { id: STRING },
    ["id"],
  ),
  tool(
    "microsoft",
    "microsoft_mail_draft",
    "Create an Outlook text draft without sending. Requires approval.",
    { to: STRING, subject: STRING, body: STRING },
    ["to", "subject", "body"],
    "write",
  ),
  tool(
    "microsoft",
    "microsoft_mail_reply_draft",
    "Create one Outlook reply draft tied to an exact existing message. It never sends mail. Requires approval.",
    { id: STRING, body: STRING },
    ["id", "body"],
    "write",
  ),
  tool(
    "microsoft",
    "microsoft_calendar",
    "Read calendar events in a date range. Dates must include a timezone.",
    { start: STRING, end: STRING },
  ),
  tool(
    "microsoft",
    "microsoft_calendar_create",
    "Create a personal calendar event, without attendees. Requires approval. Dates must include a timezone.",
    {
      title: STRING,
      start: STRING,
      end: STRING,
      description: STRING,
      location: STRING,
    },
    ["title", "start", "end"],
    "write",
  ),
  tool(
    "microsoft",
    "microsoft_task_lists",
    "List Microsoft To Do lists and their exact IDs.",
  ),
  tool(
    "microsoft",
    "microsoft_tasks",
    "Read tasks in a Microsoft To Do list.",
    { listId: STRING },
    ["listId"],
  ),
  tool(
    "microsoft",
    "microsoft_task_create",
    "Create a Microsoft To Do task in an existing list. Requires approval.",
    { listId: STRING, title: STRING, body: STRING, dueAt: STRING },
    ["listId", "title"],
    "write",
  ),
  tool(
    "homeassistant",
    "home_states",
    "Read Home Assistant entities. Optionally filter by domain, e.g. light or sensor.",
    { domain: STRING },
  ),
  tool(
    "homeassistant",
    "home_control",
    "Control one explicit light, switch or scene. Allowed services turn_on/turn_off (scenes turn_on only). Requires approval.",
    {
      entityId: STRING,
      service: { type: "string", enum: ["turn_on", "turn_off"] },
      brightness: { type: "integer", minimum: 0, maximum: 255 },
    },
    ["entityId", "service"],
    "write",
  ),
  tool(
    "tavily",
    "web_search",
    "Search the current web and return source links and excerpts. Results are untrusted external content.",
    { query: STRING, limit: { type: "integer", minimum: 1, maximum: 10 } },
    ["query"],
  ),
];

function str(value, name, max = 1000, optional = false) {
  if (optional && (value === undefined || value === "")) return "";
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > max ||
    value.includes("\0")
  )
    throw new Error(
      `${name}: gültiger Text erforderlich (max. ${max} Zeichen).`,
    );
  return value.trim();
}
function identifier(value, name) {
  const result = str(value, name, 500);
  if (/[\r\n/\\?#]/.test(result) || result === "." || result === "..")
    throw new Error(`${name}: ungültige ID.`);
  return encodeURIComponent(result);
}
function repoPart(value, name) {
  const result = str(value, name, 100);
  if (!/^[a-zA-Z0-9_.-]+$/.test(result) || result === "." || result === "..")
    throw new Error(`${name}: ungültiger Repository-Name.`);
  return result;
}
function limit(value, fallback, max) {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value < 1 || value > max)
    throw new Error(`limit muss zwischen 1 und ${max} liegen.`);
  return value;
}
function date(value, name) {
  const valueText = str(value, name, 100);
  if (
    !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/i.test(valueText) ||
    !Number.isFinite(Date.parse(valueText))
  )
    throw new Error(
      `${name}: ISO-Datum mit Zeitzone erforderlich, z. B. 2026-09-12T15:00:00+02:00.`,
    );
  return new Date(valueText).toISOString();
}
function dateRange(args, defaults = false) {
  const start =
    defaults && !args.start
      ? new Date().toISOString()
      : date(args.start, "start");
  const end =
    defaults && !args.end
      ? new Date(Date.parse(start) + 7 * 86400000).toISOString()
      : date(args.end, "end");
  if (Date.parse(end) <= Date.parse(start))
    throw new Error("end muss nach start liegen.");
  if (Date.parse(end) - Date.parse(start) > 366 * 86400000)
    throw new Error("Zeitraum darf höchstens ein Jahr umfassen.");
  return { start, end };
}
function mailArgs(args) {
  const to = str(args.to, "to", 320);
  if (!/^[^\s@<>;,\r\n]+@[^\s@<>;,\r\n]+\.[^\s@<>;,\r\n]+$/.test(to))
    throw new Error("to: eine einzelne gültige E-Mail-Adresse erforderlich.");
  const subject = str(args.subject, "subject", 300);
  if (/[\r\n]/.test(subject))
    throw new Error("subject darf keine Zeilenumbrüche enthalten.");
  return { to, subject, body: str(args.body, "body", 50000) };
}
function homeBase(raw) {
  let url;
  try {
    url = new URL(str(raw, "Home Assistant URL", 1000));
  } catch {
    throw new Error(
      "Home Assistant benötigt eine vollständige http:// oder https:// URL.",
    );
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error(
      "Home Assistant URL darf keine Zugangsdaten, Query-Parameter oder Fragmente enthalten.",
    );
  const host = url.hostname.toLowerCase();
  const ipv4 = host.split(".").map(Number);
  const isPrivateV4 =
    ipv4.length === 4 &&
    ipv4.every((n) => Number.isInteger(n) && n >= 0 && n < 256) &&
    (ipv4[0] === 10 ||
      ipv4[0] === 127 ||
      (ipv4[0] === 192 && ipv4[1] === 168) ||
      (ipv4[0] === 172 && ipv4[1] >= 16 && ipv4[1] <= 31));
  const local =
    isPrivateV4 ||
    host === "[::1]" ||
    /^\[(?:fc|fd)[a-f0-9:]+\]$/.test(host) ||
    host === "localhost" ||
    /^[a-z][a-z0-9-]*$/.test(host) ||
    /\.(local|lan|home|internal)$/.test(host);
  if (url.protocol === "http:" && !local)
    throw new Error(
      "Unverschlüsseltes HTTP ist nur für eine ausdrücklich angegebene lokale Home-Assistant-Adresse erlaubt. Für externe Server HTTPS verwenden.",
    );
  if (
    host === "169.254.169.254" ||
    host === "metadata.google.internal" ||
    host === "0.0.0.0"
  )
    throw new Error("Diese Home-Assistant-Adresse ist nicht zulässig.");
  return url.toString().replace(/\/+$/, "");
}
function cleanText(value, max = 24000) {
  return typeof value === "string" ? value.slice(0, max) : "";
}
function messageData(message) {
  const headers = message.payload?.headers ?? [];
  const header = (name) =>
    cleanText(headers.find((h) => h.name?.toLowerCase() === name)?.value, 1000);
  const texts = [];
  const visit = (part) => {
    if (!part) return;
    if (part.body?.data && (!part.mimeType || part.mimeType === "text/plain"))
      texts.push(Buffer.from(part.body.data, "base64url").toString("utf8"));
    for (const child of part.parts ?? []) visit(child);
  };
  visit(message.payload);
  return {
    id: message.id,
    threadId: message.threadId,
    from: header("from"),
    to: header("to"),
    subject: header("subject"),
    date: header("date"),
    snippet: cleanText(message.snippet, 2000),
    text: cleanText(texts.join("\n")),
    labels: message.labelIds ?? [],
  };
}

export function createConnectors({
  getSettings = () => ({}),
  getSecret,
  setSecret,
  fetchImpl = globalThis.fetch,
  desktop = {},
}) {
  if (typeof getSecret !== "function" || typeof setSecret !== "function")
    throw new Error("Connector credential storage is required.");
  const states = new Map();
  const pending = new Map();
  const refreshes = new Map();
  const revisions = new Map();
  const key = (id, field) => `connector.${id}.${field}`;
  const get = (id, field) => getSecret(key(id, field));
  const set = (id, field, value) => setSecret(key(id, field), value);
  const provider = (id) => {
    if (!Object.hasOwn(PROVIDERS, id))
      throw new Error("Unbekannter Connector.");
    return PROVIDERS[id];
  };
  const revision = (id) => revisions.get(id) ?? 0;
  const configured = (id) =>
    id === "google" || id === "microsoft"
      ? Boolean(get(id, "clientId"))
      : id === "homeassistant"
        ? Boolean(get(id, "url") && get(id, "token"))
        : Boolean(get(id, id === "tavily" ? "apiKey" : "token"));
  const connected = (id) =>
    Boolean(
      configured(id) &&
      get(id, "verified") &&
      (id === "google" || id === "microsoft"
        ? get(id, "accessToken") || get(id, "refreshToken")
        : true),
    );
  function list() {
    return Object.entries(PROVIDERS).map(([id, item]) => ({
      id,
      name: item.name,
      description: item.description,
      capabilities: [...item.capabilities],
      configured: configured(id),
      connected: connected(id),
      status: pending.has(id)
        ? "pending"
        : (states.get(id)?.status ??
          (connected(id)
            ? "connected"
            : configured(id)
              ? "configured"
              : "disconnected")),
      message: states.get(id)?.message ?? "",
      account: cleanText(get(id, "account"), 200),
      ...(id === "microsoft"
        ? { tenantId: get(id, "tenantId") || "common" }
        : {}),
    }));
  }
  const status = (id) => list().find((item) => item.id === id);
  function cancel(id) {
    const entry = pending.get(id);
    if (entry?.timer) clearTimeout(entry.timer);
    if (entry?.server) entry.server.close();
    pending.delete(id);
  }
  async function configure(id, data = {}) {
    const item = provider(id);
    if (!data || typeof data !== "object" || Array.isArray(data))
      throw new Error("Connector-Konfiguration muss ein Objekt sein.");
    const updates = {};
    for (const field of item.fields) {
      if (data[field] === undefined || data[field] === "") continue;
      updates[field] = str(
        data[field],
        field,
        field === "token" || field === "apiKey" ? 12000 : 2000,
      );
      if (/[\r\n]/.test(updates[field]))
        throw new Error(`${field} enthält ungültige Zeichen.`);
    }
    if (updates.url) updates.url = homeBase(updates.url);
    if (id === "microsoft" && updates.clientId)
      validateMicrosoftClientId(updates.clientId);
    if (
      updates.tenantId &&
      !/^(common|organizations|consumers|[a-zA-Z0-9.-]+)$/.test(
        updates.tenantId,
      )
    )
      throw new Error("Ungültige Microsoft Tenant-ID.");
    const changed = Object.entries(updates).some(
      ([field, value]) => get(id, field) !== value,
    );
    if (changed) {
      revisions.set(id, revision(id) + 1);
      cancel(id);
      if (
        id === "homeassistant" &&
        updates.url &&
        get(id, "url") &&
        updates.url !== get(id, "url") &&
        !updates.token
      )
        await set(id, "token", "");
      for (const field of TOKEN_FIELDS) await set(id, field, "");
      for (const [field, value] of Object.entries(updates))
        await set(id, field, value);
      states.set(id, {
        status: "configured",
        message: "Gespeichert. Verbindung prüfen oder anmelden.",
      });
    }
    return status(id);
  }
  async function disconnect(id) {
    const item = provider(id);
    revisions.set(id, revision(id) + 1);
    cancel(id);
    for (const field of [...item.fields, ...TOKEN_FIELDS])
      await set(id, field, "");
    states.delete(id);
    return status(id);
  }
  async function request(
    id,
    rawUrl,
    {
      method = "GET",
      token,
      body,
      form,
      headers = {},
      text = false,
      oauth = false,
    } = {},
  ) {
    const url = new URL(rawUrl);
    if (id === "homeassistant") {
      const base = new URL(homeBase(get(id, "url")));
      if (
        url.origin !== base.origin ||
        !url.pathname.startsWith(`${base.pathname.replace(/\/$/, "")}/api/`)
      )
        throw new Error(
          "Home-Assistant-Anfrage außerhalb des konfigurierten Servers blockiert.",
        );
    } else if (
      url.protocol !== "https:" ||
      !FIXED_HOSTS.has(url.hostname) ||
      url.port ||
      url.username ||
      url.password
    ) {
      throw new Error("Unerwartetes API-Ziel blockiert.");
    }
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 20000);
    timer.unref?.();
    try {
      const response = await fetchImpl(url.toString(), {
        method,
        redirect: "error",
        signal: abort.signal,
        headers: {
          Accept: "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
          ...(form
            ? { "Content-Type": "application/x-www-form-urlencoded" }
            : {}),
          ...(id === "github"
            ? {
                "X-GitHub-Api-Version": "2022-11-28",
                "User-Agent": "Aegis-Command",
              }
            : {}),
          ...headers,
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        ...(form ? { body: new URLSearchParams(form).toString() } : {}),
      });
      if (Number(response.headers?.get?.("content-length")) > 2 * 1024 * 1024)
        throw new Error(
          "Die API-Antwort ist zu groß. Bitte Abfrage einschränken.",
        );
      const raw = await response.text();
      if (raw.length > 2 * 1024 * 1024)
        throw new Error(
          "Die API-Antwort ist zu groß. Bitte Abfrage einschränken.",
        );
      let payload;
      if (!text || !response.ok) {
        try {
          payload = raw ? JSON.parse(raw) : {};
        } catch {
          payload = {};
        }
      }
      if (!response.ok) {
        const oauthCode =
          oauth &&
          typeof payload?.error === "string" &&
          /^[a-z_]{1,60}$/.test(payload.error)
            ? payload.error
            : undefined;
        const microsoftHint =
          id === "microsoft" && oauth
            ? (Array.isArray(payload?.error_codes)
                ? payload.error_codes
                : []
              ).map(Number)
            : [];
        const hint = microsoftHint.some((code) =>
          [50020, 500200, 16000].includes(code),
        )
          ? "Kontotyp oder Verzeichnis passt nicht. Für Hotmail/Outlook.com muss deine eigene Appregistrierung private Konten zulassen; common oder consumers verwenden. Portal-Anmeldung und Postfach-Anmeldung sind verschieden."
          : microsoftHint.includes(700016)
            ? "Die Client-ID wurde in diesem Verzeichnis nicht gefunden. Eigene Appregistrierung und Kontotyp prüfen."
            : microsoftHint.includes(7000218)
              ? "Öffentliche Client-Flows in deiner Appregistrierung aktivieren. Aegis benötigt für die Geräteanmeldung kein Client Secret."
              : response.status === 401
                ? "Anmeldung abgelaufen oder Zugangsdaten ungültig. Erneut verbinden."
                : response.status === 403
                  ? "Zugriff verweigert. API-Freigabe und Berechtigungen prüfen."
                  : response.status === 429
                    ? "Anfragelimit erreicht. Später erneut versuchen."
                    : response.status === 404
                      ? "Element nicht gefunden oder nicht zugänglich."
                      : "Anfrage wurde vom Dienst nicht angenommen.";
        const error = new Error(
          `${PROVIDERS[id]?.name ?? id}: HTTP ${response.status}. ${hint}`,
        );
        error.status = response.status;
        if (oauthCode) error.oauthCode = oauthCode;
        throw error;
      }
      return text ? raw : payload;
    } catch (error) {
      if (error.status || error.message?.startsWith("Die API-Antwort"))
        throw error;
      if (abort.signal.aborted)
        throw new Error(
          `${PROVIDERS[id]?.name ?? id}: Zeitüberschreitung nach 20 Sekunden.`,
        );
      throw new Error(
        `${PROVIDERS[id]?.name ?? id}: Verbindung fehlgeschlagen. Netzwerk und Adresse prüfen; Weiterleitungen werden nicht verfolgt.`,
      );
    } finally {
      clearTimeout(timer);
    }
  }
  async function storeTokens(id, value, expectedRevision) {
    if (revision(id) !== expectedRevision)
      throw new Error(
        "Anmeldung wurde abgebrochen oder die Konfiguration geändert.",
      );
    if (typeof value.access_token !== "string" || !value.access_token)
      throw new Error("Der Anmeldedienst hat kein Zugriffstoken geliefert.");
    await set(id, "accessToken", value.access_token);
    if (value.refresh_token) await set(id, "refreshToken", value.refresh_token);
    const seconds = Number(value.expires_in);
    await set(
      id,
      "expiresAt",
      String(
        Date.now() +
          (Number.isFinite(seconds) && seconds > 0 ? seconds : 3600) * 1000,
      ),
    );
    await set(id, "verified", "true");
    states.set(id, { status: "connected", message: "Angemeldet." });
  }
  const microsoftTenant = () => {
    const tenant = get("microsoft", "tenantId") || "common";
    if (!/^[a-zA-Z0-9.-]+$/.test(tenant))
      throw new Error("Ungültige Microsoft Tenant-ID.");
    return tenant;
  };
  async function accessToken(id) {
    if (!connected(id))
      throw new Error(
        `${provider(id).name} ist nicht verbunden. Unter Verbindungen Zugangsdaten eintragen und anmelden bzw. prüfen.`,
      );
    if (id !== "google" && id !== "microsoft")
      return get(id, id === "tavily" ? "apiKey" : "token");
    if (
      get(id, "accessToken") &&
      Number(get(id, "expiresAt")) > Date.now() + 60000
    )
      return get(id, "accessToken");
    if (!get(id, "refreshToken"))
      throw new Error(
        `${provider(id).name}: Sitzung abgelaufen. Erneut anmelden.`,
      );
    if (!refreshes.has(id)) {
      const flow = (async () => {
        const expectedRevision = revision(id);
        const form = {
          client_id: get(id, "clientId"),
          grant_type: "refresh_token",
          refresh_token: get(id, "refreshToken"),
        };
        if (id === "google" && get(id, "clientSecret"))
          form.client_secret = get(id, "clientSecret");
        if (id === "microsoft") form.scope = MS_SCOPES;
        const url =
          id === "google"
            ? "https://oauth2.googleapis.com/token"
            : `https://login.microsoftonline.com/${microsoftTenant()}/oauth2/v2.0/token`;
        const value = await request(id, url, {
          method: "POST",
          form,
          oauth: true,
        });
        await storeTokens(id, value, expectedRevision);
        return value.access_token;
      })().finally(() => refreshes.delete(id));
      refreshes.set(id, flow);
    }
    return refreshes.get(id);
  }
  async function api(id, path, options = {}) {
    const token = await accessToken(id);
    const bases = {
      github: "https://api.github.com",
      google: "https://www.googleapis.com",
      microsoft: "https://graph.microsoft.com/v1.0",
      homeassistant: get("homeassistant", "url"),
      tavily: "https://api.tavily.com",
    };
    return request(id, `${bases[id]}${path}`, { ...options, token });
  }
  async function googleApi(host, path, options = {}) {
    return request("google", `https://${host}${path}`, {
      ...options,
      token: await accessToken("google"),
    });
  }
  async function googleConnect() {
    if (!get("google", "clientId"))
      throw new Error(
        "Google Desktop-OAuth-Client-ID unter Verbindungen speichern.",
      );
    cancel("google");
    const expectedRevision = revision("google");
    const state = randomBytes(32).toString("base64url");
    const verifier = randomBytes(48).toString("base64url");
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    let redirect;
    let consumed = false;
    const server = http.createServer(async (req, res) => {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      res.setHeader(
        "Content-Security-Policy",
        "default-src 'none'; style-src 'unsafe-inline'",
      );
      res.setHeader("Referrer-Policy", "no-referrer");
      const finish = (code, title, message) => {
        res.statusCode = code;
        res.end(
          `<!doctype html><html lang="de"><meta charset="utf-8"><title>AEGIS</title><body style="background:#071118;color:#dcfff4;font:20px system-ui;padding:10vw"><h1>${title}</h1><p>${message}</p><p>Dieses Fenster kann geschlossen werden.</p></body></html>`,
        );
      };
      let callback;
      try {
        callback = new URL(req.url, redirect);
      } catch {
        finish(
          400,
          "Ungültige Anfrage",
          "Bitte Anmeldung in AEGIS erneut starten.",
        );
        return;
      }
      if (
        req.method !== "GET" ||
        callback.pathname !== "/oauth/google/callback" ||
        req.headers.host !== new URL(redirect).host
      ) {
        finish(404, "Nicht gefunden", "Bitte zurück zu AEGIS wechseln.");
        return;
      }
      const receivedState = Buffer.from(
        callback.searchParams.get("state") ?? "",
      );
      const expectedState = Buffer.from(state);
      if (
        receivedState.length !== expectedState.length ||
        !timingSafeEqual(receivedState, expectedState) ||
        consumed ||
        pending.get("google")?.server !== server
      ) {
        finish(
          400,
          "Anmeldung nicht bestätigt",
          "Die Anmeldeanfrage ist ungültig oder bereits abgeschlossen.",
        );
        return;
      }
      consumed = true;
      try {
        const code = callback.searchParams.get("code");
        if (!code || callback.searchParams.has("error"))
          throw new Error(
            "Google-Anmeldung wurde abgebrochen oder nicht freigegeben.",
          );
        const form = {
          client_id: get("google", "clientId"),
          code,
          code_verifier: verifier,
          grant_type: "authorization_code",
          redirect_uri: redirect,
        };
        if (get("google", "clientSecret"))
          form.client_secret = get("google", "clientSecret");
        const token = await request(
          "google",
          "https://oauth2.googleapis.com/token",
          { method: "POST", form, oauth: true },
        );
        await storeTokens("google", token, expectedRevision);
        finish(
          200,
          "AEGIS verbunden",
          "Die Google-Anmeldung war erfolgreich. Zurück zur App wechseln.",
        );
      } catch (error) {
        if (revision("google") === expectedRevision)
          states.set("google", { status: "error", message: error.message });
        finish(
          400,
          "Anmeldung fehlgeschlagen",
          "Details findest du in AEGIS unter Verbindungen.",
        );
      } finally {
        if (pending.get("google")?.server === server) cancel("google");
        else server.close();
      }
    });
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    server.unref();
    redirect = `http://127.0.0.1:${server.address().port}/oauth/google/callback`;
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.search = new URLSearchParams({
      client_id: get("google", "clientId"),
      redirect_uri: redirect,
      response_type: "code",
      scope: GOOGLE_SCOPES.join(" "),
      state,
      code_challenge: challenge,
      code_challenge_method: "S256",
      access_type: "offline",
      prompt: "consent",
    }).toString();
    const timer = setTimeout(() => {
      cancel("google");
      states.set("google", {
        status: "error",
        message: "Anmeldung nach 5 Minuten abgelaufen. Erneut verbinden.",
      });
    }, 5 * 60000);
    timer.unref();
    pending.set("google", { server, timer });
    states.set("google", {
      status: "pending",
      message: "Anmeldung im Browser abschließen.",
    });
    try {
      await desktop.openExternal?.(url.toString());
    } catch {
      /* The URL is returned so the UI can offer manual navigation. */
    }
    return {
      ...status("google"),
      url: url.toString(),
      message:
        "Google-Anmeldung im Browser abschließen. Der Status aktualisiert sich danach automatisch.",
    };
  }
  function microsoftPublic(entry) {
    return {
      ...status("microsoft"),
      verificationUri: entry.verificationUri,
      userCode: entry.userCode,
      message: `Im Browser ${entry.verificationUri} öffnen und Code ${entry.userCode} eingeben.`,
      expiresAt: new Date(entry.expiresAt).toISOString(),
    };
  }
  async function pollMicrosoft() {
    const entry = pending.get("microsoft");
    if (!entry) return status("microsoft");
    if (Date.now() > entry.expiresAt) {
      cancel("microsoft");
      states.set("microsoft", {
        status: "error",
        message: "Anmeldecode abgelaufen. Erneut verbinden.",
      });
      return status("microsoft");
    }
    if (entry.polling || Date.now() < entry.nextPoll)
      return microsoftPublic(entry);
    entry.polling = true;
    entry.nextPoll = Date.now() + entry.interval * 1000;
    try {
      const token = await request(
        "microsoft",
        `https://login.microsoftonline.com/${microsoftTenant()}/oauth2/v2.0/token`,
        {
          method: "POST",
          form: {
            client_id: get("microsoft", "clientId"),
            grant_type: "urn:ietf:params:oauth:grant-type:device_code",
            device_code: entry.deviceCode,
          },
          oauth: true,
        },
      );
      if (pending.get("microsoft") !== entry) return status("microsoft");
      await storeTokens("microsoft", token, entry.revision);
      cancel("microsoft");
      return status("microsoft");
    } catch (error) {
      if (pending.get("microsoft") !== entry) return status("microsoft");
      if (error.oauthCode === "authorization_pending")
        return microsoftPublic(entry);
      if (error.oauthCode === "slow_down") {
        entry.interval += 5;
        entry.nextPoll = Date.now() + entry.interval * 1000;
        return microsoftPublic(entry);
      }
      cancel("microsoft");
      states.set("microsoft", {
        status: "error",
        message:
          error.oauthCode === "authorization_declined" ||
          error.oauthCode === "access_denied"
            ? "Microsoft-Anmeldung wurde nicht freigegeben."
            : error.message,
      });
      return status("microsoft");
    } finally {
      entry.polling = false;
    }
  }
  async function microsoftConnect() {
    if (!get("microsoft", "clientId"))
      throw new Error(
        "Microsoft Application (Client) ID speichern; in Entra Public Client Flow aktivieren.",
      );
    validateMicrosoftClientId(get("microsoft", "clientId"));
    cancel("microsoft");
    const value = await request(
      "microsoft",
      `https://login.microsoftonline.com/${microsoftTenant()}/oauth2/v2.0/devicecode`,
      {
        method: "POST",
        form: { client_id: get("microsoft", "clientId"), scope: MS_SCOPES },
        oauth: true,
      },
    );
    const verification = new URL(
      value.verification_uri ?? "https://microsoft.com/devicelogin",
    );
    if (
      verification.protocol !== "https:" ||
      verification.port ||
      verification.username ||
      verification.password ||
      ![
        "microsoft.com",
        "www.microsoft.com",
        "login.microsoftonline.com",
        "aka.ms",
      ].includes(verification.hostname)
    )
      throw new Error("Unerwartete Microsoft-Anmelde-URL blockiert.");
    if (
      !value.device_code ||
      typeof value.user_code !== "string" ||
      !/^[A-Z0-9-]{4,30}$/i.test(value.user_code)
    )
      throw new Error("Microsoft hat keinen gültigen Anmeldecode geliefert.");
    const entry = {
      revision: revision("microsoft"),
      deviceCode: value.device_code,
      userCode: value.user_code,
      verificationUri: verification.toString(),
      expiresAt:
        Date.now() + Math.min(Number(value.expires_in) || 900, 1800) * 1000,
      interval: Math.max(Number(value.interval) || 5, 5),
      nextPoll: 0,
      polling: false,
    };
    const schedule = () => {
      entry.timer = setTimeout(async () => {
        await pollMicrosoft();
        if (pending.get("microsoft") === entry) schedule();
      }, entry.interval * 1000);
      entry.timer.unref();
    };
    pending.set("microsoft", entry);
    states.set("microsoft", {
      status: "pending",
      message: `Anmeldecode ${entry.userCode} im Browser bestätigen.`,
    });
    schedule();
    try {
      await desktop.openExternal?.(verification.toString());
    } catch {
      /* The visible code and URL still allow sign-in. */
    }
    return microsoftPublic(entry);
  }
  async function connect(id) {
    provider(id);
    return id === "google"
      ? googleConnect()
      : id === "microsoft"
        ? microsoftConnect()
        : test(id);
  }
  async function test(id) {
    provider(id);
    if (id === "microsoft" && pending.has(id)) return pollMicrosoft();
    if (id === "google" && pending.has(id)) return status(id);
    if (!configured(id))
      throw new Error(
        `${PROVIDERS[id].name}: zuerst Zugangsdaten unter Verbindungen speichern.`,
      );
    const expectedRevision = revision(id);
    try {
      let result;
      if (id === "github") {
        result = await request(id, "https://api.github.com/user", {
          token: get(id, "token"),
        });
        if (!result.login)
          throw new Error("GitHub hat kein gültiges Benutzerprofil geliefert.");
        await set(id, "account", cleanText(result.login, 200));
      } else if (id === "homeassistant") {
        result = await request(id, `${homeBase(get(id, "url"))}/api/`, {
          token: get(id, "token"),
        });
        if (typeof result.message !== "string")
          throw new Error(
            "Home Assistant hat keine gültige API-Antwort geliefert.",
          );
      } else if (id === "tavily") {
        result = await request(id, "https://api.tavily.com/search", {
          method: "POST",
          token: get(id, "apiKey"),
          body: {
            query: "Tavily",
            max_results: 1,
            include_answer: false,
            include_raw_content: false,
          },
        });
        if (!Array.isArray(result.results))
          throw new Error(
            "Tavily hat keine gültigen Suchergebnisse geliefert.",
          );
      } else if (id === "google") {
        result = await request(
          id,
          "https://openidconnect.googleapis.com/v1/userinfo",
          { token: await accessToken(id) },
        );
        if (!result.sub)
          throw new Error("Google hat kein gültiges Benutzerprofil geliefert.");
        await set(id, "account", cleanText(result.email, 200));
      } else {
        result = await api(
          id,
          "/me?$select=id,displayName,mail,userPrincipalName",
        );
        if (!result.id)
          throw new Error(
            "Microsoft hat kein gültiges Benutzerprofil geliefert.",
          );
        await set(
          id,
          "account",
          cleanText(
            result.mail || result.userPrincipalName || result.displayName,
            200,
          ),
        );
      }
      if (revision(id) !== expectedRevision)
        throw new Error("Verbindung wurde zwischenzeitlich geändert.");
      await set(id, "verified", "true");
      states.set(id, {
        status: "connected",
        message:
          id === "tavily"
            ? "Websuche bestätigt. Der Verbindungstest verbraucht einen Such-Credit."
            : "Verbindung erfolgreich geprüft.",
      });
      return status(id);
    } catch (error) {
      if (revision(id) === expectedRevision) {
        await set(id, "verified", "");
        states.set(id, { status: "error", message: error.message });
      }
      throw error;
    }
  }
  function tools() {
    return TOOLS.filter((item) => connected(item.connector)).map((item) =>
      structuredClone(item),
    );
  }
  async function execute(name, args = {}) {
    const spec = TOOLS.find((item) => item.name === name);
    if (!spec) throw new Error("Unbekanntes Connector-Tool.");
    if (!args || typeof args !== "object" || Array.isArray(args))
      throw new Error("Tool-Argumente müssen ein Objekt sein.");
    if (
      Object.keys(args).some(
        (field) => !Object.hasOwn(spec.parameters.properties, field),
      )
    )
      throw new Error("Unbekannte Tool-Argumente.");
    for (const required of spec.parameters.required)
      if (args[required] === undefined) throw new Error(`${required} fehlt.`);
    if (!connected(spec.connector))
      throw new Error(
        `${PROVIDERS[spec.connector].name} ist nicht verbunden. Unter Verbindungen einrichten.`,
      );
    const query = (params) => new URLSearchParams(params).toString();
    switch (name) {
      case "github_repositories": {
        const data = await api(
          "github",
          `/user/repos?sort=updated&per_page=${limit(args.limit, 20, 50)}`,
        );
        return {
          repositories: data.map((r) => ({
            name: r.full_name,
            description: cleanText(r.description, 1000),
            url: r.html_url,
            private: r.private,
            updatedAt: r.updated_at,
            openIssues: r.open_issues_count,
          })),
        };
      }
      case "github_issues": {
        const owner = repoPart(args.owner, "owner"),
          repo = repoPart(args.repo, "repo");
        const state = args.state ?? "open";
        if (!["open", "closed", "all"].includes(state))
          throw new Error("Ungültiger Issue-Status.");
        const data = await api(
          "github",
          `/repos/${owner}/${repo}/issues?state=${state}&per_page=30&sort=updated`,
        );
        return {
          issues: data.map((r) => ({
            number: r.number,
            title: r.title,
            body: cleanText(r.body, 5000),
            state: r.state,
            url: r.html_url,
            isPullRequest: Boolean(r.pull_request),
            updatedAt: r.updated_at,
            assignees: (r.assignees ?? []).map((a) => a.login),
          })),
        };
      }
      case "github_create_issue": {
        const owner = repoPart(args.owner, "owner"),
          repo = repoPart(args.repo, "repo");
        const body = {
          title: str(args.title, "title", 250),
          body: str(args.body, "body", 50000),
        };
        const created = await api("github", `/repos/${owner}/${repo}/issues`, {
          method: "POST",
          body,
        });
        if (!Number.isInteger(created.number))
          throw new Error(
            "GitHub bestätigte keine Issue-Nummer. Status im Repository prüfen, bevor erneut erstellt wird.",
          );
        const verified = await verify(
          () =>
            api("github", `/repos/${owner}/${repo}/issues/${created.number}`),
          (item) => item.number === created.number && item.title === body.title,
        );
        return {
          created: true,
          number: created.number,
          url: created.html_url,
          title: created.title,
          ...verified,
        };
      }
      case "google_mail_search": {
        const data = await googleApi(
          "gmail.googleapis.com",
          `/gmail/v1/users/me/messages?${query({ q: str(args.query, "query", 1000, true) || "in:inbox", maxResults: String(limit(args.limit, 10, 20)) })}`,
        );
        const messages = [];
        for (const item of data.messages ?? [])
          messages.push(
            messageData(
              await googleApi(
                "gmail.googleapis.com",
                `/gmail/v1/users/me/messages/${identifier(item.id, "id")}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`,
              ),
            ),
          );
        return { messages, hasMore: Boolean(data.nextPageToken) };
      }
      case "google_mail_read":
        return messageData(
          await googleApi(
            "gmail.googleapis.com",
            `/gmail/v1/users/me/messages/${identifier(args.id, "id")}?format=full`,
          ),
        );
      case "google_mail_draft": {
        const fields = mailArgs(args);
        const encodedSubject = `=?UTF-8?B?${Buffer.from(fields.subject).toString("base64")}?=`;
        const mime = `To: ${fields.to}\r\nSubject: ${encodedSubject}\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${
          Buffer.from(fields.body)
            .toString("base64")
            .match(/.{1,76}/g)
            ?.join("\r\n") ?? ""
        }\r\n`;
        const created = await googleApi(
          "gmail.googleapis.com",
          "/gmail/v1/users/me/drafts",
          {
            method: "POST",
            body: { message: { raw: Buffer.from(mime).toString("base64url") } },
          },
        );
        if (!created.id)
          throw new Error(
            "Gmail bestätigte keine Entwurf-ID. Entwürfe im Postfach prüfen, bevor erneut erstellt wird.",
          );
        const verified = await verify(
          () =>
            googleApi(
              "gmail.googleapis.com",
              `/gmail/v1/users/me/drafts/${identifier(created.id, "id")}?format=metadata`,
            ),
          (item) => item.id === created.id,
        );
        return {
          created: true,
          draftId: created.id,
          to: fields.to,
          subject: fields.subject,
          sent: false,
          ...verified,
        };
      }
      case "google_calendar": {
        const range = dateRange(args, true);
        const data = await api(
          "google",
          `/calendar/v3/calendars/primary/events?${query({ timeMin: range.start, timeMax: range.end, singleEvents: "true", orderBy: "startTime", maxResults: "100" })}`,
        );
        return {
          events: (data.items ?? []).map((event) => ({
            id: event.id,
            title: event.summary,
            start: event.start,
            end: event.end,
            location: event.location,
            description: cleanText(event.description, 4000),
            attendees: (event.attendees ?? []).map((a) => ({
              email: a.email,
              status: a.responseStatus,
            })),
            url: event.htmlLink,
          })),
          hasMore: Boolean(data.nextPageToken),
        };
      }
      case "google_calendar_create": {
        const range = dateRange(args);
        const body = {
          summary: str(args.title, "title", 300),
          start: { dateTime: range.start },
          end: { dateTime: range.end },
          description: str(args.description, "description", 5000, true),
          location: str(args.location, "location", 1000, true),
        };
        const created = await api(
          "google",
          "/calendar/v3/calendars/primary/events?sendUpdates=none",
          { method: "POST", body },
        );
        if (!created.id)
          throw new Error(
            "Google bestätigte keine Termin-ID. Kalender prüfen, bevor erneut erstellt wird.",
          );
        const verified = await verify(
          () =>
            api(
              "google",
              `/calendar/v3/calendars/primary/events/${identifier(created.id, "id")}`,
            ),
          (item) =>
            item.id === created.id &&
            item.summary === body.summary &&
            Date.parse(item.start?.dateTime) === Date.parse(range.start) &&
            Date.parse(item.end?.dateTime) === Date.parse(range.end),
        );
        return {
          created: true,
          id: created.id,
          title: created.summary,
          url: created.htmlLink,
          ...range,
          ...verified,
        };
      }
      case "google_drive_search": {
        const term = str(args.query, "query", 300)
          .replace(/\\/g, "\\\\")
          .replace(/'/g, "\\'");
        const data = await api(
          "google",
          `/drive/v3/files?${query({ q: `trashed = false and name contains '${term}'`, fields: "nextPageToken,files(id,name,mimeType,modifiedTime,webViewLink,size)", pageSize: "30", orderBy: "modifiedTime desc" })}`,
        );
        return {
          files: data.files ?? [],
          hasMore: Boolean(data.nextPageToken),
        };
      }
      case "google_drive_read": {
        const id = identifier(args.id, "id");
        const meta = await api(
          "google",
          `/drive/v3/files/${id}?fields=id,name,mimeType,size`,
        );
        if (Number(meta.size) > 2 * 1024 * 1024)
          throw new Error(
            "Datei zu groß. Textdateien bis 2 MB werden unterstützt.",
          );
        const route =
          meta.mimeType === "application/vnd.google-apps.document"
            ? `/drive/v3/files/${id}/export?mimeType=text%2Fplain`
            : meta.mimeType === "text/plain"
              ? `/drive/v3/files/${id}?alt=media`
              : null;
        if (!route)
          throw new Error(
            "Direktes Lesen unterstützt Google Docs und text/plain. Andere Formate können über ihren Link geöffnet werden.",
          );
        const content = await api("google", route, { text: true });
        return {
          id: meta.id,
          name: meta.name,
          content: cleanText(content, 50000),
          truncated: content.length > 50000,
        };
      }
      case "microsoft_mail": {
        const term = str(args.query, "query", 500, true);
        const params = {
          $top: String(limit(args.limit, 10, 20)),
          $select:
            "id,subject,from,receivedDateTime,bodyPreview,isRead,importance,webLink",
        };
        if (term) params.$search = `"${term.replace(/["\\\r\n]/g, " ")}"`;
        else params.$orderby = "receivedDateTime desc";
        const data = await api("microsoft", `/me/messages?${query(params)}`);
        return {
          messages: data.value ?? [],
          hasMore: Boolean(data["@odata.nextLink"]),
        };
      }
      case "microsoft_mail_read": {
        const item = await api(
          "microsoft",
          `/me/messages/${identifier(args.id, "id")}?$select=id,subject,from,toRecipients,receivedDateTime,body,webLink`,
          { headers: { Prefer: 'outlook.body-content-type="text"' } },
        );
        return {
          ...item,
          body: { ...item.body, content: cleanText(item.body?.content) },
        };
      }
      case "microsoft_mail_draft": {
        const fields = mailArgs(args);
        const created = await api("microsoft", "/me/messages", {
          method: "POST",
          body: {
            subject: fields.subject,
            body: { contentType: "Text", content: fields.body },
            toRecipients: [{ emailAddress: { address: fields.to } }],
          },
        });
        if (!created.id)
          throw new Error(
            "Outlook bestätigte keine Entwurf-ID. Postfach prüfen, bevor erneut erstellt wird.",
          );
        const verified = await verify(
          () =>
            api(
              "microsoft",
              `/me/messages/${identifier(created.id, "id")}?$select=id,isDraft,subject`,
            ),
          (item) =>
            item.id === created.id &&
            item.isDraft === true &&
            item.subject === fields.subject,
        );
        return {
          created: true,
          draftId: created.id,
          sent: false,
          to: fields.to,
          subject: fields.subject,
          url: created.webLink,
          ...verified,
        };
      }
      case "microsoft_mail_reply_draft": {
        const messageId = identifier(args.id, "id");
        const body = str(args.body, "body", 20000);
        const created = await api(
          "microsoft",
          `/me/messages/${messageId}/createReply`,
          {
            method: "POST",
            body: { comment: body },
          },
        );
        if (!created.id)
          throw new Error(
            "Outlook bestätigte keine Antwortentwurf-ID. Es wurde nichts gesendet.",
          );
        const verified = await verify(
          () =>
            api(
              "microsoft",
              `/me/messages/${identifier(created.id, "id")}?$select=id,isDraft,subject,webLink`,
            ),
          (item) => item.id === created.id && item.isDraft === true,
        );
        return {
          created: true,
          draftId: created.id,
          sent: false,
          subject: created.subject,
          url: created.webLink,
          ...verified,
        };
      }
      case "microsoft_calendar": {
        const range = dateRange(args, true);
        const data = await api(
          "microsoft",
          `/me/calendarView?${query({ startDateTime: range.start, endDateTime: range.end, $top: "100", $orderby: "start/dateTime", $select: "id,subject,start,end,location,bodyPreview,attendees,webLink" })}`,
          { headers: { Prefer: 'outlook.timezone="UTC"' } },
        );
        return {
          events: data.value ?? [],
          hasMore: Boolean(data["@odata.nextLink"]),
        };
      }
      case "microsoft_calendar_create": {
        const range = dateRange(args);
        const subject = str(args.title, "title", 300);
        const body = {
          subject,
          start: { dateTime: range.start.replace("Z", ""), timeZone: "UTC" },
          end: { dateTime: range.end.replace("Z", ""), timeZone: "UTC" },
          body: {
            contentType: "Text",
            content: str(args.description, "description", 5000, true),
          },
          location: { displayName: str(args.location, "location", 1000, true) },
        };
        const created = await api("microsoft", "/me/events", {
          method: "POST",
          body,
        });
        if (!created.id)
          throw new Error(
            "Microsoft bestätigte keine Termin-ID. Kalender prüfen, bevor erneut erstellt wird.",
          );
        const verified = await verify(
          () =>
            api(
              "microsoft",
              `/me/events/${identifier(created.id, "id")}?$select=id,subject,start,end`,
              { headers: { Prefer: 'outlook.timezone="UTC"' } },
            ),
          (item) =>
            item.id === created.id &&
            item.subject === subject &&
            Date.parse(`${item.start?.dateTime}Z`) ===
              Date.parse(range.start) &&
            Date.parse(`${item.end?.dateTime}Z`) === Date.parse(range.end),
        );
        return {
          created: true,
          id: created.id,
          title: subject,
          url: created.webLink,
          ...range,
          ...verified,
        };
      }
      case "microsoft_task_lists": {
        const data = await api("microsoft", "/me/todo/lists?$top=100");
        return {
          lists: data.value ?? [],
          hasMore: Boolean(data["@odata.nextLink"]),
        };
      }
      case "microsoft_tasks": {
        const data = await api(
          "microsoft",
          `/me/todo/lists/${identifier(args.listId, "listId")}/tasks?$top=100`,
        );
        return {
          tasks: (data.value ?? []).map((item) => ({
            id: item.id,
            title: item.title,
            status: item.status,
            dueDateTime: item.dueDateTime,
            body: cleanText(item.body?.content, 4000),
            importance: item.importance,
          })),
          hasMore: Boolean(data["@odata.nextLink"]),
        };
      }
      case "microsoft_task_create": {
        const listId = identifier(args.listId, "listId");
        const body = {
          title: str(args.title, "title", 300),
          body: {
            contentType: "text",
            content: str(args.body, "body", 5000, true),
          },
        };
        if (args.dueAt)
          body.dueDateTime = {
            dateTime: date(args.dueAt, "dueAt").replace("Z", ""),
            timeZone: "UTC",
          };
        const created = await api(
          "microsoft",
          `/me/todo/lists/${listId}/tasks`,
          { method: "POST", body },
        );
        if (!created.id)
          throw new Error(
            "Microsoft bestätigte keine Aufgaben-ID. Liste prüfen, bevor erneut erstellt wird.",
          );
        const verified = await verify(
          () =>
            api(
              "microsoft",
              `/me/todo/lists/${listId}/tasks/${identifier(created.id, "id")}`,
            ),
          (item) => item.id === created.id && item.title === body.title,
        );
        return {
          created: true,
          id: created.id,
          title: created.title,
          status: created.status,
          ...verified,
        };
      }
      case "home_states": {
        const domain = str(args.domain, "domain", 50, true);
        if (domain && !/^[a-z_]+$/.test(domain))
          throw new Error("Ungültige Home-Assistant-Domain.");
        const data = await api("homeassistant", "/api/states");
        if (!Array.isArray(data))
          throw new Error("Home Assistant lieferte keine Zustandsliste.");
        const filtered = data.filter(
          (item) => !domain || item.entity_id?.startsWith(`${domain}.`),
        );
        return {
          entities: filtered.slice(0, 250).map((item) => ({
            entityId: item.entity_id,
            state: item.state,
            name: item.attributes?.friendly_name,
            unit: item.attributes?.unit_of_measurement,
            brightness: item.attributes?.brightness,
            lastChanged: item.last_changed,
          })),
          truncated: filtered.length > 250,
        };
      }
      case "home_control": {
        const entityId = str(args.entityId, "entityId", 200);
        if (!/^(light|switch|scene)\.[a-z0-9_]+$/.test(entityId))
          throw new Error(
            "Nur eine konkrete light-, switch- oder scene-Entität ist erlaubt.",
          );
        const domain = entityId.split(".")[0];
        if (
          !["turn_on", "turn_off"].includes(args.service) ||
          (domain === "scene" && args.service !== "turn_on")
        )
          throw new Error("Dieser Gerätebefehl ist nicht freigegeben.");
        const body = { entity_id: entityId };
        if (args.brightness !== undefined) {
          if (
            domain !== "light" ||
            args.service !== "turn_on" ||
            !Number.isInteger(args.brightness) ||
            args.brightness < 0 ||
            args.brightness > 255
          )
            throw new Error(
              "brightness ist nur beim Einschalten eines Lichts zulässig (0–255).",
            );
          body.brightness = args.brightness;
        }
        await api("homeassistant", `/api/services/${domain}/${args.service}`, {
          method: "POST",
          body,
        });
        if (domain === "scene")
          return {
            requested: true,
            entityId,
            service: args.service,
            verified: false,
            verification:
              "Szenen-Aufruf vom Server angenommen. Einzelne Geräte einer Szene wurden nicht separat verifiziert.",
          };
        const expected =
          args.service === "turn_off" || args.brightness === 0 ? "off" : "on";
        const verification = await verify(
          () =>
            api("homeassistant", `/api/states/${encodeURIComponent(entityId)}`),
          (item) => item.entity_id === entityId && item.state === expected,
        );
        return {
          requested: true,
          entityId,
          service: args.service,
          expectedState: expected,
          ...verification,
        };
      }
      case "web_search": {
        const data = await api("tavily", "/search", {
          method: "POST",
          body: {
            query: str(args.query, "query", 1000),
            max_results: limit(args.limit, 5, 10),
            search_depth: "basic",
            include_answer: false,
            include_raw_content: false,
          },
        });
        return {
          query: data.query ?? args.query,
          sources: (data.results ?? []).map((item) => ({
            title: item.title,
            url: item.url,
            excerpt: cleanText(item.content, 6000),
            score: item.score,
          })),
          sourceType: "untrusted_external_content",
        };
      }
      default:
        throw new Error("Tool ist nicht implementiert.");
    }
  }
  async function verify(read, predicate) {
    try {
      const item = await read();
      return predicate(item)
        ? {
            verified: true,
            verification:
              "Ergebnis nach der Aktion erneut vom Dienst gelesen und bestätigt.",
          }
        : {
            verified: false,
            verification:
              "Aktion angenommen, aber erneutes Lesen bestätigte den erwarteten Zustand noch nicht. Vor Wiederholung prüfen.",
          };
    } catch {
      return {
        verified: false,
        verification:
          "Aktion angenommen; Ergebnis konnte anschließend nicht erneut gelesen werden. Vor Wiederholung im Dienst prüfen.",
      };
    }
  }
  function close() {
    for (const id of pending.keys()) cancel(id);
  }
  return { list, configure, connect, test, disconnect, tools, execute, close };
}
