import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  Activity,
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  AudioLines,
  Bell,
  BrainCircuit,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  Clock3,
  Command,
  Copy,
  ExternalLink,
  FileText,
  FolderOpen,
  Github,
  Globe,
  Home,
  KeyRound,
  Layers3,
  LayoutDashboard,
  Link2,
  LoaderCircle,
  Mail,
  Maximize2,
  Mic,
  MicOff,
  Minus,
  Monitor,
  MoreHorizontal,
  Pause,
  Play,
  PlugZap,
  Plus,
  Radio,
  Search,
  Settings,
  Shield,
  ShieldCheck,
  Sparkles,
  Square,
  Target,
  Trash2,
  Undo2,
  Volume2,
  Workflow,
  X,
  Zap,
} from "lucide-react";
import {
  invoke,
  initialState,
  dateTime,
  relativeTime,
  type AegisState,
  type Row,
} from "./lib/api";
import { createVoiceSession } from "./lib/voice";
import Orb from "./components/Orb";
import MicrosoftSetup from "./components/MicrosoftSetup";
import LiveDesk, { DeskLaunchers } from "./components/LiveDesk";
import PluginHub from "./components/PluginHub";

type Page =
  | "command"
  | "missions"
  | "memory"
  | "routines"
  | "workspace"
  | "plugins"
  | "activity"
  | "settings";
