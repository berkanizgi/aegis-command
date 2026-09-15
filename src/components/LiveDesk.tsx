import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  ClipboardCheck,
  Cloud,
  CloudRain,
  FileCheck2,
  Globe2,
  LoaderCircle,
  Mail,
  MapPin,
  MessageSquareReply,
  Network,
  ScanSearch,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sun,
  TrendingUp,
  Wind,
  X,
} from "lucide-react";
import { invoke, type Row } from "../lib/api";
import Globe from "./Globe";

const fmt = (v: unknown, digits = 0) =>
  typeof v === "number" && Number.isFinite(v)
    ? v.toLocaleString("de-AT", { maximumFractionDigits: digits })
    : "—";
const date = (v: string, full = false) =>
  new Date(v.length === 10 ? `${v}T12:00:00` : v).toLocaleDateString("de-AT", {
    weekday: full ? "long" : "short",
    day: "2-digit",
    month: "2-digit",
  });
const stamp = (v: string) =>
  v.length === 10
    ? new Date(`${v}T12:00:00`).toLocaleDateString("de-AT")
    : new Date(v).toLocaleString("de-AT");
const weatherIcon = (code: number) =>
  code === 0 ? <Sun /> : code >= 51 ? <CloudRain /> : <Cloud />;

export function DeskLaunchers({ open }: { open: () => void }) {
  return (
    <button className="desk-launch" onClick={open}>
      <Globe2 size={16} />
      <span>Live Desk öffnen</span>
      <small>Postfach · Recherche · Wetter · Märkte</small>
      <ArrowUpRight size={15} />
    </button>
  );
}

function NativeSource({
  page,
  onBack,
  obscured,
}: {
  page: Row;
  onBack: () => void;
  obscured: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const update = () => {
      const box = ref.current?.getBoundingClientRect();
      window.aegis?.researchLayout?.({
        visible: Boolean(
          !obscured &&
          page.status !== "error" &&
          box &&
          box.top >= 63 &&
          document.visibilityState === "visible",
        ),
        bounds: box && {
          x: box.x,
          y: box.y,
          width: box.width,
          height: box.height,
        },
      });
    };
    const observer = new ResizeObserver(update);
    if (ref.current) observer.observe(ref.current);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    document.addEventListener("visibilitychange", update);
    // Native views cannot follow CSS interpolation; sync through the entry transition.
    let frame = 0,
      end = performance.now() + 750;
    const animate = () => {
      update();
      if (performance.now() < end) frame = requestAnimationFrame(animate);
    };
    animate();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
      document.removeEventListener("visibilitychange", update);
      window.aegis?.researchLayout?.({ visible: false });
    };
  }, [page.url, page.status, obscured]);
  return (
    <div className="source-browser">
      <div className="source-toolbar">
        <button onClick={onBack} title="Zurück zu den Ergebnissen">
          <ArrowLeft size={15} />
        </button>
        <div>
          <strong>{page.title || "Quelle"}</strong>
          <span>{page.url}</span>
        </div>
        <span className="micro-label">EXTERNE SEITE</span>
      </div>
      <div className="native-source-slot" ref={ref}>
        {page.status === "error" ? (
          <p>{page.error}</p>
        ) : (
          <p>
            <LoaderCircle className="spin" /> Quelle wird im isolierten Browser
            angezeigt.
          </p>
        )}
      </div>
      <small>
        „Zurück zu den Ergebnissen“ sagen. Seiteninhalt ist extern; Aegis
        bekommt keine Mikrofon-, Kamera- oder Anmelderechte.
      </small>
    </div>
  );
}

