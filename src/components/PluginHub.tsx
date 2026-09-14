import { useEffect, useMemo, useState } from "react";
import {
  Boxes,
  Check,
  ExternalLink,
  LoaderCircle,
  LockKeyhole,
  Mail,
  PlugZap,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { invoke, type Row } from "../lib/api";

const featuredNames = new Set([
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
]);

export default function PluginHub({
  notify,
}: {
  notify: (message: string, error?: boolean) => void;
}) {
  const [catalog, setCatalog] = useState<Row | null>(null),
    [loading, setLoading] = useState(true),
    [working, setWorking] = useState(""),
    [query, setQuery] = useState(""),
    [showAll, setShowAll] = useState(false);

  async function load(force = false) {
    setLoading(true);
    try {
      setCatalog(await invoke("plugins.catalog", { force }));
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error), true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load(false);
  }, []);

  const matchingPlugins = useMemo(() => {
    const all = (catalog?.plugins || []) as Row[];
    const needle = query.trim().toLowerCase();
    return all.filter((plugin) => {
      if (!needle)
        return showAll || plugin.featured || featuredNames.has(plugin.name);
      return `${plugin.displayName} ${plugin.description} ${plugin.category}`
        .toLowerCase()
        .includes(needle);
    });
  }, [catalog, query, showAll]);
  const plugins = matchingPlugins.slice(0, query.trim() || showAll ? 80 : 20);

  async function install(plugin: Row) {
    if (working) return;
    setWorking(plugin.name);
    try {
      const result = await invoke("plugins.install", { name: plugin.name });
      notify(result.message || `${plugin.displayName}: Einrichtung geöffnet.`);
      await load(false);
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error), true);
    } finally {
      setWorking("");
    }
  }

  async function login() {
    if (working) return;
    setWorking("account");
    try {
      const result = await invoke("plugins.login");
      notify(result.message || "ChatGPT-Anmeldung wurde geöffnet.");
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error), true);
    } finally {
      setWorking("");
    }
  }

  const outlook = (catalog?.plugins || []).find(
    (plugin: Row) => plugin.name === "outlook-email",
  );

  return (
    <div className="plugin-hub">
      <section className="panel plugin-hero">
        <div className="plugin-hero-copy">
          <span className="eyebrow">
            <span /> AEGIS EXTENSION GRID
          </span>
          <h2>Fertige Fähigkeiten. Dein letzter Klick.</h2>
          <p>
            Aegis nutzt den offiziellen Codex-/ChatGPT-Plugin-Katalog. Die
            Kontenanmeldung bleibt beim jeweiligen Anbieter; Passwörter und rohe
            OAuth-Tokens werden nicht in Aegis kopiert.
          </p>
          <div className="plugin-runtime-status">
            <span
              className={catalog?.runtime === "online" ? "online" : "cached"}
            >
              {catalog?.runtime === "online" ? "LIVE CATALOG" : "SAFE CACHE"}
            </span>
            <strong>
              {catalog?.account?.signedIn
                ? `ChatGPT verbunden${catalog.account.email ? ` · ${catalog.account.email}` : ""}`
                : catalog?.runtime === "online"
                  ? "ChatGPT-Anmeldung erforderlich"
                  : "Katalog bereit · Laufzeit wird beim Klick geprüft"}
            </strong>
            {catalog?.runtime === "online" && !catalog?.account?.signedIn && (
              <button disabled={!!working} onClick={() => void login()}>
                {working === "account" ? (
                  <LoaderCircle className="spin" size={14} />
                ) : (
                  <LockKeyhole size={14} />
                )}
                ChatGPT anmelden
              </button>
            )}
          </div>
        </div>
        <div className="plugin-orbit" aria-hidden="true">
          <Boxes size={38} />
          {Array.from({ length: 10 }, (_, index) => (
            <i
              key={index}
              style={{ transform: `rotate(${index * 36}deg) translateX(80px)` }}
            />
          ))}
        </div>
      </section>

      <section className="panel outlook-priority">
        <div className="outlook-mark">
          <Mail size={26} />
          <span>01</span>
        </div>
        <div>
          <span className="micro-label">EMPFOHLEN FÜR DEIN HOTMAIL</span>
          <h3>Outlook Email · ohne eigene Azure-App</h3>
          <p>
            Postfach lesen, Threads zusammenfassen und Antworten als Entwurf
            vorbereiten. Aegis darf nie selbst senden – der Sendeklick bleibt
            ausschließlich bei dir.
          </p>
          {!outlook?.connected && (
            <small>
              Der Klick öffnet bei Bedarf die offizielle ChatGPT-/Microsoft-
              Anmeldung. Danach hier „Status prüfen“ wählen.
            </small>
          )}
        </div>
        <button
          className={`plugin-action ${outlook?.connected ? "connected" : ""}`}
          disabled={!outlook || !outlook.available || !!working}
          onClick={() => outlook && install(outlook)}
        >
          {working === "outlook-email" ? (
            <LoaderCircle className="spin" size={16} />
          ) : outlook?.connected ? (
            <Check size={16} />
          ) : (
            <PlugZap size={16} />
          )}
          {outlook?.connected
            ? "Verbunden"
            : outlook?.installed
              ? "Hotmail verbinden"
              : "Mit einem Klick einrichten"}
        </button>
      </section>

      <div className="plugin-toolbar">
        <div className="search-input">
          <Search size={14} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Alle Plugins durchsuchen …"
            aria-label="Plugins durchsuchen"
          />
        </div>
        <span>
          {matchingPlugins.length} passend
          {matchingPlugins.length > plugins.length
            ? ` · ${plugins.length} angezeigt`
            : ""}
        </span>
        <button disabled={loading || !!working} onClick={() => void load(true)}>
          <RefreshCw size={14} className={loading ? "spin" : ""} />
          Status prüfen
        </button>
      </div>

      {catalog?.error && (
        <div className="plugin-cache-note">
          <LockKeyhole size={15} />
          <div>
            <strong>Lokaler Katalogmodus</strong>
            <span>
              Der Codex-App-Server antwortet gerade nicht. Installieren öffnet
              deshalb den offiziellen ChatGPT-Verbindungsdialog. Details:{" "}
              {catalog.error}
            </span>
          </div>
        </div>
      )}

      {loading && !catalog ? (
        <div className="plugin-loading">
          <LoaderCircle className="spin" /> Plugin-Katalog wird synchronisiert …
        </div>
      ) : (
        <div className="plugin-grid">
          {plugins.map((plugin, index) => (
            <article
              className={`plugin-card ${plugin.connected ? "connected" : ""}`}
              key={plugin.id || plugin.name}
              style={{ animationDelay: `${Math.min(index, 14) * 35}ms` }}
            >
              <div className="plugin-card-head">
                <div
                  className="plugin-glyph"
                  style={
                    plugin.brandColor
                      ? { borderColor: `${plugin.brandColor}88` }
                      : undefined
                  }
                >
                  {plugin.name.includes("mail") ? (
                    <Mail size={20} />
                  ) : (
                    <Sparkles size={20} />
                  )}
                </div>
                <span>{plugin.category}</span>
                {plugin.connected && <Check size={15} className="mint" />}
              </div>
              <h3>{plugin.displayName}</h3>
              <p>
                {plugin.description ||
                  "Fertige Fähigkeit aus dem Plugin-Katalog."}
              </p>
              <footer>
                <span>
                  {plugin.connected
                    ? "KONTO VERBUNDEN"
                    : plugin.installed
                      ? "INSTALLIERT · LOGIN OFFEN"
                      : plugin.available
                        ? "VERFÜGBAR"
                        : "NICHT VERFÜGBAR"}
                </span>
                <button
                  disabled={!plugin.available || !!working}
                  onClick={() => void install(plugin)}
                  title={plugin.disabledReason || "Plugin einrichten"}
                >
                  {working === plugin.name ? (
                    <LoaderCircle size={14} className="spin" />
                  ) : plugin.connected ? (
                    <Check size={14} />
                  ) : (
                    <ExternalLink size={14} />
                  )}
                  {plugin.connected ? "Bereit" : "Einrichten"}
                </button>
              </footer>
            </article>
          ))}
        </div>
      )}

      {!query && !showAll && (
        <button className="plugin-show-all" onClick={() => setShowAll(true)}>
          <Boxes size={15} /> Gesamten verfügbaren Katalog anzeigen
        </button>
      )}

      {matchingPlugins.length > plugins.length && (
        <p className="plugin-result-limit">
          Nutze die Suche, um weitere offizielle Erweiterungen gezielt zu
          finden.
        </p>
      )}

      <div className="plugin-policy">
        <ShieldCheck size={18} />
        <p>
          Plugin ≠ Vollmacht: Lesefunktionen dürfen Lagebilder erzeugen.
          Entwürfe werden sichtbar vorbereitet. Senden, Kaufen, Löschen oder
          Veröffentlichen bleibt eine ausdrückliche Nutzeraktion.
        </p>
      </div>
    </div>
  );
}
