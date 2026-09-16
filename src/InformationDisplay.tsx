import { useEffect, useState } from "react";
import { Maximize2, Monitor, Radio, X } from "lucide-react";
import LiveDesk from "./components/LiveDesk";
import { initialState, invoke, type AegisState, type Row } from "./lib/api";

// A second surface, not a second assistant: no microphone or realtime controller.
export default function InformationDisplay() {
  const [state, setState] = useState<AegisState>(initialState);
  const [error, setError] = useState("");
  const [online, setOnline] = useState(false);
  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      try {
        const next = await invoke("state");
        if (!alive) return;
        setOnline(true);
        setState((previous) => ({
          ...next,
          desk:
            (previous.desk?.revision ?? -1) > (next.desk?.revision ?? -1)
              ? previous.desk
              : next.desk,
        }));
      } catch {
        if (alive) setOnline(false);
      }
    };
    void refresh();
    const timer = setInterval(refresh, 2500);
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "F11") {
        event.preventDefault();
        window.aegis?.windowControl?.("fullscreen");
      }
    };
    window.addEventListener("keydown", keyboard);
    const unsubscribe = window.aegis?.onDesk?.((desk: Row) => {
      if (alive)
        setState((previous) =>
          (previous.desk?.revision ?? -1) > desk.revision
            ? previous
            : { ...previous, desk },
        );
    });
    return () => {
      alive = false;
      clearInterval(timer);
      unsubscribe?.();
      window.removeEventListener("keydown", keyboard);
    };
  }, []);
  const openInbox = () =>
    void invoke("tools.execute", {
      name: "world_mail",
      args: { provider: "microsoft", limit: 30 },
    }).catch((e) => setError(e.message));
  return (
    <div className="information-display">
      <header className="information-header">
        <div>
          <Monitor size={22} />
          <strong>
            AEGIS <span>LIVE DISPLAY</span>
          </strong>
        </div>
        <span className="micro-label">
          <i className={online ? "green-dot" : ""} />{" "}
          {online ? "MIT COMMAND CENTER VERBUNDEN" : "VERBINDUNG WIRD GEPRÜFT"}
        </span>
        <div className="information-controls">
          <button
            title="Vollbild umschalten (F11)"
            onClick={() => window.aegis?.windowControl?.("fullscreen")}
          >
            <Maximize2 size={16} />
          </button>
          <button
            title="Auf Hauptbildschirm zurückholen"
            onClick={() => window.aegis?.windowControl?.("close")}
          >
            <X size={18} />
          </button>
        </div>
      </header>
      <main>
        {state.desk?.visible ? (
          <LiveDesk
            desk={state.desk}
            homeCity={state.settings.homeCity || ""}
            notify={(text) => setError(text)}
          />
        ) : (
          <section className="display-standby">
            <div className="display-orbits" aria-hidden="true">
              <i />
              <i />
              <i />
              <Radio size={46} />
            </div>
            <span className="eyebrow">INFORMATION SYSTEM · ONLINE</span>
            <h1>Raum für deinen nächsten Auftrag.</h1>
            <p>
              Sprich auf dem Hauptbildschirm mit Aegis.
              <br />
              Postfach, Recherche und Quellen erscheinen hier – live und
              nachvollziehbar.
            </p>
            <button className="button primary" onClick={openInbox}>
              Postfach öffnen
            </button>
            <small>
              Ein Sprachkern. Zwei Bildschirme. Keine zweite KI-Sitzung.
            </small>
          </section>
        )}
      </main>
      {error && (
        <div className="display-notice" role="status">
          {error}
          <button onClick={() => setError("")} aria-label="Meldung schließen">
            <X size={16} />
          </button>
        </div>
      )}
      <footer>
        <span>AEGIS / INFORMATION SURFACE 02</span>
        <span>F11 · Vollbild umschalten &nbsp; ESC · Gespräch beenden</span>
      </footer>
    </div>
  );
}