function MapPanel({ data }: { data: Row }) {
  const [loading, setLoading] = useState(true),
    [timedOut, setTimedOut] = useState(false);
  const location = data.location,
    zoom = data.zoom ?? 11;
  const span = (360 / 2 ** zoom) * 1.6;
  const bbox = [
    Math.max(-180, location.longitude - span),
    Math.max(-85, location.latitude - span * 0.65),
    Math.min(180, location.longitude + span),
    Math.min(85, location.latitude + span * 0.65),
  ].join(",");
  const url = `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${location.latitude}%2C${location.longitude}`;
  useEffect(() => {
    setLoading(true);
    setTimedOut(false);
    const timer = setTimeout(() => setTimedOut(true), 15000);
    return () => clearTimeout(timer);
  }, [url]);
  return (
    <>
      <div className="location-title">
        <MapPin size={19} />
        <h3>
          {location.name}{" "}
          <span>
            {location.region} · {location.country}
          </span>
        </h3>
      </div>
      <div className="map-surface">
        <iframe
          key={url}
          src={url}
          title={`OpenStreetMap · ${location.name}`}
          sandbox="allow-scripts allow-same-origin allow-popups"
          allow="geolocation 'none'; microphone 'none'; camera 'none'"
          referrerPolicy="strict-origin-when-cross-origin"
          onLoad={() => setLoading(false)}
        />
        {loading && (
          <div className="map-loading">
            <LoaderCircle className="spin" />{" "}
            {timedOut
              ? "Karte noch nicht geladen – Verbindung zu OpenStreetMap prüfen."
              : "OpenStreetMap laden…"}
          </div>
        )}
      </div>
      <p className="desk-note">
        © OpenStreetMap-Mitwirkende · Zoomen und Verschieben in der Karte. Per
        Stimme: „Zeige die Karte von …“ oder „Karte näher heran“.
      </p>
    </>
  );
}

function WeatherPanel({
  data,
  control,
}: {
  data: Row;
  control: (args: Row) => void;
}) {
  const selected = data.days[data.selectedDay],
    hours = data.hours.filter((h: Row) => h.time.startsWith(selected.date));
  return (
    <>
      <div className="weather-hero">
        <Globe location={data.location} />
        <div className="weather-summary">
          <div className="eyebrow">FORECAST / {data.timezone}</div>
          <h3>{data.location.name}</h3>
          <p className="location-country">
            {data.location.region} · {data.location.country}
          </p>
          <div className="weather-condition">
            {weatherIcon(selected.code)} <span>{selected.label}</span>
          </div>
          <div className="weather-temp">
            {fmt(selected.max)}
            <span>°</span>
            <small>{fmt(selected.min)}° Tiefstwert</small>
          </div>
          <strong className="weather-date">{date(selected.date, true)}</strong>
          <div className="weather-metrics">
            <div>
              <CloudRain size={16} />
              <strong>{fmt(selected.rainChance)} %</strong>
              <small>Regenwahrscheinlichkeit</small>
            </div>
            <div>
              <Wind size={16} />
              <strong>{fmt(selected.wind)} km/h</strong>
              <small>Max. Wind</small>
            </div>
            <div>
              <Cloud size={16} />
              <strong>{fmt(selected.rain, 1)} mm</strong>
              <small>Niederschlag / Tag</small>
            </div>
          </div>
        </div>
      </div>
      <div className="forecast-days" aria-label="Vorhersagetage">
        {data.days.map((day: Row, index: number) => (
          <button
            key={day.date}
            className={index === data.selectedDay ? "selected" : ""}
            aria-pressed={index === data.selectedDay}
            onClick={() => control({ action: "select_day", index })}
          >
            <span>{date(day.date)}</span>
            {weatherIcon(day.code)}
            <strong>{fmt(day.max)}°</strong>
            <small>{fmt(day.rainChance)} %</small>
          </button>
        ))}
      </div>
      <div className="hourly-header">
        <h4>Wann wird es nass?</h4>
        <small>Stündliche Regenwahrscheinlichkeit · {selected.date}</small>
      </div>
      <div
        className="hourly-rain"
        aria-label="Stündliche Regenwahrscheinlichkeit"
      >
        {hours.map((hour: Row, i: number) => (
          <div
            key={hour.time}
            title={`${hour.time}: ${fmt(hour.rainChance)} % · ${fmt(hour.temperature, 1)} °C · ${fmt(hour.rain, 1)} mm`}
          >
            <strong>
              {fmt(hour.rainChance)}
              <small>%</small>
            </strong>
            <span className="rain-track">
              <i style={{ height: `${hour.rainChance ?? 0}%` }} />
            </span>
            <small>{i % 3 === 0 ? hour.time.slice(11, 16) : ""}</small>
          </div>
        ))}
      </div>
      <p className="desk-note">{data.note}</p>
    </>
  );
}