const navigation: {
  id: Page;
  label: string;
  icon: typeof Activity;
  section?: string;
}[] = [
  { id: "command", label: "Command Center", icon: LayoutDashboard },
  { id: "missions", label: "Missionen", icon: Target },
  { id: "memory", label: "Gedächtnis", icon: BrainCircuit },
  { id: "routines", label: "Automationen", icon: Workflow },
  { id: "workspace", label: "Workspace", icon: FolderOpen },
  { id: "plugins", label: "Plugins", icon: PlugZap },
  { id: "activity", label: "Aktivitätsprotokoll", icon: Activity },
  { id: "settings", label: "Einstellungen", icon: Settings },
];
const statusNames: Record<string, string> = {
  draft: "Entwurf",
  running: "In Ausführung",
  approval: "Freigabe benötigt",
  completed: "Abgeschlossen",
  failed: "Fehlgeschlagen",
  paused: "Pausiert",
  pending: "Ausstehend",
  done: "Erledigt",
  open: "Offen",
  success: "Erfolgreich",
};
const templates = [
  {
    icon: Mail,
    title: "Inbox Intelligence",
    subtitle: "Wichtiges erkennen. Belege sehen.",
    prompt:
      "Prüfe mein verbundenes Outlook-/Hotmail-Postfach, zeige mir die wichtigsten neuen E-Mails im Live Desk und erkläre kurz, warum sie priorisiert wurden. Nichts senden.",
  },
  {
    icon: Radio,
    title: "Morning Command",
    subtitle: "Dein Tag. Auf einen Blick.",
    prompt:
      "Erstelle mein Tagesbriefing aus meinen echten offenen Missionen, Zusagen, Erinnerungen und verfügbaren Kalenderdaten. Zeige Prioritäten und fehlende Informationen.",
  },
  {
    icon: Layers3,
    title: "Projekt fortsetzen",
    subtitle: "Genau dort weitermachen.",
    prompt:
      "Hilf mir, ein Projekt wieder aufzunehmen. Suche in meinen gespeicherten Erinnerungen und freigegebenen Workspace-Dateien nach dem letzten Stand und offenen nächsten Schritten. Frage nach dem Projektnamen, wenn er fehlt.",
  },
  {
    icon: BrainCircuit,
    title: "Idee entwickeln",
    subtitle: "Aus einem Gedanken wird ein Plan.",
    prompt:
      "Ich möchte eine neue Idee mit dir entwickeln. Frage mich zuerst nach meiner Idee und dem gewünschten Ergebnis, bevor du einen umsetzbaren Plan vorschlägst.",
  },
];
function Badge({
  status,
  children,
}: {
  status?: string;
  children?: ReactNode;
}) {
  return (
    <span className={`badge ${status || ""}`}>
      <span />
      {children || statusNames[status || ""] || status}
    </span>
  );
}
function Empty({
  icon: Icon = Target,
  title,
  detail,
  action,
}: {
  icon?: typeof Target;
  title: string;
  detail: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Icon size={22} />
      </div>
      <h3>{title}</h3>
      <p>{detail}</p>
      {action}
    </div>
  );
}
function Modal({
  title,
  eyebrow,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  eyebrow?: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    const fn = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const nodes = Array.from(
          dialogRef.current?.querySelectorAll<HTMLElement>(
            'button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),a[href],[tabindex="0"]',
          ) || [],
        );
        const first = nodes[0],
          last = nodes[nodes.length - 1];
        if (!first) {
          e.preventDefault();
          return;
        }
        if (
          e.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === dialogRef.current)
        ) {
          e.preventDefault();
          last.focus();
        } else if (
          !e.shiftKey &&
          (document.activeElement === last ||
            document.activeElement === dialogRef.current)
        ) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    addEventListener("keydown", fn);
    return () => {
      removeEventListener("keydown", fn);
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="modal-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`modal ${wide ? "wide" : ""}`}
      >
        <div className="modal-heading">
          <div>
            <span className="eyebrow">{eyebrow || "AEGIS COMMAND"}</span>
            <h2>{title}</h2>
          </div>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Schließen"
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
function Button({
  children,
  onClick,
  disabled = false,
  kind = "",
  type = "button",
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  kind?: string;
  type?: "button" | "submit";
  className?: string;
}) {
  return (
    <button
      type={type}
      className={`button ${kind} ${className}`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

export default function App() {
  const [state, setState] = useState<AegisState>(initialState),
    [page, setPage] = useState<Page>("command"),
    [online, setOnline] = useState(false),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(""),
    [toast, setToast] = useState<{ text: string; error: boolean } | null>(null),
    [modal, setModal] = useState(""),
    [selectedId, setSelectedId] = useState<string | null>(null),
    [query, setQuery] = useState(""),
    [composer, setComposer] = useState(""),
    [now, setNow] = useState(Date.now()),
    [voiceStatus, setVoiceStatus] = useState("idle"),
    [voiceLines, setVoiceLines] = useState<{ role: string; content: string }[]>(
      [],
    ),
    [focusMinutes, setFocusMinutes] = useState(45),
    [viewConversation, setViewConversation] = useState(false);
  const [controlRequest, setControlRequest] = useState<Row | null>(null);
  const displayState = useRef<Row>({});
  const deskScene = useRef<string | undefined>(undefined);
  displayState.current = state.displays || {};
  const voice = useRef<ReturnType<typeof createVoiceSession> | null>(null),
    voiceLevel = useRef(0),
    startupAttempted = useRef(false),
    endRef = useRef<HTMLDivElement>(null),
    toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const notify = useCallback((text: string, error = false) => {
    setToast({ text, error });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), error ? 9000 : 4500);
  }, []);
  const refresh = useCallback(async () => {
    try {
      const next = await invoke("state");
      setState((previous) => ({
        ...initialState,
        ...next,
        desk:
          (previous.desk?.revision ?? -1) > (next.desk?.revision ?? -1)
            ? previous.desk
            : next.desk,
        settings: { ...initialState.settings, ...next.settings },
      }));
      setOnline(true);
    } catch {
      setOnline(false);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 2500);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(id);
      clearInterval(tick);
      voice.current?.stop();
    };
  }, [refresh]);
  useEffect(
    () =>
      window.aegis?.onDesk?.((desk: Row) => {
        setState((previous) =>
          (previous.desk?.revision ?? -1) > desk.revision
            ? previous
            : { ...previous, desk },
        );
        // Progress/draft updates must not steal focus back from Settings/Plugins.
        const newScene = desk.scene?.id !== deskScene.current;
        deskScene.current = desk.scene?.id;
        if (desk.visible && newScene && !displayState.current.secondaryActive)
          setPage("command");
      }),
    [],
  );
  useEffect(
    () =>
      window.aegis?.onDisplays?.((displays: Row) => {
        const wasSecondary = displayState.current.secondaryActive;
        displayState.current = displays;
        setState((previous) => ({ ...previous, displays }));
        if (wasSecondary && !displays.secondaryActive) setPage("command");
      }),
    [],
  );
  useEffect(
    () =>
      window.aegis?.onControl?.((request: Row) => {
        if (
          request.action === "navigate" &&
          [
            "command",
            "missions",
            "memory",
            "routines",
            "workspace",
            "plugins",
            "activity",
            "settings",
          ].includes(request.target)
        ) {
          setModal("");
          setQuery("");
          setPage(request.target as Page);
          setControlRequest(request);
          notify(
            `AEGIS öffnet ${request.target === "settings" ? "die Einstellungen" : request.target === "plugins" ? "Plugins" : request.target}.`,
          );
        } else if (request.action === "stop_voice") {
          startupAttempted.current = true;
          voice.current?.stop();
          setVoiceStatus("idle");
          setControlRequest(request);
          notify("Gespräch beendet. Das Mikrofon ist aus.");
        }
      }),
    [notify],
  );
  useEffect(() => {
    void invoke("app.view", { page, voiceStatus }).catch(() => {});
    if (
      controlRequest &&
      ((controlRequest.action === "navigate" &&
        page === controlRequest.target) ||
        (controlRequest.action === "stop_voice" && voiceStatus === "idle"))
    ) {
      // This effect runs after React committed the requested view, not before navigation.
      void invoke("app.control.ack", {
        id: controlRequest.id,
        page,
        voiceStatus,
      }).catch(() => {});
      setControlRequest(null);
    }
  }, [page, voiceStatus, controlRequest]);
  async function act(operation: string, payload: Row = {}, message?: string) {
    if (operation === "missions.pause") {
      try {
        const result = await invoke(operation, payload);
        await refresh();
        return result;
      } catch (error) {
        notify(String(error), true);
        return;
      }
    }
    if (busy) return;
    setBusy(operation);
    try {
      const result = await invoke(operation, payload);
      await refresh();
      if (message) notify(message);
      return result;
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error), true);
      return undefined;
    } finally {
      setBusy("");
    }
  }
  const voiceActive = ![
    "idle",
    "disconnected",
    "stopped",
    "error",
    "closed",
  ].includes(voiceStatus);
  async function toggleVoice(startup = false) {
    startupAttempted.current = true;
    if (voiceActive) {
      await voice.current?.stop();
      setVoiceStatus("idle");
      return;
    }
    if (!state.settings.hasApiKey || state.settings.provider !== "openai") {
      setPage("settings");
      notify(
        "Für Live-Sprache benötigst du einen OpenAI API-Schlüssel. Trage ihn unter KI-Verbindung ein.",
        true,
      );
      return;
    }
    if (!voice.current)
      voice.current = createVoiceSession({
        invoke,
        onNotice: (text) => notify(text, true),
        onStatus: (status: string) => setVoiceStatus(status),
        onAudioLevel: (level: number) => {
          voiceLevel.current = level;
        },
        onTranscript: (role: string, text: string) => {
          setVoiceLines((lines) => [
            ...lines.slice(-15),
            { role, content: text },
          ]);
          refresh();
        },
        onError: (error: any) => {
          notify(error?.message || String(error), true);
          setVoiceStatus("error");
        },
      });
    try {
      setVoiceStatus("connecting");
      await voice.current.start({ briefing: startup });
    } catch (error) {
      setVoiceStatus("error");
      notify(error instanceof Error ? error.message : String(error), true);
    }
  }
  useEffect(() => {
    if (
      loading ||
      !online ||
      !window.aegis ||
      startupAttempted.current ||
      !state.settings.voiceOnStartup ||
      !state.settings.hasApiKey ||
      state.settings.provider !== "openai"
    )
      return;
    // Cancel the scheduled start on unmount/StrictMode cleanup; never reconnect
    // from the state polling loop after a deliberate stop or a provider error.
    const timer = setTimeout(() => {
      void toggleVoice(true);
    }, 500);
    return () => clearTimeout(timer);
  }, [
    loading,
    online,
    state.settings.voiceOnStartup,
    state.settings.hasApiKey,
    state.settings.provider,
  ]);
  useEffect(() => {
    if (!state.settings.hasApiKey || state.settings.provider !== "openai")
      voice.current?.stop();
  }, [state.settings.hasApiKey, state.settings.provider]);
  useEffect(() => {
    const handler = () => {
      void toggleVoice();
    };
    const unsubscribe = window.aegis?.onVoiceToggle?.(handler);
    const stopSubscription = window.aegis?.onVoiceStop?.(() =>
      voice.current?.stop(),
    );
    const keyboard = (e: KeyboardEvent) => {
      if (e.key === "F11") {
        e.preventDefault();
        window.aegis?.windowControl?.("fullscreen");
      }
      if (e.code === "Space" && e.ctrlKey) {
        e.preventDefault();
        handler();
      }
      if (e.key === "Escape" && voiceActive) void voice.current?.stop();
    };
    window.addEventListener("aegis:voice-toggle", handler);
    window.addEventListener("keydown", keyboard);
    return () => {
      unsubscribe?.();
      stopSubscription?.();
      window.removeEventListener("aegis:voice-toggle", handler);
      window.removeEventListener("keydown", keyboard);
    };
  }, [voiceActive, state.settings.hasApiKey, state.settings.provider]);
  useEffect(() => {
    if (viewConversation)
      endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [state.messages.length, voiceLines.length, viewConversation]);
  async function sendChat(e?: FormEvent) {
    e?.preventDefault();
    const message = composer.trim();
    if (!message || busy) return;
    setComposer("");
    setViewConversation(true);
    const result = await act("chat", { message });
    if (!result) setComposer(message);
    if (
      result?.message &&
      state.settings.autoSpeak &&
      "speechSynthesis" in window &&
      !voiceActive
    ) {
      const speech = new SpeechSynthesisUtterance(result.message);
      speech.lang = "de-DE";
      speechSynthesis.speak(speech);
    }
  }
  const activeMissions = state.missions.filter(
      (m) => !["completed", "failed"].includes(m.status),
    ),
    approvals = state.missions.filter((m) => m.status === "approval"),
    openCommitments = state.commitments.filter((c) => c.status !== "done"),
    connected = state.connectors.filter((c) => c.connected),
    selectedMission = state.missions.find((m) => m.id === selectedId),
    hasAI = state.settings.hasApiKey || state.settings.provider === "ollama";
  const focusRemaining =
    state.focus.active && state.focus.endsAt
      ? Math.max(
          0,
          Math.ceil((new Date(state.focus.endsAt).getTime() - now) / 1000),
        )
      : 0;
  const greeting =
    new Date(now).getHours() < 11
      ? "Guten Morgen"
      : new Date(now).getHours() < 18
        ? "Willkommen zurück"
        : "Guten Abend";
  const addressTitle = state.settings.masterProtocol
    ? "Meister"
    : state.settings.name || "Boss";
  const title = {
    command: "Command Center",
    missions: "Mission Control",
    memory: "Dein Gedächtnis",
    routines: "Automationen",
    workspace: "Dein Workspace",
    plugins: "Plugin Control",
    activity: "Aktivitätsprotokoll",
    settings: "Systemeinstellungen",
  }[page];
  function pageTo(next: Page) {
    setPage(next);
    setQuery("");
  }
  function openMission(id: string) {
    setSelectedId(id);
    setModal("mission-detail");
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            pageTo("command");
          }}
          aria-label="Aegis Command Center"
        >
          <div className="brand-mark">
            <Shield size={24} strokeWidth={1.2} />
            <span />
          </div>
          <div>
            AEGIS<small>PERSONAL COMMAND OS</small>
          </div>
        </a>
        <div className="workspace-label">
          <span className="green-dot" /> PERSONAL WORKSPACE
          <ChevronDown size={12} />
        </div>
        <span className="nav-label">CONTROL</span>
        <nav>
          {navigation.slice(0, 6).map((n) => (
            <button
              className={`nav-item ${page === n.id ? "selected" : ""}`}
              key={n.id}
              onClick={() => pageTo(n.id)}
            >
              <n.icon size={17} />
              <span>{n.label}</span>
              {n.id === "missions" && activeMissions.length > 0 && (
                <i>{activeMissions.length}</i>
              )}
              {page === n.id && <span className="nav-active-dot" />}
            </button>
          ))}
        </nav>
        <span className="nav-label system-label">SYSTEM</span>
        <nav>
          {navigation.slice(6).map((n) => (
            <button
              className={`nav-item ${page === n.id ? "selected" : ""}`}
              key={n.id}
              onClick={() => pageTo(n.id)}
            >
              <n.icon size={17} />
              <span>{n.label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="privacy-card">
            <ShieldCheck size={17} />
            <strong>Deine Kontrolle. Immer.</strong>
            <p>
              Lokales Gedächtnis.
              <br />
              Nachvollziehbare Aktionen.
            </p>
          </div>
          <button className="user-card" onClick={() => pageTo("settings")}>
            <div className="avatar">
              {String(state.settings.name || "Boss")
                .slice(0, 1)
                .toUpperCase()}
            </div>
            <div>
              {state.settings.name || "Boss"}
              <span>Personal operator</span>
            </div>
            <Settings size={15} />
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            AEGIS <span>/</span>
            <strong>{title}</strong>
          </div>
          <div className="topbar-right">
            {voiceActive && page !== "command" && (
              <button
                className="global-voice-control"
                onClick={() => void toggleVoice()}
                title="Sprache läuft auf allen Seiten weiter · zum Beenden klicken"
                aria-label="Sprachverbindung beenden"
              >
                <Mic size={15} />
                <span>
                  {voiceStatus === "speaking"
                    ? "AEGIS spricht"
                    : voiceStatus === "thinking"
                      ? "AEGIS arbeitet"
                      : "AEGIS hört zu"}
                </span>
                <X size={13} />
              </button>
            )}
            <span className={`system-chip ${online ? "" : "offline"}`}>
              <span />
              {loading
                ? "VERBINDE…"
                : online
                  ? "LOCAL CORE ONLINE"
                  : "LOCAL CORE OFFLINE"}
            </span>
            <span className="topbar-time">
              {new Date(now).toLocaleTimeString("de-AT", {
                hour: "2-digit",
                minute: "2-digit",
              })}
              <small>
                {new Date(now).toLocaleDateString("de-AT", {
                  day: "2-digit",
                  month: "2-digit",
                })}
              </small>
            </span>
            {window.aegis?.windowControl && (
              <div className="window-controls">
                <button
                  aria-label="Minimieren"
                  onClick={() => window.aegis?.windowControl?.("minimize")}
                >
                  <Minus size={14} />
                </button>
                <button
                  aria-label="Fenstergröße ändern"
                  onClick={() => window.aegis?.windowControl?.("maximize")}
                >
                  <Maximize2 size={12} />
                </button>
                <button
                  aria-label="App schließen"
                  onClick={() => window.aegis?.windowControl?.("close")}
                >
                  <X size={14} />
                </button>
              </div>
            )}
          </div>
        </header>
        {!online && !loading && (
          <div className="offline-banner">
            <Radio size={15} /> Lokaler Dienst nicht erreichbar. Starte Aegis
            über den Desktop-Launcher.
            <button onClick={refresh}>Erneut verbinden</button>
          </div>
        )}
        <main className={`content page-${page}`}>
          {page === "command" ? (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">
                    <span /> YOUR WORLD. IN SYNC.
                  </div>
                  <h1>
                    {greeting}, <span>{addressTitle}.</span>
                  </h1>
                  <p>
                    {activeMissions.length
                      ? `${activeMissions.length} Mission${activeMissions.length === 1 ? "" : "en"} offen. Dein nächster Schritt wartet.`
                      : "Alles beginnt mit deiner nächsten Idee. Ich bin bereit."}
                  </p>
                </div>
                <Button onClick={() => setModal("new-mission")} kind="primary">
                  <Plus size={16} />
                  Neue Mission
                </Button>
              </div>
              {state.displays?.secondaryActive && (
                <div className="display-link">
                  <Monitor size={16} />
                  <span>Live-Ausgabe auf Bildschirm 2</span>
                  <small>
                    {state.desk?.visible
                      ? state.desk.scene?.title
                      : "Bereit für Postfach & Recherche"}
                  </small>
                </div>
              )}
              {(!state.desk?.visible || state.displays?.secondaryActive) && (
                <DeskLaunchers
                  open={() => {
                    void act("tools.execute", {
                      name: "world_view",
                      args: { action: "open" },
                    });
                  }}
                />
              )}
              <div
                className={`command-grid ${state.desk?.visible && !state.displays?.secondaryActive ? "desk-open" : ""}`}
              >
                <section className="core-panel panel">
                  <div className="panel-top">
                    <div className="micro-label">
                      <span
                        className={`green-dot ${voiceActive ? "pulse" : ""}`}
                      />{" "}
                      AEGIS INTELLIGENCE
                    </div>
                    <button
                      className="text-button"
                      onClick={() => setViewConversation(!viewConversation)}
                      aria-expanded={viewConversation}
                      aria-controls="aegis-conversation"
                    >
                      {viewConversation ? "Chat ausblenden" : "Chat anzeigen"}
                      <ChevronRight size={13} />
                    </button>
                  </div>
                  <>
                    <div className="orb-stage">
                      <div className="orb-corner top-left">
                        <span>VOICE INTERFACE</span>
                        <strong>
                          {voiceStatus === "connecting"
                            ? "CONNECTING"
                            : voiceActive
                              ? "CONNECTED"
                              : "STANDBY"}
                        </strong>
                      </div>
                      <div className="orb-corner top-right">
                        <span>CONTEXT ENGINE</span>
                        <strong>{state.memories.length} MEMORIES</strong>
                      </div>
                      <Orb
                        active={voiceActive || !!busy}
                        status={voiceStatus}
                        audioLevel={voiceLevel}
                      />
                      <div className="orb-caption">
                        <span className="eyebrow">
                          {voiceStatus === "speaking"
                            ? "AEGIS IS SPEAKING"
                            : busy === "chat" || voiceStatus === "thinking"
                              ? "PROCESSING YOUR REQUEST"
                              : voiceActive
                                ? "LIVE VOICE CONNECTION"
                                : "AWAITING YOUR COMMAND"}
                        </span>
                        <h2>
                          {voiceStatus === "speaking"
                            ? "Ich bin ganz bei dir."
                            : busy === "chat" || voiceStatus === "thinking"
                              ? "Ich kümmere mich darum."
                              : voiceActive
                                ? voiceStatus === "connecting"
                                  ? "Ich verbinde mich…"
                                  : `Ich höre zu, ${addressTitle}.`
                                : "Was bewegen wir heute?"}
                        </h2>
                        <p>
                          {voiceActive
                            ? "Sprich natürlich. Du kannst mich jederzeit unterbrechen."
                            : hasAI
                              ? "Sprache pausiert. Du bestimmst, wann ich wieder zuhöre."
                              : "Verbinde deine KI in Einstellungen. Danach begrüße ich dich beim Start."}
                        </p>
                      </div>
                      <div className="orb-coordinate left">01 / CORE</div>
                      <div className="orb-coordinate right">
                        {hasAI ? "AI CONFIGURED" : "LOCAL MODE"}
                      </div>
                    </div>
                  </>
                  {viewConversation && (
                    <div
                      className="conversation voice-transcript"
                      id="aegis-conversation"
                    >
                      <div className="conversation-title">
                        <AudioLines size={16} />
                        <span>Deine Konversation</span>
                        <button
                          className="icon-button"
                          onClick={() => setViewConversation(false)}
                          aria-label="Konversation schließen"
                        >
                          <X size={15} />
                        </button>
                      </div>
                      {state.messages.length === 0 &&
                        voiceLines.length === 0 && (
                          <Empty
                            icon={AudioLines}
                            title="Ein Gedanke genügt."
                            detail="Sprich oder schreibe, was du vorhast. Aegis verbindet deine Anfrage mit deinen freigegebenen Werkzeugen."
                          />
                        )}
                      {state.messages.map((m) => (
                        <div
                          className={`message ${m.role === "user" ? "user" : "assistant"}`}
                          key={m.id}
                        >
                          <span className="message-label">
                            {m.role === "user" ? state.settings.name : "AEGIS"}
                          </span>
                          <div>{m.content}</div>
                        </div>
                      ))}
                      {voiceLines.map((m, i) => (
                        <div
                          className={`message ${m.role === "user" ? "user" : "assistant"}`}
                          key={`voice-${i}`}
                        >
                          <span className="message-label">
                            {m.role === "user" ? state.settings.name : "AEGIS"}{" "}
                            · LIVE
                          </span>
                          <div>{m.content}</div>
                        </div>
                      ))}
                      {busy === "chat" && (
                        <div className="thinking">
                          <span />
                          <span />
                          <span />
                          <small>Aegis denkt nach…</small>
                        </div>
                      )}
                      <div ref={endRef} />
                    </div>
                  )}
                  <div className="voice-control" aria-live="polite">
                    <button
                      className={`voice-button ${voiceActive ? "active" : ""}`}
                      onClick={() => void toggleVoice()}
                      aria-label={
                        voiceActive
                          ? "Sprachverbindung beenden"
                          : "Sprachverbindung starten"
                      }
                    >
                      {voiceStatus === "connecting" ? (
                        <LoaderCircle size={22} className="spin" />
                      ) : voiceActive ? (
                        <AudioLines size={22} />
                      ) : (
                        <Mic size={22} />
                      )}
                    </button>
                    <div>
                      <strong>
                        {voiceStatus === "speaking"
                          ? "Aegis spricht"
                          : voiceStatus === "thinking"
                            ? "Aegis denkt nach"
                            : voiceActive
                              ? voiceStatus === "connecting"
                                ? "Verbindung wird aufgebaut"
                                : "Mikrofon aktiv · Ich höre zu"
                              : "Mit Aegis sprechen"}
                      </strong>
                      <span>
                        {voiceActive ? (
                          "Escape oder Mikrofon klicken zum Beenden · API-Kosten"
                        ) : (
                          <>
                            Mikrofon aktivieren <kbd>Ctrl</kbd>
                            <kbd>Space</kbd>
                          </>
                        )}
                      </span>
                    </div>
                    <span className="voice-bars">
                      {Array.from({ length: 15 }, (_, i) => (
                        <i
                          key={i}
                          style={{
                            height: `${5 + ((i * 7) % 16)}px`,
                            animationDelay: `${i * 0.09}s`,
                          }}
                          className={
                            voiceStatus === "speaking" ? "animated" : ""
                          }
                        />
                      ))}
                    </span>
                  </div>
                  {viewConversation && (
                    <form className="composer" onSubmit={sendChat}>
                      <Command size={17} />
                      <input
                        value={composer}
                        onChange={(e) => setComposer(e.target.value)}
                        placeholder="Gib mir einen Auftrag, Boss…"
                        aria-label="Nachricht an Aegis"
                        disabled={busy === "chat"}
                      />
                      <button
                        type="submit"
                        disabled={!composer.trim() || !!busy}
                        aria-label="Nachricht senden"
                      >
                        {busy === "chat" ? (
                          <LoaderCircle size={17} className="spin" />
                        ) : (
                          <ArrowUp size={18} />
                        )}
                      </button>
                    </form>
                  )}
                  <div className="composer-footer">
                    <span>
                      <ShieldCheck size={11} /> Aktionen bleiben nachvollziehbar
                    </span>
                    <span>
                      {viewConversation
                        ? "ENTER TO SEND"
                        : "VOICE FIRST · CHAT OPTIONAL"}
                    </span>
                  </div>
                </section>
                {state.desk?.visible && !state.displays?.secondaryActive && (
                  <LiveDesk
                    desk={state.desk}
                    homeCity={state.settings.homeCity || ""}
                    notify={notify}
                    obscured={!!modal}
                  />
                )}
                <aside className="right-rail">
                  <section className="panel missions-widget">
                    <div className="panel-top">
                      <h3>
                        <Target size={15} />
                        Aktive Missionen
                      </h3>
                      <span className="count">
                        {activeMissions.length.toString().padStart(2, "0")}
                      </span>
                    </div>
                    {activeMissions.length ? (
                      <div className="widget-list">
                        {activeMissions.slice(0, 3).map((m) => (
                          <button
                            className="mission-mini"
                            key={m.id}
                            onClick={() => openMission(m.id)}
                          >
                            <div>
                              <Badge status={m.status} />
                              <ArrowUpRight size={14} />
                            </div>
                            <strong>{m.title}</strong>
                            <small>
                              {m.steps?.filter((s: Row) =>
                                ["completed", "done"].includes(s.status),
                              ).length || 0}{" "}
                              / {m.steps?.length || 0} Schritte
                            </small>
                            <div className="progress">
                              <i
                                style={{
                                  width: `${((m.steps?.filter((s: Row) => ["completed", "done"].includes(s.status)).length || 0) / Math.max(1, m.steps?.length || 0)) * 100}%`,
                                }}
                              />
                            </div>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="widget-empty">
                        <div className="radar-empty">
                          <Target size={28} strokeWidth={1} />
                        </div>
                        <strong>Platz für deinen nächsten Plan.</strong>
                        <p>
                          Aegis plant Schritte, führt sie aus
                          <br />
                          und hält dich auf dem Laufenden.
                        </p>
                        <button
                          className="text-button"
                          onClick={() => setModal("new-mission")}
                        >
                          Erste Mission starten <Plus size={13} />
                        </button>
                      </div>
                    )}
                    <button
                      className="widget-bottom"
                      onClick={() => pageTo("missions")}
                    >
                      Mission Control öffnen
                      <ArrowUpRight size={14} />
                    </button>
                  </section>
                  <section className="panel agenda-widget">
                    <div className="panel-top">
                      <h3>
                        <Clock3 size={15} />
                        Im Blick behalten
                      </h3>
                      <button
                        className="icon-button"
                        onClick={() => setModal("new-commitment")}
                        aria-label="Zusage hinzufügen"
                      >
                        <Plus size={15} />
                      </button>
                    </div>
                    {openCommitments.length ? (
                      <div className="commitment-mini-list">
                        {openCommitments.slice(0, 3).map((c) => (
                          <div className="commitment-mini" key={c.id}>
                            <button
                              className="check-button"
                              onClick={() =>
                                act(
                                  "commitments.done",
                                  { id: c.id },
                                  "Zusage erledigt.",
                                )
                              }
                              aria-label="Als erledigt markieren"
                            />
                            <div>
                              <strong>{c.title}</strong>
                              <small>
                                {c.dueAt ? dateTime(c.dueAt) : "Ohne Termin"}
                                {c.person ? ` · ${c.person}` : ""}
                              </small>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="small-empty">
                        <span className="empty-dash">—</span>
                        <p>
                          Keine offenen Zusagen.
                          <br />
                          <small>Halte fest, was dir wichtig ist.</small>
                        </p>
                      </div>
                    )}
                  </section>
                  <section
                    className={`panel focus-widget ${state.focus.active ? "focus-on" : ""}`}
                  >
                    <div className="focus-top">
                      <div className="focus-symbol">
                        <AudioLines size={19} />
                      </div>
                      <span>FOCUS SPRINT · OPTIONALER TIMER</span>
                      <span className="green-dot" />
                    </div>
                    <h3>
                      {state.focus.active
                        ? `${Math.floor(focusRemaining / 60)
                            .toString()
                            .padStart(
                              2,
                              "0",
                            )}:${(focusRemaining % 60).toString().padStart(2, "0")}`
                        : "Ungestört an einer Sache arbeiten."}
                    </h3>
                    <p>
                      {state.focus.active
                        ? "Eine Sache. Deine volle Aufmerksamkeit."
                        : "Du wählst eine Dauer. Aegis erinnert dich am Ende; andere Apps werden nicht blockiert."}
                    </p>
                    <div className="focus-actions">
                      {!state.focus.active && (
                        <select
                          value={focusMinutes}
                          onChange={(e) =>
                            setFocusMinutes(Number(e.target.value))
                          }
                          aria-label="Fokusdauer"
                        >
                          <option value={25}>25 Minuten</option>
                          <option value={45}>45 Minuten</option>
                          <option value={60}>60 Minuten</option>
                          <option value={90}>90 Minuten</option>
                        </select>
                      )}
                      <button
                        onClick={() =>
                          act(
                            state.focus.active ? "focus.stop" : "focus.start",
                            state.focus.active ? {} : { minutes: focusMinutes },
                          )
                        }
                      >
                        {state.focus.active ? (
                          <>
                            <Square size={12} />
                            Beenden
                          </>
                        ) : (
                          <>
                            <Play size={12} />
                            Starten
                          </>
                        )}
                      </button>
                    </div>
                  </section>
                </aside>
              </div>
              <div className="section-label">
                <span>THE NEXT MOVE</span>
                <span>Beispielaufträge · nach deinen Daten personalisiert</span>
              </div>
              <div className="template-grid">
                {templates.map((t) => (
                  <button
                    className="template-card"
                    key={t.title}
                    onClick={() => {
                      setComposer(t.prompt);
                      document
                        .querySelector<HTMLInputElement>(".composer input")
                        ?.focus();
                    }}
                  >
                    <span className="template-icon">
                      <t.icon size={18} />
                    </span>
                    <div>
                      <strong>{t.title}</strong>
                      <span>{t.subtitle}</span>
                    </div>
                    <ArrowUpRight size={16} />
                  </button>
                ))}
              </div>
              {!hasAI && (
                <div className="setup-banner">
                  <div className="setup-icon">
                    <Zap size={18} />
                  </div>
                  <div>
                    <strong>Gib Aegis seine Stimme.</strong>
                    <span>
                      Verbinde deine KI für natürliche Gespräche, intelligente
                      Pläne und Bildschirmverständnis.
                    </span>
                  </div>
                  <button onClick={() => pageTo("settings")}>
                    KI verbinden <ArrowUpRight size={15} />
                  </button>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">AEGIS / {page.toUpperCase()}</div>
                  <h1>{title}</h1>
                  <p>
                    {
                      {
                        missions: "Vom Vorhaben zum überprüfbaren Ergebnis.",
                        memory:
                          "Dein Kontext bleibt. Auch wenn der Arbeitstag endet.",
                        routines:
                          "Wiederkehrende Arbeit bekommt einen eigenen Ablauf.",
                        workspace:
                          "Deine Dateien. Bewusst freigegeben und direkt erreichbar.",
                        plugins:
                          "Fertige Fähigkeiten verbinden. Konten bleiben unter deiner Kontrolle.",
                        activity: "Jeder Schritt hat eine Spur.",
                        settings:
                          "Dein Assistent. Deine Werkzeuge. Deine Regeln.",
                      }[page as Exclude<Page, "command">]
                    }
                  </p>
                </div>
                {page === "missions" && (
                  <Button
                    kind="primary"
                    onClick={() => setModal("new-mission")}
                  >
                    <Plus size={16} />
                    Neue Mission
                  </Button>
                )}
                {page === "memory" && (
                  <Button kind="primary" onClick={() => setModal("new-memory")}>
                    <Plus size={16} />
                    Erinnerung speichern
                  </Button>
                )}
                {page === "routines" && (
                  <Button
                    kind="primary"
                    onClick={() => setModal("new-routine")}
                  >
                    <Plus size={16} />
                    Neue Routine
                  </Button>
                )}
              </div>
              {page === "missions" && (
                <>
                  <div className="metric-row">
                    <div>
                      <span>MISSIONEN GESAMT</span>
                      <strong>
                        {state.missions.length.toString().padStart(2, "0")}
                      </strong>
                    </div>
                    <div>
                      <span>IN BEARBEITUNG</span>
                      <strong>
                        {activeMissions.length.toString().padStart(2, "0")}
                      </strong>
                    </div>
                    <div>
                      <span>DEINE FREIGABE</span>
                      <strong className="amber">
                        {approvals.length.toString().padStart(2, "0")}
                      </strong>
                    </div>
                    <div>
                      <span>ABGESCHLOSSEN</span>
                      <strong className="mint">
                        {state.missions
                          .filter((m) => m.status === "completed")
                          .length.toString()
                          .padStart(2, "0")}
                      </strong>
                    </div>
                  </div>
                  <div className="toolbar">
                    <span>ALLE MISSIONEN</span>
                    <div className="search-input">
                      <Search size={15} />
                      <input
                        placeholder="Mission suchen…"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                      />
                    </div>
                  </div>
                  {state.missions.length ? (
                    <div className="mission-grid">
                      {state.missions
                        .filter((m) =>
                          `${m.title} ${m.goal}`
                            .toLowerCase()
                            .includes(query.toLowerCase()),
                        )
                        .map((m) => (
                          <button
                            className="panel mission-card"
                            key={m.id}
                            onClick={() => openMission(m.id)}
                          >
                            <div>
                              <Badge status={m.status} />
                              <ArrowUpRight size={16} />
                            </div>
                            <h3>{m.title}</h3>
                            <p>{m.goal}</p>
                            <footer>
                              <span>{m.steps?.length || 0} Schritte</span>
                              <span>
                                {relativeTime(m.updatedAt || m.createdAt)}
                              </span>
                            </footer>
                          </button>
                        ))}
                    </div>
                  ) : (
                    <section className="panel">
                      <Empty
                        title="Große Vorhaben. Klare Schritte."
                        detail="Beschreibe dein Ziel. Aegis erstellt einen Plan mit konkreten Werkzeugen und zeigt dir, welche Aktionen deine Freigabe benötigen."
                        action={
                          <Button onClick={() => setModal("new-mission")}>
                            <Plus size={15} />
                            Mission planen
                          </Button>
                        }
                      />
                    </section>
                  )}
                  <section className="panel commitments-panel">
                    <div className="panel-top">
                      <h3>
                        <Bell size={16} />
                        Commitment Radar
                      </h3>
                      <button
                        className="text-button"
                        onClick={() => setModal("new-commitment")}
                      >
                        <Plus size={14} />
                        Zusage erfassen
                      </button>
                    </div>
                    {state.commitments.length ? (
                      state.commitments.map((c) => (
                        <div
                          className={`commitment-row ${c.status === "done" ? "done" : ""}`}
                          key={c.id}
                        >
                          <button
                            className={`check-button ${c.status === "done" ? "checked" : ""}`}
                            disabled={c.status === "done"}
                            onClick={() =>
                              act("commitments.done", { id: c.id })
                            }
                            aria-label="Zusage erledigen"
                          >
                            {c.status === "done" && <Check size={12} />}
                          </button>
                          <div>
                            <strong>{c.title}</strong>
                            <span>{c.person || "Persönlich"}</span>
                          </div>
                          <span
                            className={
                              c.dueAt &&
                              new Date(c.dueAt).getTime() < now &&
                              c.status !== "done"
                                ? "amber"
                                : ""
                            }
                          >
                            {c.dueAt ? dateTime(c.dueAt) : "Kein Termin"}
                          </span>
                        </div>
                      ))
                    ) : (
                      <div className="inline-empty">
                        Noch keine Zusagen gespeichert. Erfasse Deadlines und
                        Versprechen hier oder im Gespräch.
                      </div>
                    )}
                  </section>
                </>
              )}
              {page === "memory" && (
                <>
                  <div className="toolbar">
                    <span>
                      {state.memories.length} GESPEICHERTE ERINNERUNGEN
                    </span>
                    <div className="search-input">
                      <Search size={15} />
                      <input
                        placeholder="In deinem Gedächtnis suchen…"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                      />
                    </div>
                  </div>
                  {state.memories.length ? (
                    <div className="memory-grid">
                      {state.memories
                        .filter((m) =>
                          `${m.title} ${m.content} ${(m.tags || []).join(" ")}`
                            .toLowerCase()
                            .includes(query.toLowerCase()),
                        )
                        .map((m) => (
                          <article className="panel memory-card" key={m.id}>
                            <div className="memory-card-top">
                              <BrainCircuit size={18} />
                              <button
                                className="icon-button danger"
                                onClick={() => {
                                  setSelectedId(m.id);
                                  setModal("delete-memory");
                                }}
                                aria-label="Erinnerung löschen"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                            <h3>{m.title}</h3>
                            <p>{m.content}</p>
                            <div className="tags">
                              {(m.tags || []).map((t: string) => (
                                <span key={t}>#{t}</span>
                              ))}
                            </div>
                            <small>{dateTime(m.createdAt)}</small>
                          </article>
                        ))}
                    </div>
                  ) : (
                    <section className="panel">
                      <Empty
                        icon={BrainCircuit}
                        title="Kontext, der mit dir wächst."
                        detail="Speichere Projekte, Präferenzen und Entscheidungen. Aegis kann diese Erinnerungen in späteren Gesprächen wiederfinden."
                        action={
                          <Button onClick={() => setModal("new-memory")}>
                            <Plus size={15} />
                            Erste Erinnerung
                          </Button>
                        }
                      />
                    </section>
                  )}
                </>
              )}
              {page === "routines" && (
                <>
                  <section
                    className={`panel shadow-panel ${state.shadow.active ? "is-recording" : ""}`}
                  >
                    <div className="shadow-intro">
                      <span className="feature-icon">
                        <Monitor size={23} />
                      </span>
                      <div>
                        <span className="eyebrow">SHADOW MODE</span>
                        <h2>
                          {state.shadow.active
                            ? "Dein Ablauf nimmt Form an."
                            : "Zeig Aegis deinen Ablauf."}
                        </h2>
                        <p>
                          Während der Sitzung erfasst Aegis alle 7 Sekunden den
                          Titel des aktiven Windows-Fensters. Ergänze konkrete
                          Arbeitsschritte manuell. Daraus entsteht ein
                          Routine-Entwurf, kein automatisches Klick-Replay.
                        </p>
                      </div>
                    </div>
                    <Button
                      kind={state.shadow.active ? "" : "primary"}
                      onClick={() =>
                        act(
                          state.shadow.active ? "shadow.stop" : "shadow.start",
                          {},
                          state.shadow.active
                            ? "Aufzeichnung beendet. Prüfe den Routine-Entwurf."
                            : "Shadow-Sitzung gestartet.",
                        )
                      }
                    >
                      {state.shadow.active ? (
                        <>
                          <Square size={14} />
                          Beenden & Entwurf erstellen
                        </>
                      ) : (
                        <>
                          <Radio size={15} />
                          Sitzung starten
                        </>
                      )}
                    </Button>
                    {state.shadow.active && (
                      <div className="shadow-recorder">
                        <div className="recording-label">
                          <span className="red-dot" /> AKTIVE FENSTERTITEL +
                          DEINE NOTIZEN · Keine Bildschirm- oder
                          Tastaturaufnahme
                        </div>
                        <ShadowForm onSave={(v) => act("shadow.event", v)} />
                        {(state.shadow.events || []).map(
                          (e: Row, i: number) => (
                            <div className="shadow-event" key={e.id || i}>
                              <span>{String(i + 1).padStart(2, "0")}</span>
                              <p>
                                {e.title}
                                <small>{e.app || e.url || ""}</small>
                              </p>
                              <Check size={13} />
                            </div>
                          ),
                        )}
                      </div>
                    )}
                  </section>
                  <div className="toolbar">
                    <span>DEINE ROUTINEN</span>
                    <span>
                      {state.routines.filter((r) => r.enabled).length} aktiv ·
                      werden ausgeführt, solange Aegis läuft
                    </span>
                  </div>
                  {state.routines.length ? (
                    <div className="routine-list">
                      {state.routines.map((r) => (
                        <article className="panel routine-card" key={r.id}>
                          <div className="routine-icon">
                            <Workflow size={22} />
                          </div>
                          <div className="routine-info">
                            <h3>{r.title}</h3>
                            <p>{r.prompt}</p>
                            <small>
                              Alle {r.intervalMinutes} Min.
                              {r.lastRun
                                ? ` · Zuletzt ${relativeTime(r.lastRun)}`
                                : ""}
                              {r.nextRun && r.enabled
                                ? ` · Nächster Lauf ${dateTime(r.nextRun)}`
                                : ""}
                            </small>
                          </div>
                          <div className="routine-actions">
                            <button
                              role="switch"
                              aria-checked={r.enabled}
                              className={`switch ${r.enabled ? "on" : ""}`}
                              onClick={() =>
                                act("routines.save", {
                                  ...r,
                                  enabled: !r.enabled,
                                })
                              }
                              aria-label={`${r.title} ${r.enabled ? "deaktivieren" : "aktivieren"}`}
                            >
                              <span />
                            </button>
                            <button
                              className="icon-button"
                              onClick={() =>
                                act(
                                  "routines.run",
                                  { id: r.id },
                                  "Routine gestartet.",
                                )
                              }
                              aria-label="Routine jetzt ausführen"
                            >
                              <Play size={16} />
                            </button>
                            <button
                              className="icon-button danger"
                              onClick={() => {
                                setSelectedId(r.id);
                                setModal("delete-routine");
                              }}
                              aria-label="Routine löschen"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <section className="panel">
                      <Empty
                        icon={Workflow}
                        title="Weniger Wiederholung. Mehr Freiraum."
                        detail="Plane Briefings, Projektchecks und wiederkehrende Aufgaben. Jede Routine folgt denselben Freigaberegeln wie deine Missionen."
                        action={
                          <Button onClick={() => setModal("new-routine")}>
                            <Plus size={15} />
                            Routine definieren
                          </Button>
                        }
                      />
                    </section>
                  )}
                </>
              )}
              {page === "workspace" && (
                <Workspace
                  state={state}
                  act={act}
                  busy={busy}
                  notify={notify}
                />
              )}
              {page === "activity" && (
                <section className="panel activity-panel">
                  <div className="panel-top">
                    <h3>
                      <ShieldCheck size={16} />
                      Verifizierbare Historie
                    </h3>
                    <span className="micro-label">
                      {state.activity.length} EREIGNISSE
                    </span>
                  </div>
                  {state.activity.length ? (
                    <div className="activity-list">
                      {state.activity.map((a) => (
                        <div className="activity-row" key={a.id}>
                          <div
                            className={`activity-symbol ${["failed", "error"].includes(a.status) ? "failed" : ""}`}
                          >
                            {["failed", "error"].includes(a.status) ? (
                              <X size={15} />
                            ) : (
                              <Check size={15} />
                            )}
                          </div>
                          <div className="activity-info">
                            <strong>{a.title}</strong>
                            <p>
                              {typeof a.detail === "string"
                                ? a.detail
                                : JSON.stringify(a.detail)}
                            </p>
                            <small>{dateTime(a.createdAt)}</small>
                          </div>
                          {a.undoable && (
                            <Button
                              onClick={() =>
                                act(
                                  "activity.undo",
                                  { id: a.id },
                                  "Aktion rückgängig gemacht.",
                                )
                              }
                            >
                              <Undo2 size={14} />
                              Rückgängig
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <Empty
                      icon={Activity}
                      title="Die Geschichte deiner Aktionen."
                      detail="Sobald du Aegis einen Auftrag gibst, siehst du hier die ausgeführten Schritte und Ergebnisse. Unterstützte lokale Änderungen kannst du rückgängig machen."
                    />
                  )}
                </section>
              )}
              {page === "plugins" && <PluginHub notify={notify} />}
              {page === "settings" && (
                <SettingsPage
                  state={state}
                  act={act}
                  busy={busy}
                  notify={notify}
                />
              )}
            </>
          )}
        </main>
        <footer className="statusbar">
          <div>
            <span className={`green-dot ${!online ? "gray" : ""}`} />
            {online ? "SYSTEM READY" : "CONNECTING"}
            <span className="status-divider" />
            <ShieldCheck size={11} />
            LOCAL MEMORY
          </div>
          <div>
            {connected.length} CONNECTIONS
            <span className="status-divider" />
            {state.settings.provider === "ollama"
              ? "OLLAMA"
              : state.settings.hasApiKey
                ? "OPENAI CONFIGURED"
                : "AI NOT CONNECTED"}
            <span className="status-divider" />
            AEGIS v0.7.0
          </div>
        </footer>
      </div>
      {busy && busy !== "chat" && (
        <div className="busy-indicator">
          <LoaderCircle size={15} className="spin" />
          Aegis arbeitet…
        </div>
      )}
      {toast && (
        <div role="status" className={`toast ${toast.error ? "error" : ""}`}>
          {toast.error ? <X size={18} /> : <CheckCheck size={18} />}
          <span>{toast.text}</span>
          <button
            className="icon-button"
            onClick={() => setToast(null)}
            aria-label="Meldung schließen"
          >
            <X size={14} />
          </button>
        </div>
      )}
      {modal === "new-mission" && (
        <Modal
          title="Was ist die Mission?"
          eyebrow="MISSION PLANNER"
          onClose={() => setModal("")}
        >
          <MissionForm
            busy={!!busy}
            onSubmit={async (v) => {
              const m = await act("missions.create", v);
              if (m?.id) {
                setSelectedId(m.id);
                setModal("mission-detail");
                setPage("missions");
              }
            }}
          />
        </Modal>
      )}
      {modal === "mission-detail" && selectedMission && (
        <Modal
          title={selectedMission.title}
          eyebrow="MISSION CONTROL"
          wide
          onClose={() => setModal("")}
        >
          <MissionDetail
            mission={selectedMission}
            busy={!!busy}
            act={act}
            onDelete={() => setModal("delete-mission")}
          />
        </Modal>
      )}
      {modal === "new-memory" && (
        <Modal
          title="Für später merken."
          eyebrow="CONTEXT ENGINE"
          onClose={() => setModal("")}
        >
          <MemoryForm
            busy={!!busy}
            onSubmit={async (v) => {
              if (await act("memory.save", v, "Erinnerung gespeichert."))
                setModal("");
            }}
          />
        </Modal>
      )}
      {modal === "new-commitment" && (
        <Modal
          title="Ein Versprechen festhalten."
          eyebrow="COMMITMENT RADAR"
          onClose={() => setModal("")}
        >
          <CommitmentForm
            busy={!!busy}
            onSubmit={async (v) => {
              if (await act("commitments.save", v, "Zusage gespeichert."))
                setModal("");
            }}
          />
        </Modal>
      )}
      {modal === "new-routine" && (
        <Modal
          title="Ein Ablauf, der für dich arbeitet."
          eyebrow="AUTOMATION ENGINE"
          onClose={() => setModal("")}
        >
          <RoutineForm
            busy={!!busy}
            onSubmit={async (v) => {
              if (
                await act(
                  "routines.save",
                  v,
                  "Routine als Entwurf gespeichert.",
                )
              )
                setModal("");
            }}
          />
        </Modal>
      )}
      {modal.startsWith("delete-") && (
        <Modal title="Eintrag löschen?" onClose={() => setModal("")}>
          <p className="modal-copy">
            Dieser gespeicherte Eintrag wird entfernt. Bereits ausgeführte
            externe Aktionen bleiben bestehen.
          </p>
          <div className="form-actions">
            <Button onClick={() => setModal("")}>Abbrechen</Button>
            <Button
              kind="danger-solid"
              disabled={!!busy}
              onClick={async () => {
                await act(
                  modal === "delete-mission"
                    ? "missions.delete"
                    : modal === "delete-memory"
                      ? "memory.delete"
                      : "routines.delete",
                  { id: selectedId },
                );
                setModal("");
              }}
            >
              <Trash2 size={14} />
              Löschen
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function MissionForm({
  onSubmit,
  busy,
}: {
  onSubmit: (v: Row) => void;
  busy: boolean;
}) {
  const [goal, setGoal] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ goal });
      }}
    >
      <p className="modal-copy">
        Beschreibe das gewünschte Ergebnis. Aegis erstellt konkrete Schritte und
        zeigt dir den Plan vor der Ausführung.
      </p>
      <Field label="Dein Ziel">
        <textarea
          autoFocus
          rows={5}
          required
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          placeholder="Zum Beispiel: Erstelle mein Tagesbriefing aus meinen offenen Zusagen und gespeicherten Projektnotizen."
        />
      </Field>
      <div className="form-note">
        <ShieldCheck size={14} />
        Externe Änderungen brauchen deine Freigabe.
      </div>
      <div className="form-actions">
        <Button type="submit" kind="primary" disabled={busy || !goal.trim()}>
          {busy ? (
            <LoaderCircle size={15} className="spin" />
          ) : (
            <Sparkles size={15} />
          )}
          Mission planen
        </Button>
      </div>
    </form>
  );
}
function MemoryForm({
  onSubmit,
  busy,
}: {
  onSubmit: (v: Row) => void;
  busy: boolean;
}) {
  const [title, setTitle] = useState(""),
    [content, setContent] = useState(""),
    [tags, setTags] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({
          title,
          content,
          tags: tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
        });
      }}
    >
      <Field label="Titel">
        <input
          autoFocus
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Projekt Atlas — letzter Stand"
        />
      </Field>
      <Field label="Was soll Aegis wissen?">
        <textarea
          required
          rows={5}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Kontext, Entscheidungen, Präferenzen…"
        />
      </Field>
      <Field label="Tags" hint="Mit Kommas trennen.">
        <input
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="projekt, arbeit"
        />
      </Field>
      <div className="form-actions">
        <Button type="submit" kind="primary" disabled={busy}>
          <BrainCircuit size={15} />
          Speichern
        </Button>
      </div>
    </form>
  );
}
function CommitmentForm({
  onSubmit,
  busy,
}: {
  onSubmit: (v: Row) => void;
  busy: boolean;
}) {
  const [title, setTitle] = useState(""),
    [person, setPerson] = useState(""),
    [due, setDue] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({
          title,
          person,
          ...(due ? { dueAt: new Date(due).toISOString() } : {}),
        });
      }}
    >
      <Field label="Deine Zusage">
        <input
          autoFocus
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Den Entwurf an Lara schicken"
        />
      </Field>
      <div className="form-grid">
        <Field label="Person (optional)">
          <input
            value={person}
            onChange={(e) => setPerson(e.target.value)}
            placeholder="Lara"
          />
        </Field>
        <Field label="Fällig am (optional)">
          <input
            type="datetime-local"
            value={due}
            onChange={(e) => setDue(e.target.value)}
          />
        </Field>
      </div>
      <div className="form-actions">
        <Button type="submit" kind="primary" disabled={busy}>
          <Bell size={15} />
          Zusage speichern
        </Button>
      </div>
    </form>
  );
}
function RoutineForm({
  onSubmit,
  busy,
}: {
  onSubmit: (v: Row) => void;
  busy: boolean;
}) {
  const [title, setTitle] = useState(""),
    [prompt, setPrompt] = useState(""),
    [minutes, setMinutes] = useState(1440);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ title, prompt, intervalMinutes: minutes, enabled: false });
      }}
    >
      <Field label="Name der Routine">
        <input
          autoFocus
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Mein tägliches Briefing"
        />
      </Field>
      <Field label="Auftrag">
        <textarea
          required
          rows={4}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Prüfe meine offenen Zusagen und erstelle eine Prioritätenliste für heute."
        />
      </Field>
      <Field label="Intervall">
        <select
          value={minutes}
          onChange={(e) => setMinutes(Number(e.target.value))}
        >
          <option value={30}>Alle 30 Minuten</option>
          <option value={60}>Stündlich</option>
          <option value={360}>Alle 6 Stunden</option>
          <option value={1440}>Täglich</option>
          <option value={10080}>Wöchentlich</option>
        </select>
      </Field>
      <div className="form-note">
        <Pause size={14} />
        Wird zuerst pausiert gespeichert. Aktiviere sie nach deiner Prüfung.
      </div>
      <div className="form-actions">
        <Button type="submit" kind="primary" disabled={busy}>
          <Workflow size={15} />
          Routine speichern
        </Button>
      </div>
    </form>
  );
}
function ShadowForm({ onSave }: { onSave: (v: Row) => Promise<any> }) {
  const [title, setTitle] = useState(""),
    [app, setApp] = useState("");
  return (
    <form
      className="shadow-form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (await onSave({ title, app })) setTitle("");
      }}
    >
      <input
        required
        placeholder="Was hast du gerade getan?"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <input
        placeholder="App (optional)"
        value={app}
        onChange={(e) => setApp(e.target.value)}
      />
      <Button type="submit">
        <Plus size={15} />
        Schritt erfassen
      </Button>
    </form>
  );
}
function MissionDetail({
  mission: m,
  act,
  busy,
  onDelete,
}: {
  mission: Row;
  act: (o: string, p?: Row, message?: string) => Promise<any>;
  busy: boolean;
  onDelete: () => void;
}) {
  return (
    <div className="mission-detail">
      <div className="mission-meta">
        <Badge status={m.status} />
        <span>{dateTime(m.createdAt)}</span>
      </div>
      <p className="mission-goal">{m.goal}</p>
      {m.error && <div className="error-box">{m.error}</div>}
      {m.summary && (
        <div className="summary-box">
          <CheckCheck size={17} />
          <p>{m.summary}</p>
        </div>
      )}
      <div className="section-label">
        <span>ACTION PLAN</span>
        <span>{m.steps?.length || 0} Schritte</span>
      </div>
      <div className="steps-list">
        {(m.steps || []).map((s: Row, i: number) => (
          <div key={s.id} className={`step-card ${s.status}`}>
            <div className="step-number">
              {["completed", "done"].includes(s.status) ? (
                <Check size={15} />
              ) : (
                String(i + 1).padStart(2, "0")
              )}
            </div>
            <div className="step-body">
              <div className="step-title">
                <strong>{s.title}</strong>
                <Badge status={s.status} />
              </div>
              <span className="tool-name">{s.tool}</span>
              <details>
                <summary>
                  Aktion & Parameter
                  <ChevronDown size={13} />
                </summary>
                <pre>
                  {JSON.stringify(
                    { ...s.target, parameters: s.args || {} },
                    null,
                    2,
                  )}
                </pre>
              </details>
              {s.result !== undefined && (
                <details className="step-result">
                  <summary>
                    Ergebnis anzeigen
                    <ChevronDown size={13} />
                  </summary>
                  <pre>
                    {typeof s.result === "string"
                      ? s.result
                      : JSON.stringify(s.result, null, 2)}
                  </pre>
                </details>
              )}
              {s.error && <p className="error-text">{s.error}</p>}
              {["approval", "awaiting_approval", "pending_approval"].includes(
                s.status,
              ) && (
                <div className="approval-box">
                  <ShieldCheck size={16} />
                  <p>Prüfe diese konkrete Aktion und ihre Parameter.</p>
                  <Button
                    kind="primary"
                    disabled={busy}
                    onClick={() =>
                      act("missions.approve", { id: m.id, stepId: s.id })
                    }
                  >
                    <Check size={14} />
                    Freigeben
                  </Button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="form-actions mission-detail-actions">
        <Button kind="danger" onClick={onDelete}>
          <Trash2 size={14} />
          Löschen
        </Button>
        <div>
          {m.status === "running" ? (
            <Button onClick={() => act("missions.pause", { id: m.id })}>
              <Pause size={14} />
              Pausieren
            </Button>
          ) : !["completed", "approval", "failed"].includes(m.status) ? (
            <Button
              kind="primary"
              disabled={busy}
              onClick={() => act("missions.run", { id: m.id })}
            >
              <Play size={14} />
              {m.status === "draft" ? "Plan ausführen" : "Fortsetzen"}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Workspace({
  state,
  act,
  busy,
  notify,
}: {
  state: AegisState;
  act: (o: string, p?: Row, message?: string) => Promise<any>;
  busy: string;
  notify: (t: string, e?: boolean) => void;
}) {
  const [query, setQuery] = useState(""),
    [results, setResults] = useState<Row[] | null>(null),
    [question, setQuestion] = useState(
      "Was ist auf diesem Bildschirm zu sehen? Hilf mir, den nächsten sinnvollen Schritt zu finden.",
    ),
    [analysis, setAnalysis] = useState("");
  async function search(e: FormEvent) {
    e.preventDefault();
    const value = await act("workspace.search", { query });
    if (value)
      setResults(
        Array.isArray(value) ? value : value.files || value.results || [],
      );
  }
  return (
    <>
      <section className="panel workspace-panel">
        <div className="workspace-hero">
          <div className="folder-symbol">
            <FolderOpen size={31} />
          </div>
          <div>
            <span className="eyebrow">LOCAL WORKSPACE</span>
            <h2>
              {state.settings.workspace
                ? "Dein Arbeitsbereich ist verbunden."
                : "Ein Zuhause für deine Projekte."}
            </h2>
            <p>
              {state.settings.workspace ||
                "Wähle den Ordner, auf dessen Dateien Aegis zugreifen darf."}
            </p>
          </div>
          <Button
            onClick={() => act("workspace.pick", {}, "Workspace aktualisiert.")}
          >
            <FolderOpen size={15} />
            {state.settings.workspace ? "Ordner ändern" : "Ordner wählen"}
          </Button>
        </div>
        <form className="workspace-search" onSubmit={search}>
          <Search size={19} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Dateien im freigegebenen Workspace finden…"
            aria-label="Workspace durchsuchen"
          />
          <Button
            type="submit"
            kind="primary"
            disabled={!state.settings.workspace || !!busy}
          >
            Suchen
          </Button>
        </form>
        {results !== null && (
          <div className="file-results">
            {results.length ? (
              results.map((f, i) => {
                const path =
                  typeof f === "string"
                    ? f
                    : f.path || f.fullPath || f.relativePath || f.name;
                return (
                  <div className="file-row" key={path || i}>
                    <FileText size={17} />
                    <div>
                      <strong>{f.name || f.relativePath || path}</strong>
                      <small>{path}</small>
                    </div>
                    <button
                      className="icon-button"
                      onClick={() => act("workspace.open", { path })}
                      aria-label="Datei öffnen"
                    >
                      <ArrowUpRight size={16} />
                    </button>
                  </div>
                );
              })
            ) : (
              <div className="inline-empty">
                Keine passenden Dateien gefunden.
              </div>
            )}
          </div>
        )}
      </section>
      <section className="panel screen-panel">
        <div className="panel-top">
          <h3>
            <Monitor size={17} />
            Screen Wingman
          </h3>
          <span className="micro-label">ON DEMAND</span>
        </div>
        <p>
          Aegis analysiert den Bildschirm, den du im Freigabedialog auswählst.
          Beschreibe, wobei du Hilfe möchtest.
        </p>
        <Field label="Deine Frage">
          <textarea
            rows={3}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
          />
        </Field>
        <Button
          kind="primary"
          disabled={!!busy || !question.trim()}
          onClick={async () => {
            const r = await act("screen.analyze", { question });
            if (r)
              setAnalysis(
                typeof r === "string"
                  ? r
                  : r.message || r.analysis || JSON.stringify(r, null, 2),
              );
          }}
        >
          <Monitor size={15} />
          Bildschirm wählen & analysieren
        </Button>
        {analysis && (
          <div className="analysis-result">
            <span className="eyebrow">AEGIS ANALYSE</span>
            <p>{analysis}</p>
          </div>
        )}
        <div className="form-note">
          <ShieldCheck size={14} />
          Eine Analyse pro Freigabe. Keine permanente Aufnahme.
        </div>
      </section>
    </>
  );
}

const connectorMeta: Record<
  string,
  {
    icon: typeof Github;
    label: string;
    fields: {
      key: string;
      label: string;
      secret?: boolean;
      placeholder?: string;
    }[];
    help: string;
    link: string;
  }
> = {
  github: {
    icon: Github,
    label: "GitHub",
    fields: [
      {
        key: "token",
        label: "Personal Access Token",
        secret: true,
        placeholder: "github_pat_…",
      },
    ],
    help: "Verbinde Repositories, Issues und Pull Requests mit einem Token für die gewünschten Repositories.",
    link: "https://github.com/settings/tokens?type=beta",
  },
  google: {
    icon: Globe,
    label: "Google Workspace",
    fields: [
      {
        key: "clientId",
        label: "OAuth Client ID",
        placeholder: "…apps.googleusercontent.com",
      },
      { key: "clientSecret", label: "OAuth Client Secret", secret: true },
    ],
    help: "Verwende einen OAuth-Client für Desktop-Apps. Aktiviere Gmail und Google Calendar in deinem Google Cloud-Projekt.",
    link: "https://console.cloud.google.com/apis/credentials",
  },
  microsoft: {
    icon: Layers3,
    label: "Microsoft 365",
    fields: [
      {
        key: "clientId",
        label: "Application (Client) ID",
        placeholder: "Eigene App-ID · xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
      },
      { key: "tenantId", label: "Tenant ID", placeholder: "common" },
    ],
    help: "Private Outlook-/Hotmail-Konten und Microsoft 365. Einrichtung und Postfach-Anmeldung sind zwei verschiedene Schritte.",
    link: "https://entra.microsoft.com/",
  },
  homeassistant: {
    icon: Home,
    label: "Home Assistant",
    fields: [
      {
        key: "url",
        label: "Home Assistant URL",
        placeholder: "http://homeassistant.local:8123",
      },
      { key: "token", label: "Long-lived Access Token", secret: true },
    ],
    help: "Verbinde deine Home Assistant-Instanz für Gerätestatus und freigegebene Smart-Home-Aktionen.",
    link: "https://www.home-assistant.io/docs/authentication/",
  },
  tavily: {
    icon: Search,
    label: "Web-Recherche",
    fields: [
      {
        key: "apiKey",
        label: "Tavily API Key",
        secret: true,
        placeholder: "tvly-…",
      },
    ],
    help: "Ermöglicht aktuelle Web-Recherchen mit Quellen über Tavily.",
    link: "https://app.tavily.com/",
  },
};
function SettingsPage({
  state,
  act,
  busy,
  notify,
}: {
  state: AegisState;
  act: (o: string, p?: Row, message?: string) => Promise<any>;
  busy: string;
  notify: (t: string, e?: boolean) => void;
}) {
  const [values, setValues] = useState<Row>({ ...state.settings, apiKey: "" }),
    [credentials, setCredentials] = useState<Record<string, Row>>({}),
    [expanded, setExpanded] = useState(""),
    [authInfo, setAuthInfo] = useState<Record<string, Row>>({});
  const set = (key: string, value: any) =>
    setValues((v) => ({ ...v, [key]: value }));
  async function save(e: FormEvent) {
    e.preventDefault();
    const payload: Row = {
      name: values.name,
      provider: values.provider,
      model: values.model,
      realtimeModel: values.realtimeModel,
      voice: values.voice,
      dailyRequestLimit: Number(values.dailyRequestLimit),
      autoSpeak: !!values.autoSpeak,
      voiceOnStartup: !!values.voiceOnStartup,
      launchFullscreen: !!values.launchFullscreen,
      useSecondDisplay: !!values.useSecondDisplay,
      startupMailBriefing: !!values.startupMailBriefing,
      economyMode: !!values.economyMode,
      masterProtocol: !!values.masterProtocol,
      homeCity: values.homeCity || "",
      speechHints: values.speechHints || "",
      autostart: !!values.autostart,
    };
    if (values.apiKey) payload.apiKey = values.apiKey;
    const r = await act(
      "settings.update",
      payload,
      "Einstellungen gespeichert.",
    );
    if (r) setValues((v) => ({ ...v, ...r, apiKey: "" }));
  }
  function hasSavedAI() {
    return state.settings.hasApiKey || state.settings.provider === "ollama";
  }
  async function connect(id: string) {
    const r = await act("connector.connect", { id });
    if (r) {
      setAuthInfo((a) => ({ ...a, [id]: r }));
      if (r.message) notify(r.message);
    }
  }
  return (
    <div className="settings-layout">
      <form className="panel settings-main" onSubmit={save}>
        <div className="panel-top">
          <h3>
            <Sparkles size={17} />
            KI-Verbindung
          </h3>
          <Badge status={hasSavedAI() ? "completed" : "draft"}>
            {state.settings.provider === "ollama"
              ? "Lokale KI konfiguriert"
              : state.settings.hasApiKey
                ? "Schlüssel gespeichert"
                : "Einrichtung erforderlich"}
          </Badge>
        </div>
        <div className="settings-section">
          {state.settings.secretStorage === "memory-only" && (
            <div className="error-box">
              Windows-Verschlüsselung ist hier nicht verfügbar. Schlüssel
              bleiben nur bis zum Beenden im Speicher; lokale Inhalte werden
              unverschlüsselt gespeichert. Keine sensiblen Daten hinterlegen.
            </div>
          )}
          <p className="settings-description">
            Das Gespräch und die Planung laufen über deinen eigenen KI-Zugang.
            API-Nutzung wird direkt beim Anbieter abgerechnet.
          </p>
          <div className="form-note usage-readout">
            Heute (UTC): {state.usage.requests || 0} /{" "}
            {state.settings.dailyRequestLimit} API-Aufrufe ·{" "}
            {(state.usage.inputTokens || 0) + (state.usage.outputTokens || 0)}{" "}
            Text-Tokens ·{" "}
            {(state.usage.realtimeInputAudioTokens || 0) +
              (state.usage.realtimeOutputAudioTokens || 0)}{" "}
            Audio-Tokens · {state.usage.realtimeCachedTokens || 0} davon als
            Realtime-Cache gemeldet. Das ist eine lokale Zählung, kein
            verbindlicher Rechnungsbetrag.
          </div>
          <div className="form-grid">
            <Field label="KI-Anbieter">
              <select
                value={values.provider}
                onChange={(e) => {
                  set("provider", e.target.value);
                  set(
                    "model",
                    e.target.value === "ollama" ? "qwen3:8b" : "gpt-4.1-mini",
                  );
                }}
              >
                <option value="openai">
                  OpenAI · Chat, Vision & Live-Sprache
                </option>
                <option value="ollama">Ollama · Lokale Text-KI</option>
              </select>
            </Field>
            <Field label="Wie soll Aegis dich ansprechen?">
              <input
                value={values.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="Boss"
              />
            </Field>
          </div>
          {values.provider === "openai" ? (
            <>
              <Field
                label="OpenAI API-Schlüssel"
                hint={
                  state.settings.hasApiKey
                    ? "Ein Schlüssel ist sicher gespeichert. Leer lassen, um ihn beizubehalten."
                    : "Du benötigst einen API-Schlüssel mit API-Guthaben; ein ChatGPT-Abo allein reicht nicht."
                }
              >
                <div className="input-with-icon">
                  <KeyRound size={16} />
                  <input
                    type="password"
                    autoComplete="off"
                    value={values.apiKey}
                    onChange={(e) => set("apiKey", e.target.value)}
                    placeholder={
                      state.settings.hasApiKey
                        ? "•••••••••••••••• · gespeichert"
                        : "sk-…"
                    }
                  />
                </div>
              </Field>
              <a
                className="inline-link"
                href="https://platform.openai.com/api-keys"
                target="_blank"
                rel="noreferrer"
              >
                API-Schlüssel bei OpenAI erstellen
                <ExternalLink size={12} />
              </a>
              <div className="form-grid model-fields">
                <Field label="Text- & Vision-Modell">
                  <input
                    value={values.model}
                    onChange={(e) => set("model", e.target.value)}
                  />
                </Field>
                <Field label="Realtime-Sprachmodell">
                  <input
                    value={values.realtimeModel}
                    onChange={(e) => set("realtimeModel", e.target.value)}
                  />
                </Field>
              </div>
              <Field label="Stimme">
                <select
                  value={values.voice}
                  onChange={(e) => set("voice", e.target.value)}
                >
                  {[
                    "cedar",
                    "marin",
                    "ash",
                    "ballad",
                    "coral",
                    "sage",
                    "verse",
                    "alloy",
                    "echo",
                    "shimmer",
                  ].map((v) => (
                    <option key={v} value={v}>
                      {v.charAt(0).toUpperCase() + v.slice(1)}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="form-note cost-guidance">
                Empfohlene günstige Kombination: <b>gpt-4.1-mini</b> für Text
                und <b>gpt-realtime-mini</b> für Sprache. Das Sprachmodell ist
                der größere Kostentreiber; längere gesprochene Antworten und ein
                wachsender Dialog erhöhen den Verbrauch. Web-Recherche hat
                zusätzlich Suchkosten.
              </div>
            </>
          ) : (
            <>
              <Field
                label="Lokaler Ollama-Dienst"
                hint="Aus Sicherheitsgründen nur auf diesem Computer."
              >
                <input readOnly value="http://127.0.0.1:11434" />
              </Field>
              <Field label="Installiertes Modell">
                <input
                  value={values.ollamaModel || values.model}
                  onChange={(e) => {
                    set("ollamaModel", e.target.value);
                    set("model", e.target.value);
                  }}
                  placeholder="qwen3:8b"
                />
              </Field>
              <div className="form-note">
                Live-Sprache erfordert eine OpenAI-Verbindung. Für Ollama muss
                der lokale Dienst gestartet sein.
              </div>
            </>
          )}
        </div>
        <div className="settings-section">
          <h3>
            <ShieldCheck size={16} />
            Persönliche Einstellungen
          </h3>
          <Field
            label="Tägliches Anfrage-Limit"
            hint="Begrenzt Text-API-Aufrufe und Sprach-Verbindungsstarts. Kein Euro-Limit. Live-Sprache kann zusätzliche laufende API-Kosten verursachen."
          >
            <input
              type="number"
              min={1}
              max={1000}
              value={values.dailyRequestLimit}
              onChange={(e) => set("dailyRequestLimit", Number(e.target.value))}
            />
          </Field>
          <label className="toggle-row economy-toggle">
            <div>
              <strong>Kostenwächter · empfohlen</strong>
              <span>
                Begrenzt den aktiven Sprachkontext auf 6.000 Tokens, hält
                Antworten kurz und reduziert Text-/Rechercheausgaben. Dein
                lokales Gedächtnis und „Merke dir“-Einträge bleiben erhalten.
              </span>
            </div>
            <input
              type="checkbox"
              checked={!!values.economyMode}
              onChange={(e) => set("economyMode", e.target.checked)}
            />
          </label>
          <label className="toggle-row">
            <div>
              <strong>Meister-Protokoll</strong>
              <span>
                Aegis bleibt als loyaler strategischer Berater in seiner Rolle
                und spricht dich in jeder Antwort mit „Meister“ an. Bei falschen
                Annahmen widerspricht er respektvoll statt sie zu bestätigen.
              </span>
            </div>
            <input
              type="checkbox"
              checked={!!values.masterProtocol}
              onChange={(e) => set("masterProtocol", e.target.checked)}
            />
          </label>
          <Field label="Standardort für Wetter & Karten (optional)">
            <input
              value={values.homeCity || ""}
              placeholder="Stadt, Land – keine automatische Ortung"
              onChange={(e) => set("homeCity", e.target.value)}
            />
            <small className="form-note">
              Für „Wie wird das Wetter hier?“ Sonst fragt Aegis nach dem Ort.
              Live Desk: Wetter, Karte und Kurse ohne zusätzliche API-Schlüssel;
              Web-Recherche über OpenAI (Suchkosten) oder Tavily.
            </small>
          </Field>
          <Field
            label="Spracherkennung · wichtige Namen & Orte"
            hint="Kommagetrennte Hinweise verbessern Eigennamen, ohne ein größeres Sprachmodell zu wählen."
          >
            <textarea
              rows={3}
              value={values.speechHints || ""}
              placeholder="Bregenz, Vorarlberg, Projektname, Person …"
              onChange={(e) => set("speechHints", e.target.value)}
            />
          </Field>
          <label className="toggle-row">
            <div>
              <strong>Beim Öffnen begrüßen & zuhören</strong>
              <span>
                Startet das Mikrofon und eine kostenpflichtige KI-Sprachsitzung
                automatisch. Maximal 15 Minuten; Escape beendet sie. Kein
                automatischer Neustart nach Fehlern.
              </span>
            </div>
            <input
              type="checkbox"
              checked={!!values.voiceOnStartup}
              onChange={(e) => set("voiceOnStartup", e.target.checked)}
            />
          </label>
          <label className="toggle-row">
            <div>
              <strong>Postfach beim Sprachstart prüfen</strong>
              <span>
                Beim automatischen Start einmal die letzten 20
                Outlook-Nachrichten lesen und kurz einordnen. Kein Senden, keine
                zusätzlichen Textmodell-Aufrufe. Der geprüfte Ausschnitt wird
                angezeigt.
              </span>
            </div>
            <input
              type="checkbox"
              checked={!!values.startupMailBriefing}
              onChange={(e) => set("startupMailBriefing", e.target.checked)}
            />
          </label>
          <label className="toggle-row">
            <div>
              <strong>Im Vollbild starten</strong>
              <span>F11 wechselt jederzeit zurück in den Fenstermodus.</span>
            </div>
            <input
              type="checkbox"
              checked={!!values.launchFullscreen}
              onChange={(e) => set("launchFullscreen", e.target.checked)}
            />
          </label>
          <label className="toggle-row">
            <div>
              <strong>Zweiten Bildschirm nutzen</strong>
              <span>
                Sprachkern hier, Postfach und Recherche auf dem zweiten Display.
                Ohne zweiten Bildschirm bleibt alles hier. Windows muss auf
                „Erweitern“ stehen (Win + P).
              </span>
            </div>
            <input
              type="checkbox"
              checked={!!values.useSecondDisplay}
              onChange={(e) => set("useSecondDisplay", e.target.checked)}
            />
          </label>
          <label className="toggle-row">
            <div>
              <strong>Textantworten vorlesen</strong>
              <span>
                Systemstimme für Antworten außerhalb eines Live-Gesprächs.
              </span>
            </div>
            <input
              type="checkbox"
              checked={!!values.autoSpeak}
              onChange={(e) => set("autoSpeak", e.target.checked)}
            />
          </label>
          <label className="toggle-row">
            <div>
              <strong>Mit Windows starten</strong>
              <span>Öffnet Aegis nach deiner Anmeldung.</span>
            </div>
            <input
              type="checkbox"
              checked={!!values.autostart}
              onChange={(e) => set("autostart", e.target.checked)}
            />
          </label>
        </div>
        <div className="settings-save">
          <Button
            disabled={!!busy || !hasSavedAI()}
            onClick={async () => {
              const r = await act("ai.test");
              if (r) notify(r.message);
            }}
          >
            <Radio size={14} />
            KI-Verbindung testen
          </Button>
          {state.settings.hasApiKey && (
            <Button
              kind="danger"
              disabled={!!busy}
              onClick={() =>
                act(
                  "settings.update",
                  { apiKey: "" },
                  "API-Schlüssel entfernt.",
                )
              }
            >
              <X size={13} />
              Schlüssel entfernen
            </Button>
          )}
          <span>
            <ShieldCheck size={13} />
            Schlüssel bleiben außerhalb deines Projekts.
          </span>
          <Button kind="primary" type="submit" disabled={!!busy}>
            <Check size={15} />
            Einstellungen speichern
          </Button>
        </div>
      </form>
      <section className="panel connectors-panel">
        <div className="panel-top">
          <h3>
            <Link2 size={17} />
            Verbindungen
          </h3>
          <span className="count">
            {state.connectors.filter((c) => c.connected).length} / 5
          </span>
        </div>
        <p className="connectors-description">
          Erweitere Aegis um die Werkzeuge, die du tatsächlich verwendest.
        </p>
        {Object.entries(connectorMeta).map(([id, meta]) => {
          const connector = state.connectors.find((c) => c.id === id) || {
            connected: false,
            status: "disconnected",
          };
          const Icon = meta.icon;
          return (
            <div
              className={`connector ${expanded === id ? "expanded" : ""}`}
              key={id}
            >
              <button
                className="connector-heading"
                onClick={() => setExpanded(expanded === id ? "" : id)}
              >
                <span className={`connector-icon ${id}`}>
                  <Icon size={19} />
                </span>
                <div>
                  <strong>{meta.label}</strong>
                  <small className={connector.connected ? "mint" : ""}>
                    {connector.connected
                      ? "Verbunden"
                      : connector.configured
                        ? "Konfiguriert · Verbindung prüfen"
                        : "Nicht verbunden"}
                  </small>
                </div>
                <ChevronDown size={15} />
              </button>
              {expanded === id && (
                <div className="connector-body">
                  <p>{meta.help}</p>
                  {id === "microsoft" ? (
                    <MicrosoftSetup />
                  ) : (
                    <a
                      className="inline-link"
                      href={meta.link}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Zugang einrichten
                      <ExternalLink size={12} />
                    </a>
                  )}
                  {meta.fields.map((f) => (
                    <Field key={f.key} label={f.label}>
                      {id === "microsoft" && f.key === "tenantId" ? (
                        <>
                          <select
                            aria-label="Microsoft-Kontotyp"
                            value={
                              credentials[id]?.tenantId ??
                              connector.tenantId ??
                              "common"
                            }
                            onChange={(e) =>
                              setCredentials((v) => ({
                                ...v,
                                [id]: { ...v[id], tenantId: e.target.value },
                              }))
                            }
                          >
                            <option value="common">
                              Privat + Arbeit/Schule (common)
                            </option>
                            <option value="consumers">
                              Nur privat · Hotmail / Outlook.com (consumers)
                            </option>
                            <option value="organizations">
                              Nur Arbeit oder Schule (organizations)
                            </option>
                            {connector.tenantId &&
                              ![
                                "common",
                                "consumers",
                                "organizations",
                              ].includes(connector.tenantId) && (
                                <option value={connector.tenantId}>
                                  Eigenes Verzeichnis ({connector.tenantId})
                                </option>
                              )}
                          </select>
                          <small className="form-note">
                            Für Hotmail muss die Appregistrierung private Konten
                            unterstützen. „common“ verbindet private und
                            Organisationskonten; es umgeht keine Berechtigungen.
                          </small>
                        </>
                      ) : (
                        <input
                          type={f.secret ? "password" : "text"}
                          autoComplete="off"
                          placeholder={
                            f.placeholder ||
                            "Nicht im Klartext gespeichert anzeigen"
                          }
                          value={credentials[id]?.[f.key] || ""}
                          onChange={(e) =>
                            setCredentials((v) => ({
                              ...v,
                              [id]: { ...v[id], [f.key]: e.target.value },
                            }))
                          }
                        />
                      )}
                    </Field>
                  ))}
                  <div className="connector-buttons">
                    <Button
                      disabled={
                        !!busy ||
                        !Object.values(credentials[id] || {}).some(Boolean)
                      }
                      onClick={async () => {
                        const payload = Object.fromEntries(
                          Object.entries(credentials[id] || {}).filter(
                            ([, v]) => String(v).trim(),
                          ),
                        );
                        const r = await act(
                          "connector.configure",
                          { id, ...payload },
                          "Zugangsdaten gespeichert.",
                        );
                        if (r) setCredentials((v) => ({ ...v, [id]: {} }));
                      }}
                    >
                      <KeyRound size={13} />
                      Speichern
                    </Button>
                    {["google", "microsoft"].includes(id) && (
                      <Button
                        disabled={
                          !!busy ||
                          !connector.configured ||
                          Object.values(credentials[id] || {}).some(Boolean)
                        }
                        onClick={() => connect(id)}
                      >
                        <ExternalLink size={13} />
                        {id === "microsoft" ? "Postfach anmelden" : "Anmelden"}
                      </Button>
                    )}
                    <Button
                      disabled={!!busy}
                      onClick={async () => {
                        const r = await act("connector.test", { id });
                        if (r)
                          notify(
                            r.message ||
                              `${meta.label}: ${r.connected || r.ok ? "Verbindung erfolgreich." : r.status || "Prüfung abgeschlossen."}`,
                          );
                      }}
                    >
                      <Radio size={13} />
                      Testen
                    </Button>
                    {connector.configured || connector.connected ? (
                      <Button
                        kind="danger"
                        disabled={!!busy}
                        onClick={() =>
                          act(
                            "connector.disconnect",
                            { id },
                            "Verbindung getrennt.",
                          )
                        }
                      >
                        <X size={13} />
                        Trennen
                      </Button>
                    ) : null}
                  </div>
                  {id === "microsoft" && !connector.configured && (
                    <p className="form-note">
                      Noch keine eigene Client-ID gespeichert. Die
                      Postfach-Anmeldung wird danach freigeschaltet.
                    </p>
                  )}
                  {authInfo[id] && (
                    <div className="auth-info">
                      {authInfo[id].message && <p>{authInfo[id].message}</p>}
                      {authInfo[id].userCode && (
                        <>
                          <code>{authInfo[id].userCode}</code>
                          <Button
                            onClick={() =>
                              navigator.clipboard
                                .writeText(authInfo[id].userCode)
                                .then(() => notify("Anmeldecode kopiert."))
                            }
                          >
                            <Copy size={12} />
                            Code kopieren
                          </Button>
                        </>
                      )}
                      {authInfo[id].url && (
                        <a
                          className="inline-link"
                          href={authInfo[id].url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Google-Anmeldung öffnen
                          <ExternalLink size={12} />
                        </a>
                      )}
                      {authInfo[id].verificationUri && (
                        <a
                          className="inline-link"
                          href={authInfo[id].verificationUri}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Microsoft-Anmeldung öffnen
                          <ExternalLink size={12} />
                        </a>
                      )}
                    </div>
                  )}
                  {connector.message && (
                    <p className="connector-status">{connector.message}</p>
                  )}
                  <div className="connector-capabilities">
                    {(connector.capabilities || []).map((c: string) => (
                      <span key={c}>{c}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
        <div className="connector-policy">
          <ShieldCheck size={17} />
          <p>
            Lesen und vorbereiten kann Aegis selbstständig. Externe Änderungen
            erscheinen als konkrete Aktion zur Freigabe.
          </p>
        </div>
      </section>
    </div>
  );
}