function MarketPanel({ data }: { data: Row }) {
  const [hover, setHover] = useState<number | null>(null);
  const values = data.points.map((p: Row) => p.value),
    min = Math.min(...values),
    max = Math.max(...values),
    delta = max - min || min * 0.01 || 1;
  const first = Date.parse(data.points[0].time),
    last = Date.parse(data.points.at(-1).time),
    duration = last - first || 1;
  const points = data.points.map((p: Row) => ({
    x: 45 + ((Date.parse(p.time) - first) / duration) * 665,
    y: 200 - ((p.value - min) / delta) * 155,
  }));
  const selected = data.points[hover ?? data.points.length - 1];
  return (
    <>
      <div className="market-head">
        <div>
          <div className="eyebrow">
            {data.marketKind === "fx"
              ? "CURRENCY / ECB REFERENCE"
              : "CRYPTO / COINBASE EXCHANGE"}
          </div>
          <h3>
            {data.base}
            <span> / {data.quote}</span>
          </h3>
        </div>
        <TrendingUp size={32} />
      </div>
      <div className="market-value">
        {fmt(data.price, data.marketKind === "fx" ? 5 : 2)}
        <span>{data.quote}</span>
        <small className={data.change < 0 ? "negative" : "positive"}>
          {data.change >= 0 ? "+" : ""}
          {fmt(data.change, 2)} % <span>seit {date(data.changeSince)}</span>
        </small>
      </div>
      <div className="market-chart">
        <div className="chart-readout">
          {stamp(selected.time)}{" "}
          <strong>
            {fmt(selected.value, 5)} {data.quote}
          </strong>
        </div>
        <svg
          viewBox="0 0 760 255"
          role="img"
          aria-label={`${data.base}/${data.quote} – ${data.points.length} echte Kursdatenpunkte`}
          onMouseLeave={() => setHover(null)}
          onMouseMove={(e) => {
            const box = e.currentTarget.getBoundingClientRect(),
              x = ((e.clientX - box.left) / box.width) * 760;
            let best = 0;
            points.forEach((p: Row, i: number) => {
              if (Math.abs(p.x - x) < Math.abs(points[best].x - x)) best = i;
            });
            setHover(best);
          }}
        >
          <defs>
            <linearGradient id="market-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#7cebc5" stopOpacity=".25" />
              <stop offset="100%" stopColor="#7cebc5" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[45, 95, 145, 200].map((y) => (
            <line
              key={y}
              x1="45"
              y1={y}
              x2="710"
              y2={y}
              stroke="#79acaa20"
              strokeDasharray="4 5"
            />
          ))}
          <polygon
            points={`${points[0].x},210 ${points.map((p: Row) => `${p.x},${p.y}`).join(" ")} ${points.at(-1).x},210`}
            fill="url(#market-fill)"
          />
          <polyline
            points={points.map((p: Row) => `${p.x},${p.y}`).join(" ")}
            fill="none"
            stroke={data.change < 0 ? "#dfb388" : "#84eac4"}
            strokeWidth="2.5"
            strokeLinejoin="round"
          />
          {hover !== null && (
            <>
              <line
                x1={points[hover].x}
                x2={points[hover].x}
                y1="30"
                y2="210"
                stroke="#beead855"
              />
              <circle
                cx={points[hover].x}
                cy={points[hover].y}
                r="4"
                fill="#e1fff1"
              />
            </>
          )}
          <text x="45" y="242">
            {date(data.points[0].time)}
          </text>
          <text x="710" y="242" textAnchor="end">
            {date(data.points.at(-1).time)}
          </text>
          <text x="710" y="25" textAnchor="end">
            Max. {fmt(max, 5)}
          </text>
        </svg>
      </div>
      <div className="market-stats">
        <div>
          <small>Tief im Zeitraum</small>
          <strong>{fmt(min, 5)}</strong>
        </div>
        <div>
          <small>Hoch im Zeitraum</small>
          <strong>{fmt(max, 5)}</strong>
        </div>
        <div>
          <small>Kurszeitpunkt</small>
          <strong>{stamp(data.priceAt)}</strong>
        </div>
      </div>
      <p className="desk-note">{data.note}</p>
      <details className="market-table">
        <summary>{data.points.length} Originalwerte anzeigen</summary>
        <table>
          <thead>
            <tr>
              <th>Zeit</th>
              <th>
                {data.quote} je {data.base}
              </th>
            </tr>
          </thead>
          <tbody>
            {data.points.map((p: Row, i: number) => (
              <tr key={`${p.time}-${i}`}>
                <td>{p.time}</td>
                <td>{fmt(p.value, 6)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </>
  );
}

function ResearchJourney({ scene }: { scene: Row }) {
  const sources = scene.sources || [];
  const ready = scene.status === "ready";
  return (
    <div className={`research-journey ${ready ? "complete" : "running"}`}>
      <div className="research-browser-chrome">
        <div className="research-window-dots">
          <i /> <i /> <i />
        </div>
        <div className="research-address">
          <ScanSearch size={13} />
          <span>{scene.data?.query || scene.title}</span>
          {!ready && <b />}
        </div>
        <span className="micro-label">AEGIS RESEARCH ROUTE</span>
      </div>
      <div className="research-route">
        <div className="research-route-line" />
        {[
          [Search, "ANFRAGE", "Suchdienst angefragt"],
          [
            Network,
            "QUELLEN",
            ready ? `${sources.length} gefunden` : "Netz wird geprüft",
          ],
          [
            FileCheck2,
            "EVIDENZ",
            ready ? "Belege geordnet" : "Relevanz wird bewertet",
          ],
        ].map(([Icon, label, detail], index) => (
          <div className="research-node" key={String(label)}>
            <span style={{ animationDelay: `${index * 180}ms` }}>
              <Icon size={16} />
            </span>
            <strong>{label as string}</strong>
            <small>{detail as string}</small>
          </div>
        ))}
      </div>
      <div className="research-packets" aria-hidden="true">
        {Array.from({ length: 9 }, (_, i) => (
          <i key={i} style={{ animationDelay: `${i * 130}ms` }} />
        ))}
      </div>
      <small className="research-honesty">
        Sichtbarer API-/Quellenpfad. Keine vorgetäuschten Google-Klicks.
      </small>
    </div>
  );
}

function MailLoading() {
  return (
    <div className="mail-loading" aria-label="Postfach wird geprüft">
      <div className="mail-orbit">
        <Mail size={33} />
        {Array.from({ length: 8 }, (_, i) => (
          <i
            key={i}
            style={{ transform: `rotate(${i * 45}deg) translateX(82px)` }}
          />
        ))}
      </div>
      <p>Postfachsignale werden lokal geordnet.</p>
      <small>Absender · Lesestatus · Aktualität · Aufmerksamkeitssignale</small>
    </div>
  );
}

function InboxPanel({
  data,
  notify,
}: {
  data: Row;
  notify: (message: string, error?: boolean) => void;
}) {
  const [selectedId, setSelectedId] = useState(""),
    [instruction, setInstruction] = useState(""),
    [draftBody, setDraftBody] = useState(""),
    [working, setWorking] = useState("");
  const selected = data.messages.find((item: Row) => item.id === selectedId);
  const draft = data.replyDraft;

  useEffect(() => {
    setDraftBody(draft?.body || "");
  }, [draft?.id, draft?.body]);

  async function prepare(message: Row) {
    if (!instruction.trim()) {
      notify(
        "Sag oder schreibe zuerst, was die Antwort ausdrücken soll.",
        true,
      );
      return;
    }
    setWorking("prepare");
    try {
      await invoke("mail.reply.prepare", {
        messageId: message.id,
        instruction,
      });
      notify("Antwort lokal vorbereitet. Bitte vor dem Speichern prüfen.");
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error), true);
    } finally {
      setWorking("");
    }
  }

  async function saveDraft() {
    if (!draft?.id || working) return;
    setWorking("save");
    try {
      if (draftBody !== draft.body)
        await invoke("mail.reply.update", {
          replyId: draft.id,
          body: draftBody,
        });
      const result = await invoke("mail.reply.save", { replyId: draft.id });
      notify(
        result.sent === false
          ? "Als Entwurf gespeichert – nicht gesendet."
          : "Antwortstatus bitte im Postfach prüfen.",
      );
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error), true);
    } finally {
      setWorking("");
    }
  }

  async function copyDraft() {
    try {
      await navigator.clipboard.writeText(draftBody);
      notify("Entwurf kopiert.");
    } catch {
      notify("Entwurf konnte nicht kopiert werden.", true);
    }
  }

  async function discardDraft() {
    if (working) return;
    try {
      await invoke("mail.reply.clear");
      setSelectedId("");
      setInstruction("");
      notify("Lokalen Entwurf verworfen. Es wurde nichts gesendet.");
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error), true);
    }
  }

  return (
    <div className="inbox-intelligence">
      <div className="inbox-overview">
        <div>
          <span className="eyebrow">SECURE INBOX / {data.providerLabel}</span>
          <h3>{data.account || "Verbundenes Postfach"}</h3>
          <p>
            {data.messages.length} geprüft · {data.unreadCount} ungelesen
          </p>
        </div>
        <div className="attention-counter">
          <ShieldAlert size={25} />
          <strong>{data.attentionCount}</strong>
          <small>Aufmerksamkeit</small>
        </div>
      </div>
      <div className="inbox-daily-brief">
        <div className="inbox-brief-scan" aria-hidden="true" />
        <div>
          <span className="micro-label">HEUTIGES POSTFACH-LAGEBILD</span>
          <strong>
            {data.summary?.headline || "Postfachausschnitt geprüft."}
          </strong>
          <p>
            Heute {data.summary?.todayCount || 0} · davon ungelesen{" "}
            {data.summary?.todayUnread || 0} · zu prüfen{" "}
            {data.summary?.actionCount || 0}
          </p>
        </div>
        {!!data.summary?.topSubjects?.length && (
          <div className="brief-topics">
            {data.summary.topSubjects.map((subject: string, index: number) => (
              <span key={`${subject}-${index}`}>
                0{index + 1} / {subject}
              </span>
            ))}
          </div>
        )}
      </div>
      {draft && (
        <section className={`mail-composer ${draft.status}`}>
          <header>
            <div>
              <span className="micro-label">
                REPLY CAPSULE / NICHT GESENDET
              </span>
              <h4>AW: {draft.subject}</h4>
              <small>An Thread von {draft.from}</small>
            </div>
            <span className="draft-lock">
              <ShieldCheck size={14} />{" "}
              {draft.status === "saved"
                ? "ENTWURF"
                : draft.status === "saving"
                  ? "SPEICHERT …"
                  : draft.status === "uncertain"
                    ? "BITTE PRÜFEN"
                    : "LOKAL"}
            </span>
            <button
              className="mail-composer-close"
              onClick={() => void discardDraft()}
              title="Lokalen Entwurf verwerfen"
              aria-label="Lokalen Entwurf verwerfen"
              disabled={draft.status === "saving"}
            >
              ×
            </button>
          </header>
          <textarea
            value={draftBody}
            readOnly={draft.status !== "ready"}
            onChange={(event) => setDraftBody(event.target.value)}
            aria-label="Vorbereiteter Antwortentwurf"
          />
          <div className="mail-composer-safety">
            <ShieldCheck size={14} />
            <span>{draft.safety}</span>
          </div>
          <footer>
            <button onClick={() => void copyDraft()}>
              <ClipboardCheck size={14} /> Text kopieren
            </button>
            {draft.status === "ready" && (
              <button
                className="save-draft"
                disabled={!!working}
                onClick={() => void saveDraft()}
              >
                {working === "save" ? (
                  <LoaderCircle size={14} className="spin" />
                ) : (
                  <MessageSquareReply size={14} />
                )}
                Als Outlook-Entwurf speichern
              </button>
            )}
            {draft.status === "saved" && draft.draftUrl && (
              <a href={draft.draftUrl} target="_blank" rel="noreferrer">
                <ArrowUpRight size={14} /> In Outlook öffnen · dort selbst
                senden
              </a>
            )}
          </footer>
        </section>
      )}
      {!data.messages.length ? (
        <div className="inbox-empty">Keine passenden Nachrichten gefunden.</div>
      ) : (
        <div className="mailbox-scroll" aria-label="Nachrichten im Postfach">
          <div className="mailbox-scroll-heading">
            <span>POSTEINGANG</span>
            <small>
              {data.messages.length} geladen
              {data.hasMore ? " · weitere vorhanden" : ""}
            </small>
          </div>
          <div className="mail-constellation">
            <div className="mail-scanline" />
            {data.messages.map((message: Row, index: number) => (
              <details
                className={`mail-evidence ${message.priority}`}
                key={message.id || index}
                style={{ animationDelay: `${Math.min(index, 10) * 60}ms` }}
                open={index === 0 && message.priority === "attention"}
              >
                <summary>
                  <span className="mail-rank">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="mail-signal" />
                  <div>
                    <small>{message.from}</small>
                    <strong>{message.subject}</strong>
                    <span>
                      {message.receivedAt
                        ? new Date(message.receivedAt).toLocaleString("de-AT")
                        : "Zeitpunkt unbekannt"}
                      {message.unread ? " · UNGELESEN" : ""}
                    </span>
                  </div>
                  <b>
                    {message.priority === "attention"
                      ? "PRIORITÄT"
                      : message.priority === "review"
                        ? "PRÜFEN"
                        : "INFO"}
                  </b>
                </summary>
                <div className="mail-proof">
                  <p>
                    {message.preview ||
                      "Keine Vorschau vom Postfach geliefert."}
                  </p>
                  <div>
                    {(message.reasons || []).map((reason: string) => (
                      <span key={reason}>
                        <FileCheck2 size={11} /> {reason}
                      </span>
                    ))}
                    {!message.reasons?.length && (
                      <span>Keine erhöhten Signale erkannt</span>
                    )}
                  </div>
                  <div className="mail-proof-actions">
                    <button
                      onClick={() => {
                        setSelectedId(message.id);
                        setInstruction("");
                      }}
                    >
                      <MessageSquareReply size={13} /> Antwort vorbereiten
                    </button>
                    {message.webLink && (
                      <a
                        href={message.webLink}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <ArrowUpRight size={13} /> Original öffnen
                      </a>
                    )}
                  </div>
                </div>
              </details>
            ))}
          </div>
        </div>
      )}
      {selected && !draft && (
        <section className="reply-intent">
          <header>
            <MessageSquareReply size={17} />
            <div>
              <span>ANTWORT AN {selected.from}</span>
              <strong>{selected.subject}</strong>
            </div>
            <button onClick={() => setSelectedId("")}>×</button>
          </header>
          <p>
            Beschreibe nur deine Absicht – Aegis formuliert sie sauber. Oder
            sag: „Antworte auf diese Mail, dass …“
          </p>
          <textarea
            autoFocus
            value={instruction}
            onChange={(event) => setInstruction(event.target.value)}
            placeholder="Zum Beispiel: Bedanke dich und bestätige, dass ich den Termin akzeptiere. Keine weiteren Zusagen."
          />
          <button
            className="prepare-reply"
            disabled={!instruction.trim() || !!working}
            onClick={() => void prepare(selected)}
          >
            {working === "prepare" ? (
              <LoaderCircle size={14} className="spin" />
            ) : (
              <Network size={14} />
            )}
            Antwort lokal formulieren
          </button>
        </section>
      )}
      <p className="desk-note">{data.note}</p>
    </div>
  );
}

function CitedText({
  part,
  sources,
  openSource,
}: {
  part: Row;
  sources: Row[];
  openSource: (index: number) => void;
}) {
  const nodes: ReactNode[] = [];
  let cursor = 0;
  for (const citation of [...(part.citations || [])].sort(
    (a, b) => a.start - b.start,
  )) {
    if (citation.start < cursor) continue;
    nodes.push(part.text.slice(cursor, citation.start));
    const annotated = part.text.slice(citation.start, citation.end);
    // Some providers annotate the supported sentence instead of a citation
    // marker. Preserve that sentence; never replace evidence with a link.
    const index = sources.findIndex((s) => s.url === citation.url);
    if (
      index < 0 ||
      !/^\s*(?:\[[^\]]+\](?:\([^)]*\))?|cite[^]*)\s*$/.test(annotated)
    )
      nodes.push(annotated);
    if (index >= 0)
      nodes.push(
        <button
          className="inline-citation"
          key={`${citation.start}-${citation.url}`}
          onClick={() => openSource(index + 1)}
          title={citation.title}
        >
          [{index + 1}] {citation.title}
        </button>,
      );
    cursor = citation.end;
  }
  nodes.push(part.text.slice(cursor));
  return <p className="research-answer">{nodes}</p>;
}

export default function LiveDesk({
  desk,
  homeCity,
  notify,
  obscured = false,
}: {
  desk: Row;
  homeCity: string;
  notify: (message: string, error?: boolean) => void;
  obscured?: boolean;
}) {
  const [mode, setMode] = useState("weather"),
    [input, setInput] = useState(homeCity || ""),
    [kind, setKind] = useState("fx"),
    [days, setDays] = useState(30),
    [mailProvider, setMailProvider] = useState("microsoft");
  const scene = desk.scene;
  useEffect(() => {
    if (
      !scene ||
      !["weather", "map", "markets", "search", "mail"].includes(scene.kind)
    )
      return;
    setMode(scene.kind);
    setInput(
      scene.data?.query ||
        scene.data?.location?.query ||
        (scene.title === "Dein Live Desk" ? homeCity : scene.title),
    );
  }, [scene?.id]);
  const marketKind = scene?.data?.marketKind;
  const marketDays =
    typeof scene?.data?.days === "number" ? scene.data.days : null;
  useEffect(() => {
    if (marketKind) setKind(marketKind);
    if (marketDays) setDays(marketDays);
  }, [marketKind, marketDays]);
  async function run(name: string, args: Row) {
    try {
      await invoke("tools.execute", { name, args });
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), true);
    }
  }
  const control = (args: Row) => {
    void run("world_view", args);
  };
  const openSource = (index: number) =>
    control({ action: "open_source", index });
  const submit = () => {
    if (mode === "markets") {
      const [base, quote] = input.toUpperCase().split(/[\s/\-]+/);
      void run("world_markets", {
        kind,
        base: base || (kind === "fx" ? "EUR" : "BTC"),
        quote: quote || (kind === "fx" ? "USD" : "EUR"),
        days,
      });
    } else if (mode === "mail")
      void run("world_mail", {
        provider: mailProvider,
        query: input,
        limit: 30,
      });
    else
      void run(
        `world_${mode}`,
        mode === "search"
          ? { query: input }
          : { location: input, ...(mode === "weather" ? { day: 1 } : {}) },
      );
  };
  return (
    <section className="live-desk panel" aria-label="Live Desk">
      <header className="desk-header">
        <div>
          <span className="green-dot" />
          <strong>LIVE DESK</strong>
          <small>DEINE WELT. IM BLICK.</small>
        </div>
        <div>
          <button
            onClick={() => control({ action: "previous" })}
            disabled={!desk.history?.length}
            title="Vorheriges Ergebnis"
          >
            <ArrowLeft size={16} />
          </button>
          <button
            onClick={() => control({ action: "home" })}
            title="Live Desk schließen"
            aria-label="Live Desk schließen"
          >
            <X size={17} />
          </button>
        </div>
      </header>
      <div className="desk-navigation">
        {[
          { id: "weather", label: "Wetter", Icon: CloudRain },
          { id: "map", label: "Karte", Icon: MapPin },
          { id: "markets", label: "Märkte", Icon: TrendingUp },
          { id: "mail", label: "Postfach", Icon: Mail },
          { id: "search", label: "Recherche", Icon: Search },
        ].map(({ id, label, Icon }) => (
          <button
            key={id}
            className={mode === id ? "selected" : ""}
            onClick={() => {
              setMode(id);
              setInput(
                id === "markets"
                  ? "EUR/USD"
                  : id === "search" || id === "mail"
                    ? ""
                    : scene?.data?.location?.query || homeCity || "",
              );
            }}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>
      <form
        className="desk-input"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {mode === "markets" && (
          <select
            aria-label="Kursart"
            value={kind}
            onChange={(e) => {
              setKind(e.target.value);
              setInput(e.target.value === "crypto" ? "BTC/EUR" : "EUR/USD");
            }}
          >
            <option value="fx">Währungen</option>
            <option value="crypto">Krypto</option>
          </select>
        )}
        {mode === "mail" && (
          <select
            aria-label="Postfachanbieter"
            value={mailProvider}
            onChange={(e) => setMailProvider(e.target.value)}
          >
            <option value="microsoft">Hotmail</option>
            <option value="google">Gmail</option>
          </select>
        )}
        <input
          aria-label="Live-Desk-Anfrage"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={
            mode === "search"
              ? "Was soll ich im Internet herausfinden?"
              : mode === "mail"
                ? "Optional: Thema oder Absender"
                : mode === "markets"
                  ? "EUR/USD oder BTC/EUR"
                  : "Stadt, Land – z. B. Wien, Österreich"
          }
        />
        {mode === "markets" && (
          <select
            aria-label="Kurszeitraum"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
          >
            {[7, 30, 90].map((d) => (
              <option key={d} value={d}>
                {d} Tage
              </option>
            ))}
          </select>
        )}
        <button type="submit" aria-label="Live-Desk-Anfrage starten">
          <ArrowUpRight size={19} />
        </button>
      </form>
      <div className="desk-content" key={scene?.id || "empty"}>
        {!scene ? (
          <div className="desk-empty">
            <Globe />
            <h3>Sag es. Ich bringe es ins Bild.</h3>
            <p>
              „Wie wird das Wetter morgen in Wien?“
              <br />
              „Zeig mir Euro gegen Dollar.“
              <br />
              „Welche neuen Hotmail-Nachrichten sind wichtig?“
              <br />
              „Recherchiere … und öffne die erste Quelle.“
            </p>
            <small>
              Wetter, Ortskarten, Währungen und Krypto ohne zusätzliche
              Schlüssel. Postfach nach sicherer Verbindung.
              <br />
              Recherche über OpenAI oder Tavily. Keine automatische
              Standortermittlung.
            </small>
          </div>
        ) : (
          <>
            <div className="desk-scene-heading">
              <span className="micro-label">
                {scene.kind.toUpperCase()} /{" "}
                {scene.status === "loading"
                  ? "DATENABRUF"
                  : scene.status === "error"
                    ? "ABRUF FEHLGESCHLAGEN"
                    : "ERGEBNIS"}
              </span>
              <h2>{scene.data?.query || scene.title}</h2>
            </div>
            <div className="desk-progress" role="status">
              {scene.events.map((event: Row, i: number) => (
                <span key={i}>
                  {scene.status === "loading" &&
                  i === scene.events.length - 1 ? (
                    <LoaderCircle size={12} className="spin" />
                  ) : (
                    <Check size={12} />
                  )}
                  {event.label}
                </span>
              ))}
            </div>
            {scene.status === "loading" && (
              <div className="desk-fetching">
                {scene.kind === "search" ? (
                  <ResearchJourney scene={scene} />
                ) : scene.kind === "mail" ? (
                  <MailLoading />
                ) : (
                  <Globe />
                )}
                {!(["search", "mail"] as string[]).includes(scene.kind) && (
                  <p>Ich hole die Daten für dich.</p>
                )}
                <small>
                  Die Schritte oben zeigen tatsächlich gestartete oder
                  abgeschlossene Abrufe.
                </small>
              </div>
            )}
            {scene.status === "error" && (
              <div className="desk-error">
                <Cloud size={32} />
                <h3>Hier fehlt noch etwas.</h3>
                <p>{scene.error}</p>
                <small>
                  Keine Ersatzdaten erfunden. Passe die Anfrage an oder versuche
                  es später erneut.
                </small>
              </div>
            )}
            {scene.status === "ready" &&
              (scene.browser ? (
                <NativeSource
                  page={scene.browser}
                  obscured={obscured}
                  onBack={() => control({ action: "back" })}
                />
              ) : (
                <>
                  {scene.kind === "weather" && (
                    <WeatherPanel data={scene.data} control={control} />
                  )}
                  {scene.kind === "map" && <MapPanel data={scene.data} />}
                  {scene.kind === "markets" && (
                    <MarketPanel data={scene.data} />
                  )}
                  {scene.kind === "mail" && (
                    <InboxPanel data={scene.data} notify={notify} />
                  )}
                  {scene.kind === "search" && (
                    <div className="research-result">
                      <ResearchJourney scene={scene} />
                      <div className="research-provider">
                        <Search size={15} />
                        {scene.data.provider}
                        <span>{scene.sources.length} Quellen</span>
                      </div>
                      {scene.data.parts?.map((part: Row, i: number) => (
                        <CitedText
                          key={i}
                          part={part}
                          sources={scene.sources}
                          openSource={openSource}
                        />
                      ))}
                      <p className="desk-note">{scene.data.note}</p>
                    </div>
                  )}
                  {!!scene.sources.length && (
                    <div className="desk-sources">
                      <div className="micro-label">
                        QUELLEN / „ÖFFNE QUELLE EINS“
                      </div>
                      {scene.sources.map((source: Row, index: number) => (
                        <button
                          key={`${source.url}-${index}`}
                          onClick={() => openSource(index + 1)}
                        >
                          <span className="source-number">
                            {String(index + 1).padStart(2, "0")}
                          </span>
                          <div>
                            <strong>{source.title}</strong>
                            <small>{source.url}</small>
                            {source.excerpt && <p>{source.excerpt}</p>}
                          </div>
                          <ArrowUpRight size={15} />
                        </button>
                      ))}
                    </div>
                  )}
                </>
              ))}
            {scene.fetchedAt && (
              <footer className="desk-data-time">
                Abruf: {new Date(scene.fetchedAt).toLocaleString("de-AT")} ·
                Kein permanenter Live-Feed
              </footer>
            )}
          </>
        )}
      </div>
    </section>
  );
}
